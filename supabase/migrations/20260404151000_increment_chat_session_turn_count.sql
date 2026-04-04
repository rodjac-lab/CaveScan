CREATE OR REPLACE FUNCTION increment_chat_session_turn_count(target_session_id uuid)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE chat_sessions
  SET turn_count = turn_count + 1
  WHERE id = target_session_id
    AND user_id = auth.uid()
  RETURNING turn_count;
$$;
