import "jsr:@supabase/functions-js/edge-runtime.d.ts"

// === CONFIG ===
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')
const OPENAI_MODEL = 'gpt-4.1-mini'
const API_TIMEOUT_MS = 12_000

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// === TYPES ===

type FactualIntent = 'temporal' | 'geographic' | 'quantitative' | 'ranking' | 'inventory'
type InventoryScope = 'drunk' | 'cave' | 'both'
type ConversationalIntent =
  | 'recommendation'
  | 'inventory_lookup'
  | 'memory_lookup'
  | 'tasting_log'
  | 'encavage'
  | 'smalltalk'

interface RequestBody {
  query: string
  availableCountries?: string[]
  availableRegions?: string[]
  availableAppellations?: string[]
  availableDomaines?: string[]
  today?: string
}

interface ClassifiedFilters {
  millesime?: number
  country?: string
  region?: string
  appellation?: string
  appellationPattern?: string
  domaine?: string
  cuvee?: string
  dateRange?: { start: string; end: string }
  freeLocation?: string
}

interface ClassifiedIntent {
  isFactual: boolean
  intent: FactualIntent | null
  filters: ClassifiedFilters
  scope: InventoryScope | null
  rankingDirection: 'desc' | 'asc' | null
  rankingLimit: number | null
  conversationalIntent: ConversationalIntent | null
  confidence: number
}

// === PROMPT ===

const CLASSIFIER_PROMPT = `Tu es un classifier d'intentions pour une app d'oenologie.

Tu recois une question utilisateur et tu retournes un JSON strict qui decrit si c'est une question factuelle sur la cave/les degustations et avec quels filtres.

# Intents

- "temporal" : filtre sur une date ou periode. "en mars", "hier", "ce week-end", "la semaine derniere", "le 26 fevrier"
- "geographic" : filtre sur un lieu de degustation (restaurant, ville, maison d'un ami). "a Rome", "chez Medric", "au restaurant X", "a Saint Genis Laval"
- "quantitative" : question qui demande un nombre. "combien de Brunello", "nombre de bouteilles"
- "ranking" : demande un classement. "mes meilleurs 2015", "les 3 pires notes", "top Chianti"
- "inventory" : liste ou presence. "ai-je deja bu du Barolo", "liste de mes Chianti", "quels vins italiens j'ai"
- null : question conversationnelle, pas de lookup factuel. "accord pour poulet roti", "parle-moi du Savagnin", "que boire ce soir", salutations, remerciements.

Un seul intent par query. Si plusieurs correspondent, choisis le plus specifique (temporal prime sur inventory quand il y a une date).

# Filtres

Les valeurs country / region / appellation / domaine DOIVENT etre choisies parmi les listes "Available..." fournies si une correspondance existe. Si la query mentionne un lieu qui n'est pas dans ces listes (ex: "Saint Genis Laval"), utilise "freeLocation" au lieu de region/appellation. Ne JAMAIS deviner une appellation non listee.

REGLES ABSOLUES sur les filtres :

- PARCIMONIE : retourne UNIQUEMENT les filtres que la query mentionne explicitement. Ne deduis PAS country ou region a partir de l'appellation. Ex: "combien de Brunello" → {appellation:"Brunello di Montalcino"} UNIQUEMENT, PAS {country:"Italie", region:"Toscane", appellation:"..."}. Ex: "ai-je bu du Barolo" → {appellation:"Barolo"} uniquement. Ex: "liste mes Chianti" → {appellationPattern:"Chianti"} uniquement, PAS avec country.
- VILLE vs REGION : un nom de ville (Rome, Paris, Lyon, Marseille, Milan, New York, etc.) va TOUJOURS dans "freeLocation". N'invente JAMAIS une region a partir d'une ville. "a Rome" → {freeLocation:"Rome"}, JAMAIS {region:"Toscane"} ou {country:"Italie"}. Bordeaux-la-ville est ambigu avec Bordeaux-la-region : si la query dit "au restaurant de Bordeaux" c'est une ville, si elle dit "mes Bordeaux" c'est une region de vin.
- PAYS ou REGION explicite : renvoyer country seulement si la query nomme le pays ("les vins italiens", "mes espagnols"). Renvoyer region seulement si la query nomme la region ("mes Bourgognes", "vins de la Loire").

- millesime : annee 4 chiffres (1900-2030)
- dateRange : { start: "YYYY-MM-DD", end: "YYYY-MM-DD" } en te basant sur "today" fourni. "hier"=jour-1, "ce week-end"=samedi+dimanche de la semaine courante, "en mars"=01-03 a 31-03 de l'annee en cours, "la semaine derniere"=lundi-dimanche de la semaine precedente.
- appellation vs appellationPattern : distinction IMPORTANTE.
  - Si la query nomme une appellation PRECISE ("Chianti Classico", "Saint-Emilion Grand Cru", "Brunello di Montalcino"), retourne "appellation" avec la valeur canonique exacte de la liste.
  - Si la query utilise un terme GENERIQUE ou FAMILLE qui couvre plusieurs appellations ("Chianti" seul, "Bordeaux" seul, "Saint-Emilion" si la liste contient aussi des Grand Cru distincts), retourne "appellationPattern" avec la racine (ex: "Chianti"). Le builder SQL fera un LIKE.
  - Exclusif : retourne l'un OU l'autre, pas les deux.
- cuvee : uniquement si la query nomme explicitement une cuvee (ex: "Clos de Tart"). Sinon omit.
- freeLocation : texte libre (ville, quartier, prenom precede de "chez", nom de restaurant). Preserve la casse d'origine.

# Scope

- "drunk" : la query concerne des vins degustes (par defaut pour temporal et geographic et ranking sur ratings)
- "cave" : la query concerne la cave actuelle ("j'ai encore", "combien il me reste", "en cave")
- "both" : inventory neutre ("ai-je deja...", "liste de mes...")
- null : pas factuel

# Ranking (rempli UNIQUEMENT si intent=ranking)

- rankingDirection : "desc" pour "meilleurs / top / plus bons", "asc" pour "pires / plus mauvais / moins bons". Par defaut "desc".
- rankingLimit : nombre explicite ("top 3" -> 3, "mes 5 meilleurs" -> 5). Si non precise, laisser null, le code prendra un defaut raisonnable.

# Pieges a eviter

- "mars" dans "en mars" = mois, PAS l'appellation Marsannay
- "laval" dans "Saint Genis Laval" = ville, PAS la region Val de Loire
- "Saint" dans "Saint Genis Laval" = partie d'un nom de ville, PAS une appellation Saint-*
- "roti" dans "poulet roti" = plat, PAS l'appellation Cote Rotie (et cette query est conversationnelle, isFactual=false)
- "mes" = possessif francais courant, n'active rien tout seul
- Un possessif + un chiffre (ex "mes 2015") = ranking ou inventory
- Les questions d'accord mets/vin, de culture generale, de recommandation pour ce soir, de salutation = isFactual=false, intent=null, filters={}, scope=null

# Intent conversationnel (dimension independante)

En plus de la classification factuelle ci-dessus, classe la query sur une SECONDE dimension : l'intent conversationnel. Ce champ sert a desambiguiser le routage cote app quand plusieurs formulations sont possibles. Les deux dimensions sont ORTHOGONALES : une query peut etre factuelle ET avoir un conversationalIntent (ex: "Combien j'ai de Bourgognes" -> isFactual=true, intent=quantitative, conversationalIntent=inventory_lookup).

Valeurs possibles pour conversationalIntent :

- "recommendation" : l'utilisateur veut qu'on lui PROPOSE un ou plusieurs vins a boire ou ouvrir, avec ou sans contrainte. "Que boire ce soir", "propose-moi un vin", "choisis dans ma cave", "sers-moi quelque chose", "trouve-moi un vin pour ce plat", "qu'est-ce que j'ouvre", "ouvre-moi un rouge", "un accord pour mon osso bucco", "plutot un italien du coup". Le verbe d'action (choisir, proposer, recommander, ouvrir, servir, trouver) combine a un vin/la cave/un plat est un signal fort.
- "inventory_lookup" : question FACTUELLE sur ce qui est en cave ou a ete bu, sans demande de selection. "Combien j'ai de Bourgognes", "est-ce que j'ai du Barolo", "quels vins italiens j'ai", "liste mes Chianti", "ai-je deja bu un Brunello".
- "memory_lookup" : reference a une degustation passee ou un souvenir. "Tu te souviens du vin chez Medric", "la derniere fois qu'on a bu du Barolo c'etait quand", "rappelle-moi ce vin qu'on avait aime".
- "tasting_log" : l'utilisateur decrit une degustation en cours ou raconte une degustation recente pour la loguer. "Je bois un Barolo ce soir", "on vient d'ouvrir un Chianti 2015", "j'ai deguste un tres bon Pomerol hier".
- "encavage" : l'utilisateur veut ajouter une bouteille en cave. "J'ai achete", "j'ai recu", "ajoute ce Bordeaux", "encave ces bouteilles", "je viens de recevoir une caisse".
- "smalltalk" : conversation pure, culture du vin, questions generales, accord mets/vin theorique sans demande de recommandation explicite, salutations, remerciements. "Parle-moi du Savagnin", "c'est quoi la difference entre Chianti et Chianti Classico", "merci", "salut".
- null : tu n'es pas confiant ou la query est trop ambigue pour trancher. Il vaut mieux null qu'une categorie fausse.

REGLE CLE : "Choisis dans ma cave" est une RECOMMENDATION (verbe choisis), pas un inventory_lookup, meme si "ma cave" apparait. Le VERBE d'action prime sur les mots-cles.
REGLE CLE : "Que boire ce soir" sans precision = RECOMMENDATION, pas smalltalk.
REGLE CLE : si la query est une reference factuelle pure (combien, quels, liste, ai-je deja) sans verbe d'action -> inventory_lookup.

# Confidence

0.9-1.0 : tres clair. 0.7-0.89 : probable. 0.5-0.69 : incertain. <0.5 : ne pas marquer isFactual=true.

Si isFactual=false, intent=null, filters={}, scope=null. conversationalIntent reste renseigne independamment (la plupart des conversationnels sont isFactual=false).

Reponds UNIQUEMENT avec le JSON.`

// === UTILS ===

async function fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(`Request timed out after ${API_TIMEOUT_MS / 1000}s`)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

function stripMarkdownCodeBlock(text: string): string {
  let result = text.trim()
  if (result.startsWith('```')) {
    result = result.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
  }
  return result
}

const VALID_INTENTS = new Set(['temporal', 'geographic', 'quantitative', 'ranking', 'inventory'])
const VALID_SCOPES = new Set(['drunk', 'cave', 'both'])
const VALID_CONVERSATIONAL_INTENTS = new Set([
  'recommendation',
  'inventory_lookup',
  'memory_lookup',
  'tasting_log',
  'encavage',
  'smalltalk',
])

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed.slice(0, 200) : undefined
}

function normalizeDate(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const match = value.trim().match(/^\d{4}-\d{2}-\d{2}$/)
  return match ? value.trim() : undefined
}

function parseAndValidate(text: string): ClassifiedIntent {
  const data = JSON.parse(stripMarkdownCodeBlock(text))

  const isFactual = data.isFactual === true
  const intentRaw = typeof data.intent === 'string' ? data.intent : null
  const intent: FactualIntent | null =
    isFactual && intentRaw && VALID_INTENTS.has(intentRaw) ? (intentRaw as FactualIntent) : null

  const scopeRaw = typeof data.scope === 'string' ? data.scope : null
  const scope: InventoryScope | null =
    isFactual && scopeRaw && VALID_SCOPES.has(scopeRaw) ? (scopeRaw as InventoryScope) : null

  const confidence =
    typeof data.confidence === 'number' ? Math.min(1, Math.max(0, data.confidence)) : 0

  const filtersRaw = (data.filters ?? {}) as Record<string, unknown>
  const filters: ClassifiedFilters = {}

  const millesime = typeof filtersRaw.millesime === 'number' ? Math.trunc(filtersRaw.millesime) : undefined
  if (millesime && millesime >= 1900 && millesime <= 2100) filters.millesime = millesime

  const country = normalizeString(filtersRaw.country)
  if (country) filters.country = country

  const region = normalizeString(filtersRaw.region)
  if (region) filters.region = region

  const appellation = normalizeString(filtersRaw.appellation)
  const appellationPattern = normalizeString(filtersRaw.appellationPattern)
  if (appellation) {
    filters.appellation = appellation
  } else if (appellationPattern) {
    filters.appellationPattern = appellationPattern
  }

  const domaine = normalizeString(filtersRaw.domaine)
  if (domaine) filters.domaine = domaine

  const cuvee = normalizeString(filtersRaw.cuvee)
  if (cuvee) filters.cuvee = cuvee

  const freeLocation = normalizeString(filtersRaw.freeLocation)
  if (freeLocation) filters.freeLocation = freeLocation

  if (filtersRaw.dateRange && typeof filtersRaw.dateRange === 'object') {
    const dr = filtersRaw.dateRange as Record<string, unknown>
    const start = normalizeDate(dr.start)
    const end = normalizeDate(dr.end)
    if (start && end) filters.dateRange = { start, end }
  }

  const rankingDirectionRaw = typeof data.rankingDirection === 'string' ? data.rankingDirection : null
  const rankingDirection: 'desc' | 'asc' | null =
    intent === 'ranking' && (rankingDirectionRaw === 'desc' || rankingDirectionRaw === 'asc')
      ? rankingDirectionRaw
      : null

  const rankingLimitRaw = typeof data.rankingLimit === 'number' ? Math.trunc(data.rankingLimit) : null
  const rankingLimit: number | null =
    intent === 'ranking' && rankingLimitRaw != null && rankingLimitRaw > 0 && rankingLimitRaw <= 20
      ? rankingLimitRaw
      : null

  const conversationalIntentRaw =
    typeof data.conversationalIntent === 'string' ? data.conversationalIntent : null
  const conversationalIntent: ConversationalIntent | null =
    conversationalIntentRaw && VALID_CONVERSATIONAL_INTENTS.has(conversationalIntentRaw)
      ? (conversationalIntentRaw as ConversationalIntent)
      : null

  return {
    isFactual: isFactual && intent !== null,
    intent,
    filters: isFactual && intent ? filters : {},
    scope,
    rankingDirection,
    rankingLimit,
    conversationalIntent,
    confidence,
  }
}

function buildUserPrompt(body: RequestBody): string {
  const lines: string[] = []
  lines.push(`Query : "${body.query}"`)
  const today = body.today ?? new Date().toISOString().slice(0, 10)
  lines.push(`Today : ${today}`)
  const limit = 80
  const fmt = (arr?: string[]) =>
    Array.isArray(arr) && arr.length > 0 ? arr.slice(0, limit).join(', ') : '(aucune)'
  lines.push(`Available countries : ${fmt(body.availableCountries)}`)
  lines.push(`Available regions : ${fmt(body.availableRegions)}`)
  lines.push(`Available appellations : ${fmt(body.availableAppellations)}`)
  lines.push(`Available domaines : ${fmt(body.availableDomaines)}`)
  return lines.join('\n')
}

function extractErrorMessage(errorText: string): string {
  try {
    const parsed = JSON.parse(errorText)
    return parsed.error?.message || errorText
  } catch {
    return errorText
  }
}

// === PROVIDERS ===

const GEMINI_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    isFactual: { type: 'BOOLEAN' },
    intent: {
      type: 'STRING',
      nullable: true,
      enum: ['temporal', 'geographic', 'quantitative', 'ranking', 'inventory'],
    },
    filters: {
      type: 'OBJECT',
      properties: {
        millesime: { type: 'NUMBER', nullable: true },
        country: { type: 'STRING', nullable: true },
        region: { type: 'STRING', nullable: true },
        appellation: { type: 'STRING', nullable: true },
        appellationPattern: { type: 'STRING', nullable: true },
        domaine: { type: 'STRING', nullable: true },
        cuvee: { type: 'STRING', nullable: true },
        freeLocation: { type: 'STRING', nullable: true },
        dateRange: {
          type: 'OBJECT',
          nullable: true,
          properties: {
            start: { type: 'STRING' },
            end: { type: 'STRING' },
          },
          required: ['start', 'end'],
        },
      },
    },
    scope: {
      type: 'STRING',
      nullable: true,
      enum: ['drunk', 'cave', 'both'],
    },
    rankingDirection: {
      type: 'STRING',
      nullable: true,
      enum: ['desc', 'asc'],
    },
    rankingLimit: { type: 'NUMBER', nullable: true },
    conversationalIntent: {
      type: 'STRING',
      nullable: true,
      enum: ['recommendation', 'inventory_lookup', 'memory_lookup', 'tasting_log', 'encavage', 'smalltalk'],
    },
    confidence: { type: 'NUMBER' },
  },
  required: ['isFactual', 'confidence'],
}

const OPENAI_RESPONSE_SCHEMA = {
  name: 'celestin_intent_classification',
  strict: false,
  schema: {
    type: 'object',
    properties: {
      isFactual: { type: 'boolean' },
      intent: {
        type: ['string', 'null'],
        enum: ['temporal', 'geographic', 'quantitative', 'ranking', 'inventory', null],
      },
      filters: {
        type: 'object',
        properties: {
          millesime: { type: ['number', 'null'] },
          country: { type: ['string', 'null'] },
          region: { type: ['string', 'null'] },
          appellation: { type: ['string', 'null'] },
          appellationPattern: { type: ['string', 'null'] },
          domaine: { type: ['string', 'null'] },
          cuvee: { type: ['string', 'null'] },
          freeLocation: { type: ['string', 'null'] },
          dateRange: {
            type: ['object', 'null'],
            properties: {
              start: { type: 'string' },
              end: { type: 'string' },
            },
          },
        },
      },
      scope: {
        type: ['string', 'null'],
        enum: ['drunk', 'cave', 'both', null],
      },
      rankingDirection: {
        type: ['string', 'null'],
        enum: ['desc', 'asc', null],
      },
      rankingLimit: { type: ['number', 'null'] },
      conversationalIntent: {
        type: ['string', 'null'],
        enum: ['recommendation', 'inventory_lookup', 'memory_lookup', 'tasting_log', 'encavage', 'smalltalk', null],
      },
      confidence: { type: 'number' },
    },
    required: ['isFactual', 'confidence'],
  },
}

async function callGemini(userPrompt: string): Promise<ClassifiedIntent> {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not configured')

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`

  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: CLASSIFIER_PROMPT }] },
      contents: [{ parts: [{ text: userPrompt }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 600,
        responseMimeType: 'application/json',
        responseSchema: GEMINI_RESPONSE_SCHEMA,
      },
    }),
  })

  if (!response.ok) {
    throw new Error(`Gemini 2.5 Flash Lite (${response.status}): ${extractErrorMessage(await response.text())}`)
  }

  const result = await response.json()
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('No text response from Gemini')

  return parseAndValidate(text)
}

async function callOpenAI(userPrompt: string): Promise<ClassifiedIntent> {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not configured')

  const response = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      max_tokens: 600,
      temperature: 0.1,
      response_format: { type: 'json_schema', json_schema: OPENAI_RESPONSE_SCHEMA },
      messages: [
        { role: 'system', content: CLASSIFIER_PROMPT },
        { role: 'user', content: userPrompt },
      ],
    }),
  })

  if (!response.ok) {
    throw new Error(`OpenAI ${OPENAI_MODEL} (${response.status}): ${extractErrorMessage(await response.text())}`)
  }

  const result = await response.json()
  const text = result.choices?.[0]?.message?.content
  if (!text) throw new Error('No text response from OpenAI')

  return parseAndValidate(text)
}

// === FALLBACK ===

async function classifyWithFallback(userPrompt: string): Promise<{ provider: string; result: ClassifiedIntent }> {
  const providers: Array<{ name: string; call: () => Promise<ClassifiedIntent> }> = []

  if (GEMINI_API_KEY) providers.push({ name: 'Gemini Flash Lite', call: () => callGemini(userPrompt) })
  if (OPENAI_API_KEY) providers.push({ name: 'GPT-4.1 mini', call: () => callOpenAI(userPrompt) })

  if (providers.length === 0) throw new Error('No API keys configured (GEMINI_API_KEY or OPENAI_API_KEY).')

  const errors: string[] = []
  for (const provider of providers) {
    try {
      const result = await provider.call()
      return { provider: provider.name, result }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[classify-celestin-intent] ${provider.name} failed: ${message}`)
      errors.push(`${provider.name}: ${message}`)
    }
  }

  throw new Error(`All providers failed. ${errors.join(' | ')}`)
}

// === MAIN HANDLER ===

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  const startedAt = Date.now()

  try {
    const body: RequestBody = await req.json()

    if (!body.query || typeof body.query !== 'string' || body.query.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'query is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
      )
    }

    const userPrompt = buildUserPrompt(body)
    const { provider, result } = await classifyWithFallback(userPrompt)

    const latencyMs = Date.now() - startedAt
    console.log(
      `[classify-celestin-intent] provider=${provider} latency=${latencyMs}ms isFactual=${result.isFactual} intent=${result.intent ?? 'null'} convIntent=${result.conversationalIntent ?? 'null'} conf=${result.confidence.toFixed(2)} query="${body.query.slice(0, 80)}"`,
    )

    return new Response(
      JSON.stringify({ ...result, _meta: { provider, latencyMs } }),
      { headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[classify-celestin-intent] Error:', message)
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
    )
  }
})
