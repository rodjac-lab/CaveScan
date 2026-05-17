import { beforeEach, describe, expect, it, vi } from 'vitest'
import { uploadPhoto } from './uploadPhoto'
import { resizeImage } from './image'
import { supabase } from './supabase'

vi.mock('./image', () => ({
  resizeImage: vi.fn(async () => new Blob(['compressed'], { type: 'image/jpeg' })),
}))

const mocks = vi.hoisted(() => ({
  upload: vi.fn(async () => ({ error: null })),
  getPublicUrl: vi.fn((path: string) => ({ data: { publicUrl: `https://cdn.example/${path}` } })),
  getUser: vi.fn<() => Promise<{ data: { user: { id: string } | null }; error: Error | null }>>(
    async () => ({ data: { user: { id: 'user-123' } }, error: null }),
  ),
}))

vi.mock('./supabase', () => ({
  supabase: {
    auth: {
      getUser: mocks.getUser,
    },
    storage: {
      from: vi.fn(() => ({
        upload: mocks.upload,
        getPublicUrl: mocks.getPublicUrl,
      })),
    },
  },
}))

describe('uploadPhoto', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })
    mocks.upload.mockResolvedValue({ error: null })
  })

  it('uploads photos under the authenticated user prefix', async () => {
    const file = new File(['raw'], 'front.jpg', { type: 'image/jpeg' })

    const result = await uploadPhoto(file, '../label avant.jpg')

    expect(resizeImage).toHaveBeenCalledWith(file)
    expect(supabase.storage.from).toHaveBeenCalledWith('wine-labels')
    expect(mocks.upload).toHaveBeenCalledWith('user-123/label-avant.jpg', expect.any(Blob), { contentType: 'image/jpeg' })
    expect(mocks.getPublicUrl).toHaveBeenCalledWith('user-123/label-avant.jpg')
    expect(result).toBe('https://cdn.example/user-123/label-avant.jpg')
  })

  it('rejects anonymous uploads before touching storage', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })

    await expect(uploadPhoto(new File(['raw'], 'front.jpg'), 'front.jpg'))
      .rejects.toThrow('Photo upload requires an authenticated user')

    expect(mocks.upload).not.toHaveBeenCalled()
  })
})
