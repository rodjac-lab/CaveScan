export function detectMediaType(base64: string): 'image/jpeg' | 'image/png' {
  return base64.startsWith('/9j/') ? 'image/jpeg' : 'image/png'
}

