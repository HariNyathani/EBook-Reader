'use client';

/**
 * Dynamic wrapper for ReaderView — ensures client-only loading (ssr: false).
 *
 * ISD §9.B: foliate-js requires the DOM and renders sandboxed iframes, so it must
 * be loaded client-side only via next/dynamic with ssr: false.
 *
 * This wrapper is imported by the reader page (server component) and renders the
 * client-side ReaderView only in the browser.
 *
 * NOTE: In Next.js 15 / React 19, `next/dynamic({ ssr: false })` is only permitted
 * inside a Client Component — using it from a Server Component is a build error.
 * This module therefore carries the 'use client' directive; the server page renders
 * it as a client boundary.
 */

import dynamic from 'next/dynamic';
import { ReaderSkeleton } from './reader-view';

/**
 * ReaderView — dynamically imported client component.
 * SSR is disabled because foliate-js requires the DOM.
 */
const ReaderView = dynamic(() => import('./reader-view'), {
  ssr: false,
  loading: ReaderSkeleton,
});

export default ReaderView;
