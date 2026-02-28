-- Add quantity column to bottles table
-- Existing bottles get quantity=1 by default (correct for legacy duplicated rows)
ALTER TABLE bottles ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 0);
