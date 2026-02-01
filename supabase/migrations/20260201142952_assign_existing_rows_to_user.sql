-- Assign existing rows without user_id to a specific user (for recovery)
DO $$
DECLARE
  target_user UUID := '955a4b38-eb94-4d70-8361-d10f5427e3ff';
BEGIN
  UPDATE zones
  SET user_id = target_user
  WHERE user_id IS NULL;

  UPDATE bottles
  SET user_id = target_user
  WHERE user_id IS NULL;
END $$;
