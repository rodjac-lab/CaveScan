import { supabase } from '@/lib/supabase'
import { resizeImage } from '@/lib/image'

/**
 * Compresses and uploads a photo to the wine-labels bucket.
 * Returns the public URL, or null if upload fails.
 */
export async function uploadPhoto(file: File, fileName: string): Promise<string | null> {
  const compressedBlob = await resizeImage(file)

  const { error: uploadError } = await supabase.storage
    .from('wine-labels')
    .upload(fileName, compressedBlob, { contentType: 'image/jpeg' })

  if (uploadError) throw uploadError

  const { data: urlData } = supabase.storage
    .from('wine-labels')
    .getPublicUrl(fileName)

  return urlData.publicUrl
}
