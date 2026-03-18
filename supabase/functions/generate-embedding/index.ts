import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

// === CONFIG ===
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const API_TIMEOUT_MS = 10_000
const EMBEDDING_MODEL = 'text-embedding-3-small'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// === TYPES ===

interface QueryRequest {
  query: string
}

interface SaveRequest {
  text: string
  bottle_id: string
}

type RequestBody = QueryRequest | SaveRequest

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

async function generateEmbedding(text: string): Promise<number[]> {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not configured')

  const response = await fetchWithTimeout('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: text,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    let message = errorText
    try {
      const parsed = JSON.parse(errorText)
      message = parsed.error?.message || errorText
    } catch { /* use raw text */ }
    throw new Error(`OpenAI embeddings (${response.status}): ${message}`)
  }

  const result = await response.json()
  const embedding = result.data?.[0]?.embedding
  if (!embedding || !Array.isArray(embedding)) {
    throw new Error('No embedding returned from OpenAI')
  }

  return embedding
}

// === MAIN HANDLER ===

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    const body: RequestBody = await req.json()

    // Mode 1: Query — generate embedding and return it
    if ('query' in body && body.query) {
      const text = body.query.trim()
      if (text.length === 0) {
        return new Response(
          JSON.stringify({ error: 'query is required' }),
          { status: 400, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
        )
      }

      console.log(`[generate-embedding] Query mode (${text.length} chars)`)
      const embedding = await generateEmbedding(text)

      return new Response(JSON.stringify({ embedding }), {
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      })
    }

    // Mode 2: Save — generate embedding and store it in the bottle row
    if ('text' in body && 'bottle_id' in body && body.text && body.bottle_id) {
      const text = body.text.trim()
      if (text.length === 0) {
        return new Response(
          JSON.stringify({ error: 'text is required' }),
          { status: 400, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
        )
      }

      console.log(`[generate-embedding] Save mode for bottle ${body.bottle_id} (${text.length} chars)`)
      const embedding = await generateEmbedding(text)

      // Save to DB using service role (bypasses RLS)
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
      const { error: updateError } = await supabase
        .from('bottles')
        .update({ embedding: JSON.stringify(embedding) })
        .eq('id', body.bottle_id)

      if (updateError) {
        console.error(`[generate-embedding] DB update failed:`, updateError)
        throw new Error(`Failed to save embedding: ${updateError.message}`)
      }

      console.log(`[generate-embedding] Embedding saved for bottle ${body.bottle_id}`)
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      })
    }

    return new Response(
      JSON.stringify({ error: 'Request must contain either { query } or { text, bottle_id }' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[generate-embedding] Error:', message)

    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
    )
  }
})
