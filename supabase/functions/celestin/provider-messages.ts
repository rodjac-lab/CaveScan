import { detectMediaType } from "./media.ts"
import type { ConversationTurn } from "./types.ts"

type GeminiTextPart = { text: string }
type GeminiInlineDataPart = { inline_data: { mime_type: string; data: string } }
type GeminiPart = GeminiTextPart | GeminiInlineDataPart
export type GeminiContent = { role: 'user' | 'model'; parts: GeminiPart[] }

type ClaudeTextContent = { type: 'text'; text: string }
type ClaudeImageContent = { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
type ClaudeContent = string | Array<ClaudeTextContent | ClaudeImageContent>
export type ClaudeMessage = { role: 'user' | 'assistant'; content: ClaudeContent }

type OpenAITextContent = { type: 'text'; text: string }
type OpenAIImageContent = { type: 'image_url'; image_url: { url: string } }
export type OpenAIMessage = { role: 'system' | 'user' | 'assistant'; content: string | Array<OpenAITextContent | OpenAIImageContent> }

export function buildGeminiContents(history: ConversationTurn[], message: string, image?: string): GeminiContent[] {
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

export function buildClaudeMessages(history: ConversationTurn[], message: string, image?: string): ClaudeMessage[] {
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

export function buildOpenAIMessages(
  systemPrompt: string,
  userPrompt: string,
  history: ConversationTurn[],
  image?: string,
): OpenAIMessage[] {
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
  return messages
}
