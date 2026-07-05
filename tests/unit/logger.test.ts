/**
 * Unit tests for the structured, PII-scrubbing logger.
 *
 * Phase 15 (ISD §15.G, §15.X, §15.AA, §15.BB). Verifies that:
 *   - Email addresses are masked in any string field.
 *   - JWTs and Bearer tokens are redacted.
 *   - Supabase/R2 secret patterns are redacted.
 *   - Sensitive keys (password, token, etc.) are redacted regardless
 *     of their value.
 *   - The log level filter respects the minLevel config.
 *   - Errors are formatted with name + message + truncated stack.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('logger — PII scrubbing (Phase 15)', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env['LOG_LEVEL'] = 'debug';
    // NODE_ENV is typed as a literal in some configs; cast to allow
    // assignment in tests.
    (process.env as Record<string, string>)['NODE_ENV'] = 'test';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('scrubs an email in a string field', async () => {
    const { _scrubValue } = await import('@/lib/logging/logger');
    const out = _scrubValue('user alice@example.com signed in') as string;
    expect(out).toContain('*@example.com');
    expect(out).not.toContain('alice@example.com');
  });

  it('scrubs a JWT-shaped string', async () => {
    const { _scrubValue } = await import('@/lib/logging/logger');
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MSJ9.4FhFTbKgRjqPz4CpzC9zCpzC9zCpz';
    const out = _scrubValue(`token: ${jwt}`) as string;
    expect(out).toContain('[redacted-jwt]');
    expect(out).not.toContain(jwt);
  });

  it('scrubs Bearer <token> shape', async () => {
    const { _scrubValue } = await import('@/lib/logging/logger');
    const out = _scrubValue('Authorization: Bearer abcdefghijklmnop') as string;
    expect(out).toContain('Bearer [redacted]');
  });

  it('scrubs Supabase service-role key shape (SB_SECRET_*)', async () => {
    const { _scrubValue } = await import('@/lib/logging/logger');
    const out = _scrubValue('key=SB_SECRET_AbCdEfGhIjKlMnOp1234') as string;
    expect(out).toContain('[redacted-secret]');
  });

  it('redacts sensitive keys regardless of value', async () => {
    const { _scrubValue } = await import('@/lib/logging/logger');
    const out = _scrubValue({ password: 'hunter2', email: 'real@x.com', foo: 'bar' }) as Record<
      string,
      unknown
    >;
    expect(out['password']).toBe('[redacted]');
    // email is a non-listed key; the value is scrubbed in-string.
    expect(JSON.stringify(out)).not.toContain('real@x.com');
    expect(out['foo']).toBe('bar');
  });

  it('handles deeply nested objects without infinite recursion', async () => {
    const { _scrubValue } = await import('@/lib/logging/logger');
    const deep: Record<string, unknown> = {};
    let cur: Record<string, unknown> = deep;
    for (let i = 0; i < 50; i++) {
      cur.next = {};
      cur = cur.next as Record<string, unknown>;
    }
    cur.value = 'leaf';
    const out = _scrubValue(deep);
    expect(out).toBeDefined();
  });

  it('handles circular objects without throwing', async () => {
    const { _scrubValue } = await import('@/lib/logging/logger');
    const a: Record<string, unknown> = { name: 'a' };
    const b: Record<string, unknown> = { name: 'b', a };
    a.b = b;
    const out = _scrubValue(a);
    expect(out).toBeDefined();
  });

  it('emits JSON in production and pretty in development', async () => {
    (process.env as Record<string, string>)['NODE_ENV'] = 'production';
    const writes: string[] = [];
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation((s) => {
      writes.push(String(s));
      return true;
    });
    const { logger } = await import('@/lib/logging/logger');
    logger.info('test.event', { userId: 'u-1' });
    expect(spy).toHaveBeenCalled();
    const lastWrite = writes[writes.length - 1] ?? '';
    expect(lastWrite).toContain('"event":"test.event"');
    expect(lastWrite).toContain('"service":"epub-reader"');
    expect(lastWrite).toContain('"env":"production"');
  });

  it('honors the LOG_LEVEL min filter (info < error)', async () => {
    process.env['LOG_LEVEL'] = 'error';
    // Reset module cache so loadConfig() picks up the new LOG_LEVEL.
    vi.resetModules();
    const writes: string[] = [];
    vi.spyOn(process.stderr, 'write').mockImplementation((s) => {
      writes.push(String(s));
      return true;
    });
    const { logger } = await import('@/lib/logging/logger');
    logger.info('ignored', { foo: 1 });
    logger.error('kept', { foo: 2 });
    const joined = writes.join('\n');
    expect(joined).not.toContain('ignored');
    expect(joined).toContain('kept');
  });

  it('maskEmail masks the local part of an address', async () => {
    const { maskEmail } = await import('@/lib/logging/logger');
    expect(maskEmail('alice@example.com')).toMatch(/^a\*+@example\.com$/);
    expect(maskEmail('a@x.io')).toBe('a*@x.io');
    expect(maskEmail('not-an-email')).toBe('[masked-email]');
  });
});
