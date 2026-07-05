-- Migration: 0011_reading_sessions.sql
-- Phase 10: Reading Statistics Foundation
--
-- Capture-only foundation for future reading statistics (ISD §10.G).
-- Records reading session duration per user/book.
-- No aggregation or charts implemented yet (future phase).

-- Create reading_sessions table
CREATE TABLE IF NOT EXISTS public.reading_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ NOT NULL,
  duration_seconds INT NOT NULL CHECK (duration_seconds >= 0),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for efficient queries (user + book + time)
CREATE INDEX IF NOT EXISTS idx_reading_sessions_user_book_started
  ON public.reading_sessions(user_id, book_id, started_at DESC);

-- Enable Row Level Security
ALTER TABLE public.reading_sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only read their own sessions (and must be approved)
DROP POLICY IF EXISTS "Users can read own sessions" ON public.reading_sessions;
CREATE POLICY "Users can read own sessions"
  ON public.reading_sessions
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    AND (auth.jwt() ->> 'is_approved')::boolean = true
  );

-- RLS Policy: Users can only insert their own sessions (and must be approved)
DROP POLICY IF EXISTS "Users can insert own sessions" ON public.reading_sessions;
CREATE POLICY "Users can insert own sessions"
  ON public.reading_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (auth.jwt() ->> 'is_approved')::boolean = true
  );

-- Comment: Foundation for future statistics (no aggregation yet)
COMMENT ON TABLE public.reading_sessions IS
  'Capture-only foundation for future reading statistics. Records session duration per user/book. No aggregation implemented yet.';
