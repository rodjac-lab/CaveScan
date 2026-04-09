import { lazy, type ComponentType, type LazyExoticComponent } from 'react'

const RETRY_KEY = 'celestin:lazy-retry'

function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(error.message)
}

export function lazyWithRetry<T extends ComponentType<unknown>>(
  importer: () => Promise<{ default: T }>
): LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      const module = await importer()
      sessionStorage.removeItem(RETRY_KEY)
      return module
    } catch (error) {
      if (typeof window !== 'undefined' && isChunkLoadError(error)) {
        const lastRetry = sessionStorage.getItem(RETRY_KEY)
        if (lastRetry !== '1') {
          sessionStorage.setItem(RETRY_KEY, '1')
          window.location.reload()
          return new Promise<never>(() => {})
        }
      }
      throw error
    }
  })
}
