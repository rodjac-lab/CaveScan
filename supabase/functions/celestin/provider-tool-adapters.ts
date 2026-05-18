import { CELESTIN_TOOLS } from "./tools.ts"
import type { CelestinExecutedToolCall, CelestinProviderToolCall } from "./tool-runtime.ts"

type JsonObject = Record<string, unknown>

export type GeminiTool = {
  functionDeclarations: Array<{
    name: string
    description: string
    parameters: JsonObject
  }>
}

export type GeminiFunctionCall = {
  id?: string
  name?: string
  args?: JsonObject
}

export type GeminiContentWithFunctionCalls = {
  role: 'model'
  parts: Array<{ functionCall?: GeminiFunctionCall; [key: string]: unknown }>
}

export type OpenAITool = {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: JsonObject
  }
}

export function buildGeminiCelestinTools(): GeminiTool[] {
  return [{
    functionDeclarations: CELESTIN_TOOLS.map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema,
    })),
  }]
}

export function buildOpenAICelestinTools(): OpenAITool[] {
  return CELESTIN_TOOLS.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema,
    },
  }))
}

export function extractGeminiProviderToolCalls(content: GeminiContentWithFunctionCalls | null | undefined): CelestinProviderToolCall[] {
  const parts = Array.isArray(content?.parts) ? content.parts : []
  return parts
    .map((part, index): CelestinProviderToolCall | null => {
      const call = part.functionCall
      if (!call?.name) return null
      return {
        id: call.id ?? `gemini_${index}_${call.name}`,
        name: call.name,
        input: call.args && typeof call.args === 'object' ? call.args : {},
      }
    })
    .filter((call): call is CelestinProviderToolCall => !!call)
}

function parseToolContent(content: string): unknown {
  try {
    return JSON.parse(content) as unknown
  } catch {
    return content
  }
}

export function buildGeminiFunctionResponseContent(toolResults: CelestinExecutedToolCall[]) {
  return {
    role: 'user' as const,
    parts: toolResults.map((tool) => ({
      functionResponse: {
        name: tool.name,
        id: tool.id,
        response: {
          result: parseToolContent(tool.content),
          ...(tool.isError ? { error: true } : {}),
        },
      },
    })),
  }
}
