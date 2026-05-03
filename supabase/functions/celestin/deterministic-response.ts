import type { ContextPlan } from "./context-plan.ts"
import {
  parseFilteredCellarBottleCount,
  parseGenericCellarBottleCount,
  parseTastingCountQuery,
  parseTastingRatingQuery,
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

  if (
    input.routingIntent === 'cellar_lookup'
    && input.contextPlan.truthPolicy === 'exact_only'
    && parseGenericCellarBottleCount(input.body.message)
  ) {
    const total = input.resolvedSources.cave.totalBottles
    const references = input.resolvedSources.cave.referenceCount

    if (total === 0) {
      return {
        message: 'Ta cave est vide pour l instant.',
        ui_action: null,
        action_chips: ['Ajouter une bouteille', 'Voir la cave'],
      }
    }

    const referencePart = references === 1 ? '1 reference' : `${references} references`
    const bottlePart = total === 1 ? '1 bouteille' : `${total} bouteilles`

    return {
      message: `Tu as ${bottlePart} en cave, sur ${referencePart}.`,
      ui_action: null,
      action_chips: ['Voir la cave', 'Quels rouges ?', 'Que boire ce soir ?'],
    }
  }

  const filteredCellarCount = parseFilteredCellarBottleCount(input.body.message)
  if (
    filteredCellarCount
    && input.routingIntent === 'cellar_lookup'
    && input.contextPlan.truthPolicy === 'exact_only'
    && input.resolvedSources.cave.countFilter?.filter === filteredCellarCount.filter
  ) {
    const total = input.resolvedSources.cave.totalBottles
    const references = input.resolvedSources.cave.referenceCount
    const label = input.resolvedSources.cave.countFilter.label

    if (total === 0) {
      return {
        message: `Je ne trouve aucun ${label} en cave.`,
        ui_action: null,
        action_chips: ['Voir la cave', 'Que boire ce soir ?'],
      }
    }

    const referencePart = references === 1 ? '1 reference' : `${references} references`
    const bottlePart = total === 1 ? '1 bouteille' : `${total} bouteilles`
    return {
      message: `Tu as ${bottlePart} de ${label} en cave, sur ${referencePart}.`,
      ui_action: null,
      action_chips: ['Voir la cave', 'Quels rouges ?', 'Que boire ce soir ?'],
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

  return null
}
