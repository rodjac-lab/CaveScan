import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('storage and RPC security migration', () => {
  const sql = readFileSync('supabase/migrations/20260517193000_harden_storage_and_rpc_security.sql', 'utf8')
  const legacyUploadSql = readFileSync('supabase/migrations/20260517201000_allow_legacy_authenticated_wine_label_uploads.sql', 'utf8')

  it('removes broad public wine-labels policies and recreates scoped authenticated policies', () => {
    expect(sql).toContain('DROP POLICY IF EXISTS "Public read access" ON storage.objects')
    expect(sql).toContain('DROP POLICY IF EXISTS "Allow uploads" ON storage.objects')
    expect(sql).toContain('DROP POLICY IF EXISTS "Allow updates" ON storage.objects')
    expect(sql).toContain('DROP POLICY IF EXISTS "Allow deletes" ON storage.objects')
    expect(sql).toContain('TO authenticated')
    expect(sql).toContain("bucket_id = 'wine-labels'")
    expect(sql).toContain('(storage.foldername(name))[1] = auth.uid()::text')
  })

  it('revokes anonymous access to security definer RPC functions', () => {
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.increment_chat_session_turn_count(uuid) FROM anon')
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.is_current_user_admin() FROM anon')
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.search_sessions(vector, integer, double precision) FROM anon')
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM authenticated')
  })

  it('keeps signed-in access for scoped memory functions', () => {
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.search_memories(vector, integer, double precision) TO authenticated')
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.search_sessions(vector, integer, double precision) TO authenticated')
    expect(sql).toContain('IF auth.uid() IS NULL THEN')
  })

  it('allows only signed-in legacy root uploads during the PWA transition', () => {
    expect(legacyUploadSql).toContain('TO authenticated')
    expect(legacyUploadSql).toContain("bucket_id = 'wine-labels'")
    expect(legacyUploadSql).toContain('coalesce(array_length(storage.foldername(name), 1), 0) = 0')
    expect(legacyUploadSql).not.toContain('TO public')
    expect(legacyUploadSql).not.toContain('FOR SELECT')
    expect(legacyUploadSql).not.toContain('FOR UPDATE')
    expect(legacyUploadSql).not.toContain('FOR DELETE')
  })
})
