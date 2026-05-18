export const CELESTIN_V2_DOGFOOD_KEY = 'celestin.v2_dogfood_enabled'
export const CELESTIN_V2_DOGFOOD_SOURCE = 'dogfood_v2'
export const CELESTIN_PROVIDER_DOGFOOD_KEY = 'celestin.provider_dogfood'
export const CELESTIN_GEMINI_DOGFOOD_PROVIDER = 'gemini-flash-lite-stable-t08'
export const CELESTIN_GEMINI_DOGFOOD_SOURCE = 'dogfood_v2_gemini'

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
    clearCelestinDogfoodProvider()
  }
}

export function getCelestinDogfoodProvider(): string | undefined {
  if (typeof window === 'undefined') return undefined
  const value = window.localStorage.getItem(CELESTIN_PROVIDER_DOGFOOD_KEY)
  return value === CELESTIN_GEMINI_DOGFOOD_PROVIDER ? value : undefined
}

export function setCelestinDogfoodProvider(provider: string | undefined): void {
  if (typeof window === 'undefined') return
  if (provider === CELESTIN_GEMINI_DOGFOOD_PROVIDER) {
    window.localStorage.setItem(CELESTIN_PROVIDER_DOGFOOD_KEY, provider)
    window.localStorage.setItem(CELESTIN_V2_DOGFOOD_KEY, 'true')
  } else {
    clearCelestinDogfoodProvider()
  }
}

export function clearCelestinDogfoodProvider(): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(CELESTIN_PROVIDER_DOGFOOD_KEY)
}
