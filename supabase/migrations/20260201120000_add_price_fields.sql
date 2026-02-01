-- Add price fields to bottles
ALTER TABLE bottles ADD COLUMN IF NOT EXISTS purchase_price DECIMAL(10, 2);
ALTER TABLE bottles ADD COLUMN IF NOT EXISTS market_value DECIMAL(10, 2);
