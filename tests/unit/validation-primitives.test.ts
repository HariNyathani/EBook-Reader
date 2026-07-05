/**
 * Unit tests for the validation primitives.
 */

import { describe, expect, it } from 'vitest';
import {
  uuidSchema,
  emailSchema,
  nonEmptyString,
  parseOrThrow,
  parseResult,
} from '@/lib/validation/primitives';

describe('validation/primitives', () => {
  it('uuidSchema accepts a valid uuid', () => {
    expect(uuidSchema.safeParse('11111111-2222-3333-4444-555555555555').success).toBe(true);
  });

  it('uuidSchema rejects a non-uuid', () => {
    expect(uuidSchema.safeParse('not-a-uuid').success).toBe(false);
  });

  it('emailSchema accepts a valid email', () => {
    expect(emailSchema.safeParse('a@b.co').success).toBe(true);
  });

  it('emailSchema rejects an invalid email', () => {
    expect(emailSchema.safeParse('not-an-email').success).toBe(false);
  });

  it('nonEmptyString trims and requires at least one char', () => {
    expect(nonEmptyString.safeParse('  hello  ').success).toBe(true);
    expect(nonEmptyString.safeParse('   ').success).toBe(false);
  });

  it('parseOrThrow returns the parsed value', () => {
    expect(parseOrThrow(emailSchema, 'a@b.co')).toBe('a@b.co');
  });

  it('parseOrThrow throws on invalid', () => {
    expect(() => parseOrThrow(emailSchema, 'nope')).toThrow();
  });

  it('parseResult returns ok on valid', () => {
    const r = parseResult(emailSchema, 'a@b.co');
    expect(r.status).toBe('success');
    if (r.status === 'success') expect(r.data).toBe('a@b.co');
  });

  it('parseResult returns fail on invalid', () => {
    const r = parseResult(emailSchema, 'nope');
    expect(r.status).toBe('error');
    if (r.status === 'error') {
      expect(r.code).toBe('VALIDATION_ERROR');
      expect(typeof r.message).toBe('string');
    }
  });
});
