-- Add user ownership and user-scoped RLS for bottles/zones

-- Ensure auth schema is available (Supabase provides it)
-- user_id defaults to auth.uid() on insert for authenticated users

ALTER TABLE zones
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE bottles
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE zones
ALTER COLUMN user_id SET DEFAULT auth.uid();

ALTER TABLE bottles
ALTER COLUMN user_id SET DEFAULT auth.uid();

-- Optional indexes for per-user queries
CREATE INDEX IF NOT EXISTS idx_zones_user_id ON zones(user_id);
CREATE INDEX IF NOT EXISTS idx_bottles_user_id ON bottles(user_id);

-- Drop permissive policies
DROP POLICY IF EXISTS "Allow all operations on zones" ON zones;
DROP POLICY IF EXISTS "Allow all operations on bottles" ON bottles;

-- Zones policies: user-scoped
CREATE POLICY "Zones are user-owned" ON zones
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Bottles policies: user-scoped
CREATE POLICY "Bottles are user-owned" ON bottles
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
