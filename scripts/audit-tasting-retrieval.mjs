import fs from 'fs'
import path from 'path'

const ROOT = process.cwd()
const DEFAULT_OUT_DIR = path.join(ROOT, 'evals', 'results')

const DEFAULT_QUERIES = [
  'Tu te souviens de la soirée du 26 fevrier?',
  'Et le Gangloff il etait comment?',
  "Quelque chose dans l'esprit de ce qu'on avait aimé avec l'osso bucco",
  'Je cherche un vin italien',
  'Rome',
]

const FRENCH_MONTHS = {
  janvier: '01',
  fevrier: '02',
  février: '02',
  mars: '03',
  avril: '04',
  mai: '05',
  juin: '06',
  juillet: '07',
  aout: '08',
  août: '08',
  septembre: '09',
  octobre: '10',
  novembre: '11',
  decembre: '12',
  décembre: '12',
}

const STOP_WORDS = new Set([
  'je', "j'ai", 'tu', 'il', 'on', 'nous', 'vous', 'ils',
  'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'au', 'aux',
  'ce', 'ca', 'ces', 'mon', 'ma', 'mes', 'ton', 'ta', 'tes', 'son', 'sa', 'ses',
  'et', 'ou', 'mais', 'donc', 'que', 'qui', 'quoi',
  'dans', 'sur', 'avec', 'pour', 'par', 'pas', 'plus', 'bien', 'tres', 'trop',
  'est', 'sont', 'fait', 'ete', 'deja', 'encore', 'jamais', 'toujours',
  'oui', 'non', 'merci', 'aussi', 'comme', 'tout', 'tous',
  'est-ce', 'estce', 'ai', 'bu', 'goute', 'ouvert', 'ouvre', "j'en", 'jen', 'aije',
  'vin', 'vins',
])

function normalizeForMatch(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9\s'-]/g, '')
    .trim()
}

function extractQueryTerms(query) {
  return normalizeForMatch(query)
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word))
}

function isOneEditAway(left, right) {
  if (left === right) return true
  if (Math.abs(left.length - right.length) > 1) return false

  let i = 0
  let j = 0
  let edits = 0

  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      i += 1
      j += 1
      continue
    }
    edits += 1
    if (edits > 1) return false
    if (left.length > right.length) i += 1
    else if (right.length > left.length) j += 1
    else {
      i += 1
      j += 1
    }
  }

  if (i < left.length || j < right.length) edits += 1
  return edits <= 1
}

function termMatchesIdentity(term, field) {
  const normalizedField = normalizeForMatch(field)
  if (!normalizedField) return false
  if (normalizedField.includes(term)) return true

  const fieldTokens = normalizedField.split(/\s+/).filter((token) => token.length > 2)
  return fieldTokens.some((token) =>
    token.includes(term)
    || term.includes(token)
    || (term.length >= 6 && token.length >= 6 && isOneEditAway(term, token))
  )
}

function countTermMatches(normalizedQuery, terms) {
  let matches = 0
  for (const term of terms ?? []) {
    if (normalizedQuery.includes(normalizeForMatch(term))) matches += 1
  }
  return matches
}

function daysSince(dateStr) {
  if (!dateStr) return Infinity
  const diff = Date.now() - new Date(dateStr).getTime()
  return Math.max(0, diff / (1000 * 60 * 60 * 24))
}

function detectEvidenceMode(query) {
  const normalized = normalizeForMatch(query)
  if (/\b(souviens|souvenir|rappelle|rappel|soiree|soiree)\b/.test(normalized)) return 'synthesis'
  if (/\bdeja\b.*\b(bu|goute|ouvert|deguste)\b/.test(normalized)) return 'exact'
  return 'semantic'
}

function extractBottleDateKeys(bottle) {
  if (!bottle.drunk_at) return null
  const date = new Date(bottle.drunk_at)
  if (Number.isNaN(date.getTime())) return null

  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')

  return {
    iso: `${year}-${month}-${day}`,
    dayMonth: `${day}-${month}`,
  }
}

function extractDateFiltersFromQuery(query, bottles) {
  const normalizedQuery = normalizeForMatch(query)
  const results = new Set()

  const explicitFrench = normalizedQuery.match(/\b(\d{1,2})\s+(janvier|fevrier|février|mars|avril|mai|juin|juillet|aout|août|septembre|octobre|novembre|decembre|décembre)(?:\s+(\d{4}))?\b/)
  if (!explicitFrench) return []

  const day = explicitFrench[1].padStart(2, '0')
  const month = FRENCH_MONTHS[explicitFrench[2]]
  const year = explicitFrench[3]

  for (const bottle of bottles) {
    const keys = extractBottleDateKeys(bottle)
    if (!keys) continue
    if (year && keys.iso === `${year}-${month}-${day}`) results.add(keys.iso)
    else if (keys.dayMonth === `${day}-${month}`) results.add(keys.iso)
  }

  return Array.from(results)
}

function bottleMatchesDateFilter(bottle, dates) {
  if (!dates.length) return false
  const keys = extractBottleDateKeys(bottle)
  return Boolean(keys && dates.includes(keys.iso))
}

function computeHighlightScore(bottle) {
  const note = bottle.tasting_note?.trim() ?? ''
  const normalizedNote = normalizeForMatch(note)
  const tags = bottle.tasting_tags ?? null
  let score = 0

  if (bottle.rating != null) score += Number(bottle.rating) * 8
  if (tags?.sentiment === 'excellent') score += 5
  else if (tags?.sentiment === 'bon') score += 2
  if (note.length > 120) score += 2
  if (note.length > 220) score += 1

  if (/\b19\/20\b|\b20\/20\b|\bgrand millesime\b|\bgrand vin\b|\bincroyable\b|\bsublime\b/.test(normalizedNote)) score += 4
  if (/\bdeuxieme vin de la soiree\b|\bdeuxieme\b|\bderriere\b|\bjuste derriere\b|\ben dessous\b/.test(normalizedNote)) score -= 6

  return score
}

function sortSynthesisMemories(memories) {
  return [...memories].sort((left, right) => {
    const leftDays = daysSince(left.drunk_at)
    const rightDays = daysSince(right.drunk_at)
    if (leftDays !== rightDays) return leftDays - rightDays

    const leftHighlight = computeHighlightScore(left)
    const rightHighlight = computeHighlightScore(right)
    if (leftHighlight !== rightHighlight) return rightHighlight - leftHighlight

    const leftRating = left.rating ?? 0
    const rightRating = right.rating ?? 0
    if (leftRating !== rightRating) return rightRating - leftRating

    return `${left.domaine ?? ''} ${left.cuvee ?? ''} ${left.appellation ?? ''}`
      .localeCompare(`${right.domaine ?? ''} ${right.cuvee ?? ''} ${right.appellation ?? ''}`)
  })
}

function dedupeBottles(bottles) {
  const map = new Map()
  for (const bottle of bottles) {
    if (!map.has(bottle.id)) map.set(bottle.id, bottle)
  }
  return Array.from(map.values())
}

function scoreBottle(query, bottle, semanticBoostIds = new Set()) {
  const hasQuery = Boolean(query?.trim())
  const normalizedQuery = hasQuery ? normalizeForMatch(query) : ''
  const fallbackWords = hasQuery ? extractQueryTerms(query) : []
  const tags = bottle.tasting_tags ?? null
  let score = 0
  let relevanceScore = 0
  const reasons = []

  if (hasQuery) {
    const identityFields = [bottle.domaine, bottle.appellation, bottle.cuvee].filter(Boolean)
    for (const word of fallbackWords) {
      for (const field of identityFields) {
        if (termMatchesIdentity(word, field)) {
          relevanceScore += 5
          reasons.push(`identity:${word}`)
        }
      }
    }

    if (tags) {
      const platsHits = countTermMatches(normalizedQuery, tags.plats)
      const descHits = countTermMatches(normalizedQuery, tags.descripteurs)
      const keywordHits = countTermMatches(normalizedQuery, tags.keywords)
      if (platsHits) reasons.push(`plats:${platsHits}`)
      if (descHits) reasons.push(`descripteurs:${descHits}`)
      if (keywordHits) reasons.push(`keywords:${keywordHits}`)
      relevanceScore += platsHits * 3
      relevanceScore += descHits * 3
      relevanceScore += keywordHits * 2
    }

    if (bottle.tasting_note) {
      const normalizedNote = normalizeForMatch(bottle.tasting_note)
      for (const word of fallbackWords) {
        if (normalizedNote.includes(word)) {
          relevanceScore += 2
          reasons.push(`note:${word}`)
        }
      }
    }
  }

  score += relevanceScore

  if (semanticBoostIds.has(bottle.id)) {
    score += relevanceScore > 0 ? 1.2 : 0.35
    reasons.push('semantic-boost')
  }

  if (tags?.sentiment === 'excellent') {
    score += 3
    reasons.push('sentiment:excellent')
  } else if (tags?.sentiment === 'bon') {
    score += 1
    reasons.push('sentiment:bon')
  }

  if (bottle.rating != null) {
    if (bottle.rating >= 4) {
      score += 1.5
      reasons.push('rating>=4')
    }
    if (bottle.rating === 5) {
      score += 1.0
      reasons.push('rating=5')
    }
  }

  const days = daysSince(bottle.drunk_at)
  if (days < 30) {
    score += 1.5
    reasons.push('recency<30d')
  } else if (days < 90) {
    score += 0.8
    reasons.push('recency<90d')
  } else if (days < 180) {
    score += 0.3
    reasons.push('recency<180d')
  }

  return { bottle, score, relevanceScore, reasons }
}

function rankKeywordAndSemantic(query, bottles, limit, semanticRaw) {
  const semanticBoostIds = new Set((semanticRaw ?? []).map((bottle) => bottle.id))
  const pool = dedupeBottles([...(semanticRaw ?? []), ...bottles])
  const scored = pool
    .filter((bottle) => bottle.tasting_note && bottle.tasting_note.trim().length > 0)
    .map((bottle) => scoreBottle(query, bottle, semanticBoostIds))

  const relevantOnly = scored.filter((entry) => entry.relevanceScore > 0)
  const source = relevantOnly.length > 0 ? relevantOnly : scored.filter((entry) => entry.score > 0)
  return source
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
}

function parseArgs(argv) {
  const args = {
    fixture: null,
    outDir: DEFAULT_OUT_DIR,
    queries: [],
    userId: null,
    limit: 5,
    live: false,
  }

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--fixture' && argv[i + 1]) args.fixture = path.resolve(argv[++i])
    else if (arg === '--query' && argv[i + 1]) args.queries.push(argv[++i])
    else if (arg === '--user-id' && argv[i + 1]) args.userId = argv[++i]
    else if (arg === '--out-dir' && argv[i + 1]) args.outDir = path.resolve(argv[++i])
    else if (arg === '--limit' && argv[i + 1]) args.limit = Number(argv[++i]) || args.limit
    else if (arg === '--live') args.live = true
  }

  if (args.queries.length === 0) args.queries = [...DEFAULT_QUERIES]
  return args
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/)
  const env = {}
  for (const line of lines) {
    if (!line || line.trim().startsWith('#')) continue
    const idx = line.indexOf('=')
    if (idx === -1) continue
    const key = line.slice(0, idx).trim()
    const value = line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '').replace(/\\n/g, '').trim()
    env[key] = value
  }
  return env
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options)
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`${response.status} ${response.statusText}: ${text}`)
  }
  return response.json()
}

async function loadLiveDrunkBottles({ supabaseUrl, serviceRoleKey, userId }) {
  const select = [
    'id', 'domaine', 'cuvee', 'appellation', 'millesime', 'couleur',
    'country', 'region', 'tasting_note', 'tasting_tags', 'rating', 'drunk_at',
    'character', 'grape_varieties', 'food_pairings', 'rebuy', 'qpr',
  ].join(',')

  const url = `${supabaseUrl}/rest/v1/bottles?user_id=eq.${userId}&status=eq.drunk&select=${encodeURIComponent(select)}`
  const data = await fetchJson(url, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  })

  return data.map((bottle) => ({
    ...bottle,
    tasting_tags: bottle.tasting_tags ?? null,
  }))
}

async function fetchQueryEmbedding({ supabaseUrl, serviceRoleKey, query }) {
  const data = await fetchJson(`${supabaseUrl}/functions/v1/generate-embedding`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({ query }),
  })
  return data.embedding
}

async function fetchSemanticRaw({ supabaseUrl, serviceRoleKey, userId, query, limit }) {
  const embedding = await fetchQueryEmbedding({ supabaseUrl, serviceRoleKey, query })
  return fetchJson(`${supabaseUrl}/rest/v1/rpc/search_memories`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({
      query_embedding: embedding,
      match_count: limit,
      similarity_threshold: 0.3,
      requesting_user_id: userId,
    }),
  })
}

function loadFixtureDrunkBottles(fixturePath) {
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'))
  return fixture.drunk ?? []
}

function serializeBottle(bottle) {
  return {
    id: bottle.id,
    domaine: bottle.domaine ?? null,
    cuvee: bottle.cuvee ?? null,
    appellation: bottle.appellation ?? null,
    millesime: bottle.millesime ?? null,
    rating: bottle.rating ?? null,
    drunk_at: bottle.drunk_at ?? null,
    sentiment: bottle.tasting_tags?.sentiment ?? null,
    note_excerpt: bottle.tasting_note?.replace(/\s+/g, ' ').trim().slice(0, 220) ?? null,
  }
}

function printSection(title, entries) {
  console.log(`\n${title}`)
  if (!entries.length) {
    console.log('  (aucun)')
    return
  }
  entries.forEach((entry, index) => {
    const bottle = entry.bottle ?? entry
    const label = [bottle.domaine, bottle.cuvee, bottle.appellation, bottle.millesime].filter(Boolean).join(' | ')
    const score = entry.score != null ? ` score=${entry.score.toFixed(2)}` : ''
    const similarity = entry.similarity != null ? ` similarity=${Number(entry.similarity).toFixed(3)}` : ''
    const reasons = entry.reasons?.length ? ` [${entry.reasons.join(', ')}]` : ''
    console.log(`  ${index + 1}. ${label}${score}${similarity}${reasons}`)
  })
}

async function main() {
  const args = parseArgs(process.argv)
  ensureDir(args.outDir)

  const env = {
    ...readEnvFile(path.join(ROOT, '.env.local')),
    ...process.env,
  }

  const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE || env.SUPABASE_SERVICE_KEY

  let drunkBottles = []
  if (args.fixture) {
    drunkBottles = loadFixtureDrunkBottles(args.fixture)
  } else if (args.live) {
    if (!supabaseUrl || !serviceRoleKey || !args.userId) {
      throw new Error('Live mode requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and --user-id')
    }
    drunkBottles = await loadLiveDrunkBottles({ supabaseUrl, serviceRoleKey, userId: args.userId })
  } else {
    throw new Error('Provide --fixture <path> or use --live --user-id <uuid>')
  }

  const report = {
    generatedAt: new Date().toISOString(),
    source: args.fixture ? { type: 'fixture', fixture: args.fixture } : { type: 'live', userId: args.userId },
    queryCount: args.queries.length,
    results: [],
  }

  for (const query of args.queries) {
    const mode = detectEvidenceMode(query)
    const dateFilters = extractDateFiltersFromQuery(query, drunkBottles)
    const exactDateMatches = dateFilters.length > 0
      ? sortSynthesisMemories(drunkBottles.filter((bottle) => bottleMatchesDateFilter(bottle, dateFilters))).slice(0, args.limit)
      : []

    let semanticRaw = []
    if (args.live && mode === 'semantic') {
      semanticRaw = await fetchSemanticRaw({
        supabaseUrl,
        serviceRoleKey,
        userId: args.userId,
        query,
        limit: args.limit,
      })
    }

    const keywordRanked = rankKeywordAndSemantic(query, drunkBottles, args.limit, [])
    const finalRanked = mode === 'semantic'
      ? rankKeywordAndSemantic(query, drunkBottles, args.limit, semanticRaw)
      : exactDateMatches.map((bottle) => ({ bottle, score: computeHighlightScore(bottle), relevanceScore: 0, reasons: ['exact-date-filter'] }))

    const result = {
      query,
      mode,
      dateFilters,
      semanticRaw: semanticRaw.map((row) => ({ ...serializeBottle(row), similarity: row.similarity })),
      keywordRanked: keywordRanked.map((entry) => ({ ...serializeBottle(entry.bottle), score: entry.score, reasons: entry.reasons })),
      finalRanked: finalRanked.map((entry) => ({ ...serializeBottle(entry.bottle), score: entry.score, reasons: entry.reasons })),
    }

    report.results.push(result)

    console.log(`\n=== ${query} ===`)
    console.log(`mode=${mode}${dateFilters.length ? ` dates=${dateFilters.join(',')}` : ''}`)
    printSection('Semantic brut', semanticRaw)
    printSection('Keyword / rescoring local', keywordRanked)
    printSection('Classement final', finalRanked)
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const outPath = path.join(args.outDir, `tasting-retrieval-audit-${timestamp}.json`)
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2))
  console.log(`\nRapport écrit: ${outPath}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
