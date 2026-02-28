-- User Taste Profile: one row per user, JSONB computed + explicit preferences
CREATE TABLE user_taste_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  computed_profile JSONB NOT NULL DEFAULT '{}',
  explicit_preferences JSONB NOT NULL DEFAULT '{}',
  computed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_taste_profiles_user_id ON user_taste_profiles(user_id);

ALTER TABLE user_taste_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own taste profile"
  ON user_taste_profiles FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TRIGGER update_user_taste_profiles_updated_at
  BEFORE UPDATE ON user_taste_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
