import type { CognitiveMode } from "./turn-interpreter.ts"
import type { RequestBody } from "./types.ts"

type ContextMode = CognitiveMode | 'greeting' | 'social'

export function buildMemoriesSection(body: RequestBody): string[] {
  if (!body.memories) return []

  const parts = [`Souvenirs de degustation :\n${body.memories}`]

  if (body.memoryEvidenceMode === 'exact') {
    parts.push('Le bloc ci-dessus est un inventaire exact deja filtre. N ajoute aucun autre vin.')
    parts.push('Si l utilisateur demande une note, des etoiles ou un commentaire de degustation, tu dois repondre uniquement avec la note/verbatim explicitement presents dans ce bloc. Si le vin ou sa note n apparait pas, dis clairement que tu ne retrouves pas cette degustation. N invente jamais une note.')
  } else if (body.memoryEvidenceMode === 'synthesis') {
    parts.push('Le bloc ci-dessus est la base exacte de synthese. N affirme rien hors de ces degustations.')
  } else {
    parts.push('Cite des souvenirs specifiques quand pertinent.')
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
          '- Ces faits sont exhaustifs pour la question posee. Ne presume aucune omission ou erreur.',
          '- Tu ne dois JAMAIS mentionner un vin qui n apparait pas explicitement dans ce bloc. Si le bloc ne cite pas un vin, il n existe pas pour cette reponse, meme si ton intuition ou tes connaissances le suggerent. C est une regle absolue anti-hallucination.',
          '- Chaque bloc comporte un indicateur de rendu : si le bloc dit "Enumere les N vin(s) ci-dessous", liste-les tous, un par un. S il dit "L inventaire compte N fiches — TROP pour lister", donne uniquement le chiffre total + 2-3 exemples emblematiques tires du bloc, et renvoie l utilisateur vers la page Cave pour la liste complete.',
          '- Le bloc classement (top N par note) doit toujours etre enumere dans son integralite, quel que soit son count.',
          '- Le bloc temporel (vins bus sur une periode) doit etre enumere dans son integralite, meme pour 10+ vins — c est un historique, pas un inventaire de stock.',
          '- Le chiffre total (ex: "15 vin(s) bu(s)", "9 fiche(s)", "10 exemplaire(s)") est la bonne reponse au "combien". Ne l arrondis pas.',
          '- Quand plusieurs blocs coexistent, suis l indicateur de rendu de CHACUN independamment.',
          '- Si un fait de ce bloc contredit un souvenir ou ton intuition, le fait prime.',
          '- Le bloc "Souvenirs de degustation" reste utile pour la texture qualitative (verbatim, ambiance, descripteurs), pas pour les chiffres.',
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
