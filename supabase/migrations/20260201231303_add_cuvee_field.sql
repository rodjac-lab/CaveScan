-- Add cuvee field to bottles table
-- Example: Domaine = "Chartogne Taillet", Cuvee = "Orizeaux", Appellation = "Champagne"

ALTER TABLE bottles ADD COLUMN IF NOT EXISTS cuvee TEXT;

-- Add index for searching by cuvee
CREATE INDEX IF NOT EXISTS idx_bottles_cuvee ON bottles(cuvee);
