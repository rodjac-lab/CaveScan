import type { ConversationState } from "./conversation-state.ts"
import type { TurnInterpretation } from "./turn-interpreter.ts"
import type { RequestBody } from "./types.ts"

function normalizeForRouting(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

export function inferMemoryFocus(body: RequestBody, message: string, lastAssistantText?: string): string | null {
  const normalizedMessage = normalizeForRouting(message)
  const isEllipticMemoryFollowUp =
    /\b(combien d'etoiles|combien etoiles|quelle note|quel millesime|quelle impression)\b/i.test(normalizedMessage)
    || /^(et|et le|et la|et les|et lui|et elle)\b/i.test(normalizedMessage)

  if (!isEllipticMemoryFollowUp) return null

  const previousUserTurn = [...body.history].reverse().find((turn) => turn.role === 'user')?.text ?? null
  const sourceTexts = [previousUserTurn, lastAssistantText].filter(Boolean) as string[]

  for (const source of sourceTexts) {
    const matches = source.match(/\b([A-Z][A-Za-zÀ-ÿ'’.-]{2,}(?:\s+[A-Z][A-Za-zÀ-ÿ'’.-]{2,}){0,3})\b/g)
    if (!matches || matches.length === 0) continue

    const candidate = matches[matches.length - 1]
    if (/^(Le|La|Les|Un|Une|Et)$/i.test(candidate)) continue
    return candidate
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
    if (candidate) {
      return candidate
    }
  }

  if (/\b(rayas|gangloff|brunello|selosse|leflaive|dugat|dugat-py|grange des peres|grange des p[eè]res)\b/i.test(body.message)) {
    const explicit = body.message.match(/\b(rayas|gangloff|brunello|selosse|leflaive|dugat-py|dugat|grange des peres|grange des p[eè]res)\b/i)
    if (explicit?.[1]) return explicit[1]
  }

  const isEllipticFollowUp =
    /\b(combien d'etoiles|combien etoiles|quelle note|quel millesime|quelle impression)\b/i.test(normalizedMessage)
    || /^(et|et le|et la|et les|et lui|et elle)\b/i.test(normalizedMessage)
    || /^c'est tout[?! ]*$/i.test(normalizedMessage)

  if (isEllipticFollowUp && existingFocus) {
    return existingFocus
  }

  return inferMemoryFocus(body, body.message, lastAssistantText) ?? existingFocus
}

