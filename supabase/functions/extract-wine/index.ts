import "jsr:@supabase/functions-js/edge-runtime.d.ts"

// === CONFIG ===
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
const ANTHROPIC_MODEL = Deno.env.get('ANTHROPIC_MODEL')?.trim()
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
// Set to "gemini" to use Gemini as primary, anything else = Claude primary
const PRIMARY_PROVIDER = Deno.env.get('PRIMARY_PROVIDER')?.trim()?.toLowerCase() || 'claude'
const ENABLE_MULTI_BOTTLE_SCAN = Deno.env.get('ENABLE_MULTI_BOTTLE_SCAN') === 'true'

const EXTRACTION_PROMPT = ENABLE_MULTI_BOTTLE_SCAN
  ? `Analyse cette photo de vin et reponds UNIQUEMENT avec un JSON valide au format:

{
  "kind": "single_bottle" | "multi_bottle",
  "bottles": [
    {
      "domaine": "nom du domaine/chateau/producteur",
      "cuvee": "nom de la cuvee si mentionne",
      "appellation": "appellation d'origine (AOC/AOP/DOC/DOCG...)",
      "millesime": annee (nombre entier ou null si non visible),
      "couleur": "rouge" | "blanc" | "rose" | "bulles",
      "country": "pays de production",
      "region": "region viticole",
      "cepage": "cepage principal si mentionne",
      "confidence": 0.0-1.0,
      "grape_varieties": ["cepage1", "cepage2"] ou null,
      "serving_temperature": "16-18C" ou null,
      "typical_aromas": ["arome1", "arome2", "arome3"] ou null,
      "food_pairings": ["accord1", "accord2"] ou null,
      "character": "commentaire sommelier (1-2 phrases)" ou null
    }
  ]
}

Regles:
- S'il n'y a qu'une seule bouteille clairement identifiable, utilise "kind": "single_bottle" et renvoie une seule entree dans "bottles".
- Si plusieurs bouteilles distinctes sont visibles et lisibles, utilise "kind": "multi_bottle" et renvoie une entree par bouteille identifiable.
- N'invente jamais une bouteille. Si une etiquette est trop floue ou partielle, ignore cette bouteille.
- Si une information n'est pas visible sur l'etiquette, utilise null.
- La cuvee est le nom specifique du vin, distinct du domaine et de l'appellation.
- Pour la couleur, deduis-la de l'appellation si elle n'est pas explicite.

# Champs enrichis - Reperes de degustation

Deduis les champs suivants a partir de tes connaissances oenologiques.
La precision est prioritaire sur l'originalite.

## Niveau de connaissance
- Si tu connais ce domaine specifiquement, base tes reponses sur son style propre et precise-le dans character.
- Si tu ne connais que l'appellation, donne les infos typiques de l'appellation. Ne fais pas semblant de connaitre le domaine.

## grape_varieties
Cepages reels de cette appellation (ou de ce domaine si tu le connais).
Ne jamais inventer. En cas de doute, donne les cepages typiques de l'appellation.

## serving_temperature
Temperature de service adaptee au type de vin :
- Rouges legers : 14-15C
- Rouges moyens : 15-16C
- Rouges charpentes : 16-18C
- Blancs legers/vifs : 8-10C
- Blancs secs aromatiques : 10-12C
- Blancs amples/boises : 12-14C
- Roses : 10-12C
- Champagne/Bulles : 8-10C
- Liquoreux : 8-10C

## typical_aromas
Aromes typiques du vin. Sois precis et descriptif :
- Utilise des familles aromatiques detaillees.
- Donne 3-5 descripteurs.
- Tiens compte du millesime si present :
  - Vin jeune (< 5 ans) : aromes primaires
  - Vin en developpement (5-10 ans) : aromes secondaires
  - Vin mature (> 10 ans) : aromes tertiaires

## food_pairings
2-3 accords mets pertinents. Regles strictes :
- Jamais de rouge tannique sur poisson.
- Champagne/bulles = joker universel.
- Privilegie les accords regionaux.
- Ose un accord creatif si pertinent.

## character
Commentaire de sommelier en 1-2 phrases avec du caractere.
Parle comme un ami sommelier : direct, utile, honnete.
- Si tu connais le domaine : parle de son style.
- Si tu ne le connais pas : commente l'appellation/millesime avec honnetete.
- Mentionne si le vin gagne a etre carafe ou s'il est pret a boire.
- Ne jamais inventer un style de domaine que tu ne connais pas.
- Reste factuel sur le potentiel de garde.

Reponds uniquement avec le JSON, sans texte avant ou apres.`
  : `Analyse cette photo d'etiquette de vin et reponds UNIQUEMENT avec un JSON valide au format:

{
  "kind": "single_bottle",
  "bottles": [
    {
      "domaine": "nom du domaine/chateau/producteur",
      "cuvee": "nom de la cuvee si mentionne",
      "appellation": "appellation d'origine (AOC/AOP/DOC/DOCG...)",
      "millesime": annee (nombre entier ou null si non visible),
      "couleur": "rouge" | "blanc" | "rose" | "bulles",
      "country": "pays de production",
      "region": "region viticole",
      "cepage": "cepage principal si mentionne",
      "confidence": 0.0-1.0,
      "grape_varieties": ["cepage1", "cepage2"] ou null,
      "serving_temperature": "16-18C" ou null,
      "typical_aromas": ["arome1", "arome2", "arome3"] ou null,
      "food_pairings": ["accord1", "accord2"] ou null,
      "character": "commentaire sommelier (1-2 phrases)" ou null
    }
  ]
}

Regles:
- Extrais une seule bouteille principale.
- Si plusieurs bouteilles sont visibles, concentre-toi sur la bouteille la plus centrale et la plus lisible.
- N'invente rien. Si une information n'est pas lisible, mets null.
- La cuvee est le nom specifique du vin, distinct du domaine et de l'appellation.
- Pour la couleur, deduis-la de l'appellation si elle n'est pas explicite.

Reponds uniquement avec le JSON, sans texte avant ou apres.`

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ExtractionResult {
  provider: string
  data: Record<string, unknown>
}

interface ExtractionEnvelope {
  kind: 'single_bottle' | 'multi_bottle'
  bottles: Array<Record<string, unknown>>
}

function stripMarkdownCodeBlock(text: string): string {
  let result = text.trim()
  if (result.startsWith('```')) {
    result = result.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
  }
  return result
}

function detectMediaType(base64: string): string {
  return base64.startsWith('/9j/') ? 'image/jpeg' : 'image/png'
}

function normalizeEnvelope(raw: unknown): ExtractionEnvelope {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid extraction payload')
  }

  const record = raw as Record<string, unknown>
  const rawBottles = Array.isArray(record.bottles) ? record.bottles : [record]
  const bottles = rawBottles
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item))
    .filter((item) => Boolean(item.domaine || item.appellation || item.cuvee || item.millesime))

  if (bottles.length === 0) {
    throw new Error('No identifiable bottle found')
  }

  if (!ENABLE_MULTI_BOTTLE_SCAN) {
    return {
      kind: 'single_bottle',
      bottles: [bottles[0]],
    }
  }

  return {
    kind: bottles.length > 1 || record.kind === 'multi_bottle' ? 'multi_bottle' : 'single_bottle',
    bottles,
  }
}

const API_TIMEOUT_MS = 15_000

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

async function callClaude(imageBase64: string | undefined, imageUrl: string | undefined): Promise<ExtractionResult> {
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured')

  const model = ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001'
  const imageContent = imageBase64
    ? { type: 'image', source: { type: 'base64', media_type: detectMediaType(imageBase64), data: imageBase64 } }
    : { type: 'image', source: { type: 'url', url: imageUrl } }

  const response = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1800,
      messages: [{
        role: 'user',
        content: [imageContent, { type: 'text', text: EXTRACTION_PROMPT }],
      }],
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    let message = errorText
    try {
      const parsed = JSON.parse(errorText)
      message = parsed.error?.message || errorText
    } catch {
      // use raw text
    }
    throw new Error(`Claude ${model} (${response.status}): ${message}`)
  }

  const result = await response.json()
  const textContent = result.content?.find((c: { type: string; text?: string }) => c.type === 'text')
  if (!textContent?.text) throw new Error('No text response from Claude')

  const data = normalizeEnvelope(JSON.parse(stripMarkdownCodeBlock(textContent.text)))
  return { provider: `claude/${model}`, data }
}

async function callGemini(imageBase64: string | undefined): Promise<ExtractionResult> {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not configured')
  if (!imageBase64) throw new Error('Gemini requires base64 image (no URL support in this implementation)')

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`

  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { inline_data: { mime_type: detectMediaType(imageBase64), data: imageBase64 } },
          { text: EXTRACTION_PROMPT },
        ],
      }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 1800,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            kind: { type: 'STRING' },
            bottles: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  domaine: { type: 'STRING', nullable: true },
                  cuvee: { type: 'STRING', nullable: true },
                  appellation: { type: 'STRING', nullable: true },
                  millesime: { type: 'INTEGER', nullable: true },
                  couleur: { type: 'STRING', nullable: true },
                  country: { type: 'STRING', nullable: true },
                  region: { type: 'STRING', nullable: true },
                  cepage: { type: 'STRING', nullable: true },
                  confidence: { type: 'NUMBER' },
                  grape_varieties: { type: 'ARRAY', nullable: true, items: { type: 'STRING' } },
                  serving_temperature: { type: 'STRING', nullable: true },
                  typical_aromas: { type: 'ARRAY', nullable: true, items: { type: 'STRING' } },
                  food_pairings: { type: 'ARRAY', nullable: true, items: { type: 'STRING' } },
                  character: { type: 'STRING', nullable: true },
                },
                required: ['domaine', 'appellation', 'couleur', 'confidence'],
              },
            },
          },
          required: ['kind', 'bottles'],
        },
      },
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    let message = errorText
    try {
      const parsed = JSON.parse(errorText)
      message = parsed.error?.message || errorText
    } catch {
      // use raw text
    }
    throw new Error(`Gemini 2.5 Flash (${response.status}): ${message}`)
  }

  const result = await response.json()
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('No text response from Gemini')

  const data = normalizeEnvelope(JSON.parse(stripMarkdownCodeBlock(text)))
  return { provider: 'gemini/2.5-flash', data }
}

async function extractWithFallback(imageBase64: string | undefined, imageUrl: string | undefined): Promise<ExtractionResult> {
  const providers: Array<{ name: string; call: () => Promise<ExtractionResult> }> = []

  if (PRIMARY_PROVIDER === 'gemini') {
    if (GEMINI_API_KEY) providers.push({ name: 'Gemini', call: () => callGemini(imageBase64) })
    if (ANTHROPIC_API_KEY) providers.push({ name: 'Claude', call: () => callClaude(imageBase64, imageUrl) })
  } else {
    if (ANTHROPIC_API_KEY) providers.push({ name: 'Claude', call: () => callClaude(imageBase64, imageUrl) })
    if (GEMINI_API_KEY) providers.push({ name: 'Gemini', call: () => callGemini(imageBase64) })
  }

  if (providers.length === 0) {
    throw new Error('No API keys configured. Set ANTHROPIC_API_KEY and/or GEMINI_API_KEY.')
  }

  const errors: string[] = []
  for (const provider of providers) {
    try {
      console.log(`Trying ${provider.name}...`)
      const result = await provider.call()
      console.log(`${provider.name} succeeded: ${result.provider}`)
      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`${provider.name} failed: ${message}`)
      errors.push(message)
    }
  }

  throw new Error(`All providers failed. ${errors.join(' | ')}`)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    console.log(`Starting extraction (primary: ${PRIMARY_PROVIDER})...`)

    const { image_url, image_base64 } = await req.json()
    console.log('Request parsed, has image_base64:', !!image_base64, 'has image_url:', !!image_url)

    if (!image_url && !image_base64) {
      throw new Error('Either image_url or image_base64 is required')
    }

    const { provider, data } = await extractWithFallback(image_base64, image_url)
    console.log('Extraction done by:', provider, 'kind:', data.kind, 'count:', Array.isArray(data.bottles) ? data.bottles.length : 0)

    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('Error:', message)

    const userMessage = message.includes('Unexpected token') || message.includes('JSON')
      ? "Impossible de lire l'etiquette sur cette photo."
      : message

    return new Response(
      JSON.stringify({ error: userMessage }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
    )
  }
})
