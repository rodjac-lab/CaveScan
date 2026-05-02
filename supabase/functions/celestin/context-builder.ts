import type { ContextPlan } from "./context-plan.ts"
import { resolveContextSources, type ResolvedContextSources, type ResolvedMemoriesSource } from "./source-resolver.ts"
import type { CognitiveMode } from "./turn-interpreter.ts"
import type { RequestBody } from "./types.ts"

type ContextMode = CognitiveMode | 'greeting' | 'social'

export function buildMemoriesSection(body: RequestBody): string[] {
  if (!body.memories) return []

  const parts = [`Souvenirs de degustation :\n${body.memories}`]

  if (body.memoryEvidenceMode === 'exact') {
    parts.push('Le bloc ci-dessus est un inventaire exact deja filtre. N ajoute aucun autre vin. Pour une question sur une note ou un verbatim, reponds uniquement avec ce qui apparait ici ; sinon dis que tu ne retrouves pas la degustation.')
  } else if (body.memoryEvidenceMode === 'synthesis') {
    parts.push('Le bloc ci-dessus est la base exacte de synthese. N affirme rien hors de ces degustations.')
  }

  return parts
}

function buildResolvedMemoriesSection(memories: ResolvedMemoriesSource): string[] {
  const parts = [`Souvenirs de degustation :\n${memories.text}`]

  if (memories.evidenceMode === 'exact') {
    parts.push('Le bloc ci-dessus est un inventaire exact deja filtre. N ajoute aucun autre vin. Pour une question sur une note ou un verbatim, reponds uniquement avec ce qui apparait ici ; sinon dis que tu ne retrouves pas la degustation.')
  } else if (memories.evidenceMode === 'synthesis') {
    parts.push('Le bloc ci-dessus est la base exacte de synthese. N affirme rien hors de ces degustations.')
  }

  return parts
}

function buildSqlRetrievalSection(sqlRetrieval: string): string {
  return [
    'Faits deterministes extraits de la base (source exacte, pas une inference) :',
    sqlRetrieval,
    [
      'Regles d usage de ce bloc :',
      '- Tu ne dois JAMAIS mentionner un vin qui n apparait pas explicitement dans ce bloc — regle absolue anti-hallucination.',
      '- Suis l indicateur de rendu present dans chaque sous-bloc (ex: "Enumere les N vin(s)" liste tout ; "TROP pour lister" donne le total + 2-3 exemples + renvoie vers la page Cave).',
      '- Les blocs classement (top N par note) et temporel (vins bus sur une periode) sont toujours enumeres en entier, quel que soit leur count.',
      '- Si un fait de ce bloc contredit un souvenir ou ton intuition, le fait prime.',
      '- Le bloc "Souvenirs de degustation" sert pour la texture qualitative (verbatim, ambiance), pas pour les chiffres.',
    ].join('\n'),
  ].join('\n\n')
}

export function summarizeCaveCounts(body: RequestBody): { totalBottles: number; referenceCount: number } {
  const referenceCount = body.cave.length
  const totalBottles = body.cave.reduce((sum, bottle) => sum + Math.max(1, bottle.quantity ?? 1), 0)
  return { totalBottles, referenceCount }
}

function shouldIncludeProfile(body: RequestBody, cognitiveMode: ContextMode, contextPlan?: ContextPlan): boolean {
  if (contextPlan?.profile === 'none') return false
  if (contextPlan) return contextPlan.profile !== 'none'
  return !!body.compiledProfileMarkdown?.trim() || (cognitiveMode !== 'tasting_memory' && !!body.profile)
}

function shouldIncludeMemories(body: RequestBody, cognitiveMode: ContextMode, contextPlan?: ContextPlan): boolean {
  if (!body.memories) return false
  if (contextPlan) return contextPlan.memories !== 'none'
  return cognitiveMode !== 'greeting'
    && cognitiveMode !== 'social'
    && cognitiveMode !== 'restaurant_assistant'
}

function shouldIncludeSqlRetrieval(body: RequestBody, cognitiveMode: ContextMode, contextPlan?: ContextPlan): boolean {
  if (!body.sqlRetrieval?.trim()) return false
  if (contextPlan) {
    return contextPlan.tools !== 'none'
      || contextPlan.truthPolicy === 'exact_only'
      || contextPlan.truthPolicy === 'memory_only'
  }
  return cognitiveMode !== 'greeting' && cognitiveMode !== 'social'
}

function shouldIncludeZones(contextPlan?: ContextPlan): boolean {
  return !contextPlan || contextPlan.zones === 'names'
}

function caveDetailLevel(cognitiveMode: ContextMode, contextPlan?: ContextPlan): ContextPlan['cave'] | 'legacy_detail' {
  if (contextPlan) return contextPlan.cave
  if (cognitiveMode === 'greeting' || cognitiveMode === 'social' || cognitiveMode === 'tasting_memory') return 'count'
  if (cognitiveMode === 'restaurant_assistant' || cognitiveMode === 'wine_conversation') return 'none'
  return 'legacy_detail'
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

  if (sources.sqlRetrieval) {
    parts.push(buildSqlRetrievalSection(sources.sqlRetrieval.text))
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
    parts.push(`Bouteilles en cave : ${sources.cave.totalBottles} bouteilles (${sources.cave.referenceCount} references).`)
    for (const b of sources.cave.bottles) {
      const label = [b.domaine, b.cuvee, b.appellation, b.millesime, b.couleur]
        .filter(Boolean)
        .join(' · ')
      const qty = b.quantity ?? 1
      const vol = b.volume === '0.375' ? 'demi' : b.volume === '1.5' ? 'magnum' : 'btl'
      const qtyStr = `${qty}× ${vol}`
      const extra = b.character ? ` — ${b.character}` : ''
      const localScore = typeof b.local_score === 'number' ? ` | score_local=${b.local_score}` : ''
      parts.push(`- [${b.id}] ${label} | ${qtyStr}${extra}${localScore}`)
    }
  } else {
    parts.push('Cave vide — propose uniquement des decouvertes.')
  }

  return parts.join('\n\n')
}

export function buildContextBlock(body: RequestBody, cognitiveMode: ContextMode, contextPlan?: ContextPlan): string {
  if (contextPlan) {
    return buildContextBlockFromResolvedSources(resolveContextSources(body, contextPlan))
  }

  const parts: string[] = []
  const caveCounts = summarizeCaveCounts(body)

  if (shouldIncludeProfile(body, cognitiveMode, contextPlan) && body.compiledProfileMarkdown?.trim()) {
    parts.push(`Profil utilisateur compile :\n${body.compiledProfileMarkdown}`)
  } else if (shouldIncludeProfile(body, cognitiveMode, contextPlan) && body.profile) {
    parts.push(`Profil de gout :\n${body.profile}`)
  }

  if (shouldIncludeMemories(body, cognitiveMode, contextPlan)) {
    parts.push(buildMemoriesSection(body).join('\n\n'))
  }

  if (shouldIncludeSqlRetrieval(body, cognitiveMode, contextPlan)) {
    parts.push(
      buildSqlRetrievalSection(body.sqlRetrieval!.trim()),
    )
  }

  const caveLevel = caveDetailLevel(cognitiveMode, contextPlan)
  const zones = (body as Record<string, unknown>).zones as string[] | undefined
  if (shouldIncludeZones(contextPlan) && zones && zones.length > 0) {
    parts.push(`Zones de stockage disponibles : ${zones.join(', ')}`)
  }

  if (caveLevel === 'count') {
    if (body.cave.length > 0) {
      const suffix = !contextPlan && cognitiveMode === 'tasting_memory' ? ', detail non inclus' : ''
      parts.push(`Cave : ${caveCounts.totalBottles} bouteilles (${caveCounts.referenceCount} references${suffix}).`)
    }
    return parts.join('\n\n')
  }

  if (caveLevel === 'tool_only') {
    parts.push('Cave : detail non injecte. Utilise les outils ou les faits deterministes fournis pour les questions exactes de cave.')
    return parts.join('\n\n')
  }

  if (caveLevel === 'none') {
    return parts.join('\n\n')
  }

  if (body.cave.length > 0) {
    parts.push(`Bouteilles en cave : ${caveCounts.totalBottles} bouteilles (${caveCounts.referenceCount} references).`)
    for (const b of body.cave) {
      const label = [b.domaine, b.cuvee, b.appellation, b.millesime, b.couleur]
        .filter(Boolean)
        .join(' · ')
      const qty = b.quantity ?? 1
      const vol = b.volume === '0.375' ? 'demi' : b.volume === '1.5' ? 'magnum' : 'btl'
      const qtyStr = `${qty}× ${vol}`
      const extra = b.character ? ` — ${b.character}` : ''
      const localScore = typeof b.local_score === 'number' ? ` | score_local=${b.local_score}` : ''
      parts.push(`- [${b.id}] ${label} | ${qtyStr}${extra}${localScore}`)
    }
  } else {
    parts.push('Cave vide — propose uniquement des decouvertes.')
  }

  return parts.join('\n\n')
}
