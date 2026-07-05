/**
 * Unit tests for the cn() utility.
 *
 * Trivial module, but tested so coverage of src/lib/utils/* is
 * non-zero and the threshold is met.
 */

import { describe, expect, it } from 'vitest';
import { cn } from '@/lib/utils/cn';

describe('cn', () => {
  it('returns a single class for a single string', () => {
    expect(cn('foo')).toBe('foo');
  });

  it('joins multiple classes', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('drops falsy values', () => {
    expect(cn('foo', false, null, undefined, '', 'bar')).toBe('foo bar');
  });

  it('handles arrays', () => {
    expect(cn(['foo', 'bar'], 'baz')).toBe('foo bar baz');
  });

  it('merges Tailwind conflicts (later wins)', () => {
    expect(cn('px-4', 'px-2')).toBe('px-2');
  });
});
