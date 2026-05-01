type AnthropicUsage = {
  input_tokens?: number
  output_tokens?: number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
}

export function logAnthropicUsage(
  caller: string,
  result: { usage?: AnthropicUsage },
  extra: Record<string, unknown> = {},
): void {
  const usage = result.usage ?? {}
  console.log('[anthropic-usage]', JSON.stringify({
    caller,
    input_tokens: usage.input_tokens ?? 0,
    output_tokens: usage.output_tokens ?? 0,
    cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
    cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
    ...extra,
  }))
}
