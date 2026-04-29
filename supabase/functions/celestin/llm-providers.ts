import { detectMediaType } from "./media.ts"
import {
  buildClaudeMessages,
  buildGeminiContents,
  buildOpenAIMessages,
} from "./provider-messages.ts"
import { GEMINI_RESPONSE_SCHEMA, OPENAI_RESPONSE_SCHEMA } from "./provider-schemas.ts"
import { extractErrorMessage, fetchWithTimeout } from "./provider-utils.ts"
import { parseAndValidate } from "./response-validation.ts"
import type { CelestinResponse, ConversationTurn } from "./types.ts"

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')
const CLAUDE_MODEL = 'claude-haiku-4-5-20251001'
const OPENAI_MODEL = 'gpt-4.1-mini'

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

async function callClaude(systemPrompt: string, userPrompt: string, history: ConversationTurn[], image?: string): Promise<CelestinResponse> {
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured')

  const messages = history.length > 0
    ? buildClaudeMessages(history, userPrompt, image)
    : image
      ? [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: detectMediaType(image), data: image } },
          { type: 'text', text: userPrompt },
        ] }]
      : [{ role: 'user', content: userPrompt }]

  const response = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      messages,
    }),
  })

  if (!response.ok) {
    throw new Error(`Claude ${CLAUDE_MODEL} (${response.status}): ${extractErrorMessage(await response.text())}`)
  }

  const result = await response.json()
  const textContent = result.content?.find((c: { type: string; text?: string }) => c.type === 'text')
  if (!textContent?.text) throw new Error('No text response from Claude')

  return parseAndValidate(textContent.text)
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
): Promise<{ provider: string; response: CelestinResponse }> {
  if (forcedProvider) {
    const providerMap: Record<string, { name: string; call: () => Promise<CelestinResponse> }> = {
      claude: { name: 'Claude', call: () => callClaude(systemPrompt, userPrompt, history, image) },
      gemini: { name: 'Gemini', call: () => callGemini(systemPrompt, userPrompt, history, image) },
      'gemini-flash-lite': { name: 'Gemini 3.1 Flash-Lite', call: () => callGeminiFlashLite(systemPrompt, userPrompt, history, image) },
      'gemini-3-flash': { name: 'Gemini 3 Flash', call: () => callGemini3Flash(systemPrompt, userPrompt, history, image) },
      'gemini-3-flash-low': { name: 'Gemini 3 Flash (low)', call: () => callGemini3FlashLow(systemPrompt, userPrompt, history, image) },
      openai: { name: 'GPT-4.1 mini', call: () => callOpenAI(systemPrompt, userPrompt, history, image) },
    }
    const selected = providerMap[forcedProvider.toLowerCase()]
    if (!selected) throw new Error(`Unknown provider: ${forcedProvider}`)
    console.log(`[celestin] Forced provider: ${selected.name}`)
    const response = await selected.call()
    return { provider: selected.name, response }
  }

  const providers: Array<{ name: string; call: () => Promise<CelestinResponse> }> = []
  if (ANTHROPIC_API_KEY) providers.push({ name: 'Claude Haiku 4.5', call: () => callClaude(systemPrompt, userPrompt, history, image) })
  if (GEMINI_API_KEY) providers.push({ name: 'Gemini', call: () => callGemini(systemPrompt, userPrompt, history, image) })
  if (OPENAI_API_KEY) providers.push({ name: 'GPT-4.1 mini', call: () => callOpenAI(systemPrompt, userPrompt, history, image) })

  if (providers.length === 0) {
    throw new Error('No API keys configured.')
  }

  const errors: string[] = []
  for (const provider of providers) {
    try {
      console.log(`[celestin] Trying ${provider.name}...`)
      const response = await provider.call()
      console.log(`[celestin] ${provider.name} succeeded: ui_action=${response.ui_action?.kind ?? 'none'}`)
      return { provider: provider.name, response }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[celestin] ${provider.name} failed: ${message}`)
      errors.push(message)
    }
  }

  throw new Error(`All providers failed. ${errors.join(' | ')}`)
}
