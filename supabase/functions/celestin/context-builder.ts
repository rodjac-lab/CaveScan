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

export function summarizeCaveCounts(body: RequestBody): { totalBottles: number; referenceCount: number } {
  const referenceCount = body.cave.length
  const totalBottles = body.cave.reduce((sum, bottle) => sum + Math.max(1, bottle.quantity ?? 1), 0)
  return { totalBottles, referenceCount }
}

export function buildContextBlock(body: RequestBody, cognitiveMode: ContextMode): string {
  const parts: string[] = []
  const caveCounts = summarizeCaveCounts(body)

  if (body.compiledProfileMarkdown?.trim()) {
    parts.push(`Profil utilisateur compile :\n${body.compiledProfileMarkdown}`)
  } else if (cognitiveMode !== 'tasting_memory' && body.profile) {
    parts.push(`Profil de gout :\n${body.profile}`)
  }

  const shouldIncludeTastingMemories =
    !!body.memories
    && cognitiveMode !== 'greeting'
    && cognitiveMode !== 'social'
    && cognitiveMode !== 'restaurant_assistant'

  if (shouldIncludeTastingMemories) {
    parts.push(buildMemoriesSection(body).join('\n\n'))
  }

  const shouldIncludeSqlRetrieval =
    !!body.sqlRetrieval?.trim()
    && cognitiveMode !== 'greeting'
    && cognitiveMode !== 'social'

  if (shouldIncludeSqlRetrieval) {
    parts.push(
      [
        'Faits deterministes extraits de la base (source exacte, pas une inference) :',
        body.sqlRetrieval!.trim(),
        [
          'Regles d usage de ce bloc :',
          '- Tu ne dois JAMAIS mentionner un vin qui n apparait pas explicitement dans ce bloc — regle absolue anti-hallucination.',
          '- Suis l indicateur de rendu present dans chaque sous-bloc (ex: "Enumere les N vin(s)" liste tout ; "TROP pour lister" donne le total + 2-3 exemples + renvoie vers la page Cave).',
          '- Les blocs classement (top N par note) et temporel (vins bus sur une periode) sont toujours enumeres en entier, quel que soit leur count.',
          '- Si un fait de ce bloc contredit un souvenir ou ton intuition, le fait prime.',
          '- Le bloc "Souvenirs de degustation" sert pour la texture qualitative (verbatim, ambiance), pas pour les chiffres.',
        ].join('\n'),
      ].join('\n\n'),
    )
  }

  if (cognitiveMode === 'greeting' || cognitiveMode === 'social') {
    if (body.cave.length > 0) {
      parts.push(`Cave : ${caveCounts.totalBottles} bouteilles (${caveCounts.referenceCount} references).`)
    }
    return parts.join('\n\n')
  }

  if (cognitiveMode === 'restaurant_assistant' || cognitiveMode === 'wine_conversation') {
    return parts.join('\n\n')
  }

  if (cognitiveMode === 'tasting_memory') {
    if (body.cave.length > 0) {
      parts.push(`Cave : ${caveCounts.totalBottles} bouteilles (${caveCounts.referenceCount} references, detail non inclus).`)
    }
    return parts.join('\n\n')
  }

  const zones = (body as Record<string, unknown>).zones as string[] | undefined
  if (zones && zones.length > 0) {
    parts.push(`Zones de stockage disponibles : ${zones.join(', ')}`)
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
