import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { buildContextBlock } from "./context-builder.ts"
import { computeNextState, INITIAL_STATE, type ConversationState } from "./conversation-state.ts"
import { celestinWithFallback } from "./llm-providers.ts"
import { resolveActiveMemoryFocus } from "./memory-focus.ts"
import { buildCelestinSystemPrompt } from "./prompt-builder.ts"
import { applyResponsePolicy } from "./response-policy.ts"
import { interpretTurn } from "./turn-interpreter.ts"
import { buildUserPrompt } from "./user-prompt.ts"
import type { RequestBody } from "./types.ts"

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  let forcedProvider: string | undefined
  try {
    const body: RequestBody = await req.json()
    forcedProvider = body.provider

    const conversationState: ConversationState = body.conversationState ?? { ...INITIAL_STATE }
    const lastAssistantTurn = [...body.history].reverse().find((turn) => turn.role === 'assistant')
    const lastAssistantText = lastAssistantTurn?.text

    const interpretation = interpretTurn(body.message, !!body.image, conversationState, lastAssistantText)
    console.log(`[celestin] message="${body.message.slice(0, 80)}" turn=${interpretation.turnType} mode=${interpretation.cognitiveMode} state=${conversationState.phase} history=${body.history.length} cave=${body.cave.length} image=${body.image ? 'yes' : 'no'}`)

    const contextBlock = buildContextBlock(body, interpretation.cognitiveMode)
    const systemPrompt = buildCelestinSystemPrompt(interpretation.cognitiveMode)
      + '\n\n--- CONTEXTE UTILISATEUR ---\n\n'
      + contextBlock

    const activeMemoryFocus = resolveActiveMemoryFocus(body, interpretation, conversationState, lastAssistantText)
    const userPrompt = buildUserPrompt(
      body,
      interpretation,
      { ...conversationState, memoryFocus: activeMemoryFocus },
      lastAssistantText,
    )

    const { provider, response: rawResponse } = await celestinWithFallback(
      systemPrompt,
      userPrompt,
      body.history,
      body.provider,
      body.image,
    )

    const response = applyResponsePolicy(
      rawResponse,
      body,
      conversationState,
      interpretation,
      lastAssistantText,
      body.message.length,
    )

    const nextState = computeNextState(
      conversationState,
      interpretation.turnType,
      !!response.ui_action,
      response.ui_action?.kind,
      interpretation.inferredTaskType,
      activeMemoryFocus,
    )

    console.log(`[celestin] Done by ${provider}: ui_action=${response.ui_action?.kind ?? 'none'} nextState=${nextState.phase} focus=${nextState.memoryFocus ?? 'none'} msg="${response.message.slice(0, 120)}" compiled=${body.compiledProfileMarkdown?.trim() ? 'yes' : 'no'}`)

    return new Response(JSON.stringify({
      ...response,
      _nextState: nextState,
      _debug: {
        turnType: interpretation.turnType,
        cognitiveMode: interpretation.cognitiveMode,
        provider,
        compiledProfile: !!body.compiledProfileMarkdown?.trim(),
        memoryEvidenceMode: body.memoryEvidenceMode ?? null,
        memoryFocus: activeMemoryFocus,
      },
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
