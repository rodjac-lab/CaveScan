import { describe, expect, it } from 'vitest'
import { isInvalidRefreshTokenError } from '@/lib/authErrors'

describe('isInvalidRefreshTokenError', () => {
  it('matches Supabase invalid refresh token errors', () => {
    expect(isInvalidRefreshTokenError(new Error('Invalid Refresh Token: Refresh Token Not Found'))).toBe(true)
    expect(isInvalidRefreshTokenError(new Error('Refresh Token Not Found'))).toBe(true)
  })

  it('ignores unrelated errors', () => {
    expect(isInvalidRefreshTokenError(new Error('Network request failed'))).toBe(false)
    expect(isInvalidRefreshTokenError('Invalid Refresh Token')).toBe(false)
  })
})
