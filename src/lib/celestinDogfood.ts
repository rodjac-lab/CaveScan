export const CELESTIN_V2_DOGFOOD_KEY = 'celestin.v2_dogfood_enabled'
export const CELESTIN_V2_DOGFOOD_SOURCE = 'dogfood_v2'

export function isCelestinV2DogfoodEnabled(): boolean {
  if (typeof window === 'undefined') return false
  const value = window.localStorage.getItem(CELESTIN_V2_DOGFOOD_KEY)
  return value === 'true' || value === '1'
}
