import type { ComponentType } from 'react'

type PageModule = Promise<{ default: ComponentType<unknown> }>

const routeLoaders = {
  '/cave': () => import('@/pages/Home'),
  '/add': () => import('@/pages/AddBottle'),
  '/remove': () => import('@/pages/RemoveBottle'),
  '/degustations': () => import('@/pages/Degustations'),
  '/decouvrir': () => import('@/pages/Decouvrir'),
  '/settings': () => import('@/pages/Settings'),
  '/scanner': () => import('@/pages/Scanner'),
  '/login': () => import('@/pages/Login'),
  '/signup': () => import('@/pages/Signup'),
  '/': () => import('@/pages/Landing'),
  '/debug': () => import('@/pages/Debug'),
} satisfies Record<string, () => PageModule>

const preloadedRoutes = new Map<string, PageModule>()

export type PreloadableRoute = keyof typeof routeLoaders

export function loadRoute(route: PreloadableRoute): PageModule {
  const cached = preloadedRoutes.get(route)
  if (cached) return cached

  const promise = routeLoaders[route]()
  preloadedRoutes.set(route, promise)
  return promise
}

export function preloadRoute(route: string): void {
  if (route in routeLoaders) {
    void loadRoute(route as PreloadableRoute)
  }
}

export function preloadPrimaryRoutes(): void {
  const run = () => {
    ;(['/cave', '/degustations', '/decouvrir', '/settings', '/scanner'] as const).forEach(preloadRoute)
  }

  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(run, { timeout: 1500 })
    return
  }

  globalThis.setTimeout(run, 300)
}
