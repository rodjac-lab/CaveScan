import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
const ANTHROPIC_MODEL = Deno.env.get('ANTHROPIC_MODEL')?.trim()

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

interface ImageContent {
  type: 'image'
  source: {
    type: 'base64' | 'url'
    media_type?: string
    data?: string
    url?: string
  }
}

interface ClaudeContentBlock {
  type: string
  text?: string
}

interface ClaudeResponse {
  content: ClaudeContentBlock[]
}

interface AnthropicErrorPayload {
  error?: {
    type?: string
    message?: string
  }
}

type AnthropicAttempt = {
  model: string
  status: number
  message: string
}

function buildImageContent(imageBase64: string | undefined, imageUrl: string | undefined): ImageContent {
  if (imageBase64) {
    const mediaType = imageBase64.startsWith('/9j/') ? 'image/jpeg' : 'image/png'
    return {
      type: 'image',
      source: {
        type: 'base64',
        media_type: mediaType,
        data: imageBase64,
      },
    }
  }
  return {
    type: 'image',
    source: {
      type: 'url',
      url: imageUrl,
    },
  }
}

function stripMarkdownCodeBlock(text: string): string {
  let result = text.trim()
  if (result.startsWith('```')) {
    result = result.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
  }
  return result
}

function buildModelFallbackList(): string[] {
  const models = [
    ANTHROPIC_MODEL || '',
    'claude-haiku-4-5-20251001',
    'claude-sonnet-4-20250514',
  ]

  return [...new Set(models.filter(Boolean))]
}

function parseAnthropicError(rawText: string): string {
  try {
    const parsed = JSON.parse(rawText) as AnthropicErrorPayload
    return parsed.error?.message || rawText
  } catch {
    return rawText
  }
}

function shouldStopFallback(status: number, message: string): boolean {
  if (status === 401 || status === 403) return true
  if (status === 429) return true

  const lower = message.toLowerCase()
  return (
    lower.includes('api key') ||
    lower.includes('authentication') ||
    lower.includes('permission') ||
    lower.includes('quota')
  )
}

async function callAnthropicWithFallback(imageContent: ImageContent): Promise<{ model: string; result: ClaudeResponse }> {
  const models = buildModelFallbackList()
  const attempts: AnthropicAttempt[] = []

  for (const model of models) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY || '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              imageContent,
              { type: 'text', text: EXTRACTION_PROMPT },
            ],
          },
        ],
      }),
    })

    if (response.ok) {
      const result = await response.json() as ClaudeResponse
      return { model, result }
    }

    const errorText = await response.text()
    const message = parseAnthropicError(errorText)
    attempts.push({ model, status: response.status, message })
    console.error(`Anthropic error with model ${model}:`, response.status, message)

    if (shouldStopFallback(response.status, message)) {
      break
    }
  }

  const summary = attempts.map((attempt) => `${attempt.model} (${attempt.status}): ${attempt.message}`).join(' | ')
  throw new Error(`Anthropic extraction failed after ${attempts.length} attempt(s). ${summary}`)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    console.log('Starting extraction...')

    if (!ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY not configured')
    }
    console.log('API key found')

    const { image_url, image_base64 } = await req.json()
    console.log('Request parsed, has image_base64:', !!image_base64, 'has image_url:', !!image_url)

    if (!image_url && !image_base64) {
      throw new Error('Either image_url or image_base64 is required')
    }

    const imageContent = buildImageContent(image_base64, image_url)
    console.log('Image content built, calling Anthropic with model fallback...')

    const { model, result } = await callAnthropicWithFallback(imageContent)
    console.log('Anthropic response parsed with model:', model, 'content blocks:', result.content?.length)
    const textContent = result.content.find((c: ClaudeContentBlock) => c.type === 'text')

    if (!textContent?.text) {
      throw new Error('No text response from Claude')
    }

    const jsonText = stripMarkdownCodeBlock(textContent.text)

    let extraction
    try {
      extraction = JSON.parse(jsonText)
    } catch {
      console.error('Claude responded with text instead of JSON:', textContent.text.slice(0, 200))
      throw new Error('Impossible de lire l\'étiquette sur cette photo.')
    }

    return new Response(JSON.stringify(extraction), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('Error:', message)
    return new Response(
      JSON.stringify({ error: message }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    )
  }
})
