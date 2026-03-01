-- Add bottle volume with constrained values:
-- 0.375L (half), 0.75L (standard), 1.5L (magnum)
ALTER TABLE bottles
ADD COLUMN volume_l NUMERIC(4,3) NOT NULL DEFAULT 0.75
CHECK (volume_l IN (0.375, 0.75, 1.5));
