-- search_memories still returned rating as int, but bottles.rating now supports half-stars.
-- This breaks the RPC at runtime when Postgres returns a numeric value.
DROP FUNCTION IF EXISTS search_memories(vector, integer, double precision, uuid);

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
  rating numeric,
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
