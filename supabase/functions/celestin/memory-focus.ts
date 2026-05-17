import type { ConversationState } from "./conversation-state.ts"
import type { TurnInterpretation } from "./turn-interpreter.ts"
import type { RequestBody } from "./types.ts"
import { isMemoryFocusLookup } from "../../../shared/celestin/memory-intent-patterns.ts"

function normalizeForRouting(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’']/g, ' ')
    .trim()
}

const FOCUS_STOP_WORDS = /^(Le|La|Les|Un|Une|Et|Je|Tu|Il|Elle|On|Ce|Cet|Cette|Ca|Ça|Soit)$/i
const GENERIC_FOCUS_WORDS = new Set(['degustation', 'note', 'souvenir', 'vin', 'vins', 'etoiles', 'millesime', 'impression', 't en', 'c est', 'c etait', 'marc'])

function extractFocusCandidate(source: string): string | null {
  const matches = source.match(/\b([A-Z][A-Za-zÀ-ÿ'’.-]{2,}(?:\s+(?:d[eu]|des|la|le|les|[A-Z][A-Za-zÀ-ÿ'’.-]{2,})){0,4})\b/g)
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
  if (/[.!?]/.test(candidate)) return true
  return GENERIC_FOCUS_WORDS.has(normalizeForRouting(candidate))
}

function hasAmbiguousNonUserAttribution(text: string): boolean {
  const normalized = normalizeForRouting(text)
  return /\b(?:m a|m avait|m en a|t a|t avait|t en a|nous a|on m a)\s+(?:parle|conseille|recommande|dit)\b/.test(normalized)
    || /\b(?:conseil|recommandation|avis)\s+de\b/.test(normalized)
}

function hasDirectTastingEvidence(text: string): boolean {
  const normalized = normalizeForRouting(text)
  return /\b(?:qu['’ ]on a bu|que j['’ ]ai bu|deja bu|j['’ ]ai bu|on a bu|deguste|goute|ouvert|millesime|combien d etoiles|quelle note|c['’ ]etait comment)\b/.test(normalized)
}

export function inferMemoryFocus(body: RequestBody, message: string, lastAssistantText?: string): string | null {
  const normalizedMessage = normalizeForRouting(message)

  if (!isMemoryFocusLookup(normalizedMessage)) return null

  const previousUserTurn = [...body.history].reverse().find((turn) => turn.role === 'user')?.text ?? null
  if (previousUserTurn && hasAmbiguousNonUserAttribution(previousUserTurn)) return null
  const sourceTexts = [previousUserTurn, lastAssistantText].filter(Boolean) as string[]

  for (const source of sourceTexts) {
    if (hasAmbiguousNonUserAttribution(source)) continue
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
  const existingFocus = state.memoryFocus ?? null

  if (interpretation.cognitiveMode !== 'tasting_memory') {
    return null
  }

  const directPatterns = [
    /\bet\s+(?:le|la|les|l')\s*([a-zà-ÿ0-9'’-]{3,})/i,
    /\bdu\s+([a-zà-ÿ0-9'’-]{3,})\b/i,
    /\bde\s+([a-zà-ÿ0-9'’-]{3,})\b/i,
  ]

  if (hasDirectTastingEvidence(body.message) && !hasAmbiguousNonUserAttribution(body.message)) {
    const namedCandidate = extractFocusCandidate(body.message)
    if (namedCandidate) return namedCandidate

    for (const pattern of directPatterns) {
      const match = body.message.match(pattern)
      const candidate = match?.[1]?.trim()
      if (candidate && !isRejectedFocusCandidate(candidate)) {
        return candidate
      }
    }
  }

  return inferMemoryFocus(body, body.message, lastAssistantText) ?? existingFocus
}
