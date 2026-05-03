import type { ResolvedContextSources, ResolvedMemoriesSource } from "./source-resolver.ts"

function buildResolvedMemoriesSection(memories: ResolvedMemoriesSource): string[] {
  const parts = [`Souvenirs de degustation :\n${memories.text}`]

  if (memories.evidenceMode === 'exact') {
    parts.push('Le bloc ci-dessus est un inventaire exact deja filtre. N ajoute aucun autre vin. Pour une question sur une note ou un verbatim, reponds uniquement avec ce qui apparait ici ; sinon dis que tu ne retrouves pas la degustation.')
  } else if (memories.evidenceMode === 'synthesis') {
    parts.push('Le bloc ci-dessus est la base exacte de synthese. N affirme rien hors de ces degustations.')
  }

  return parts
}

export function buildContextBlockFromResolvedSources(sources: ResolvedContextSources): string {
  const parts: string[] = []

  if (sources.profile?.compiledMarkdown) {
    parts.push(`Profil utilisateur compile :\n${sources.profile.compiledMarkdown}`)
  } else if (sources.profile?.legacyProfile) {
    parts.push(`Profil de gout :\n${sources.profile.legacyProfile}`)
  }

  if (sources.memories) {
    parts.push(buildResolvedMemoriesSection(sources.memories).join('\n\n'))
  }

  if (sources.zones.length > 0) {
    parts.push(`Zones de stockage disponibles : ${sources.zones.join(', ')}`)
  }

  if (sources.cave.level === 'count') {
    if (sources.cave.referenceCount > 0) {
      parts.push(`Cave : ${sources.cave.totalBottles} bouteilles (${sources.cave.referenceCount} references).`)
    }
    return parts.join('\n\n')
  }

  if (sources.cave.level === 'tool_only') {
    parts.push('Cave : detail non injecte. Utilise les outils ou les faits deterministes fournis pour les questions exactes de cave.')
    return parts.join('\n\n')
  }

  if (sources.cave.level === 'none') {
    return parts.join('\n\n')
  }

  if (sources.cave.bottles.length > 0) {
    if (sources.cave.origin === 'preempted_candidates') {
      const totalLabel = sources.cave.totalBottles > 0
        ? ` (cave totale : ${sources.cave.totalBottles} bouteilles)`
        : ''
      parts.push(`Candidats cave pre-selectionnes : ${sources.cave.bottles.length} bouteilles${totalLabel}. Choisis 1 a 3 bouteilles parmi cette liste en mettant leur bottle_id (8 caracteres) dans recommendation_selection. Ne propose pas de bouteille hors de cette liste.`)
    } else {
      parts.push(`Bouteilles en cave : ${sources.cave.totalBottles} bouteilles (${sources.cave.referenceCount} references).`)
    }
    for (const b of sources.cave.bottles) {
      const label = [b.domaine, b.cuvee, b.appellation, b.millesime, b.couleur]
        .filter(Boolean)
        .join(' · ')
      const qty = b.quantity ?? 1
      const vol = b.volume === '0.375' ? 'demi' : b.volume === '1.5' ? 'magnum' : 'btl'
      const qtyStr = `${qty}× ${vol}`
      const extra = b.character ? ` — ${b.character}` : ''
      const pairings = b.food_pairings?.length ? ` | accords=${b.food_pairings.join(', ')}` : ''
      const localScore = typeof b.local_score === 'number' ? ` | score_local=${b.local_score}` : ''
      parts.push(`- [${b.id}] ${label} | ${qtyStr}${extra}${pairings}${localScore}`)
    }
  } else {
    parts.push('Cave vide — propose uniquement des decouvertes.')
  }

  return parts.join('\n\n')
}
