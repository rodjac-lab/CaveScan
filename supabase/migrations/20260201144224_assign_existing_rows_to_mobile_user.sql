-- Assign existing rows without user_id to the mobile user
DO $$
DECLARE
  target_user UUID := '3e4238fe-2e9a-4414-8a2f-dd9670c50b6b';
BEGIN
  UPDATE zones
  SET user_id = target_user
  WHERE user_id IS NULL;

  UPDATE bottles
  SET user_id = target_user
  WHERE user_id IS NULL;
END $$;
