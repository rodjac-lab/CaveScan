import { detectMediaType } from "./media.ts"
import {
  buildClaudeMessages,
  buildGeminiContents,
  buildOpenAIMessages,
  type ClaudeMessage,
  type ClaudeToolResultContent,
  type ClaudeToolUseContent,
} from "./provider-messages.ts"
import { GEMINI_RESPONSE_SCHEMA, OPENAI_RESPONSE_SCHEMA } from "./provider-schemas.ts"
import { extractErrorMessage, fetchWithTimeout } from "./provider-utils.ts"
import { recordProviderResponse, type CelestinProviderResponseTrace } from "./provider-adapter.ts"
import {
  buildGeminiCelestinTools,
  buildGeminiFunctionResponseContent,
  extractGeminiProviderToolCalls,
  type GeminiContentWithFunctionCalls,
} from "./provider-tool-adapters.ts"
import { containsStructuredResponseAttempt, parseAndValidate, stripStructuredResponseArtifacts } from "./response-validation.ts"
import type { AuthContext } from "./auth.ts"
import { executeCelestinProviderToolCalls, type CelestinToolCallTrace } from "./tool-runtime.ts"
import { CELESTIN_TOOLS, type CelestinToolName } from "./tools.ts"
import { logAnthropicUsage } from "../_shared/anthropic-usage.ts"
import type { CelestinProviderResponse, CelestinResponse, ConversationTurn } from "./types.ts"

export type { CelestinToolCallTrace } from "./tool-runtime.ts"

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')
const PROVIDER_AGNOSTIC_TOOLS_ENABLED = Deno.env.get('CELESTIN_PROVIDER_AGNOSTIC_TOOLS') === '1'
const CLAUDE_MODEL = 'claude-haiku-4-5-20251001'
const OPENAI_MODEL = 'gpt-4.1-mini'
type ClaudeToolChoice = 'auto' | 'any' | 'none'
type ClaudeToolChoicePayload =
  | { type: 'auto' }
  | { type: 'any' }
  | { type: 'none' }
  | { type: 'tool'; name: CelestinToolName }

export interface CelestinProviderOptions {
  auth?: AuthContext
  requestSource?: string
  usageContext?: CelestinUsageContext
  toolsEnabled?: boolean
  forcedToolName?: CelestinToolName
  requireToolUse?: boolean
  providerToolAdaptersEnabled?: boolean
  validateResponse?: (response: CelestinProviderResponse, trace: CelestinProviderTrace) => string | null
}

export function providerCanAnswerWithCurrentTools(providerName: string, options?: CelestinProviderOptions): boolean {
  const requiresToolBackedAnswer = !!options?.forcedToolName || !!options?.requireToolUse
  if (!requiresToolBackedAnswer) return true
  const normalizedProviderName = providerName.toLowerCase()
  if (normalizedProviderName.includes('claude')) return true

  const adaptersEnabled = options?.providerToolAdaptersEnabled ?? PROVIDER_AGNOSTIC_TOOLS_ENABLED
  if (!adaptersEnabled) return false

  // Gemini adapters are available behind an explicit flag while the final
  // provider round-trip is validated against dogfood/source-required traces.
  return normalizedProviderName.includes('gemini')
}

export function providerToolAdapterGateMessage(providerName: string): string {
  return `${providerName} cannot answer source-required turns without tool adapters. Server config required: CELESTIN_PROVIDER_AGNOSTIC_TOOLS=1.`
}

export interface CelestinUsageContext {
  turnId: string
  route: string
  turnType: string
  mode: string
}

export interface CelestinProviderAttemptTrace {
  provider: string
  status: 'success' | 'error'
  durationMs: number
  error?: string
}

export interface CelestinClaudeCacheTrace {
  creationInputTokens: number
  readInputTokens: number
}

export interface CelestinProviderUsageTrace {
  inputTokens: number
  outputTokens: number
  cacheCreationInputTokens: number
  cacheReadInputTokens: number
}

export interface CelestinProviderTrace {
  attempts: CelestinProviderAttemptTrace[]
  toolCalls: CelestinToolCallTrace[]
  claudeCache: CelestinClaudeCacheTrace
  usage: CelestinProviderUsageTrace
  providerPath: 'direct_response' | 'tool_response' | 'fallback_response'
  responses: CelestinProviderResponseTrace[]
}

export class CelestinProviderFallbackError extends Error {
  providerErrors: string[]
  trace: CelestinProviderTrace

  constructor(providerErrors: string[], trace: CelestinProviderTrace) {
    super(`All providers failed. ${providerErrors.join(' | ')}`)
    this.name = 'CelestinProviderFallbackError'
    this.providerErrors = providerErrors
    this.trace = trace
  }
}

function createProviderTrace(): CelestinProviderTrace {
  return {
    attempts: [],
    toolCalls: [],
    claudeCache: { creationInputTokens: 0, readInputTokens: 0 },
    usage: { inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 },
    providerPath: 'direct_response',
    responses: [],
  }
}

function extractGeminiText(result: { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }, label: string): string {
  const parts = result.candidates?.[0]?.content?.parts ?? []
  const text = parts.map((part) => typeof part.text === 'string' ? part.text : '').filter(Boolean).join('\n').trim()
  if (!text) throw new Error(`No text response from ${label}`)
  return text
}

async function callGeminiModel(
  modelId: string,
  label: string,
  systemPrompt: string,
  userPrompt: string,
  history: ConversationTurn[],
  image: string | undefined,
  thinkingConfig: Record<string, unknown>,
  generationOverrides?: Partial<{
    temperature: number
    maxOutputTokens: number
  }>,
  trace?: CelestinProviderTrace,
  options?: CelestinProviderOptions,
): Promise<CelestinResponse> {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not configured')

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${GEMINI_API_KEY}`
  const contents = history.length > 0
    ? buildGeminiContents(history, userPrompt, image)
    : image
      ? [{ role: 'user', parts: [{ inline_data: { mime_type: detectMediaType(image), data: image } }, { text: userPrompt }] }]
      : [{ role: 'user', parts: [{ text: userPrompt }] }]
  const requiresProviderToolAdapter = !!options?.forcedToolName || !!options?.requireToolUse
  const toolsEnabled = !!options?.toolsEnabled && requiresProviderToolAdapter && !!options.auth?.userId && !!options.auth.supabase
  const forcedToolName = toolsEnabled ? options?.forcedToolName : undefined
  const toolConfig = toolsEnabled
    ? {
        functionCallingConfig: {
          mode: options?.requireToolUse || forcedToolName ? 'ANY' : 'AUTO',
          ...(forcedToolName ? { allowedFunctionNames: [forcedToolName] } : {}),
        },
      }
    : undefined
  const responseGenerationConfig = {
    temperature: generationOverrides?.temperature ?? 0.5,
    maxOutputTokens: generationOverrides?.maxOutputTokens ?? 4096,
    responseMimeType: 'application/json',
    responseSchema: GEMINI_RESPONSE_SCHEMA,
    thinkingConfig,
  }
  const toolCallGenerationConfig = {
    temperature: generationOverrides?.temperature ?? 0.5,
    maxOutputTokens: generationOverrides?.maxOutputTokens ?? 4096,
    thinkingConfig,
  }

  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: toolsEnabled ? toolCallGenerationConfig : responseGenerationConfig,
      ...(toolsEnabled ? { tools: buildGeminiCelestinTools(), toolConfig } : {}),
    }),
  })

  if (!response.ok) {
    throw new Error(`${label} (${response.status}): ${extractErrorMessage(await response.text())}`)
  }

  const result = await response.json()
  const firstContent = result.candidates?.[0]?.content as GeminiContentWithFunctionCalls | undefined
  const toolCalls = toolsEnabled ? extractGeminiProviderToolCalls(firstContent) : []
  if (toolCalls.length > 0) {
    if (!firstContent) throw new Error(`${label} returned tool calls without model content`)
    if (trace) trace.providerPath = 'tool_response'
    const executedToolCalls = await executeCelestinProviderToolCalls(toolCalls, {
      userId: options.auth!.userId!,
      supabase: options.auth!.supabase!,
    })
    if (trace) trace.toolCalls.push(...executedToolCalls.map((tool) => tool.trace))

    const finalContents = [
      ...contents,
      firstContent,
      buildGeminiFunctionResponseContent(executedToolCalls),
    ]
    const finalResponse = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: finalContents,
        generationConfig: responseGenerationConfig,
        tools: buildGeminiCelestinTools(),
        toolConfig: { functionCallingConfig: { mode: 'NONE' } },
      }),
    })

    if (!finalResponse.ok) {
      throw new Error(`${label} tool followup (${finalResponse.status}): ${extractErrorMessage(await finalResponse.text())}`)
    }

    const finalResult = await finalResponse.json()
    const finalText = extractGeminiText(finalResult, label)
    try {
      const parsed = parseAndValidate(finalText)
      recordProviderResponse({ trace, provider: label, rawText: finalText, parseStatus: 'success', response: parsed })
      return parsed
    } catch (err) {
      recordProviderResponse({ trace, provider: label, rawText: finalText, parseStatus: 'error', error: err })
      throw err
    }
  }

  if (toolsEnabled && (options?.requireToolUse || forcedToolName)) {
    throw new Error(`${label} did not request a required tool`)
  }

  const text = extractGeminiText(result, label)

  try {
    const parsed = parseAndValidate(text)
    recordProviderResponse({ trace, provider: label, rawText: text, parseStatus: 'success', response: parsed })
    return parsed
  } catch (err) {
    recordProviderResponse({ trace, provider: label, rawText: text, parseStatus: 'error', error: err })
    throw err
  }
}

async function callGemini(systemPrompt: string, userPrompt: string, history: ConversationTurn[], image?: string, trace?: CelestinProviderTrace, options?: CelestinProviderOptions): Promise<CelestinProviderResponse> {
  return callGeminiModel(
    'gemini-2.5-flash',
    'Gemini 2.5 Flash',
    systemPrompt,
    userPrompt,
    history,
    image,
    { thinkingBudget: image ? 1024 : 0 },
    undefined,
    trace,
    options,
  )
}

async function callGeminiFlashLite(systemPrompt: string, userPrompt: string, history: ConversationTurn[], image?: string, trace?: CelestinProviderTrace, options?: CelestinProviderOptions): Promise<CelestinProviderResponse> {
  return callGeminiModel(
    'gemini-3.1-flash-lite-preview',
    'Gemini 3.1 Flash-Lite',
    systemPrompt,
    userPrompt,
    history,
    image,
    { thinkingLevel: 'minimal' },
    undefined,
    trace,
    options,
  )
}

async function callGeminiFlashLiteStable(systemPrompt: string, userPrompt: string, history: ConversationTurn[], image?: string, trace?: CelestinProviderTrace, options?: CelestinProviderOptions): Promise<CelestinProviderResponse> {
  return callGeminiModel(
    'gemini-3.1-flash-lite',
    'Gemini 3.1 Flash-Lite stable',
    systemPrompt,
    userPrompt,
    history,
    image,
    { thinkingLevel: 'minimal' },
    undefined,
    trace,
    options,
  )
}

async function callGeminiFlashLiteStableT08(systemPrompt: string, userPrompt: string, history: ConversationTurn[], image?: string, trace?: CelestinProviderTrace, options?: CelestinProviderOptions): Promise<CelestinProviderResponse> {
  return callGeminiModel(
    'gemini-3.1-flash-lite',
    'Gemini 3.1 Flash-Lite stable t0.8',
    systemPrompt,
    userPrompt,
    history,
    image,
    { thinkingLevel: 'minimal' },
    { temperature: 0.8 },
    trace,
    options,
  )
}

async function callGeminiFlashLiteStableT08Low(systemPrompt: string, userPrompt: string, history: ConversationTurn[], image?: string, trace?: CelestinProviderTrace, options?: CelestinProviderOptions): Promise<CelestinProviderResponse> {
  return callGeminiModel(
    'gemini-3.1-flash-lite',
    'Gemini 3.1 Flash-Lite stable t0.8 low',
    systemPrompt,
    userPrompt,
    history,
    image,
    { thinkingLevel: 'low' },
    { temperature: 0.8 },
    trace,
    options,
  )
}

async function callGeminiFlashLiteStableT10(systemPrompt: string, userPrompt: string, history: ConversationTurn[], image?: string, trace?: CelestinProviderTrace, options?: CelestinProviderOptions): Promise<CelestinProviderResponse> {
  return callGeminiModel(
    'gemini-3.1-flash-lite',
    'Gemini 3.1 Flash-Lite stable t1.0',
    systemPrompt,
    userPrompt,
    history,
    image,
    { thinkingLevel: 'minimal' },
    { temperature: 1.0 },
    trace,
    options,
  )
}

async function callGemini3Flash(systemPrompt: string, userPrompt: string, history: ConversationTurn[], image?: string, trace?: CelestinProviderTrace, options?: CelestinProviderOptions): Promise<CelestinProviderResponse> {
  return callGeminiModel(
    'gemini-3-flash-preview',
    'Gemini 3 Flash',
    systemPrompt,
    userPrompt,
    history,
    image,
    { thinkingLevel: 'minimal' },
    undefined,
    trace,
    options,
  )
}

async function callGemini3FlashLow(systemPrompt: string, userPrompt: string, history: ConversationTurn[], image?: string, trace?: CelestinProviderTrace, options?: CelestinProviderOptions): Promise<CelestinProviderResponse> {
  return callGeminiModel(
    'gemini-3-flash-preview',
    'Gemini 3 Flash (thinking low)',
    systemPrompt,
    userPrompt,
    history,
    image,
    { thinkingLevel: 'low' },
    undefined,
    trace,
    options,
  )
}

function buildClaudeSystem(systemPrompt: string, cacheSystem: boolean) {
  const marker = '\n\n--- CONTEXTE UTILISATEUR ---\n\n'
  const markerIndex = systemPrompt.indexOf(marker)
  if (markerIndex >= 0) {
    return [
      {
        type: 'text',
        text: systemPrompt.slice(0, markerIndex),
        ...(cacheSystem ? { cache_control: { type: 'ephemeral' } } : {}),
      },
      {
        type: 'text',
        text: systemPrompt.slice(markerIndex),
      },
    ]
  }

  return [{
    type: 'text',
    text: systemPrompt,
    ...(cacheSystem ? { cache_control: { type: 'ephemeral' } } : {}),
  }]
}

function buildClaudeTools(cacheTools: boolean) {
  return CELESTIN_TOOLS.map((tool, index) => {
    if (!cacheTools || index !== CELESTIN_TOOLS.length - 1) return tool
    return {
      ...tool,
      cache_control: { type: 'ephemeral' },
    }
  })
}

function buildClaudeToolChoice(toolChoice: ClaudeToolChoice, forcedToolName?: CelestinToolName): ClaudeToolChoicePayload {
  if (toolChoice === 'none') return { type: 'none' }
  if (forcedToolName) return { type: 'tool', name: forcedToolName }
  if (toolChoice === 'any') return { type: 'any' }
  return { type: 'auto' }
}

function extractClaudeText(result: { content?: Array<{ type: string; text?: string }> }): string {
  const textContent = result.content?.find((c) => c.type === 'text' && c.text)
  if (!textContent?.text) throw new Error('No text response from Claude')
  return textContent.text
}

function parseClaudeResponse(text: string, trace?: CelestinProviderTrace): CelestinProviderResponse {
  try {
    const parsed = parseAndValidate(text)
    recordProviderResponse({ trace, provider: 'Claude', rawText: text, parseStatus: 'success', response: parsed })
    return parsed
  } catch (err) {
    if (containsStructuredResponseAttempt(text)) {
      recordProviderResponse({ trace, provider: 'Claude', rawText: text, parseStatus: 'error', error: err })
      throw err
    }

    const message = stripStructuredResponseArtifacts(text)
    if (!message) {
      recordProviderResponse({ trace, provider: 'Claude', rawText: text, parseStatus: 'error', error: err })
      throw err
    }
    console.warn(`[celestin] Claude returned text instead of JSON; wrapping as message-only response: ${err instanceof Error ? err.message : String(err)}`)
    const wrapped = { message, ui_action: null, action_chips: null }
    recordProviderResponse({ trace, provider: 'Claude', rawText: text, parseStatus: 'wrapped_text', response: wrapped, error: err })
    return wrapped
  }
}

async function postClaudeMessages(input: {
  systemPrompt: string
  messages: ClaudeMessage[]
  toolChoice: ClaudeToolChoice
  caller: string
  messagePreview: string
  cacheSystem: boolean
  cacheTools: boolean
  requestSource?: string
  auth?: AuthContext
  usageContext?: CelestinUsageContext
  forcedToolName?: CelestinToolName
  maxTokens?: number
  trace?: CelestinProviderTrace
}) {
  const toolsIncluded = input.toolChoice !== 'none'
  const payload: Record<string, unknown> = {
    model: CLAUDE_MODEL,
    max_tokens: input.maxTokens ?? 4096,
    system: buildClaudeSystem(input.systemPrompt, input.cacheSystem),
    messages: input.messages,
  }
  if (toolsIncluded) {
    payload.tools = buildClaudeTools(input.cacheTools)
    payload.tool_choice = buildClaudeToolChoice(input.toolChoice, input.forcedToolName)
  }

  const response = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    throw new Error(`Claude ${CLAUDE_MODEL} (${response.status}): ${extractErrorMessage(await response.text())}`)
  }

  const result = await response.json()
  const toolsEnabled = input.toolChoice !== 'none'
  const usageExtra = {
    messagePreview: input.messagePreview,
    toolsEnabled,
    toolsIncluded,
    toolChoice: input.toolChoice,
    forcedToolName: input.forcedToolName,
    requestSource: input.requestSource,
  }
  logAnthropicUsage(input.caller, result, usageExtra)
  await persistClaudeUsage({
    auth: input.auth,
    caller: input.caller,
    result,
    trace: input.trace,
    requestSource: input.requestSource,
    messagePreview: input.messagePreview,
    toolsEnabled,
    toolsIncluded,
    toolChoice: input.toolChoice,
    usageContext: input.usageContext,
  })
  const usage = result.usage as {
    cache_creation_input_tokens?: number
    cache_read_input_tokens?: number
  } | undefined
  if (usage && (usage.cache_creation_input_tokens || usage.cache_read_input_tokens)) {
    const create = usage.cache_creation_input_tokens ?? 0
    const read = usage.cache_read_input_tokens ?? 0
    if (input.trace) {
      input.trace.claudeCache.creationInputTokens += create
      input.trace.claudeCache.readInputTokens += read
    }
    console.log(`[celestin:claude-cache] create=${create} read=${read}`)
  }
  return result
}

function maxTokensForToolFollowup(toolUses: ClaudeToolUseContent[]): number {
  const names = new Set(toolUses.map((tool) => tool.name))
  if (names.has('search_cellar_candidates')) return 900
  if (names.has('query_cellar')) return 600
  if (names.has('query_memory')) return 800
  if (names.has('query_tastings')) return 1000
  return 1200
}

async function persistClaudeUsage(input: {
  auth?: AuthContext
  caller: string
  result: { usage?: Record<string, unknown> }
  trace?: CelestinProviderTrace
  requestSource?: string
  messagePreview: string
  toolsEnabled: boolean
  toolsIncluded: boolean
  toolChoice: ClaudeToolChoice
  usageContext?: CelestinUsageContext
}) {
  const supabase = input.auth?.supabase
  if (!supabase) return

  const usage = input.result.usage ?? {}
  const numeric = (key: string): number => {
    const value = usage[key]
    return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0
  }
  const inputTokens = numeric('input_tokens')
  const outputTokens = numeric('output_tokens')
  const cacheCreationInputTokens = numeric('cache_creation_input_tokens')
  const cacheReadInputTokens = numeric('cache_read_input_tokens')

  if (input.trace) {
    input.trace.usage.inputTokens += inputTokens
    input.trace.usage.outputTokens += outputTokens
    input.trace.usage.cacheCreationInputTokens += cacheCreationInputTokens
    input.trace.usage.cacheReadInputTokens += cacheReadInputTokens
  }

  try {
    const { error } = await supabase.from('celestin_llm_usage').insert({
      user_id: input.auth?.userId ?? null,
      turn_id: input.usageContext?.turnId ?? null,
      request_source: input.requestSource ?? null,
      caller: input.caller,
      provider: 'anthropic',
      model: CLAUDE_MODEL,
      route: input.usageContext?.route ?? null,
      turn_type: input.usageContext?.turnType ?? null,
      mode: input.usageContext?.mode ?? null,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cache_creation_input_tokens: cacheCreationInputTokens,
      cache_read_input_tokens: cacheReadInputTokens,
      tools_enabled: input.toolsEnabled,
      tools_included: input.toolsIncluded,
      tool_choice: input.toolChoice,
      message_preview: input.messagePreview,
      raw_usage: usage,
    })
    if (error) console.warn('[celestin:usage-db] insert failed:', error.message)
  } catch (err) {
    console.warn('[celestin:usage-db] insert failed:', err instanceof Error ? err.message : String(err))
  }
}

function toolUseBlocks(result: { content?: unknown[] }): ClaudeToolUseContent[] {
  return (result.content ?? []).filter((block): block is ClaudeToolUseContent => {
    const candidate = block as Partial<ClaudeToolUseContent>
    return candidate.type === 'tool_use'
      && typeof candidate.id === 'string'
      && typeof candidate.name === 'string'
      && typeof candidate.input === 'object'
      && candidate.input !== null
  })
}

async function callClaude(
  systemPrompt: string,
  userPrompt: string,
  history: ConversationTurn[],
  image?: string,
  options?: CelestinProviderOptions,
  trace?: CelestinProviderTrace,
): Promise<CelestinProviderResponse> {
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured')

  const messages = history.length > 0
    ? buildClaudeMessages(history, userPrompt, image)
    : image
      ? [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: detectMediaType(image), data: image } },
          { type: 'text', text: userPrompt },
        ] }]
      : [{ role: 'user', content: userPrompt }]

  const auth = options?.auth
  const toolsEnabled = !!options?.toolsEnabled
  const messagePreview = userPrompt.replace(/\s+/g, ' ').slice(0, 120)
  const forcedToolName = toolsEnabled ? options?.forcedToolName : undefined
  const toolChoice: ClaudeToolChoice = toolsEnabled
    ? options?.requireToolUse && !forcedToolName
      ? 'any'
      : 'auto'
    : 'none'
  const first = await postClaudeMessages({
    systemPrompt,
    messages,
    toolChoice,
    forcedToolName,
    trace,
    caller: 'celestin.claude.first',
    messagePreview,
    cacheSystem: true,
    cacheTools: toolsEnabled,
    requestSource: options?.requestSource,
    auth,
    usageContext: options?.usageContext,
  })
  const toolUses = toolsEnabled ? toolUseBlocks(first) : []

  if (first.stop_reason !== 'tool_use' || toolUses.length === 0) {
    if (trace) trace.providerPath = 'direct_response'
    return parseClaudeResponse(extractClaudeText(first), trace)
  }

  if (trace) trace.providerPath = 'tool_response'
  console.log(`[celestin:tools] Claude requested ${toolUses.map((tool) => tool.name).join(', ')}`)
  const executedToolCalls = await executeCelestinProviderToolCalls(toolUses, {
    userId: auth!.userId!,
    supabase: auth!.supabase!,
  })
  if (trace) trace.toolCalls.push(...executedToolCalls.map((tool) => tool.trace))
  const toolResults: ClaudeToolResultContent[] = executedToolCalls.map((tool) => ({
    type: 'tool_result',
    tool_use_id: tool.id,
    content: tool.content,
    is_error: tool.isError || undefined,
  }))

  const followupMessages: ClaudeMessage[] = [
    ...messages,
    { role: 'assistant', content: first.content },
    { role: 'user', content: toolResults },
  ]
  const final = await postClaudeMessages({
    systemPrompt,
    messages: followupMessages,
    toolChoice: 'none',
    trace,
    caller: 'celestin.claude.tool_followup',
    messagePreview,
    maxTokens: maxTokensForToolFollowup(toolUses),
    cacheSystem: true,
    cacheTools: false,
    requestSource: options?.requestSource,
    auth,
    usageContext: options?.usageContext,
  })

  if (final.stop_reason === 'tool_use') {
    throw new Error('Claude requested a second tool round; refusing to continue')
  }

  return parseClaudeResponse(extractClaudeText(final), trace)
}

async function callOpenAI(systemPrompt: string, userPrompt: string, history: ConversationTurn[], image?: string, trace?: CelestinProviderTrace): Promise<CelestinProviderResponse> {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not configured')

  const messages = buildOpenAIMessages(systemPrompt, userPrompt, history, image)

  const response = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      max_tokens: 4096,
      temperature: 0.5,
      response_format: { type: 'json_schema', json_schema: OPENAI_RESPONSE_SCHEMA },
      messages,
    }),
  })

  if (!response.ok) {
    throw new Error(`OpenAI ${OPENAI_MODEL} (${response.status}): ${extractErrorMessage(await response.text())}`)
  }

  const result = await response.json()
  const text = result.choices?.[0]?.message?.content
  if (!text) throw new Error('No text response from OpenAI')

  try {
    const parsed = parseAndValidate(text)
    recordProviderResponse({ trace, provider: 'GPT-4.1 mini', rawText: text, parseStatus: 'success', response: parsed })
    return parsed
  } catch (err) {
    recordProviderResponse({ trace, provider: 'GPT-4.1 mini', rawText: text, parseStatus: 'error', error: err })
    throw err
  }
}

export async function celestinWithFallback(
  systemPrompt: string,
  userPrompt: string,
  history: ConversationTurn[],
  forcedProvider?: string,
  image?: string,
  options?: CelestinProviderOptions,
): Promise<{ provider: string; response: CelestinProviderResponse; providerErrors: string[]; trace: CelestinProviderTrace }> {
  const trace = createProviderTrace()
  const validateProviderResponse = (response: CelestinProviderResponse) => {
    const reason = options?.validateResponse?.(response, trace)
    if (reason) throw new Error(reason)
  }

  if (forcedProvider) {
    const providerMap: Record<string, { name: string; call: () => Promise<CelestinProviderResponse> }> = {
      claude: { name: 'Claude', call: () => callClaude(systemPrompt, userPrompt, history, image, options, trace) },
      gemini: { name: 'Gemini', call: () => callGemini(systemPrompt, userPrompt, history, image, trace, options) },
      'gemini-flash-lite': { name: 'Gemini 3.1 Flash-Lite', call: () => callGeminiFlashLite(systemPrompt, userPrompt, history, image, trace, options) },
      'gemini-flash-lite-stable': { name: 'Gemini 3.1 Flash-Lite stable', call: () => callGeminiFlashLiteStable(systemPrompt, userPrompt, history, image, trace, options) },
      'gemini-flash-lite-stable-t08': { name: 'Gemini 3.1 Flash-Lite stable t0.8', call: () => callGeminiFlashLiteStableT08(systemPrompt, userPrompt, history, image, trace, options) },
      'gemini-flash-lite-stable-t08-low': { name: 'Gemini 3.1 Flash-Lite stable t0.8 low', call: () => callGeminiFlashLiteStableT08Low(systemPrompt, userPrompt, history, image, trace, options) },
      'gemini-flash-lite-stable-t10': { name: 'Gemini 3.1 Flash-Lite stable t1.0', call: () => callGeminiFlashLiteStableT10(systemPrompt, userPrompt, history, image, trace, options) },
      'gemini-3-flash': { name: 'Gemini 3 Flash', call: () => callGemini3Flash(systemPrompt, userPrompt, history, image, trace, options) },
      'gemini-3-flash-low': { name: 'Gemini 3 Flash (low)', call: () => callGemini3FlashLow(systemPrompt, userPrompt, history, image, trace, options) },
      openai: { name: 'GPT-4.1 mini', call: () => callOpenAI(systemPrompt, userPrompt, history, image, trace) },
    }
    const selected = providerMap[forcedProvider.toLowerCase()]
    if (!selected) throw new Error(`Unknown provider: ${forcedProvider}`)
    if (!providerCanAnswerWithCurrentTools(selected.name, options)) {
      throw new Error(providerToolAdapterGateMessage(selected.name))
    }
    console.log(`[celestin] Forced provider: ${selected.name}`)
    const startedAt = performance.now()
    try {
      const response = await selected.call()
      validateProviderResponse(response)
      trace.attempts.push({ provider: selected.name, status: 'success', durationMs: Math.round(performance.now() - startedAt) })
      return { provider: selected.name, response, providerErrors: [], trace }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      trace.attempts.push({ provider: selected.name, status: 'error', durationMs: Math.round(performance.now() - startedAt), error: message })
      throw new CelestinProviderFallbackError([message], trace)
    }
  }

  const providers: Array<{ name: string; call: () => Promise<CelestinProviderResponse> }> = []
  if (ANTHROPIC_API_KEY) providers.push({ name: 'Claude Haiku 4.5', call: () => callClaude(systemPrompt, userPrompt, history, image, options, trace) })
  if (GEMINI_API_KEY && providerCanAnswerWithCurrentTools('Gemini', options)) providers.push({ name: 'Gemini', call: () => callGemini(systemPrompt, userPrompt, history, image, trace, options) })
  if (OPENAI_API_KEY && providerCanAnswerWithCurrentTools('GPT-4.1 mini', options)) providers.push({ name: 'GPT-4.1 mini', call: () => callOpenAI(systemPrompt, userPrompt, history, image, trace) })

  if (providers.length === 0) {
    throw new Error('No API keys configured.')
  }

  const errors: string[] = []
  for (const provider of providers) {
    const startedAt = performance.now()
    try {
      console.log(`[celestin] Trying ${provider.name}...`)
      const response = await provider.call()
      validateProviderResponse(response)
      const durationMs = Math.round(performance.now() - startedAt)
      trace.attempts.push({ provider: provider.name, status: 'success', durationMs })
      if (errors.length > 0) trace.providerPath = 'fallback_response'
      console.log(`[celestin] ${provider.name} succeeded: ui_action=${response.ui_action?.kind ?? 'none'}`)
      return { provider: provider.name, response, providerErrors: errors, trace }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      trace.attempts.push({
        provider: provider.name,
        status: 'error',
        durationMs: Math.round(performance.now() - startedAt),
        error: message,
      })
      console.error(`[celestin] ${provider.name} failed: ${message}`)
      errors.push(message)
    }
  }

  trace.providerPath = 'fallback_response'
  throw new CelestinProviderFallbackError(errors, trace)
}
