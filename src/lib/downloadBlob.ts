export function downloadBlob(content: string | Blob, filename: string, type?: string): void {
  const blob = content instanceof Blob ? content : new Blob([content], { type: type ?? 'text/plain' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}
