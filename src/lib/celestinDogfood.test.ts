import { beforeEach, describe, expect, it } from 'vitest'
import {
  CELESTIN_GEMINI_DOGFOOD_PROVIDER,
  CELESTIN_PROVIDER_DOGFOOD_KEY,
  CELESTIN_V2_DOGFOOD_KEY,
  getCelestinDogfoodProvider,
  isCelestinV2DogfoodEnabled,
  setCelestinDogfoodProvider,
  setCelestinV2DogfoodEnabled,
} from '@/lib/celestinDogfood'

class MemoryStorage {
  private values = new Map<string, string>()

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }
}

describe('celestin dogfood settings', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'window', {
      value: { localStorage: new MemoryStorage() },
      configurable: true,
    })
  })

  it('enables V2 when Gemini dogfood provider is selected', () => {
    setCelestinDogfoodProvider(CELESTIN_GEMINI_DOGFOOD_PROVIDER)

    expect(isCelestinV2DogfoodEnabled()).toBe(true)
    expect(getCelestinDogfoodProvider()).toBe(CELESTIN_GEMINI_DOGFOOD_PROVIDER)
    expect(window.localStorage.getItem(CELESTIN_V2_DOGFOOD_KEY)).toBe('true')
    expect(window.localStorage.getItem(CELESTIN_PROVIDER_DOGFOOD_KEY)).toBe(CELESTIN_GEMINI_DOGFOOD_PROVIDER)
  })

  it('clears provider override when V2 dogfood is disabled', () => {
    setCelestinDogfoodProvider(CELESTIN_GEMINI_DOGFOOD_PROVIDER)
    setCelestinV2DogfoodEnabled(false)

    expect(isCelestinV2DogfoodEnabled()).toBe(false)
    expect(getCelestinDogfoodProvider()).toBeUndefined()
  })
})
