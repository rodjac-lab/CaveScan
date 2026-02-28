import { stringSimilarity } from '@/lib/utils'
import type { BottleWithZone } from '@/lib/types'

const SIMILARITY_THRESHOLD_PRIMARY = 0.75
const SIMILARITY_THRESHOLD_SECONDARY = 0.8
const MATCH_SCORE_THRESHOLD = 3
const APPELLATION_MISMATCH_PENALTY = -2.0

type MatchCandidate = {
  bottle: BottleWithZone
  score: number
}

export function findMatches(
  bottles: BottleWithZone[],
  extraction: { domaine?: string | null; cuvee?: string | null; appellation?: string | null; millesime?: number | null },
): BottleWithZone[] {
  const candidates: MatchCandidate[] = []

  for (const bottle of bottles) {
    if (extraction.millesime && bottle.millesime && bottle.millesime !== extraction.millesime) {
      continue
    }

    let score = 0

    if (extraction.domaine && bottle.domaine) {
      const similarity = stringSimilarity(extraction.domaine, bottle.domaine)
      if (similarity >= SIMILARITY_THRESHOLD_PRIMARY) {
        score += similarity * 4
      }
    }

    if (extraction.cuvee && bottle.cuvee) {
      const similarity = stringSimilarity(extraction.cuvee, bottle.cuvee)
      if (similarity >= SIMILARITY_THRESHOLD_PRIMARY) {
        score += similarity * 4
      }
    }

    if (extraction.appellation && bottle.appellation) {
      const similarity = stringSimilarity(extraction.appellation, bottle.appellation)
      if (similarity >= SIMILARITY_THRESHOLD_SECONDARY) {
        score += similarity * 1.5
      } else {
        score += APPELLATION_MISMATCH_PENALTY
      }
    }

    if (extraction.millesime && bottle.millesime === extraction.millesime) {
      score += 1
    }

    if (score >= MATCH_SCORE_THRESHOLD) {
      candidates.push({ bottle, score })
    }
  }

  return candidates.sort((a, b) => b.score - a.score).map((candidate) => candidate.bottle)
}
