import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')

const ENRICHMENT_PROMPT = `Tu es un sommelier expert. On te donne les informations d'une bouteille de vin.
Complète les champs enrichis en te basant sur tes connaissances œnologiques.

RÈGLES :
- Si tu connais CE DOMAINE spécifiquement, base tes réponses sur son style propre.
- Si tu ne connais que l'appellation, donne les infos typiques de l'appellation. Ne fais PAS semblant de connaître le domaine.
- grape_varieties : cépages réels de cette appellation (ou du domaine si connu). Ne jamais inventer.
- serving_temperature : adaptée au type de vin (ex: "16-18°C" pour rouge charpenté, "10-12°C" pour blanc sec)
- typical_aromas : 3-5 descripteurs précis. Tiens compte du millésime si présent (jeune = fruits frais, mature = cuir/truffe).
- food_pairings : 2-3 accords pertinents. JAMAIS de rouge tannique sur poisson. Privilégie les accords régionaux.
- character : commentaire de sommelier en 1-2 phrases, direct et opinioné. Mentionne si le vin gagne à être carafé. Reste factuel sur le potentiel de garde.

Réponds UNIQUEMENT avec le JSON.`

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    grape_varieties: { type: 'ARRAY', nullable: true, items: { type: 'STRING' } },
    serving_temperature: { type: 'STRING', nullable: true },
    typical_aromas: { type: 'ARRAY', nullable: true, items: { type: 'STRING' } },
    food_pairings: { type: 'ARRAY', nullable: true, items: { type: 'STRING' } },
    character: { type: 'STRING', nullable: true },
  },
  required: ['grape_varieties', 'serving_temperature', 'typical_aromas', 'food_pairings', 'character'],
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

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${ENRICHMENT_PROMPT}\n\nBouteille : ${description}` }] }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 500,
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Gemini (${response.status}): ${errorText}`)
    }

    const result = await response.json()
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) throw new Error('No response from Gemini')

    const data = JSON.parse(text)
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
