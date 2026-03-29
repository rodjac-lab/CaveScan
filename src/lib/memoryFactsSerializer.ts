/**
 * Serializes memory facts for injection into the Celestin prompt.
 * Compact format (~200-300 tokens for 10-15 facts).
 */

import type { MemoryFact } from '@/lib/chatPersistence'

const CATEGORY_LABELS: Record<string, string> = {
  preference: 'Aime',
  aversion: 'N\'aime pas',
  context: 'Contexte',
  life_event: 'Vie',
  wine_knowledge: 'Sait',
  social: 'Social',
  cellar_intent: 'Intention',
}

export function serializeMemoryFactsForPrompt(facts: MemoryFact[]): string | undefined {
  if (facts.length === 0) return undefined

  const lines = facts.map(f => {
    const label = CATEGORY_LABELS[f.category] ?? f.category
    const temp = f.is_temporary ? ' (temporaire)' : ''
    return `- ${label} : ${f.fact}${temp}`
  })

  return `Ce que tu sais de l'utilisateur :\n${lines.join('\n')}`
}
