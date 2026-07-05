-- 0001_extensions_and_enums.sql
-- Phase 3: Enable required extensions and declare the book_format enum.
-- Idempotent: uses IF NOT EXISTS throughout.

-- pgcrypto provides gen_random_uuid() for UUID primary key generation.
create extension if not exists "pgcrypto";

-- book_format enum — extensible per SAD §7 (e.g., 'pdf', 'mobi' may be added).
-- Use DO block for idempotency (can't use IF NOT EXISTS on CREATE TYPE directly in PG < 16 without checks).
do $$ begin
  create type public.book_format as enum ('epub');
exception
  when duplicate_object then null;
end $$;
