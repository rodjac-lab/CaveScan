import { supabase } from '@/lib/supabase'
import { resizeImage } from '@/lib/image'

/**
 * Compresses and uploads a photo to the wine-labels bucket.
 * Returns the public URL, or null if upload fails.
 */
export async function uploadPhoto(file: File, fileName: string): Promise<string | null> {
  const compressedBlob = await resizeImage(file)
  const { data: userData, error: userError } = await supabase.auth.getUser()

  if (userError) throw userError
  if (!userData.user?.id) throw new Error('Photo upload requires an authenticated user')

  const safeFileName = fileName
    .replace(/[/\\]+/g, '-')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
    || 'photo.jpg'
  const storagePath = `${userData.user.id}/${safeFileName}`

  const { error: uploadError } = await supabase.storage
    .from('wine-labels')
    .upload(storagePath, compressedBlob, { contentType: 'image/jpeg' })

  if (uploadError) throw uploadError

  const { data: urlData } = supabase.storage
    .from('wine-labels')
    .getPublicUrl(storagePath)

  return urlData.publicUrl
}
