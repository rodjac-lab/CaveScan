import { detectMediaType } from "./media.ts"
import { GEMINI_RESPONSE_SCHEMA, OPENAI_RESPONSE_SCHEMA } from "./provider-schemas.ts"
import { parseAndValidate } from "./response-validation.ts"
import type { CelestinResponse, ConversationTurn } from "./types.ts"

const MISTRAL_API_KEY = Deno.env.get('MISTRAL_API_KEY')
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')
const MISTRAL_MODEL = 'mistral-small-latest'
const CLAUDE_MODEL = 'claude-haiku-4-5-20251001'
const OPENAI_MODEL = 'gpt-4.1-mini'
const API_TIMEOUT_MS = 15_000

type GeminiTextPart = { text: string }
type GeminiInlineDataPart = { inline_data: { mime_type: string; data: string } }
type GeminiPart = GeminiTextPart | GeminiInlineDataPart
type GeminiContent = { role: 'user' | 'model'; parts: GeminiPart[] }

type ClaudeTextContent = { type: 'text'; text: string }
type ClaudeImageContent = { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
type ClaudeContent = string | Array<ClaudeTextContent | ClaudeImageContent>
type ClaudeMessage = { role: 'user' | 'assistant'; content: ClaudeContent }

type OpenAITextContent = { type: 'text'; text: string }
type OpenAIImageContent = { type: 'image_url'; image_url: { url: string } }
type OpenAIMessage = { role: 'system' | 'user' | 'assistant'; content: string | Array<OpenAITextContent | OpenAIImageContent> }

async function fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(`Request timed out after ${API_TIMEOUT_MS / 1000}s`)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

function extractErrorMessage(errorText: string): string {
  try {
    const parsed = JSON.parse(errorText)
    return parsed.error?.message || errorText
  } catch {
    return errorText
  }
}

function buildGeminiContents(history: ConversationTurn[], message: string, image?: string): GeminiContent[] {
  const contents: GeminiContent[] = history.map((turn) => {
    const parts: GeminiPart[] = []
    if (turn.image && turn.role === 'user') {
      parts.push({ inline_data: { mime_type: detectMediaType(turn.image), data: turn.image } })
    }
    parts.push({ text: turn.text })
    return { role: turn.role === 'user' ? 'user' : 'model', parts }
  })
  const userParts: GeminiPart[] = []
  if (image) {
    userParts.push({ inline_data: { mime_type: detectMediaType(image), data: image } })
  }
  userParts.push({ text: message })
  contents.push({ role: 'user', parts: userParts })
  return contents
}

function buildClaudeMessages(history: ConversationTurn[], message: string, image?: string): ClaudeMessage[] {
  const messages: ClaudeMessage[] = history.map((turn) => {
    if (turn.image && turn.role === 'user') {
      return {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: detectMediaType(turn.image), data: turn.image } },
          { type: 'text', text: turn.text },
        ],
      }
    }
    return { role: turn.role === 'user' ? 'user' : 'assistant', content: turn.text }
  })
  if (image) {
    messages.push({
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: detectMediaType(image), data: image } },
        { type: 'text', text: message },
      ],
    })
  } else {
    messages.push({ role: 'user', content: message })
  }
  return messages
}

async function callGemini(systemPrompt: string, userPrompt: string, history: ConversationTurn[], image?: string): Promise<CelestinResponse> {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not configured')

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`
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
        thinkingConfig: { thinkingBudget: image ? 1024 : 0 },
      },
    }),
  })

  if (!response.ok) {
    throw new Error(`Gemini 2.5 Flash (${response.status}): ${extractErrorMessage(await response.text())}`)
  }

  const result = await response.json()
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('No text response from Gemini')

  return parseAndValidate(text)
}

async function callMistral(systemPrompt: string, userPrompt: string, history: ConversationTurn[], image?: string): Promise<CelestinResponse> {
  if (!MISTRAL_API_KEY) throw new Error('MISTRAL_API_KEY not configured')

  const messages: Array<{ role: string; content: string }> = [
    { role: 'system', content: systemPrompt },
  ]
  for (const turn of history) {
    messages.push({ role: turn.role === 'user' ? 'user' : 'assistant', content: turn.text })
  }
  const finalPrompt = image
    ? userPrompt + "\n\n(L'utilisateur a envoye une photo mais je ne peux pas la voir. Reponds en te basant uniquement sur le texte.)"
    : userPrompt
  messages.push({ role: 'user', content: finalPrompt })

  const response = await fetchWithTimeout('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${MISTRAL_API_KEY}`,
    },
    body: JSON.stringify({
      model: MISTRAL_MODEL,
      max_tokens: 4096,
      temperature: 0.5,
      response_format: { type: 'json_object' },
      messages,
    }),
  })

  if (!response.ok) {
    throw new Error(`Mistral ${MISTRAL_MODEL} (${response.status}): ${extractErrorMessage(await response.text())}`)
  }

  const result = await response.json()
  const text = result.choices?.[0]?.message?.content
  if (!text) throw new Error('No text response from Mistral')

  return parseAndValidate(text)
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

  const messages: OpenAIMessage[] = [
    { role: 'system', content: systemPrompt },
  ]
  for (const turn of history) {
    if (turn.image && turn.role === 'user') {
      messages.push({
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:${detectMediaType(turn.image)};base64,${turn.image}` } },
          { type: 'text', text: turn.text },
        ],
      })
    } else {
      messages.push({ role: turn.role === 'user' ? 'user' : 'assistant', content: turn.text })
    }
  }
  if (image) {
    messages.push({
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: `data:${detectMediaType(image)};base64,${image}` } },
        { type: 'text', text: userPrompt },
      ],
    })
  } else {
    messages.push({ role: 'user', content: userPrompt })
  }

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
      mistral: { name: 'Mistral', call: () => callMistral(systemPrompt, userPrompt, history, image) },
      openai: { name: 'GPT-4.1 mini', call: () => callOpenAI(systemPrompt, userPrompt, history, image) },
    }
    const selected = providerMap[forcedProvider.toLowerCase()]
    if (!selected) throw new Error(`Unknown provider: ${forcedProvider}`)
    console.log(`[celestin] Forced provider: ${selected.name}`)
    const response = await selected.call()
    return { provider: selected.name, response }
  }

  const providers: Array<{ name: string; call: () => Promise<CelestinResponse> }> = []
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

