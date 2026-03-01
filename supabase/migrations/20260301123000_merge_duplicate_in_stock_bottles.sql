-- Merge duplicate in-stock rows into a single row with aggregated quantity.
-- Scope is per user and bottle identity, including location and volume.
WITH duplicate_groups AS (
  SELECT
    user_id,
    domaine,
    cuvee,
    appellation,
    millesime,
    couleur,
    zone_id,
    shelf,
    volume_l,
    MIN(id) AS keep_id,
    ARRAY_AGG(id) AS all_ids,
    SUM(quantity) AS total_quantity
  FROM bottles
  WHERE status = 'in_stock'
  GROUP BY
    user_id,
    domaine,
    cuvee,
    appellation,
    millesime,
    couleur,
    zone_id,
    shelf,
    volume_l
  HAVING COUNT(*) > 1
),
updated AS (
  UPDATE bottles b
  SET
    quantity = dg.total_quantity,
    updated_at = NOW()
  FROM duplicate_groups dg
  WHERE b.id = dg.keep_id
  RETURNING dg.keep_id, dg.all_ids
)
DELETE FROM bottles b
USING updated u
WHERE b.id = ANY(u.all_ids)
  AND b.id <> u.keep_id;
