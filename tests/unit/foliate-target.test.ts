/**
 * Unit tests for `toFoliateTarget` — the goTo target normaliser in the
 * FoliateEngine adapter.
 *
 * Regression (reader render bug): the progress scrubber navigates by overall
 * reading fraction, passed as a numeric STRING ("0.15"). foliate-js only
 * treats an object `{ fraction }` as a fraction — a numeric string resolves
 * as an href and fails, so the scrubber snapped back to 0%. This helper must
 * convert a 0..1 fraction string into `{ fraction }` while passing CFIs and
 * hrefs through untouched.
 */

import { describe, expect, it } from 'vitest';
import { toFoliateTarget } from '@/features/reader/engine/foliate-engine';

describe('toFoliateTarget', () => {
  it('converts a mid-range fraction string to a { fraction } object', () => {
    expect(toFoliateTarget('0.15')).toEqual({ fraction: 0.15 });
  });

  it('treats the boundary values "0" and "1" as fractions (Home/End keys)', () => {
    expect(toFoliateTarget('0')).toEqual({ fraction: 0 });
    expect(toFoliateTarget('1')).toEqual({ fraction: 1 });
  });

  it('accepts a leading-dot fraction like ".5"', () => {
    expect(toFoliateTarget('.5')).toEqual({ fraction: 0.5 });
  });

  it('passes an epubcfi target through unchanged', () => {
    const cfi = 'epubcfi(/6/4[chap01]!/4/2/1:0)';
    expect(toFoliateTarget(cfi)).toBe(cfi);
  });

  it('passes an href target through unchanged', () => {
    expect(toFoliateTarget('chapter1.xhtml#section')).toBe('chapter1.xhtml#section');
  });

  it('does NOT treat an out-of-range number string as a fraction', () => {
    // "15" would be a section index in foliate, not 15%. We pass it through
    // as a string rather than silently reinterpreting it as a fraction.
    expect(toFoliateTarget('15')).toBe('15');
  });
});
