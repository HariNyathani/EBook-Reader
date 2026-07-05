/**
 * Unit tests for auth input validation (Zod schemas) and action logic.
 * Phase 4 — ISD §4.X Testing Requirements.
 *
 * These tests verify that invalid inputs are rejected before reaching Supabase.
 * Integration/E2E auth tests (Playwright) are in tests/e2e/ and require a live Supabase project.
 */

import { describe, it, expect } from 'vitest';
import { credentialsSchema, registerSchema } from '@/features/auth/schemas';
import { approvalSchema } from '@/features/admin/schemas';

// ---------------------------------------------------------------------------
// credentialsSchema / registerSchema
// ---------------------------------------------------------------------------
describe('credentialsSchema', () => {
  it('accepts valid email and password', () => {
    const result = credentialsSchema.safeParse({
      email: 'user@example.com',
      password: 'securepassword123',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid email', () => {
    const result = credentialsSchema.safeParse({
      email: 'not-an-email',
      password: 'securepassword123',
    });
    expect(result.success).toBe(false);
  });

  it('rejects password shorter than 8 characters', () => {
    const result = credentialsSchema.safeParse({
      email: 'user@example.com',
      password: 'short',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0]?.message).toContain('8 characters');
    }
  });

  it('rejects password longer than 72 characters', () => {
    const result = credentialsSchema.safeParse({
      email: 'user@example.com',
      password: 'a'.repeat(73),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0]?.message).toContain('72 characters');
    }
  });

  it('accepts password at max boundary (72 chars)', () => {
    const result = credentialsSchema.safeParse({
      email: 'user@example.com',
      password: 'a'.repeat(72),
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing email', () => {
    const result = credentialsSchema.safeParse({
      password: 'securepassword123',
    });
    expect(result.success).toBe(false);
  });
});

describe('registerSchema (alias of credentialsSchema)', () => {
  it('accepts same valid input as credentialsSchema', () => {
    const result = registerSchema.safeParse({
      email: 'new@example.com',
      password: 'strongpassword!',
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// approvalSchema
// ---------------------------------------------------------------------------
describe('approvalSchema', () => {
  it('accepts valid userId (UUID) + approve=true', () => {
    const result = approvalSchema.safeParse({
      userId: '123e4567-e89b-12d3-a456-426614174000',
      approve: true,
    });
    expect(result.success).toBe(true);
  });

  it('accepts approve=false', () => {
    const result = approvalSchema.safeParse({
      userId: '123e4567-e89b-12d3-a456-426614174000',
      approve: false,
    });
    expect(result.success).toBe(true);
  });

  it('rejects non-UUID userId', () => {
    const result = approvalSchema.safeParse({
      userId: 'not-a-uuid',
      approve: true,
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-boolean approve', () => {
    const result = approvalSchema.safeParse({
      userId: '123e4567-e89b-12d3-a456-426614174000',
      approve: 'yes',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing userId', () => {
    const result = approvalSchema.safeParse({ approve: true });
    expect(result.success).toBe(false);
  });
});
