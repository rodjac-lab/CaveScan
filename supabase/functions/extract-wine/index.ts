import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')

const EXTRACTION_PROMPT = `Analyse cette photo d'étiquette de vin et extrais les informations suivantes au format JSON :

{
  "domaine": "nom du domaine/château/producteur",
  "appellation": "appellation d'origine (AOC/AOP/DOC/DOCG...)",
  "millesime": année (nombre entier ou null si non visible),
  "couleur": "rouge" | "blanc" | "rosé" | "bulles",
  "region": "région viticole",
  "cepage": "cépage principal si mentionné",
  "confidence": 0.0-1.0
}

Si une information n'est pas visible sur l'étiquette, utilise null.
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    if (!ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY not configured')
    }

    const { image_url, image_base64 } = await req.json()

    if (!image_url && !image_base64) {
      throw new Error('Either image_url or image_base64 is required')
    }

    const imageContent = buildImageContent(image_base64, image_url)

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
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

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Claude API error: ${errorText}`)
    }

    const result = await response.json()
    const textContent = result.content.find((c: ClaudeContentBlock) => c.type === 'text')

    if (!textContent?.text) {
      throw new Error('No text response from Claude')
    }

    const jsonText = stripMarkdownCodeBlock(textContent.text)
    const extraction = JSON.parse(jsonText)

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
