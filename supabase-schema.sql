-- Run this in Supabase SQL Editor (https://supabase.com/dashboard/project/<ref>/sql/new)

-- 1. Create scan_results table
CREATE TABLE IF NOT EXISTS scan_results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  grade TEXT NOT NULL,
  score INTEGER NOT NULL,
  summary TEXT,
  categories JSONB DEFAULT '[]',
  recommendations JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Enable Row Level Security
ALTER TABLE scan_results ENABLE ROW LEVEL SECURITY;

-- 3. Policies: users can only see their own scans
CREATE POLICY "Users can view own scans"
  ON scan_results
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own scans"
  ON scan_results
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own scans"
  ON scan_results
  FOR DELETE
  USING (auth.uid() = user_id);

-- 4. Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_scan_results_user_id ON scan_results(user_id);
CREATE INDEX IF NOT EXISTS idx_scan_results_created_at ON scan_results(created_at DESC);
