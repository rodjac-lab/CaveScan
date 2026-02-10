-- Tracking table for user analytics
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid(),
  action TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS: each user can only insert their own events
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can insert own events"
  ON events FOR INSERT WITH CHECK (user_id = auth.uid());

-- Indexes for analytics queries
CREATE INDEX idx_events_action ON events (action);
CREATE INDEX idx_events_created_at ON events (created_at);
CREATE INDEX idx_events_user_id ON events (user_id);
