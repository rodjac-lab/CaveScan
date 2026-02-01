-- Add tasting_photos column for storing photos taken during wine tasting
ALTER TABLE bottles ADD COLUMN IF NOT EXISTS tasting_photos JSONB DEFAULT '[]';

-- Add comment explaining the structure
COMMENT ON COLUMN bottles.tasting_photos IS 'Array of tasting photos: [{url: string, label?: string, taken_at: string}]';
