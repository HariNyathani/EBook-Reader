/**
 * Automated a11y tests (Phase 15 §15.AA, Phase 16 §16.BB, §16.AA).
 *
 * Uses @axe-core/playwright to run the WCAG 2.1 AA rule packs
 * against the key pages. Any serious/critical violation fails
 * the test.
 *
 * The pages exercised are the public/auth surfaces only — the
 * protected app requires an approved user, which E2E doesn't
 * have without the full backend.
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const pagesToTest: Array<{ name: string; path: string }> = [
  { name: 'home', path: '/' },
  { name: 'login', path: '/login' },
  { name: 'register', path: '/register' },
  { name: 'pending-approval', path: '/pending-approval' },
  { name: 'offline', path: '/offline' },
];

for (const p of pagesToTest) {
  test(`a11y: ${p.name} (${p.path}) has no serious/critical violations`, async ({ page }) => {
    await page.goto(p.path, { waitUntil: 'domcontentloaded' });
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    const serious = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    if (serious.length > 0) {
      // Print the violations for the test report.
      for (const v of serious) {
        console.error(`  - ${v.id} (${v.impact}): ${v.help}`);
        for (const n of v.nodes) {
          console.error(`    → ${n.html.slice(0, 120)}`);
        }
      }
    }
    expect(serious).toEqual([]);
  });
}
