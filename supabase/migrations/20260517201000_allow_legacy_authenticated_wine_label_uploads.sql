-- Transitional compatibility for installed PWAs that may still run the old
-- upload bundle and write wine-labels objects at the bucket root.
--
-- This keeps uploads working for signed-in users while preserving the hardening
-- that removed public listing, update, and delete policies. New app versions
-- upload under auth.uid()/filename and use the stricter owner-prefix policy.
CREATE POLICY "Authenticated legacy root wine label uploads"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'wine-labels'
    AND coalesce(array_length(storage.foldername(name), 1), 0) = 0
  );
