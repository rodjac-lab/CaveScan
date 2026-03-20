import { supabase } from '@/lib/supabase'
import { fileToBase64 } from '@/lib/image'
import { parseExtractWineResponse } from '@/lib/extractWineResponse'

export type ExtractWineResult = ReturnType<typeof parseExtractWineResponse>

export async function extractWineFromBase64(imageBase64: string): Promise<ExtractWineResult> {
  const { data, error } = await supabase.functions.invoke('extract-wine', {
    body: { image_base64: imageBase64 },
  })

  if (error) throw error
  return parseExtractWineResponse(data)
}

export async function extractWineFromFile(
  file: File,
  options?: { retryMultiBottleMaxSize?: number }
): Promise<ExtractWineResult> {
  let parsed = await extractWineFromBase64(await fileToBase64(file))

  if (options?.retryMultiBottleMaxSize && parsed.kind === 'multi_bottle') {
    try {
      parsed = await extractWineFromBase64(
        await fileToBase64(file, options.retryMultiBottleMaxSize)
      )
    } catch {
      // Keep the first parsed result if the hi-res retry fails.
    }
  }

  return parsed
}
