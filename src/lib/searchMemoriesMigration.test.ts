import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('search_memories security migration', () => {
  const sql = readFileSync('supabase/migrations/20260514120000_bind_search_memories_to_auth_uid.sql', 'utf8')

  it('removes the caller-controlled user id signature', () => {
    expect(sql).toContain('DROP FUNCTION IF EXISTS search_memories(vector, integer, double precision, uuid)')
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION search_memories\(\s*query_embedding vector\(1536\),\s*match_count int DEFAULT 7,\s*similarity_threshold float DEFAULT 0\.3\s*\)/)
    expect(sql).not.toMatch(/requesting_user_id uuid/)
  })

  it('binds the SECURITY DEFINER body to auth.uid and authenticated execute grants', () => {
    expect(sql).toContain('SECURITY DEFINER')
    expect(sql).toContain('SET search_path = public')
    expect(sql).toContain('WHERE b.user_id = auth.uid()')
    expect(sql).toContain('REVOKE ALL ON FUNCTION search_memories(vector, integer, double precision) FROM anon')
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION search_memories(vector, integer, double precision) TO authenticated')
  })
})
