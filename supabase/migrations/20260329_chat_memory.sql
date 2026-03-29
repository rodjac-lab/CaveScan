-- =====================================================
-- Chat Memory: persistence des conversations + extraction d'insights
-- Implements remaining V2 items from docs/celestin-memory-plan.md
-- =====================================================

-- Ensure pgvector is available (already enabled for bottles.embedding)
-- CREATE EXTENSION IF NOT EXISTS vector;

-- =========================
-- 1. chat_sessions
-- =========================
CREATE TABLE chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  turn_count INTEGER NOT NULL DEFAULT 0,
  summary TEXT,
  summary_embedding vector(1536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own their sessions" ON chat_sessions
  FOR ALL USING (user_id = auth.uid());
CREATE INDEX idx_chat_sessions_user ON chat_sessions(user_id, started_at DESC);

-- =========================
-- 2. chat_messages
-- =========================
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  role TEXT NOT NULL CHECK (role IN ('user', 'celestin')),
  content TEXT NOT NULL,
  has_image BOOLEAN NOT NULL DEFAULT false,
  ui_action_kind TEXT,
  cognitive_mode TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own their messages" ON chat_messages
  FOR ALL USING (user_id = auth.uid());
CREATE INDEX idx_chat_messages_session ON chat_messages(session_id, created_at);
CREATE INDEX idx_chat_messages_user ON chat_messages(user_id, created_at DESC);

-- =========================
-- 3. user_memory_facts
-- =========================
CREATE TABLE user_memory_facts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  session_id UUID REFERENCES chat_sessions(id) ON DELETE SET NULL,
  category TEXT NOT NULL CHECK (category IN (
    'preference', 'aversion', 'context', 'life_event',
    'wine_knowledge', 'social', 'cellar_intent'
  )),
  fact TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.8,
  source_quote TEXT,
  is_temporary BOOLEAN NOT NULL DEFAULT false,
  expires_at TIMESTAMPTZ,
  superseded_by UUID REFERENCES user_memory_facts(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE user_memory_facts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own their facts" ON user_memory_facts
  FOR ALL USING (user_id = auth.uid());
CREATE INDEX idx_memory_facts_active ON user_memory_facts(user_id, created_at DESC)
  WHERE superseded_by IS NULL;

-- =========================
-- 4. RPC: search_sessions (semantic search on session summaries)
-- =========================
CREATE OR REPLACE FUNCTION search_sessions(
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
  RETURN QUERY
  SELECT
    cs.id,
    cs.summary,
    cs.started_at,
    cs.turn_count,
    1 - (cs.summary_embedding <=> query_embedding) AS similarity
  FROM chat_sessions cs
  WHERE cs.user_id = auth.uid()
    AND cs.summary_embedding IS NOT NULL
    AND cs.summary IS NOT NULL
    AND 1 - (cs.summary_embedding <=> query_embedding) > similarity_threshold
  ORDER BY cs.summary_embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
