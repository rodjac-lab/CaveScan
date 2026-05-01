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
import { parseAndValidate } from "./response-validation.ts"
import type { AuthContext } from "./auth.ts"
import { CELESTIN_TOOLS, executeCelestinTool } from "./tools.ts"
import type { CelestinResponse, ConversationTurn } from "./types.ts"

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')
const CLAUDE_MODEL = 'claude-haiku-4-5-20251001'
const OPENAI_MODEL = 'gpt-4.1-mini'

export interface CelestinProviderOptions {
  auth?: AuthContext
}

export interface CelestinProviderAttemptTrace {
  provider: string
  status: 'success' | 'error'
  durationMs: number
  error?: string
}

export interface CelestinToolCallTrace {
  name: string
  input: Record<string, unknown>
  durationMs: number
  source?: string
  totalRows?: number
  listedRows?: number
  totalQuantity?: number
  error?: string
}

export interface CelestinClaudeCacheTrace {
  creationInputTokens: number
  readInputTokens: number
}

export interface CelestinProviderTrace {
  attempts: CelestinProviderAttemptTrace[]
  toolCalls: CelestinToolCallTrace[]
  claudeCache: CelestinClaudeCacheTrace
  providerPath: 'direct_response' | 'tool_response' | 'fallback_response'
}

function createProviderTrace(): CelestinProviderTrace {
  return {
    attempts: [],
    toolCalls: [],
    claudeCache: { creationInputTokens: 0, readInputTokens: 0 },
    providerPath: 'direct_response',
  }
}

async function callGeminiModel(
  modelId: string,
  label: string,
  systemPrompt: string,
  userPrompt: string,
  history: ConversationTurn[],
  image: string | undefined,
  thinkingConfig: Record<string, unknown>,
): Promise<CelestinResponse> {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not configured')

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${GEMINI_API_KEY}`
  const contents = history.length > 0
    ? buildGeminiContents(history, userPrompt, image)
    : image
      ? [{ role: 'user', parts: [{ inline_data: { mime_type: detectMediaType(image), data: image } }, { text: userPrompt }] }]
      : [{ role: 'user', parts: [{ text: userPrompt }] }]

  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: {
        temperature: 0.5,
        maxOutputTokens: 4096,
        responseMimeType: 'application/json',
        responseSchema: GEMINI_RESPONSE_SCHEMA,
        thinkingConfig,
      },
    }),
  })

  if (!response.ok) {
    throw new Error(`${label} (${response.status}): ${extractErrorMessage(await response.text())}`)
  }

  const result = await response.json()
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error(`No text response from ${label}`)

  return parseAndValidate(text)
}

async function callGemini(systemPrompt: string, userPrompt: string, history: ConversationTurn[], image?: string): Promise<CelestinResponse> {
  return callGeminiModel(
    'gemini-2.5-flash',
    'Gemini 2.5 Flash',
    systemPrompt,
    userPrompt,
    history,
    image,
    { thinkingBudget: image ? 1024 : 0 },
  )
}

async function callGeminiFlashLite(systemPrompt: string, userPrompt: string, history: ConversationTurn[], image?: string): Promise<CelestinResponse> {
  return callGeminiModel(
    'gemini-3.1-flash-lite-preview',
    'Gemini 3.1 Flash-Lite',
    systemPrompt,
    userPrompt,
    history,
    image,
    { thinkingLevel: 'minimal' },
  )
}

async function callGemini3Flash(systemPrompt: string, userPrompt: string, history: ConversationTurn[], image?: string): Promise<CelestinResponse> {
  return callGeminiModel(
    'gemini-3-flash-preview',
    'Gemini 3 Flash',
    systemPrompt,
    userPrompt,
    history,
    image,
    { thinkingLevel: 'minimal' },
  )
}

async function callGemini3FlashLow(systemPrompt: string, userPrompt: string, history: ConversationTurn[], image?: string): Promise<CelestinResponse> {
  return callGeminiModel(
    'gemini-3-flash-preview',
    'Gemini 3 Flash (thinking low)',
    systemPrompt,
    userPrompt,
    history,
    image,
    { thinkingLevel: 'low' },
  )
}

function buildClaudeSystem(systemPrompt: string) {
  const marker = '\n\n--- CONTEXTE UTILISATEUR ---\n\n'
  const markerIndex = systemPrompt.indexOf(marker)
  if (markerIndex >= 0) {
    return [
      {
        type: 'text',
        text: systemPrompt.slice(0, markerIndex),
        cache_control: { type: 'ephemeral' },
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
    cache_control: { type: 'ephemeral' },
  }]
}

function extractClaudeText(result: { content?: Array<{ type: string; text?: string }> }): string {
  const textContent = result.content?.find((c) => c.type === 'text' && c.text)
  if (!textContent?.text) throw new Error('No text response from Claude')
  return textContent.text
}

function parseClaudeResponse(text: string): CelestinResponse {
  try {
    return parseAndValidate(text)
  } catch (err) {
    const message = text.trim()
    if (!message) throw err
    console.warn(`[celestin] Claude returned text instead of JSON; wrapping as message-only response: ${err instanceof Error ? err.message : String(err)}`)
    return { message, ui_action: null, action_chips: null }
  }
}

async function postClaudeMessages(input: {
  systemPrompt: string
  messages: ClaudeMessage[]
  toolsEnabled: boolean
  trace?: CelestinProviderTrace
}) {
  const response = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      system: buildClaudeSystem(input.systemPrompt),
      messages: input.messages,
      ...(input.toolsEnabled ? { tools: CELESTIN_TOOLS, tool_choice: { type: 'auto' } } : {}),
    }),
  })

  if (!response.ok) {
    throw new Error(`Claude ${CLAUDE_MODEL} (${response.status}): ${extractErrorMessage(await response.text())}`)
  }

  const result = await response.json()
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
): Promise<CelestinResponse> {
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
  const toolsEnabled = !!auth?.userId && !!auth.supabase && !image
  const first = await postClaudeMessages({ systemPrompt, messages, toolsEnabled, trace })
  const toolUses = toolsEnabled ? toolUseBlocks(first) : []

  if (first.stop_reason !== 'tool_use' || toolUses.length === 0) {
    if (trace) trace.providerPath = 'direct_response'
    return parseClaudeResponse(extractClaudeText(first))
  }

  if (trace) trace.providerPath = 'tool_response'
  console.log(`[celestin:tools] Claude requested ${toolUses.map((tool) => tool.name).join(', ')}`)
  const toolResults: ClaudeToolResultContent[] = await Promise.all(toolUses.slice(0, 3).map(async (tool) => {
    const startedAt = performance.now()
    try {
      const content = await executeCelestinTool(tool.name, tool.input, {
        userId: auth!.userId!,
        supabase: auth!.supabase!,
      })
      if (trace) {
        let parsed: Record<string, unknown> = {}
        try {
          parsed = JSON.parse(content) as Record<string, unknown>
        } catch {
          parsed = {}
        }
        trace.toolCalls.push({
          name: tool.name,
          input: tool.input,
          durationMs: Math.round(performance.now() - startedAt),
          source: typeof parsed.source === 'string' ? parsed.source : undefined,
          totalRows: typeof parsed.totalRows === 'number' ? parsed.totalRows : undefined,
          listedRows: typeof parsed.listedRows === 'number' ? parsed.listedRows : undefined,
          totalQuantity: typeof parsed.totalQuantity === 'number' ? parsed.totalQuantity : undefined,
          error: typeof parsed.error === 'string' ? parsed.error : undefined,
        })
      }
      return { type: 'tool_result', tool_use_id: tool.id, content }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      trace?.toolCalls.push({
        name: tool.name,
        input: tool.input,
        durationMs: Math.round(performance.now() - startedAt),
        error: message,
      })
      return { type: 'tool_result', tool_use_id: tool.id, content: message, is_error: true }
    }
  }))

  const followupMessages: ClaudeMessage[] = [
    ...messages,
    { role: 'assistant', content: first.content },
    { role: 'user', content: toolResults },
  ]
  const final = await postClaudeMessages({ systemPrompt, messages: followupMessages, toolsEnabled: false, trace })

  if (final.stop_reason === 'tool_use') {
    throw new Error('Claude requested a second tool round; refusing to continue')
  }

  return parseClaudeResponse(extractClaudeText(final))
}

async function callOpenAI(systemPrompt: string, userPrompt: string, history: ConversationTurn[], image?: string): Promise<CelestinResponse> {
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

  return parseAndValidate(text)
}

export async function celestinWithFallback(
  systemPrompt: string,
  userPrompt: string,
  history: ConversationTurn[],
  forcedProvider?: string,
  image?: string,
  options?: CelestinProviderOptions,
): Promise<{ provider: string; response: CelestinResponse; providerErrors: string[]; trace: CelestinProviderTrace }> {
  const trace = createProviderTrace()
  if (forcedProvider) {
    const providerMap: Record<string, { name: string; call: () => Promise<CelestinResponse> }> = {
      claude: { name: 'Claude', call: () => callClaude(systemPrompt, userPrompt, history, image, options, trace) },
      gemini: { name: 'Gemini', call: () => callGemini(systemPrompt, userPrompt, history, image) },
      'gemini-flash-lite': { name: 'Gemini 3.1 Flash-Lite', call: () => callGeminiFlashLite(systemPrompt, userPrompt, history, image) },
      'gemini-3-flash': { name: 'Gemini 3 Flash', call: () => callGemini3Flash(systemPrompt, userPrompt, history, image) },
      'gemini-3-flash-low': { name: 'Gemini 3 Flash (low)', call: () => callGemini3FlashLow(systemPrompt, userPrompt, history, image) },
      openai: { name: 'GPT-4.1 mini', call: () => callOpenAI(systemPrompt, userPrompt, history, image) },
    }
    const selected = providerMap[forcedProvider.toLowerCase()]
    if (!selected) throw new Error(`Unknown provider: ${forcedProvider}`)
    console.log(`[celestin] Forced provider: ${selected.name}`)
    const startedAt = performance.now()
    try {
      const response = await selected.call()
      trace.attempts.push({ provider: selected.name, status: 'success', durationMs: Math.round(performance.now() - startedAt) })
      return { provider: selected.name, response, providerErrors: [], trace }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      trace.attempts.push({ provider: selected.name, status: 'error', durationMs: Math.round(performance.now() - startedAt), error: message })
      throw err
    }
  }

  const providers: Array<{ name: string; call: () => Promise<CelestinResponse> }> = []
  if (ANTHROPIC_API_KEY) providers.push({ name: 'Claude Haiku 4.5', call: () => callClaude(systemPrompt, userPrompt, history, image, options, trace) })
  if (GEMINI_API_KEY) providers.push({ name: 'Gemini', call: () => callGemini(systemPrompt, userPrompt, history, image) })
  if (OPENAI_API_KEY) providers.push({ name: 'GPT-4.1 mini', call: () => callOpenAI(systemPrompt, userPrompt, history, image) })

  if (providers.length === 0) {
    throw new Error('No API keys configured.')
  }

  const errors: string[] = []
  for (const provider of providers) {
    const startedAt = performance.now()
    try {
      console.log(`[celestin] Trying ${provider.name}...`)
      const response = await provider.call()
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

  throw new Error(`All providers failed. ${errors.join(' | ')}`)
}
