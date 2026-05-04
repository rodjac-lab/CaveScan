-- =============================================================================
-- Seed test user account from a source user account.
--
-- Purpose: replicate Rodol's personal cellar/profile/memory onto the test
-- account so the authenticated LLM eval (Phase D, separate PR) can exercise
-- the prod path (preempt cellar candidates) against realistic data.
--
-- IMPORTANT:
--   * NEVER place this file under supabase/migrations/ — it would auto-apply
--     on every deploy and wipe the test account each time.
--   * Run via MCP (`mcp__plugin_supabase_supabase__execute_sql`) which uses
--     the Supabase service_role key and bypasses RLS.
--   * Replace :SRC_USER below with the source user_id (Rodol's personal
--     account UUID) before executing. The target user is fixed.
--
-- Snapshot of test account state pre-wipe is archived at:
--   evals/fixtures/archive/vivino-test-snapshot-2026-05-04.json
-- =============================================================================

-- ---------- Parameters (substitute before exec) ----------
--   :SRC_USER  Rodol's personal account UUID    (source)
--   :TGT_USER  '213e0662-2a6a-4868-957b-bbab982b342f'   (test account, fixed)
--
-- Convention used below: replace the literal '__SRC_USER__' and
-- '__TGT_USER__' tokens via your runner before sending the SQL.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1) WIPE the target account, in child-first order to respect FKs.
--    user_id = '__TGT_USER__'  (test account)
-- =============================================================================

DELETE FROM chat_messages       WHERE user_id = '__TGT_USER__';
DELETE FROM user_memory_facts   WHERE user_id = '__TGT_USER__';
DELETE FROM chat_sessions       WHERE user_id = '__TGT_USER__';
DELETE FROM bottles             WHERE user_id = '__TGT_USER__';
DELETE FROM zones               WHERE user_id = '__TGT_USER__';
DELETE FROM events              WHERE user_id = '__TGT_USER__';
DELETE FROM user_taste_profiles WHERE user_id = '__TGT_USER__';

-- =============================================================================
-- 2) RESEED from the source account, parents-first.
--
--    IDs are REGENERATED via gen_random_uuid() because the source rows still
--    own their original IDs (we never touch them); reusing them on insert
--    would violate the table primary keys.
--
--    Two temp mapping tables preserve the FK graph:
--      - zone_id_map    : remaps bottles.zone_id
--      - fact_id_map    : remaps user_memory_facts.superseded_by (self-FK)
--
--    NOTE: events.metadata may contain bottle_id strings as soft references.
--    These will point to the ORIGINAL source bottle IDs and won't resolve to
--    the regenerated bottles on the test account. This is acceptable — events
--    is an audit log and is never joined back to bottles by Celestin's hot
--    path. If a follow-up needs intact references, regenerate metadata too.
--
--    chat_sessions / chat_messages are intentionally NOT copied — the eval
--    injects its own conversations. user_memory_facts.session_id is set to
--    NULL on copy (column is nullable, FK is ON DELETE SET NULL).
-- =============================================================================

CREATE TEMP TABLE zone_id_map (old_id uuid PRIMARY KEY, new_id uuid NOT NULL) ON COMMIT DROP;
CREATE TEMP TABLE fact_id_map (old_id uuid PRIMARY KEY, new_id uuid NOT NULL) ON COMMIT DROP;

INSERT INTO zone_id_map (old_id, new_id)
SELECT id, gen_random_uuid() FROM zones WHERE user_id = '__SRC_USER__';

INSERT INTO fact_id_map (old_id, new_id)
SELECT id, gen_random_uuid() FROM user_memory_facts WHERE user_id = '__SRC_USER__';

-- 2a. zones — parent of bottles via bottles.zone_id
INSERT INTO zones (
  id, name, description, rows, columns, created_at, updated_at, position, user_id
)
SELECT
  m.new_id, z.name, z.description, z.rows, z.columns, z.created_at, z.updated_at,
  z.position, '__TGT_USER__'::uuid
FROM zones z
JOIN zone_id_map m ON m.old_id = z.id
WHERE z.user_id = '__SRC_USER__';

-- 2b. bottles — id regenerated; zone_id remapped via zone_id_map
INSERT INTO bottles (
  id, domaine, appellation, millesime, couleur, raw_extraction, zone_id,
  shelf, photo_url, status, added_at, drunk_at, updated_at, tasting_note,
  price, drink_from, drink_until, notes, photo_url_back, purchase_price,
  market_value, user_id, tasting_photos, cuvee, rebuy, qpr, grape_varieties,
  serving_temperature, typical_aromas, food_pairings, character, quantity,
  volume_l, tasting_tags, country, region, embedding, rating
)
SELECT
  gen_random_uuid(), b.domaine, b.appellation, b.millesime, b.couleur,
  b.raw_extraction, m.new_id AS zone_id, b.shelf, b.photo_url, b.status,
  b.added_at, b.drunk_at, b.updated_at, b.tasting_note, b.price, b.drink_from,
  b.drink_until, b.notes, b.photo_url_back, b.purchase_price, b.market_value,
  '__TGT_USER__'::uuid AS user_id, b.tasting_photos, b.cuvee, b.rebuy, b.qpr,
  b.grape_varieties, b.serving_temperature, b.typical_aromas, b.food_pairings,
  b.character, b.quantity, b.volume_l, b.tasting_tags, b.country, b.region,
  b.embedding, b.rating
FROM bottles b
LEFT JOIN zone_id_map m ON m.old_id = b.zone_id
WHERE b.user_id = '__SRC_USER__';

-- 2c. events — id regenerated; metadata kept verbatim (soft refs not remapped)
INSERT INTO events (
  id, user_id, action, metadata, created_at
)
SELECT
  gen_random_uuid(), '__TGT_USER__'::uuid AS user_id, action, metadata, created_at
FROM events
WHERE user_id = '__SRC_USER__';

-- 2d. user_taste_profiles — UNIQUE(user_id); id regenerated. WIPE removed the
-- target row but ON CONFLICT defensively handles partial wipes.
INSERT INTO user_taste_profiles (
  id, user_id, computed_profile, explicit_preferences, computed_at, created_at, updated_at
)
SELECT
  gen_random_uuid(), '__TGT_USER__'::uuid AS user_id, computed_profile,
  explicit_preferences, computed_at, created_at, updated_at
FROM user_taste_profiles
WHERE user_id = '__SRC_USER__'
ON CONFLICT (user_id) DO UPDATE SET
  computed_profile     = EXCLUDED.computed_profile,
  explicit_preferences = EXCLUDED.explicit_preferences,
  computed_at          = EXCLUDED.computed_at,
  updated_at           = EXCLUDED.updated_at;

-- 2e. user_memory_facts — id remapped via fact_id_map; superseded_by also
-- remapped (self-FK). session_id forced to NULL.
INSERT INTO user_memory_facts (
  id, user_id, session_id, category, fact, confidence, source_quote,
  is_temporary, expires_at, superseded_by, created_at
)
SELECT
  m.new_id, '__TGT_USER__'::uuid AS user_id, NULL::uuid AS session_id,
  f.category, f.fact, f.confidence, f.source_quote, f.is_temporary, f.expires_at,
  ms.new_id AS superseded_by,
  f.created_at
FROM user_memory_facts f
JOIN fact_id_map m  ON m.old_id  = f.id
LEFT JOIN fact_id_map ms ON ms.old_id = f.superseded_by
WHERE f.user_id = '__SRC_USER__';

COMMIT;

-- =============================================================================
-- Post-flight verification queries (run separately after COMMIT)
-- =============================================================================
--
-- Counts on target should equal the pre-flight counts on source:
--   SELECT 'zones' AS t, count(*) FROM zones                WHERE user_id = '__TGT_USER__'
--   UNION ALL SELECT 'bottles',  count(*) FROM bottles      WHERE user_id = '__TGT_USER__'
--   UNION ALL SELECT 'events',   count(*) FROM events       WHERE user_id = '__TGT_USER__'
--   UNION ALL SELECT 'profile',  count(*) FROM user_taste_profiles WHERE user_id = '__TGT_USER__'
--   UNION ALL SELECT 'facts',    count(*) FROM user_memory_facts   WHERE user_id = '__TGT_USER__';
--
-- Embedding sanity (must equal source bottles-with-embedding count):
--   SELECT count(*) FROM bottles WHERE user_id = '__TGT_USER__' AND embedding IS NOT NULL;
--
-- FK sanity — orphan zone_id should be 0:
--   SELECT count(*) FROM bottles b
--   LEFT JOIN zones z ON z.id = b.zone_id
--   WHERE b.user_id = '__TGT_USER__' AND b.zone_id IS NOT NULL AND z.id IS NULL;
--
-- session_id nullification — should be 0:
--   SELECT count(*) FROM user_memory_facts WHERE user_id = '__TGT_USER__' AND session_id IS NOT NULL;
--
-- Spot check (run identical query on source, IDs must match):
--   SELECT id, domaine, cuvee, millesime FROM bottles WHERE user_id = '__TGT_USER__' ORDER BY id LIMIT 5;
