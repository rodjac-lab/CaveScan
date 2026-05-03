import { describe, expect, it } from 'vitest'
import { shouldEnableCelestinTools } from './tool-policy'

describe('shouldEnableCelestinTools', () => {
  it('enables tools for wine conversation unknown follow-ups', () => {
    expect(shouldEnableCelestinTools({
      authReady: true,
      hasImage: false,
      usageContext: {
        route: 'unknown',
        turnType: 'unknown',
        mode: 'wine_conversation',
      },
    })).toBe(true)
  })

  it('enables tools for cellar lookup routes', () => {
    expect(shouldEnableCelestinTools({
      authReady: true,
      hasImage: false,
      usageContext: {
        route: 'cellar_lookup',
        turnType: 'context_switch',
        mode: 'cellar_assistant',
      },
    })).toBe(true)
  })

  it('enables tools for tasting memory mode', () => {
    expect(shouldEnableCelestinTools({
      authReady: true,
      hasImage: false,
      usageContext: {
        route: 'unknown',
        turnType: 'task_continue',
        mode: 'tasting_memory',
      },
    })).toBe(true)
  })

  it('disables tools without auth or with images', () => {
    expect(shouldEnableCelestinTools({
      authReady: false,
      hasImage: false,
      usageContext: { route: 'cellar_lookup', mode: 'cellar_assistant' },
    })).toBe(false)

    expect(shouldEnableCelestinTools({
      authReady: true,
      hasImage: true,
      usageContext: { route: 'cellar_lookup', mode: 'cellar_assistant' },
    })).toBe(false)
  })
})
