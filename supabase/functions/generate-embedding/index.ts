import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import { applyOwnedRowFilter, getBearerToken } from "./ownership.ts"

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

interface SaveSessionRequest {
  text: string
  session_id: string
}

type RequestBody = QueryRequest | SaveRequest | SaveSessionRequest

// === UTILS ===

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}

async function requireAuthenticatedUserId(req: Request, supabase: ReturnType<typeof createClient>): Promise<string | null> {
  const token = getBearerToken(req.headers)
  if (!token) return null

  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user?.id) return null
  return data.user.id
}

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
        return jsonResponse({ error: 'query is required' }, 400)
      }

      console.log(`[generate-embedding] Query mode (${text.length} chars)`)
      const embedding = await generateEmbedding(text)

      return jsonResponse({ embedding })
    }

    // Mode 2: Save — generate embedding and store it in the bottle row
    if ('text' in body && 'bottle_id' in body && body.text && body.bottle_id) {
      const text = body.text.trim()
      if (text.length === 0) {
        return jsonResponse({ error: 'text is required' }, 400)
      }

      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
      const userId = await requireAuthenticatedUserId(req, supabase)
      if (!userId) {
        return jsonResponse({ error: 'Authentication required to save embeddings' }, 401)
      }

      console.log(`[generate-embedding] Save mode for bottle ${body.bottle_id} (${text.length} chars)`)
      const embedding = await generateEmbedding(text)

      const { data: updated, error: updateError } = await applyOwnedRowFilter(supabase
        .from('bottles')
        .update({ embedding: JSON.stringify(embedding) }), body.bottle_id, userId)

      if (updateError) {
        console.error(`[generate-embedding] DB update failed:`, updateError)
        throw new Error(`Failed to save embedding: ${updateError.message}`)
      }
      if (!updated) {
        return jsonResponse({ error: 'Bottle not found for authenticated user' }, 404)
      }

      console.log(`[generate-embedding] Embedding saved for bottle ${body.bottle_id}`)
      return jsonResponse({ success: true })
    }

    // Mode 3: Save session — generate embedding and store it in the chat_sessions row
    if ('text' in body && 'session_id' in body && body.text && (body as SaveSessionRequest).session_id) {
      const text = body.text.trim()
      const sessionId = (body as SaveSessionRequest).session_id
      if (text.length === 0) {
        return jsonResponse({ error: 'text is required' }, 400)
      }

      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
      const userId = await requireAuthenticatedUserId(req, supabase)
      if (!userId) {
        return jsonResponse({ error: 'Authentication required to save embeddings' }, 401)
      }

      console.log(`[generate-embedding] Save mode for session ${sessionId} (${text.length} chars)`)
      const embedding = await generateEmbedding(text)

      const { data: updated, error: updateError } = await applyOwnedRowFilter(supabase
        .from('chat_sessions')
        .update({ summary_embedding: JSON.stringify(embedding) }), sessionId, userId)

      if (updateError) {
        console.error(`[generate-embedding] DB update failed:`, updateError)
        throw new Error(`Failed to save session embedding: ${updateError.message}`)
      }
      if (!updated) {
        return jsonResponse({ error: 'Chat session not found for authenticated user' }, 404)
      }

      console.log(`[generate-embedding] Embedding saved for session ${sessionId}`)
      return jsonResponse({ success: true })
    }

    return jsonResponse({ error: 'Request must contain { query }, { text, bottle_id }, or { text, session_id }' }, 400)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[generate-embedding] Error:', message)

    return jsonResponse({ error: message }, 500)
  }
})
