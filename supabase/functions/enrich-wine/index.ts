import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')

const ENRICHMENT_PROMPT = `Tu es un sommelier expert. On te donne les informations d'une bouteille de vin.
Complète les champs enrichis en te basant sur tes connaissances œnologiques.

RÈGLES :
- Si tu connais CE DOMAINE spécifiquement, base tes réponses sur son style propre.
- Si tu ne connais que l'appellation, donne les infos typiques de l'appellation. Ne fais PAS semblant de connaître le domaine.
- country : pays de production le plus probable. Ne jamais inventer si tu n'es pas sûr.
- region : région viticole la plus pertinente pour ce vin. Ne jamais inventer si tu n'es pas sûr.
- grape_varieties : cépages réels de cette appellation (ou du domaine si connu). Ne jamais inventer.
- serving_temperature : adaptée au type de vin (ex: "16-18°C" pour rouge charpenté, "10-12°C" pour blanc sec)
- typical_aromas : 3-5 descripteurs précis. Tiens compte du millésime si présent (jeune = fruits frais, mature = cuir/truffe).
- food_pairings : 2-3 accords pertinents. JAMAIS de rouge tannique sur poisson. Privilégie les accords régionaux.
- character : commentaire de sommelier en 1-2 phrases, direct et opinioné. Mentionne si le vin gagne à être carafé. Reste factuel sur le potentiel de garde.
- drink_from : année (entier) à partir de laquelle le vin commence à être agréable. Basé sur l'appellation, le millésime et le style. null si impossible à estimer.
- drink_until : année (entier) limite raisonnable pour boire le vin. Au-delà il risque de décliner. null si impossible à estimer.

IMPORTANT : Tous les champs texte doivent etre en francais (aromes, accords, character, etc.), meme pour des vins etrangers.

Réponds UNIQUEMENT avec le JSON.`

const TIMEOUT_MS = 15_000

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const RESPONSE_SCHEMA = {
  type: 'OBJECT' as const,
  properties: {
    country: { type: 'STRING' as const, nullable: true },
    region: { type: 'STRING' as const, nullable: true },
    grape_varieties: { type: 'ARRAY' as const, items: { type: 'STRING' as const }, nullable: true },
    serving_temperature: { type: 'STRING' as const, nullable: true },
    typical_aromas: { type: 'ARRAY' as const, items: { type: 'STRING' as const }, nullable: true },
    food_pairings: { type: 'ARRAY' as const, items: { type: 'STRING' as const }, nullable: true },
    character: { type: 'STRING' as const, nullable: true },
    drink_from: { type: 'INTEGER' as const, nullable: true },
    drink_until: { type: 'INTEGER' as const, nullable: true },
  },
  required: ['country', 'region', 'grape_varieties', 'serving_temperature', 'typical_aromas', 'food_pairings', 'character', 'drink_from', 'drink_until'],
}

function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer))
}

function stripMarkdownCodeBlock(text: string): string {
  let result = text.trim()
  if (result.startsWith('```')) {
    result = result.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
  }
  return result
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not configured')

    const { domaine, cuvee, appellation, millesime, couleur } = await req.json()

    const description = [domaine, cuvee, appellation, millesime, couleur].filter(Boolean).join(', ')
    if (!description) throw new Error('At least one wine field is required')

    console.log(`Enriching: ${description}`)

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`

    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${ENRICHMENT_PROMPT}\n\nBouteille : ${description}` }] }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 1500,
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`Gemini error: ${errorText}`)
      throw new Error(`Gemini (${response.status}): ${errorText.substring(0, 200)}`)
    }

    const result = await response.json()
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) throw new Error('No response from Gemini')

    let jsonText = stripMarkdownCodeBlock(text)
    // Fix Gemini's unescaped newlines in JSON strings
    jsonText = jsonText.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ')
    const data = JSON.parse(jsonText)

    console.log(`Success: ${Object.keys(data).join(', ')}`)

    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('Error:', message)
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
    )
  }
})
