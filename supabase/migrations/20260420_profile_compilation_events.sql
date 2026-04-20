-- =====================================================
-- Profile compilation events
-- Candidate signals raised during sessions + audit trail
-- of patches applied to the compiled user profile.
-- =====================================================

-- Candidate signals: lightweight flags raised during activity
-- (rated tasting, reco feedback, topic exploration, etc.)
-- They are consumed by the patch-user-profile edge function.

CREATE TABLE IF NOT EXISTS profile_candidate_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  session_id UUID REFERENCES chat_sessions(id) ON DELETE SET NULL,
  signal_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  consumed_at TIMESTAMPTZ,
  consumed_by_patch_id UUID,
  CONSTRAINT profile_candidate_signals_type_check CHECK (signal_type IN (
    'rated_tasting_with_comment',
    'explicit_reco_feedback',
    'new_general_preference',
    'profile_contradiction',
    'long_topic_exploration',
    'new_topic_first_seen'
  ))
);

CREATE INDEX IF NOT EXISTS idx_profile_candidate_signals_user_unconsumed
  ON profile_candidate_signals(user_id, created_at)
  WHERE consumed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_profile_candidate_signals_session
  ON profile_candidate_signals(session_id)
  WHERE session_id IS NOT NULL;

ALTER TABLE profile_candidate_signals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own candidate signals" ON profile_candidate_signals;
CREATE POLICY "Users can manage own candidate signals"
  ON profile_candidate_signals FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());


-- Profile patches: audit trail of every change applied to the
-- compiled profile markdown. no_change rows are kept as evidence
-- that a check ran but found nothing durable.

CREATE TABLE IF NOT EXISTS profile_patches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  profile_version_before INTEGER NOT NULL,
  profile_version_after INTEGER NOT NULL,
  action TEXT NOT NULL,
  section TEXT,
  content TEXT,
  reason TEXT,
  based_on_signal_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  llm_model TEXT,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT profile_patches_action_check CHECK (action IN (
    'add', 'edit', 'remove', 'no_change', 'full_rewrite'
  )),
  CONSTRAINT profile_patches_section_check CHECK (
    section IS NULL OR section IN (
      'profil_gustatif',
      'moments_marquants',
      'explorations_en_cours',
      'style_de_conversation'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_profile_patches_user_applied_at
  ON profile_patches(user_id, applied_at DESC);

ALTER TABLE profile_patches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own profile patches" ON profile_patches;
CREATE POLICY "Users can read own profile patches"
  ON profile_patches FOR SELECT
  USING (user_id = auth.uid());

-- Note: inserts/updates only happen via the patch-user-profile edge function
-- using the service role key. No insert policy for regular users by design.


-- FK from signal -> patch once it is consumed, added after both tables exist
-- (non-blocking: signal can exist without a patch, patch can exist without signals)

ALTER TABLE profile_candidate_signals
  ADD CONSTRAINT profile_candidate_signals_consumed_by_patch_fk
  FOREIGN KEY (consumed_by_patch_id) REFERENCES profile_patches(id) ON DELETE SET NULL;
