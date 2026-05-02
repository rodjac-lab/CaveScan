import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { resolveAuthContext } from "./auth.ts"
import { runCelestinTurn } from "./runtime.ts"
import { updateCelestinEdgeFunctionTimings } from "./observability.ts"
import type { RequestBody } from "./types.ts"

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ISOLATE_STARTED_AT = performance.now()
let invocationCount = 0

Deno.serve(async (req) => {
  const functionStartedAt = performance.now()
  invocationCount += 1
  const invocationIndex = invocationCount
  const isolateAgeMs = Math.round(functionStartedAt - ISOLATE_STARTED_AT)
  const coldStart = invocationIndex === 1
  const region = Deno.env.get('SB_REGION')
    ?? Deno.env.get('SUPABASE_REGION')
    ?? Deno.env.get('DENO_REGION')
    ?? null

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  let forcedProvider: string | undefined
  try {
    const parseStartedAt = performance.now()
    const body: RequestBody = await req.json()
    const parseMs = Math.round(performance.now() - parseStartedAt)
    forcedProvider = body.provider
    const authStartedAt = performance.now()
    const auth = await resolveAuthContext(req)
    const authMs = Math.round(performance.now() - authStartedAt)

    const runtimeStartedAt = performance.now()
    const { response, nextState, debugTrace, turnId } = await runCelestinTurn(body, auth)
    const runtimeMs = Math.round(performance.now() - runtimeStartedAt)

    await updateCelestinEdgeFunctionTimings({
      supabase: auth.supabase,
      turnId,
      functionStartedAt,
      parseMs,
      authMs,
      runtimeMs,
      isolateAgeMs,
      invocationIndex,
      coldStart,
      region,
    })

    return new Response(JSON.stringify({
      ...response,
      _nextState: nextState,
      _turnId: turnId,
      ...(body.debugTrace ? { _debug: debugTrace } : {}),
    }), {
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[celestin] Error:', message)

    const errorMessage = forcedProvider
      ? `[${forcedProvider}] ${message}`
      : "Desole, je suis momentanement indisponible. Reessaie dans quelques instants !"

    return new Response(
      JSON.stringify({ message: errorMessage }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
    )
  }
})
