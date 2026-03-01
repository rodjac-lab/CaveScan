import "jsr:@supabase/functions-js/edge-runtime.d.ts"

// === CONFIG ===
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
const CLAUDE_MODEL = 'claude-haiku-4-5-20251001'
const API_TIMEOUT_MS = 15_000

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// === TYPES ===

interface TastingTags {
  plats: string[]
  descripteurs: string[]
  occasion: string | null
  sentiment: 'excellent' | 'bon' | 'moyen' | 'decevant' | null
  keywords: string[]
}

interface RequestBody {
  tasting_note: string
  bottle_context: string
}

interface ProviderResult {
  provider: string
  tags: TastingTags
}

// === PROMPT ===

const EXTRACTION_PROMPT = `Tu es un assistant qui extrait des tags structurés depuis des notes de dégustation de vin.

Analyse la note de dégustation ci-dessous et extrais les informations au format JSON :

{
  "plats": ["plat1", "plat2"],
  "descripteurs": ["descripteur1", "descripteur2"],
  "occasion": "description courte de l'occasion ou null",
  "sentiment": "excellent" | "bon" | "moyen" | "decevant" | null,
  "keywords": ["mot-clé1", "mot-clé2"]
}

Règles :
- "plats" : tous les plats, ingrédients ou types de cuisine mentionnés (ex: "spaghetti", "poisson grillé", "fromage")
- "descripteurs" : adjectifs et descriptions du vin (ex: "fruité", "tannique", "léger", "boisé", "minéral")
- "occasion" : le contexte si mentionné (ex: "restaurant à Rome", "anniversaire", "apéro entre amis"), sinon null
- "sentiment" : déduis le sentiment global de la note. "excellent" = enthousiaste/coup de coeur, "bon" = positif, "moyen" = mitigé, "decevant" = négatif. null si impossible à déterminer.
- "keywords" : expressions clés qui résument l'expérience (ex: "accord parfait", "bon rapport qualité-prix", "à regoûter")
- Si un champ n'a aucune donnée, utilise un tableau vide [] ou null selon le type
- Réponds UNIQUEMENT avec le JSON, sans texte avant ou après`

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

function parseAndValidate(text: string): TastingTags {
  const jsonText = stripMarkdownCodeBlock(text)
  const data = JSON.parse(jsonText) as TastingTags
  return {
    plats: Array.isArray(data.plats) ? data.plats : [],
    descripteurs: Array.isArray(data.descripteurs) ? data.descripteurs : [],
    occasion: typeof data.occasion === 'string' ? data.occasion : null,
    sentiment: ['excellent', 'bon', 'moyen', 'decevant'].includes(data.sentiment as string)
      ? data.sentiment
      : null,
    keywords: Array.isArray(data.keywords) ? data.keywords : [],
  }
}

// === PROVIDERS ===

async function callGemini(userPrompt: string): Promise<ProviderResult> {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not configured')

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`

  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: EXTRACTION_PROMPT }] },
      contents: [{ parts: [{ text: userPrompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 500 },
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    let message = errorText
    try {
      const parsed = JSON.parse(errorText)
      message = parsed.error?.message || errorText
    } catch { /* use raw text */ }
    throw new Error(`Gemini 2.0 Flash (${response.status}): ${message}`)
  }

  const result = await response.json()
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('No text response from Gemini')

  const tags = parseAndValidate(text)
  return { provider: 'gemini/2.0-flash', tags }
}

async function callClaude(userPrompt: string): Promise<ProviderResult> {
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured')

  const response = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 500,
      system: EXTRACTION_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    let message = errorText
    try {
      const parsed = JSON.parse(errorText)
      message = parsed.error?.message || errorText
    } catch { /* use raw text */ }
    throw new Error(`Claude ${CLAUDE_MODEL} (${response.status}): ${message}`)
  }

  const result = await response.json()
  const textContent = result.content?.find((c: { type: string; text?: string }) => c.type === 'text')
  if (!textContent?.text) throw new Error('No text response from Claude')

  const tags = parseAndValidate(textContent.text)
  return { provider: `claude/${CLAUDE_MODEL}`, tags }
}

// === FALLBACK ===

async function extractWithFallback(userPrompt: string): Promise<ProviderResult> {
  const providers: Array<{ name: string; call: () => Promise<ProviderResult> }> = []

  if (GEMINI_API_KEY) providers.push({ name: 'Gemini', call: () => callGemini(userPrompt) })
  if (ANTHROPIC_API_KEY) providers.push({ name: 'Claude', call: () => callClaude(userPrompt) })

  if (providers.length === 0) {
    throw new Error('No API keys configured. Set GEMINI_API_KEY and/or ANTHROPIC_API_KEY.')
  }

  const errors: string[] = []

  for (const provider of providers) {
    try {
      console.log(`[extract-tasting-tags] Trying ${provider.name}...`)
      const result = await provider.call()
      console.log(`[extract-tasting-tags] ${provider.name} succeeded`)
      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[extract-tasting-tags] ${provider.name} failed: ${message}`)
      errors.push(message)
    }
  }

  throw new Error(`All providers failed. ${errors.join(' | ')}`)
}

// === MAIN HANDLER ===

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    const body: RequestBody = await req.json()

    if (!body.tasting_note || body.tasting_note.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'tasting_note is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
      )
    }

    const userPrompt = `Note de dégustation : "${body.tasting_note}"
Contexte bouteille : ${body.bottle_context || 'Non spécifié'}`

    console.log(`[extract-tasting-tags] Processing note (${body.tasting_note.length} chars)`)

    const { provider, tags } = await extractWithFallback(userPrompt)
    console.log(`[extract-tasting-tags] Done by ${provider}`)

    return new Response(JSON.stringify(tags), {
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[extract-tasting-tags] Error:', message)

    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
    )
  }
})
