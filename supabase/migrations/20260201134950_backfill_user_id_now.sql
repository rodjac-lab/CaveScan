-- One-off backfill user_id for existing rows using the most recent auth user
DO $$
DECLARE
  latest_user UUID;
BEGIN
  SELECT id INTO latest_user
  FROM auth.users
  ORDER BY created_at DESC
  LIMIT 1;

  IF latest_user IS NULL THEN
    RAISE NOTICE 'No auth users found. Skipping backfill.';
    RETURN;
  END IF;

  UPDATE zones
  SET user_id = latest_user
  WHERE user_id IS NULL;

  UPDATE bottles
  SET user_id = latest_user
  WHERE user_id IS NULL;
END $$;
