-- Harden public storage and exposed SECURITY DEFINER functions flagged by Supabase Advisor.

-- Trigger helper: set an explicit search_path so execution does not depend on caller role settings.
ALTER FUNCTION public.update_updated_at_column()
  SET search_path = public, pg_temp;

-- Keep this RPC callable by signed-in clients, but never by anon/PUBLIC.
REVOKE ALL ON FUNCTION public.increment_chat_session_turn_count(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_chat_session_turn_count(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.increment_chat_session_turn_count(uuid) TO authenticated;

-- Admin check is used by RLS policies for observability. It should not be callable anonymously.
REVOKE ALL ON FUNCTION public.is_current_user_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_current_user_admin() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_current_user_admin() TO authenticated;

-- Legacy/private helper: keep it away from the exposed API roles.
REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM anon;
REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM authenticated;

-- Semantic bottle memory search: signed-in only, scoped inside the function by auth.uid().
REVOKE ALL ON FUNCTION public.search_memories(vector, integer, double precision) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_memories(vector, integer, double precision) FROM anon;
GRANT EXECUTE ON FUNCTION public.search_memories(vector, integer, double precision) TO authenticated;

-- Session memory search: same hardening as search_memories.
CREATE OR REPLACE FUNCTION public.search_sessions(
  query_embedding vector(1536),
  match_count int DEFAULT 3,
  similarity_threshold float DEFAULT 0.3
)
RETURNS TABLE (
  id UUID,
  summary TEXT,
  started_at TIMESTAMPTZ,
  turn_count INTEGER,
  similarity float
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    cs.id,
    cs.summary,
    cs.started_at,
    cs.turn_count,
    1 - (cs.summary_embedding <=> query_embedding) AS similarity
  FROM public.chat_sessions cs
  WHERE cs.user_id = auth.uid()
    AND cs.summary_embedding IS NOT NULL
    AND cs.summary IS NOT NULL
    AND 1 - (cs.summary_embedding <=> query_embedding) > similarity_threshold
  ORDER BY cs.summary_embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

REVOKE ALL ON FUNCTION public.search_sessions(vector, integer, double precision) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_sessions(vector, integer, double precision) FROM anon;
GRANT EXECUTE ON FUNCTION public.search_sessions(vector, integer, double precision) TO authenticated;

-- wine-labels is a public bucket for object URL access, but clients should not be
-- able to list, update, or delete the whole bucket. New client uploads must live
-- under the authenticated user's UUID prefix.
DROP POLICY IF EXISTS "Public read access" ON storage.objects;
DROP POLICY IF EXISTS "Allow uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow updates" ON storage.objects;
DROP POLICY IF EXISTS "Allow deletes" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload own wine labels" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read own wine labels" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update own wine labels" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete own wine labels" ON storage.objects;

CREATE POLICY "Authenticated users can upload own wine labels"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'wine-labels'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Authenticated users can read own wine labels"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'wine-labels'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Authenticated users can update own wine labels"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'wine-labels'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'wine-labels'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Authenticated users can delete own wine labels"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'wine-labels'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
