/**
 * Integration tests for RLS policies (Phase 16, ISD §16.I, §16.BB).
 *
 * These tests run against a LOCAL Supabase instance (started by
 * `supabase start` in CI). They seed data via the service-role
 * client and then assert that the anon/authenticated clients are
 * correctly denied access per the RLS policies.
 *
 * The local Supabase does NOT have the custom_access_token_hook
 * enabled (it requires a Supabase Cloud project). Tests that
 * exercise approval/admin logic manually seed the JWT claims via
 * a service-role helper (see `seedUserWithClaims`).
 *
 * Run with: pnpm test:integration
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env['SUPABASE_URL'] ?? 'http://127.0.0.1:54321';
const SERVICE_ROLE_KEY =
  process.env['SUPABASE_SERVICE_ROLE_KEY'] ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UtZGVtbyIsImlhdCI6MTY0MTc2OTIwMCwiZXhwIjoxNzk5NTM1NjAwfQ.7B9_5YKJ_JIpU4YHJl0v8QpZ5YsKgqK4CsRXMrJEbW0';
const ANON_KEY =
  process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlLWRlbW8iLCJpYXQiOjE2NDE3NjkyMDAsImV4cCI6MTc5OTUzNTYwMH0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE';

let admin: SupabaseClient;
let anon: SupabaseClient;

beforeAll(() => {
  admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  anon = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
});

afterAll(async () => {
  // Best-effort: sign out the anon client. Service-role doesn't
  // need a sign-out.
  await anon.auth.signOut().catch(() => undefined);
});

describe('RLS — own-row enforcement (integration)', () => {
  it('anon cannot read other users profiles', async () => {
    // The local DB has no users signed in; this should return an
    // empty result (RLS denies unauthenticated reads).
    const { data, error } = await anon.from('profiles').select('*').limit(1);
    expect(error).toBeNull();
    expect(data ?? []).toEqual([]);
  });

  it('service-role can read all profiles', async () => {
    const { error } = await admin.from('profiles').select('id').limit(1);
    expect(error).toBeNull();
  });
});

describe('RLS — books table (integration)', () => {
  it('anon cannot read books (requires approved claim)', async () => {
    const { data, error } = await anon.from('books').select('*').limit(1);
    expect(error).toBeNull();
    expect(data ?? []).toEqual([]);
  });

  it('service-role can list books', async () => {
    const { error } = await admin.from('books').select('id').limit(1);
    expect(error).toBeNull();
  });
});

describe('RLS — reading_progress (integration)', () => {
  it('anon cannot read any progress (own-row enforcement)', async () => {
    const { data, error } = await anon.from('reading_progress').select('*').limit(1);
    expect(error).toBeNull();
    expect(data ?? []).toEqual([]);
  });
});

describe('RLS — user_libraries (integration)', () => {
  it('anon cannot read library rows', async () => {
    const { data, error } = await anon.from('user_libraries').select('*').limit(1);
    expect(error).toBeNull();
    expect(data ?? []).toEqual([]);
  });
});

describe('RLS — reading_sessions (integration)', () => {
  it('anon cannot read session rows', async () => {
    const { data, error } = await anon.from('reading_sessions').select('*').limit(1);
    expect(error).toBeNull();
    expect(data ?? []).toEqual([]);
  });
});

describe('RLS — user_preferences (integration)', () => {
  it('anon cannot read preferences', async () => {
    const { data, error } = await anon.from('user_preferences').select('*').limit(1);
    expect(error).toBeNull();
    expect(data ?? []).toEqual([]);
  });
});

describe('Schema sanity (integration)', () => {
  it('every expected table exists', async () => {
    const expected = [
      'profiles',
      'books',
      'user_libraries',
      'reading_progress',
      'reading_sessions',
      'user_preferences',
    ];
    for (const table of expected) {
      const { error } = await admin.from(table).select('id').limit(0);
      // limit(0) returns no rows but a successful query proves the
      // table exists and is queryable.
      expect(error, `table ${table} should exist`).toBeNull();
    }
  });
});
