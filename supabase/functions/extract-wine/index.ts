import "jsr:@supabase/functions-js/edge-runtime.d.ts"

// === CONFIG ===
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
const ANTHROPIC_MODEL = Deno.env.get('ANTHROPIC_MODEL')?.trim()
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
// Set to "gemini" to use Gemini as primary, anything else = Claude primary
const PRIMARY_PROVIDER = Deno.env.get('PRIMARY_PROVIDER')?.trim()?.toLowerCase() || 'claude'

const EXTRACTION_PROMPT = `Analyse cette photo d'étiquette de vin et extrais les informations suivantes au format JSON :

{
  "domaine": "nom du domaine/château/producteur",
  "cuvee": "nom de la cuvée si mentionné (ex: Orizeaux, Les Caillerets, Clos des Mouches...)",
  "appellation": "appellation d'origine (AOC/AOP/DOC/DOCG...)",
  "millesime": année (nombre entier ou null si non visible),
  "couleur": "rouge" | "blanc" | "rose" | "bulles",
  "region": "région viticole",
  "cepage": "cépage principal si mentionné",
  "confidence": 0.0-1.0
}

Si une information n'est pas visible sur l'étiquette, utilise null.
La cuvée est le nom spécifique du vin, distinct du domaine et de l'appellation. Par exemple pour "Chartogne Taillet Orizeaux Champagne", le domaine est "Chartogne Taillet", la cuvée est "Orizeaux", et l'appellation est "Champagne".
Pour la couleur, déduis-la de l'appellation si elle n'est pas explicite.
Réponds UNIQUEMENT avec le JSON, sans texte avant ou après.`

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// === TYPES ===

interface ExtractionResult {
  provider: string
  data: Record<string, unknown>
}

// === UTILS ===

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

// === CLAUDE PROVIDER ===

async function callClaude(imageBase64: string | undefined, imageUrl: string | undefined): Promise<ExtractionResult> {
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured')

  const model = ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001'

  // Build image content
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
      max_tokens: 1024,
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
    } catch { /* use raw text */ }
    throw new Error(`Claude ${model} (${response.status}): ${message}`)
  }

  const result = await response.json()
  const textContent = result.content?.find((c: { type: string; text?: string }) => c.type === 'text')

  if (!textContent?.text) throw new Error('No text response from Claude')

  const jsonText = stripMarkdownCodeBlock(textContent.text)
  const data = JSON.parse(jsonText)
  return { provider: `claude/${model}`, data }
}

// === GEMINI PROVIDER ===

async function callGemini(imageBase64: string | undefined, _imageUrl: string | undefined): Promise<ExtractionResult> {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not configured')
  if (!imageBase64) throw new Error('Gemini requires base64 image (no URL support in this implementation)')

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`

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
      generationConfig: { temperature: 0, maxOutputTokens: 1024 },
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

  const jsonText = stripMarkdownCodeBlock(text)
  const data = JSON.parse(jsonText)
  return { provider: 'gemini/2.0-flash', data }
}

// === CROSS-PROVIDER FALLBACK ===

async function extractWithFallback(imageBase64: string | undefined, imageUrl: string | undefined): Promise<ExtractionResult> {
  // Build provider order based on config
  const providers: Array<{ name: string; call: () => Promise<ExtractionResult> }> = []

  if (PRIMARY_PROVIDER === 'gemini') {
    if (GEMINI_API_KEY) providers.push({ name: 'Gemini', call: () => callGemini(imageBase64, imageUrl) })
    if (ANTHROPIC_API_KEY) providers.push({ name: 'Claude', call: () => callClaude(imageBase64, imageUrl) })
  } else {
    if (ANTHROPIC_API_KEY) providers.push({ name: 'Claude', call: () => callClaude(imageBase64, imageUrl) })
    if (GEMINI_API_KEY) providers.push({ name: 'Gemini', call: () => callGemini(imageBase64, imageUrl) })
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

// === MAIN HANDLER ===

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
    console.log('Extraction done by:', provider)

    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('Error:', message)

    // User-friendly message for JSON parse failures
    const userMessage = message.includes('Unexpected token') || message.includes('JSON')
      ? "Impossible de lire l'étiquette sur cette photo."
      : message

    return new Response(
      JSON.stringify({ error: userMessage }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
    )
  }
})
