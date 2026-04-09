import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('deploy config', () => {
  it('keeps the SPA fallback away from static assets', () => {
    const vercelConfig = JSON.parse(
      readFileSync(path.resolve(process.cwd(), 'vercel.json'), 'utf-8')
    ) as { rewrites?: Array<{ source: string; destination: string }> }

    expect(vercelConfig.rewrites?.[0]).toEqual({
      source: '/((?!.*\\.).*)',
      destination: '/index.html',
    })
  })
})
