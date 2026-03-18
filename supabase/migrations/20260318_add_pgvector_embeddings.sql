-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column to bottles
ALTER TABLE bottles ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Index for cosine similarity search
-- Using IVFFlat with lists=1 for small dataset (~50 rows), increase later
CREATE INDEX IF NOT EXISTS idx_bottles_embedding
  ON bottles USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 1);

-- RPC function for hybrid semantic search
CREATE OR REPLACE FUNCTION search_memories(
  query_embedding vector(1536),
  match_count int DEFAULT 7,
  similarity_threshold float DEFAULT 0.3,
  requesting_user_id uuid DEFAULT auth.uid()
)
RETURNS TABLE (
  id uuid,
  domaine text,
  cuvee text,
  appellation text,
  millesime int,
  couleur text,
  country text,
  region text,
  tasting_note text,
  tasting_tags jsonb,
  rating int,
  drunk_at timestamptz,
  "character" text,
  grape_varieties text[],
  food_pairings text[],
  rebuy boolean,
  qpr int,
  similarity float
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    b.id,
    b.domaine,
    b.cuvee,
    b.appellation,
    b.millesime,
    b.couleur,
    b.country,
    b.region,
    b.tasting_note,
    b.tasting_tags,
    b.rating,
    b.drunk_at,
    b."character",
    b.grape_varieties,
    b.food_pairings,
    b.rebuy,
    b.qpr,
    1 - (b.embedding <=> query_embedding) AS similarity
  FROM bottles b
  WHERE b.user_id = requesting_user_id
    AND b.status = 'drunk'
    AND b.embedding IS NOT NULL
    AND b.tasting_note IS NOT NULL
    AND 1 - (b.embedding <=> query_embedding) > similarity_threshold
  ORDER BY
    -- Hybrid score: cosine similarity * 0.6 + quality bonuses * 0.4
    (
      (1 - (b.embedding <=> query_embedding)) * 0.6
      + (CASE WHEN b.rating >= 4 THEN 0.15 ELSE 0 END)
      + (CASE WHEN b.rating = 5 THEN 0.1 ELSE 0 END)
      + (CASE WHEN (b.tasting_tags->>'sentiment') = 'excellent' THEN 0.15 ELSE
           CASE WHEN (b.tasting_tags->>'sentiment') = 'bon' THEN 0.05 ELSE 0 END
         END)
      + (CASE WHEN b.drunk_at > NOW() - INTERVAL '30 days' THEN 0.1
              WHEN b.drunk_at > NOW() - INTERVAL '90 days' THEN 0.05
              ELSE 0 END)
    ) DESC
  LIMIT match_count;
END;
$$;
