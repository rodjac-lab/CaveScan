import type { ConversationState } from "./conversation-state.ts"
import type { TurnInterpretation } from "./turn-interpreter.ts"
import type { RequestBody } from "./types.ts"
import { isMemoryFocusLookup } from "../../../shared/celestin/memory-intent-patterns.ts"

function normalizeForRouting(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}

const FOCUS_STOP_WORDS = /^(Le|La|Les|Un|Une|Et|Je|Tu|Il|Elle|On|Ce|Cet|Cette|Ca|Ça)$/i
const GENERIC_FOCUS_WORDS = new Set(['degustation', 'note', 'souvenir', 'vin', 'vins', 'etoiles', 'millesime', 'impression'])

function extractFocusCandidate(source: string): string | null {
  const matches = source.match(/\b([A-Z][A-Za-zÀ-ÿ'’.-]{2,}(?:\s+[A-Z][A-Za-zÀ-ÿ'’.-]{2,}){0,3})\b/g)
  if (!matches || matches.length === 0) return null

  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const candidate = matches[index].replace(/[.,!?;:]+$/g, '').trim()
    if (isRejectedFocusCandidate(candidate)) continue
    return candidate
  }

  return null
}

function isRejectedFocusCandidate(candidate: string): boolean {
  if (!candidate || FOCUS_STOP_WORDS.test(candidate)) return true
  return GENERIC_FOCUS_WORDS.has(normalizeForRouting(candidate))
}

export function inferMemoryFocus(body: RequestBody, message: string, lastAssistantText?: string): string | null {
  const normalizedMessage = normalizeForRouting(message)

  if (!isMemoryFocusLookup(normalizedMessage)) return null

  const previousUserTurn = [...body.history].reverse().find((turn) => turn.role === 'user')?.text ?? null
  const sourceTexts = [previousUserTurn, lastAssistantText].filter(Boolean) as string[]

  for (const source of sourceTexts) {
    const candidate = extractFocusCandidate(source)
    if (candidate) return candidate
  }

  return null
}

export function resolveActiveMemoryFocus(
  body: RequestBody,
  interpretation: TurnInterpretation,
  state: ConversationState,
  lastAssistantText?: string,
): string | null {
  const normalizedMessage = normalizeForRouting(body.message)
  const existingFocus = state.memoryFocus ?? null

  if (interpretation.cognitiveMode !== 'tasting_memory') {
    return null
  }

  const directPatterns = [
    /\bet\s+(?:le|la|les|l')\s*([a-zà-ÿ0-9'’-]{3,})/i,
    /\bdu\s+([a-zà-ÿ0-9'’-]{3,})\b/i,
    /\bde\s+([a-zà-ÿ0-9'’-]{3,})\b/i,
  ]

  for (const pattern of directPatterns) {
    const match = body.message.match(pattern)
    const candidate = match?.[1]?.trim()
    if (candidate && !isRejectedFocusCandidate(candidate)) {
      return candidate
    }
  }

  if (isMemoryFocusLookup(normalizedMessage) && existingFocus) {
    return existingFocus
  }

  return inferMemoryFocus(body, body.message, lastAssistantText) ?? existingFocus
}
