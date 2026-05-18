import type { ToolContext, ToolInput } from "./tools.ts"
import { executeCelestinTool } from "./tools.ts"

export interface CelestinToolCallTrace {
  name: string
  input: Record<string, unknown>
  durationMs: number
  source?: string
  totalRows?: number
  listedRows?: number
  totalQuantity?: number
  rows?: Array<Record<string, unknown>>
  error?: string
}

export interface CelestinProviderToolCall {
  id: string
  name: string
  input: ToolInput
}

export interface CelestinExecutedToolCall {
  id: string
  name: string
  input: ToolInput
  content: string
  isError: boolean
  trace: CelestinToolCallTrace
}

function parseToolContent(content: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(content) as unknown
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

function buildToolTrace(input: {
  name: string
  toolInput: ToolInput
  content: string
  durationMs: number
  error?: string
}): CelestinToolCallTrace {
  const parsed = input.error ? {} : parseToolContent(input.content)
  return {
    name: input.name,
    input: input.toolInput,
    durationMs: input.durationMs,
    source: typeof parsed.source === 'string' ? parsed.source : undefined,
    totalRows: typeof parsed.totalRows === 'number' ? parsed.totalRows : undefined,
    listedRows: typeof parsed.listedRows === 'number' ? parsed.listedRows : undefined,
    totalQuantity: typeof parsed.totalQuantity === 'number' ? parsed.totalQuantity : undefined,
    rows: input.name === 'search_cellar_candidates' && Array.isArray(parsed.rows)
      ? parsed.rows.filter((row): row is Record<string, unknown> => !!row && typeof row === 'object')
      : undefined,
    error: input.error ?? (typeof parsed.error === 'string' ? parsed.error : undefined),
  }
}

export async function executeCelestinProviderToolCall(
  toolCall: CelestinProviderToolCall,
  ctx: ToolContext,
): Promise<CelestinExecutedToolCall> {
  const startedAt = performance.now()
  try {
    const content = await executeCelestinTool(toolCall.name, toolCall.input, ctx)
    const trace = buildToolTrace({
      name: toolCall.name,
      toolInput: toolCall.input,
      content,
      durationMs: Math.round(performance.now() - startedAt),
    })
    return {
      id: toolCall.id,
      name: toolCall.name,
      input: toolCall.input,
      content,
      isError: !!trace.error,
      trace,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      id: toolCall.id,
      name: toolCall.name,
      input: toolCall.input,
      content: message,
      isError: true,
      trace: buildToolTrace({
        name: toolCall.name,
        toolInput: toolCall.input,
        content: message,
        durationMs: Math.round(performance.now() - startedAt),
        error: message,
      }),
    }
  }
}

export async function executeCelestinProviderToolCalls(
  toolCalls: CelestinProviderToolCall[],
  ctx: ToolContext,
  maxCalls = 3,
): Promise<CelestinExecutedToolCall[]> {
  return Promise.all(
    toolCalls
      .slice(0, maxCalls)
      .map((toolCall) => executeCelestinProviderToolCall(toolCall, ctx)),
  )
}
