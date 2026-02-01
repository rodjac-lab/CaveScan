-- CaveScan Schema Update - Align with PRD
-- Run this in the Supabase SQL editor

-- Drop existing bottles table (no data yet)
DROP TABLE IF EXISTS bottles;

-- Recreate bottles table matching PRD
CREATE TABLE bottles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Extracted by Claude Vision
  domaine TEXT,                    -- Producer/château name
  appellation TEXT,                -- AOC/AOP/DOC
  millesime INTEGER,               -- Vintage year
  couleur TEXT CHECK (couleur IN ('rouge', 'blanc', 'rose', 'bulles')),
  raw_extraction JSONB,            -- Raw Claude response for debugging

  -- Location
  zone_id UUID REFERENCES zones(id) ON DELETE SET NULL,
  shelf TEXT,                      -- "Étagère 1", "Haut", "Bas"...

  -- Photo
  photo_url TEXT,

  -- Status
  status TEXT DEFAULT 'in_stock' CHECK (status IN ('in_stock', 'drunk')),

  -- Timestamps
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  drunk_at TIMESTAMPTZ,

  -- Tasting (optional, filled after drinking)
  tasting_note TEXT,

  -- Future enrichment
  price NUMERIC(10, 2),
  drink_from INTEGER,              -- Year to start drinking
  drink_until INTEGER,             -- Year to stop drinking
  notes TEXT
);

-- Indexes
CREATE INDEX idx_bottles_zone_id ON bottles(zone_id);
CREATE INDEX idx_bottles_domaine ON bottles(domaine);
CREATE INDEX idx_bottles_appellation ON bottles(appellation);
CREATE INDEX idx_bottles_couleur ON bottles(couleur);
CREATE INDEX idx_bottles_millesime ON bottles(millesime);
CREATE INDEX idx_bottles_status ON bottles(status);

-- Trigger for updated_at (we'll add an updated_at column)
ALTER TABLE bottles ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE TRIGGER update_bottles_updated_at
  BEFORE UPDATE ON bottles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS policies
ALTER TABLE bottles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on bottles" ON bottles
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Also update zones table to add position column if not exists
ALTER TABLE zones ADD COLUMN IF NOT EXISTS position INTEGER DEFAULT 0;
