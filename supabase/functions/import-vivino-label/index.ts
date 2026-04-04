import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const FETCH_TIMEOUT_MS = 10_000
const ALLOWED_HOSTS = new Set(['images.vivino.com'])

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RequestBody {
  bottleId: string
  imageUrl: string
}

async function getAuthenticatedUserId(req: Request): Promise<string | null> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null

  const token = authHeader.slice('Bearer '.length)
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const { data, error } = await supabase.auth.getUser(token)

  if (error || !data.user) return null
  return data.user.id
}

function assertVivinoUrl(imageUrl: string): URL {
  const parsed = new URL(imageUrl)
  if (!ALLOWED_HOSTS.has(parsed.hostname)) {
    throw new Error('Only Vivino label images are allowed')
  }
  return parsed
}

function extensionFromContentType(contentType: string | null, pathname: string): string {
  if (contentType?.includes('png')) return 'png'
  if (contentType?.includes('webp')) return 'webp'
  if (pathname.toLowerCase().endsWith('.png')) return 'png'
  if (pathname.toLowerCase().endsWith('.webp')) return 'webp'
  return 'jpg'
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'CaveScan/1.0' },
    })
  } finally {
    clearTimeout(timer)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    const userId = await getAuthenticatedUserId(req)
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      })
    }

    const { bottleId, imageUrl } = (await req.json()) as RequestBody
    if (!bottleId || !imageUrl) {
      return new Response(JSON.stringify({ error: 'bottleId and imageUrl are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      })
    }

    const parsedUrl = assertVivinoUrl(imageUrl)
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const { data: bottle, error: bottleError } = await supabase
      .from('bottles')
      .select('id, user_id, photo_url')
      .eq('id', bottleId)
      .single()

    if (bottleError || !bottle) {
      return new Response(JSON.stringify({ error: 'Bottle not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      })
    }

    if (bottle.user_id !== userId) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      })
    }

    if (bottle.photo_url) {
      return new Response(JSON.stringify({ photoUrl: bottle.photo_url, skipped: true }), {
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      })
    }

    const imageResponse = await fetchWithTimeout(imageUrl)
    if (!imageResponse.ok) {
      throw new Error(`Vivino image fetch failed (${imageResponse.status})`)
    }

    const contentType = imageResponse.headers.get('content-type')
    if (!contentType?.startsWith('image/')) {
      throw new Error('Vivino response is not an image')
    }

    const bytes = new Uint8Array(await imageResponse.arrayBuffer())
    if (bytes.byteLength === 0) {
      throw new Error('Vivino image is empty')
    }

    const ext = extensionFromContentType(contentType, parsedUrl.pathname)
    const storagePath = `${userId}/vivino/${bottleId}-${crypto.randomUUID()}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('wine-labels')
      .upload(storagePath, bytes, { contentType, upsert: false })

    if (uploadError) {
      throw uploadError
    }

    const { data: publicUrlData } = supabase.storage
      .from('wine-labels')
      .getPublicUrl(storagePath)

    const photoUrl = publicUrlData.publicUrl

    const { error: updateError } = await supabase
      .from('bottles')
      .update({ photo_url: photoUrl })
      .eq('id', bottleId)
      .eq('user_id', userId)

    if (updateError) {
      throw updateError
    }

    return new Response(JSON.stringify({ photoUrl }), {
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[import-vivino-label] Error:', message)

    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    })
  }
})
