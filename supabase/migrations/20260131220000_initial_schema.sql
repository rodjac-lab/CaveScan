-- CaveScan Initial Schema
-- Run this in the Supabase SQL editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Zones table (storage areas in the cellar)
CREATE TABLE zones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  rows INTEGER NOT NULL DEFAULT 1 CHECK (rows > 0 AND rows <= 50),
  columns INTEGER NOT NULL DEFAULT 1 CHECK (columns > 0 AND columns <= 50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Bottles table
CREATE TABLE bottles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  zone_id UUID NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
  row_position INTEGER NOT NULL CHECK (row_position > 0),
  column_position INTEGER NOT NULL CHECK (column_position > 0),

  -- Wine information
  wine_name VARCHAR(255) NOT NULL,
  appellation VARCHAR(255),
  producer VARCHAR(255),
  vintage INTEGER CHECK (vintage >= 1800 AND vintage <= 2100),
  color VARCHAR(20) NOT NULL DEFAULT 'red' CHECK (color IN ('red', 'white', 'rose', 'sparkling', 'other')),
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 0),

  -- Purchase info
  purchase_price DECIMAL(10, 2),
  purchase_date DATE,

  -- Drinking window
  drink_from INTEGER CHECK (drink_from >= 1800 AND drink_from <= 2200),
  drink_until INTEGER CHECK (drink_until >= 1800 AND drink_until <= 2200),

  -- Notes and rating
  notes TEXT,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  photo_url TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Ensure position is valid for the zone
  CONSTRAINT valid_drink_window CHECK (drink_from IS NULL OR drink_until IS NULL OR drink_from <= drink_until)
);

-- Indexes for common queries
CREATE INDEX idx_bottles_zone_id ON bottles(zone_id);
CREATE INDEX idx_bottles_wine_name ON bottles(wine_name);
CREATE INDEX idx_bottles_color ON bottles(color);
CREATE INDEX idx_bottles_vintage ON bottles(vintage);
CREATE INDEX idx_bottles_position ON bottles(zone_id, row_position, column_position);

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_zones_updated_at
  BEFORE UPDATE ON zones
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bottles_updated_at
  BEFORE UPDATE ON bottles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS)
-- For now, allow all operations (no auth required for MVP)
-- You can enable RLS later when adding authentication

ALTER TABLE zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE bottles ENABLE ROW LEVEL SECURITY;

-- Policies for anonymous access (MVP without auth)
CREATE POLICY "Allow all operations on zones" ON zones
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all operations on bottles" ON bottles
  FOR ALL
  USING (true)
  WITH CHECK (true);
