import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearAllSessions,
  loadSessions,
  saveCurrentSession,
} from './crossSessionMemory'

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

  clear(): void {
    this.values.clear()
  }
}

describe('crossSessionMemory user scoping', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: new MemoryStorage(),
      configurable: true,
    })
  })

  it('keeps same-browser debug sessions separated by owner key', () => {
    saveCurrentSession([
      { role: 'user', text: 'message user A' },
      { role: 'celestin', text: 'answer user A' },
    ], 'user-a')

    saveCurrentSession([
      { role: 'user', text: 'message user B' },
      { role: 'celestin', text: 'answer user B' },
    ], 'user-b')

    expect(loadSessions('user-a')[0].turns[0].text).toBe('message user A')
    expect(loadSessions('user-b')[0].turns[0].text).toBe('message user B')
    expect(loadSessions()).toEqual([])
  })

  it('clears only the requested owner key', () => {
    saveCurrentSession([
      { role: 'user', text: 'message user A' },
      { role: 'celestin', text: 'answer user A' },
    ], 'user-a')
    saveCurrentSession([
      { role: 'user', text: 'message user B' },
      { role: 'celestin', text: 'answer user B' },
    ], 'user-b')

    clearAllSessions('user-a')

    expect(loadSessions('user-a')).toEqual([])
    expect(loadSessions('user-b')).toHaveLength(1)
  })
})
