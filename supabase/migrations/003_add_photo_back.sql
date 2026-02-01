-- Add photo_url_back column for back label photo (champagne, etc.)
ALTER TABLE bottles ADD COLUMN IF NOT EXISTS photo_url_back TEXT;
