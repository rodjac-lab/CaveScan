import { describe, expect, it } from 'vitest'
import {
  isExactPastTastingQuery,
  isMemoryReferenceQuery,
} from '../../shared/celestin/memory-intent-patterns'

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

describe('shared memory intent patterns', () => {
  it('recognizes direct tasting-memory references used by routing', () => {
    expect(isMemoryReferenceQuery(normalize('Tu te souviens du restaurant a Rome ?'))).toBe(true)
    expect(isMemoryReferenceQuery(normalize("J'ai deja bu ce Rayas ?"))).toBe(true)
    expect(isMemoryReferenceQuery(normalize("Quelle note j'avais mis au Caillez Lemaire ?"))).toBe(true)
  })

  it('keeps exact past tasting queries separate from broader memory references', () => {
    expect(isExactPastTastingQuery(normalize("J'ai deja bu ce Rayas ?"))).toBe(true)
    expect(isExactPastTastingQuery(normalize('Tu te souviens du restaurant a Rome ?'))).toBe(false)
  })

  it('does not classify ordinary wine questions as memory references', () => {
    expect(isMemoryReferenceQuery(normalize("C'est quoi un Saint-Emilion ?"))).toBe(false)
  })
})
