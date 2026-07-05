-- Migration: 0012_user_preferences.sql
-- Phase 12: Cloud-synced Reader Preferences
--
-- Cloud copy of user reader preferences (ISD §12.G).
-- Local-first persistence lives in localStorage (zustand persist);
-- this table provides cross-device LWW sync by updated_at.
--
-- The `preferences` jsonb column reserves namespaces for future
-- SAD §7 features: highlights, annotations, dictionary. They are
-- declared in the Zod schema (optional) but NOT implemented here.

-- Create user_preferences table (1:1 with auth.users)
CREATE TABLE IF NOT EXISTS public.user_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  -- jsonb blob; shape is the versioned Preferences envelope.
  preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Envelope version (mirrors PREFERENCES_VERSION in code).
  version INT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Maintain updated_at on UPDATE via the Phase-3 trigger function.
DROP TRIGGER IF EXISTS set_user_preferences_updated_at ON public.user_preferences;
CREATE TRIGGER set_user_preferences_updated_at
  BEFORE UPDATE ON public.user_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Enable Row Level Security
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can read their own preferences (and must be approved).
DROP POLICY IF EXISTS "Users can read own preferences" ON public.user_preferences;
CREATE POLICY "Users can read own preferences"
  ON public.user_preferences
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    AND (auth.jwt() ->> 'is_approved')::boolean = true
  );

-- RLS Policy: Users can insert their own preferences.
DROP POLICY IF EXISTS "Users can insert own preferences" ON public.user_preferences;
CREATE POLICY "Users can insert own preferences"
  ON public.user_preferences
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (auth.jwt() ->> 'is_approved')::boolean = true
  );

-- RLS Policy: Users can update their own preferences.
DROP POLICY IF EXISTS "Users can update own preferences" ON public.user_preferences;
CREATE POLICY "Users can update own preferences"
  ON public.user_preferences
  FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    AND (auth.jwt() ->> 'is_approved')::boolean = true
  )
  WITH CHECK (
    user_id = auth.uid()
    AND (auth.jwt() ->> 'is_approved')::boolean = true
  );

-- No delete policy — the row persists for the lifetime of the user.

-- Comment
COMMENT ON TABLE public.user_preferences IS
  'Cloud copy of user reader preferences; local-first, LWW by updated_at. preferences jsonb reserves namespaces {reader, highlights?, annotations?, dictionary?} for future features (SAD §7).';
