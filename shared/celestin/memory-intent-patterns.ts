/**
 * Centralised regex groups that detect tasting-memory intent in user messages.
 * Previously these patterns were duplicated across three files
 * (memory-focus.ts, turn-signals.ts, tastingMemoryFilters.ts) with subtle
 * drift between them; this module is the single source of truth.
 *
 * Every pattern here assumes its input is already normalized via the
 * routing/match pipeline:
 *   - lowercased
 *   - NFD-decomposed and diacritic-stripped (so "noté" → "note")
 *   - trimmed
 *
 * Patterns therefore use lowercase ASCII forms only and omit the `i` flag.
 */

// Asks about a rating, vintage, or impression on a past tasting.
export const RATING_OR_VINTAGE_ASK_PATTERNS: readonly RegExp[] = [
  /\b(combien d'etoiles|combien etoiles|quelle note|quel millesime|quelle impression)\b/,
  /\b(c'etait comment|c.etait comment|c'etait quoi|c.etait quoi)\b/,
  /\bon avait\b.*\b(note|notes|etoiles?)\b/,
]

// "Have I already drunk/tasted/opened X" questions.
export const PAST_CONSUMPTION_ASK_PATTERNS: readonly RegExp[] = [
  /\bdeja\b.*\b(bu|goute|ouvert|deguste)\b/,
  /\b(ai[- ]?je|jai|j'en|jen)\b.*\b(bu|goute|ouvert|deguste)\b/,
  /\b(quels|lesquels|combien|liste|inventaire)\b.*\b(jai|j'en|jen|deja|bu|goute|ouvert|deguste)\b/,
]

// "Did I already note X / I noted X / what's the rating I gave" — past notes.
export const PAST_NOTE_ASK_PATTERNS: readonly RegExp[] = [
  /\bdeja\b.*\b(note|notee|degustation)\b/,
  /\b(note|notes|etoiles?|rating)\b.*\b(degustation|deguste|bu|goute|mis)\b/,
  /\bje l[' ]?ai\b.*\b(note|notee|deguste|goute|bu)\b/,
]

// Recall asks ("retrouve / retrouverais ce souvenir").
export const RECALL_ASK_PATTERNS: readonly RegExp[] = [
  /\b(retrouve|retrouver|retrouverais|retrouvera?is|retrouveras)\b.*\b(note|notes|degustation|souvenir)\b/,
]

// Lightweight follow-up signals: "et le …", "c'est tout ?". Often need
// a guard (e.g. assistant was talking about memory) before being trusted
// as a memory follow-up.
export const FOLLOW_UP_STRUCTURAL_PATTERNS: readonly RegExp[] = [
  /^(et|et le|et la|et les|et lui|et elle)\b/,
  /^c'est tout[?! ]*$/,
]

// Anaphoric references that signal "the question only makes sense given
// the recent conversation" — used to trigger context backfilling.
export const ANAPHORIC_FOLLOW_UP_PATTERNS: readonly RegExp[] = [
  /\bj'en\b/,
  /\ben ai[- ]?je\b/,
  /\bce vin\b/,
  /\bce flacon\b/,
  /\bcette bouteille\b/,
  /\bce style\b/,
  /\bcela\b/,
  /\bca\b/,
]

// Catches "pas de [X]" formulations that often indicate a negative
// inventory check ("je n'ai pas de … ?").
export const NEGATIVE_INVENTORY_PATTERNS: readonly RegExp[] = [
  /\bpas de\b/,
]

// --- Low-level helpers ---

export function matchesAny(text: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text))
}

export function matchesAnyGroup(text: string, ...groups: ReadonlyArray<readonly RegExp[]>): boolean {
  return groups.some((group) => matchesAny(text, group))
}

// --- Composed predicates: the API the rest of the codebase consumes ---

/**
 * "This message looks like a memory query that may need focus inference"
 * (i.e. the user is asking about a wine they previously talked about).
 */
export function isMemoryFocusLookup(normalizedText: string): boolean {
  return matchesAnyGroup(
    normalizedText,
    RATING_OR_VINTAGE_ASK_PATTERNS,
    RECALL_ASK_PATTERNS,
    PAST_NOTE_ASK_PATTERNS,
    FOLLOW_UP_STRUCTURAL_PATTERNS,
  )
}

/**
 * "This turn is a reply to a memory-talking assistant turn." Callers must
 * additionally verify upstream that the previous assistant message was
 * actually about a memory thread (see turn-signals isMemoryFollowUp).
 */
export function isMemoryFollowUpReply(normalizedText: string): boolean {
  return matchesAnyGroup(
    normalizedText,
    FOLLOW_UP_STRUCTURAL_PATTERNS,
    RATING_OR_VINTAGE_ASK_PATTERNS,
  )
}

/**
 * "This question is best answered with an exact lookup over past tastings
 * (no semantic search, no synthesis across many wines)."
 */
export function isExactPastTastingQuery(normalizedText: string): boolean {
  return matchesAnyGroup(
    normalizedText,
    PAST_CONSUMPTION_ASK_PATTERNS,
    PAST_NOTE_ASK_PATTERNS,
    RECALL_ASK_PATTERNS,
    NEGATIVE_INVENTORY_PATTERNS,
  )
}

/**
 * "The query needs the prior conversation to be interpretable" — either
 * because of an anaphor ("ce vin"), a structural follow-up, or because
 * it's an exact past-tasting query whose subject lives upstream.
 */
export function isContextDependentMemoryQuery(normalizedText: string): boolean {
  return matchesAnyGroup(
    normalizedText,
    ANAPHORIC_FOLLOW_UP_PATTERNS,
    FOLLOW_UP_STRUCTURAL_PATTERNS,
    PAST_CONSUMPTION_ASK_PATTERNS,
    PAST_NOTE_ASK_PATTERNS,
    RECALL_ASK_PATTERNS,
    NEGATIVE_INVENTORY_PATTERNS,
  )
}
