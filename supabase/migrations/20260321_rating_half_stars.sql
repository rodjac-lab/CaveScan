-- Allow half-star ratings (0.5 increments: 0.5, 1, 1.5, 2, ..., 5)
ALTER TABLE bottles
  ALTER COLUMN rating TYPE DECIMAL(2,1) USING rating::DECIMAL(2,1);

ALTER TABLE bottles
  DROP CONSTRAINT IF EXISTS bottles_rating_check;

ALTER TABLE bottles
  ADD CONSTRAINT bottles_rating_check CHECK (rating >= 0.5 AND rating <= 5 AND (rating * 2) = FLOOR(rating * 2));
