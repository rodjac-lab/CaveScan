import { describe, expect, it, vi } from 'vitest'
import { applyOwnedRowFilter, getBearerToken, type OwnedUpdateQuery } from './ownership'

class FakeOwnedUpdateQuery implements OwnedUpdateQuery {
  calls: Array<[string, string]> = []

  eq(column: string, value: string): OwnedUpdateQuery {
    this.calls.push([column, value])
    return this
  }

  select(columns: string) {
    return {
      maybeSingle: vi.fn(async () => ({
        data: { id: columns },
        error: null,
      })),
    }
  }
}

describe('generate-embedding ownership helpers', () => {
  it('extracts bearer tokens from authorization headers', () => {
    expect(getBearerToken(new Headers({ authorization: 'Bearer token-123' }))).toBe('token-123')
    expect(getBearerToken(new Headers({ authorization: 'bearer token-456' }))).toBe('token-456')
    expect(getBearerToken(new Headers({ authorization: 'Basic abc' }))).toBeNull()
    expect(getBearerToken(new Headers())).toBeNull()
  })

  it('always scopes service-role updates by row id and authenticated user id', async () => {
    const query = new FakeOwnedUpdateQuery()

    await applyOwnedRowFilter(query, 'row-1', 'user-1')

    expect(query.calls).toEqual([
      ['id', 'row-1'],
      ['user_id', 'user-1'],
    ])
  })
})
