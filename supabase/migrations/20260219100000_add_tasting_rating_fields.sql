-- Add structured tasting fields: rating, rebuy, qpr
ALTER TABLE bottles ADD COLUMN IF NOT EXISTS rating smallint CHECK (rating >= 1 AND rating <= 5);
ALTER TABLE bottles ADD COLUMN IF NOT EXISTS rebuy boolean;
ALTER TABLE bottles ADD COLUMN IF NOT EXISTS qpr smallint CHECK (qpr >= 1 AND qpr <= 3);
