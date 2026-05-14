import type { ContextPlan } from "./context-plan.ts"
import {
  parseCellarOriginLookup,
  parseFilteredCellarBottleCount,
  parseGenericCellarBottleCount,
  parseTastingCountQuery,
  parseTastingExtremeQuery,
  parseTastingRatingQuery,
  parseTastingRelationshipSpanQuery,
  parseVolumeCellarBottleCount,
} from "../../../shared/celestin/exact-query.ts"
import type { ResolvedContextSources } from "./source-resolver.ts"
import type { RoutingIntent } from "./turn-interpreter.ts"
import type { CelestinResponse, RequestBody, WineExtraction } from "./types.ts"

type ResolvedTastingRow = NonNullable<NonNullable<ResolvedContextSources['tastings']>['rows']>[number]

function formatTastingLabel(row: ResolvedTastingRow): string {
  return [
    row.domaine,
    row.cuvee,
    row.appellation,
    row.millesime,
  ].filter(Boolean).join(' ')
}

function formatRating(rating: number): string {
  return `${Number.isInteger(rating) ? rating.toString() : rating.toFixed(1)}/5`
}

function formatDate(value: string | null | undefined): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Paris',
  }).format(date)
}

function cleanWineField(value: string | null | undefined): string | null {
  const cleaned = value
    ?.replace(/^[\s,.;:!?'"-]+|[\s,.;:!?'"-]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned || null
}

function parseEncavageExtraction(message: string): WineExtraction | null {
  const millesimeMatch = message.match(/\b(19|20)\d{2}\b/)
  const millesime = millesimeMatch ? Number(millesimeMatch[0]) : null
  let working = message
    .replace(/\b(19|20)\d{2}\b/g, ' ')
    .replace(/\b(une?|des|du|de la|de l'|d'|bouteilles?|magnums?|demi[- ]bouteilles?)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const domaineMatch = working.match(/\b(?:domaine|chateau|château|clos|maison)\s+([A-ZÀ-ÖØ-Þ][\p{L}'’-]*(?:\s+[A-ZÀ-ÖØ-Þ][\p{L}'’-]*){0,3})/iu)
  const domaine = cleanWineField(domaineMatch ? domaineMatch[0] : null)

  if (domaine) {
    working = working.replace(domaineMatch![0], ' ').replace(/\s+/g, ' ').trim()
  }

  const appellation = cleanWineField(working)

  if (!domaine && !appellation) return null

  return {
    domaine,
    cuvee: null,
    appellation,
    millesime,
    couleur: null,
    country: null,
    region: null,
    quantity: 1,
    volume: '0.75',
  }
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

function previousUserText(body: RequestBody): string {
  return [...body.history].reverse().find((turn) => turn.role === 'user')?.text ?? ''
}

function isRedColorFollowUp(message: string): boolean {
  return /\b(plutot|plutôt|en|un)\s+rouge\b/i.test(message)
}

function pluralBottles(n: number): string {
  return n === 1 ? '1 bouteille' : `${n} bouteilles`
}

function pluralReferences(n: number): string {
  return n === 1 ? '1 reference' : `${n} references`
}

interface CellarCountReplyInput {
  total: number
  references: number
  label: string
  emptyMessage: string
  filledMessage: string
  emptyChips?: string[]
  filledChips?: string[]
}

function buildCellarCountReply({
  total,
  references,
  emptyMessage,
  filledMessage,
  emptyChips = ['Voir la cave', 'Que boire ce soir ?'],
  filledChips = ['Voir la cave', 'Quels rouges ?', 'Que boire ce soir ?'],
}: CellarCountReplyInput): CelestinResponse {
  if (total === 0) {
    return { message: emptyMessage, ui_action: null, action_chips: emptyChips }
  }
  return {
    message: filledMessage
      .replace('{bottles}', pluralBottles(total))
      .replace('{references}', pluralReferences(references)),
    ui_action: null,
    action_chips: filledChips,
  }
}

export function buildDeterministicResponse(input: {
  body: RequestBody
  routingIntent: RoutingIntent
  contextPlan: ContextPlan
  resolvedSources: ResolvedContextSources
}): CelestinResponse | null {
  if (input.body.image) return null

  const state = input.body.conversationState
  if (
    input.routingIntent === 'wine_question'
    && isRedColorFollowUp(input.body.message)
    && /\b(vin italien|italien|italie)\b/.test(normalizeText(previousUserText(input.body)))
  ) {
    return {
      message: 'Pour un rouge italien, vise un style frais et digeste : Chianti, Barbera, Etna Rosso ou Valpolicella plutôt qu’un rouge trop boisé. Tu gardes l’Italie, mais avec de l’acidité et pas trop de tanins.',
      ui_action: null,
      action_chips: ['Et en blanc italien ?', 'Pour quel plat ?', 'Voir ma cave'],
    }
  }

  if (
    input.routingIntent === 'encavage_request'
    && state?.phase === 'collecting_info'
    && state.taskType === 'encavage'
  ) {
    const extraction = parseEncavageExtraction(input.body.message)
    if (extraction) {
      return {
        message: 'Je te prépare la fiche.',
        ui_action: {
          kind: 'prepare_add_wine',
          payload: { extraction },
        },
        action_chips: null,
      }
    }
  }

  const isCellarLookupExact = input.routingIntent === 'cellar_lookup'
    && input.contextPlan.truthPolicy === 'exact_only'

  if (isCellarLookupExact && parseGenericCellarBottleCount(input.body.message)) {
    return buildCellarCountReply({
      total: input.resolvedSources.cave.totalBottles,
      references: input.resolvedSources.cave.referenceCount,
      label: '',
      emptyMessage: 'Ta cave est vide pour l instant.',
      filledMessage: 'Tu as {bottles} en cave, sur {references}.',
      emptyChips: ['Ajouter une bouteille', 'Voir la cave'],
    })
  }

  const filteredCellarCount = parseFilteredCellarBottleCount(input.body.message)
  if (
    isCellarLookupExact
    && filteredCellarCount
    && input.resolvedSources.cave.countFilter?.kind === 'color'
    && input.resolvedSources.cave.countFilter.filter === filteredCellarCount.filter
  ) {
    const label = input.resolvedSources.cave.countFilter.label
    return buildCellarCountReply({
      total: input.resolvedSources.cave.totalBottles,
      references: input.resolvedSources.cave.referenceCount,
      label,
      emptyMessage: `Je ne trouve aucun ${label} en cave.`,
      filledMessage: `Tu as {bottles} de ${label} en cave, sur {references}.`,
    })
  }

  const volumeCount = parseVolumeCellarBottleCount(input.body.message)
  if (
    isCellarLookupExact
    && volumeCount
    && input.resolvedSources.cave.countFilter?.kind === 'volume'
    && input.resolvedSources.cave.countFilter.filter === volumeCount.filter
  ) {
    const label = input.resolvedSources.cave.countFilter.label
    return buildCellarCountReply({
      total: input.resolvedSources.cave.totalBottles,
      references: input.resolvedSources.cave.referenceCount,
      label,
      emptyMessage: `Je ne trouve aucun ${label} en cave.`,
      filledMessage: `Tu as {bottles} en ${label} ({references}).`,
    })
  }

  const originLookup = parseCellarOriginLookup(input.body.message)
  if (
    isCellarLookupExact
    && originLookup
    && input.resolvedSources.cave.countFilter?.kind === 'origin'
    && input.resolvedSources.cave.countFilter.needle === originLookup.needle
  ) {
    const matches = input.resolvedSources.cave.countFilter.matches
    const total = input.resolvedSources.cave.totalBottles
    const label = input.resolvedSources.cave.countFilter.label
    const polarity = input.resolvedSources.cave.countFilter.polarity

    if (matches === 0) {
      const message = polarity === 'has_not'
        ? `Effectivement, tu n as pas de ${label} en cave.`
        : `Je ne trouve pas de ${label} en cave.`
      return {
        message,
        ui_action: null,
        action_chips: ['Voir la cave', 'Que boire ce soir ?'],
      }
    }

    const referencePart = matches === 1 ? '1 reference' : `${matches} references`
    const bottlePart = total === 1 ? '1 bouteille' : `${total} bouteilles`
    return {
      message: `Tu as ${bottlePart} de ${label} en cave (${referencePart}).`,
      ui_action: null,
      action_chips: ['Voir la cave', 'Quoi en boire ce soir ?'],
    }
  }

  const tastingQuery = parseTastingCountQuery(input.body.message)
  if (
    tastingQuery
    && (input.routingIntent === 'tasting_log' || input.routingIntent === 'memory_lookup')
    && input.contextPlan.truthPolicy === 'memory_only'
    && input.resolvedSources.tastings?.kind === 'count'
  ) {
    const total = input.resolvedSources.tastings.totalRows
    const scope = input.resolvedSources.tastings.query
      ? ` de ${input.resolvedSources.tastings.queryLabel ?? input.resolvedSources.tastings.query}`
      : ''

    if (total === 0) {
      return {
        message: `Je ne retrouve aucune degustation${scope}.`,
        ui_action: null,
        action_chips: ['Voir les degustations', 'Ajouter une degustation'],
      }
    }

    const count = total === 1 ? '1 degustation' : `${total} degustations`
    return {
      message: `Tu as ${count}${scope}.`,
      ui_action: null,
      action_chips: ['Voir les degustations', 'Retrouver une note'],
    }
  }

  const ratingQuery = parseTastingRatingQuery(input.body.message)
  if (
    ratingQuery
    && (input.routingIntent === 'tasting_log' || input.routingIntent === 'memory_lookup')
    && input.contextPlan.truthPolicy === 'memory_only'
    && input.resolvedSources.tastings?.kind === 'rating'
  ) {
    const rows = input.resolvedSources.tastings.rows ?? []
    if (rows.length !== 1) return null

    const row = rows[0]
    if (row.rating == null) return null

    const label = formatTastingLabel(row) || input.resolvedSources.tastings.queryLabel || ratingQuery.query
    return {
      message: `Tu avais mis ${formatRating(row.rating)} a ${label}.`,
      ui_action: null,
      action_chips: ['Voir les degustations', 'Retrouver une autre note'],
    }
  }

  const extremeQuery = parseTastingExtremeQuery(input.body.message)
  if (
    extremeQuery
    && (input.routingIntent === 'tasting_log' || input.routingIntent === 'memory_lookup')
    && input.contextPlan.truthPolicy === 'memory_only'
    && input.resolvedSources.tastings?.kind === 'extreme'
  ) {
    const row = input.resolvedSources.tastings.rows?.[0]
    if (!row) {
      const fallback = {
        oldest: 'Je ne retrouve aucune degustation datee fiable.',
        newest: 'Je ne retrouve aucune degustation datee fiable.',
        best: 'Je ne retrouve aucune degustation notee fiable.',
        worst: 'Je ne retrouve aucune degustation notee fiable.',
      }[extremeQuery.extreme]
      return {
        message: fallback,
        ui_action: null,
        action_chips: ['Voir les degustations', 'Retrouver une autre note'],
      }
    }

    const label = formatTastingLabel(row)
    if (!label) return null

    const date = formatDate(row.drunk_at)
    const rating = row.rating != null ? formatRating(row.rating) : null
    const suffix = extremeQuery.extreme === 'best' || extremeQuery.extreme === 'worst'
      ? rating ? `, note ${rating}` : ''
      : date ? `, degustee le ${date}` : ''

    const intro = {
      oldest: 'Ta plus ancienne degustation enregistree est',
      newest: 'Ta degustation la plus recente est',
      best: 'Ta degustation la mieux notee est',
      worst: 'Ta degustation la moins bien notee est',
    }[extremeQuery.extreme]

    return {
      message: `${intro} ${label}${suffix}.`,
      ui_action: null,
      action_chips: ['Voir les degustations', 'Retrouver une autre note'],
    }
  }

  const spanQuery = parseTastingRelationshipSpanQuery(input.body.message)
  if (
    spanQuery
    && (input.routingIntent === 'tasting_log' || input.routingIntent === 'memory_lookup')
    && input.contextPlan.truthPolicy === 'memory_only'
    && input.resolvedSources.tastings?.kind === 'span'
  ) {
    const total = input.resolvedSources.tastings.totalRows
    const firstDate = input.resolvedSources.tastings.firstDrunkAt
    const firstRow = input.resolvedSources.tastings.rows?.[0]
    if (!firstDate || !firstRow) return null

    const date = formatDate(firstDate)
    const label = formatTastingLabel(firstRow)
    if (!date || !label) return null

    const count = total === 1 ? '1 degustation' : `${total} degustations`
    return {
      message: `Je ne peux pas dater notre relation avec certitude depuis les donnees de degustation. Le plus ancien enregistrement que je retrouve est le ${date} : ${label}. Il y a ${count} dans l historique.`,
      ui_action: null,
      action_chips: ['Voir la premiere degustation', 'Quelle est la plus recente ?'],
    }
  }

  return null
}
