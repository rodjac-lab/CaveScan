export const CELESTIN_V2_DOGFOOD_KEY = 'celestin.v2_dogfood_enabled'
export const CELESTIN_V2_DOGFOOD_SOURCE = 'dogfood_v2'

export function isCelestinV2DogfoodEnabled(): boolean {
  if (typeof window === 'undefined') return false
  const value = window.localStorage.getItem(CELESTIN_V2_DOGFOOD_KEY)
  return value === 'true' || value === '1'
}

export function setCelestinV2DogfoodEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return
  if (enabled) {
    window.localStorage.setItem(CELESTIN_V2_DOGFOOD_KEY, 'true')
  } else {
    window.localStorage.removeItem(CELESTIN_V2_DOGFOOD_KEY)
  }
}
