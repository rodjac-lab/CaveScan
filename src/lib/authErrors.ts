export function isInvalidRefreshTokenError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return /Invalid Refresh Token|Refresh Token Not Found/i.test(error.message)
}
