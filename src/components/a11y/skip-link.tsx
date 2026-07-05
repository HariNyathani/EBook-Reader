'use client';

/**
 * Skip-to-content link — Phase 15 (ISD §15.AA, §15.M, §15.DD #1).
 *
 * Renders an anchor that is visually hidden until it receives focus,
 * allowing keyboard users to jump past the navigation chrome to the
 * main content. WCAG 2.1 AA — Success Criterion 2.4.1 (Bypass Blocks).
 *
 * The `href` is the id of the main content landmark. The default is
 * `main-content`; the (app) layout's <main> element should set
 * `id="main-content" tabIndex={-1}` so the anchor's focus jumps
 * cleanly into it.
 *
 * Mount once at the top of the document (in the root layout) so it
 * is available on every page.
 */

interface SkipLinkProps {
  /** Target id. Default: 'main-content'. */
  href?: string;
  /** Visible label. Default: 'Skip to main content'. */
  children?: React.ReactNode;
}

export function SkipLink({
  href = '#main-content',
  children = 'Skip to main content',
}: SkipLinkProps) {
  return (
    <a
      href={href}
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[9999] focus:rounded-md focus:bg-indigo-600 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white focus:shadow-lg focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-indigo-500"
    >
      {children}
    </a>
  );
}
