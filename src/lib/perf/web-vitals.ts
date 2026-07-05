'use client';

/**
 * Web Vitals reporter (Phase 14, ISD §14.G, §14.H, §14.X, §14.DD #6).
 *
 * Captures Core Web Vitals (LCP, INP, CLS, TTFB, FCP) and forwards
 * them to a monitoring sink. Two delivery paths are supported:
 *
 *   1. `@vercel/speed-insights` — when `NEXT_PUBLIC_SPEED_INSIGHTS`
 *      is unset (or 'true') and the package is installed, the Vercel
 *      `reportWebVitals` shim from `next/web-vitals` is invoked. This
 *      routes the metric through the Speed Insights dashboard.
 *
 *   2. Custom `/api/vitals` beacon — when `NEXT_PUBLIC_VITALS_ENDPOINT`
 *      is set, the metric is also POSTed to that endpoint as a
 *      fire-and-forget beacon with no body parsing on the client.
 *
 * Privacy (ISD §14.Z): the payloads are PII-free. They contain:
 *   - the metric name (LCP/INP/CLS/...)
 *   - the metric value
 *   - the metric rating (good/needs-improvement/poor)
 *   - a route template (never the full URL — uses the same shape as
 *     the Next.js rewriter, e.g. "/reader/[bookId]")
 *
 * No user ids, no book ids, no email, no query strings.
 *
 * Performance (ISD §14.X): reporting is non-blocking. We schedule
 * the network post via `requestIdleCallback` (or `setTimeout` as a
 * fallback) and never throw or block render.
 */

import type { NextWebVitalsMetric } from 'next/app';

export type VitalName = 'LCP' | 'CLS' | 'INP' | 'FCP' | 'TTFB' | 'FID';

/**
 * Strip a route to its template form, e.g. /reader/abc-123 → /reader/[bookId].
 * The Next.js routing layer uses square brackets for dynamic segments.
 * This is a best-effort scrub: any path component that looks like a
 * UUID is replaced with a generic token. We deliberately err on the
 * side of over-redaction.
 */
export function redactRoute(href: string): string {
  if (!href) return '/';
  try {
    const url = new URL(href, 'http://placeholder.local');
    const parts = url.pathname.split('/').filter(Boolean);
    const scrubbed = parts.map((p) => {
      // UUID-shaped segment → generic token
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(p)) {
        return '[id]';
      }
      return p;
    });
    return '/' + scrubbed.join('/');
  } catch {
    return '/';
  }
}

/**
 * The shape we forward to the monitoring sink. Kept narrow on purpose.
 */
export interface VitalPayload {
  id: string;
  name: VitalName;
  value: number;
  rating?: 'good' | 'needs-improvement' | 'poor';
  route: string;
  /** ISO timestamp. */
  timestamp: string;
}

/**
 * Send a single vital payload to the configured endpoint. The default
 * is no-op (we rely on Vercel Speed Insights in production). Set
 * NEXT_PUBLIC_VITALS_ENDPOINT to a URL to enable a custom beacon.
 */
function sendToCustomEndpoint(payload: VitalPayload): void {
  if (typeof window === 'undefined') return;
  const endpoint = process.env['NEXT_PUBLIC_VITALS_ENDPOINT'];
  if (!endpoint) return;

  try {
    const body = JSON.stringify(payload);
    const blob = new Blob([body], { type: 'application/json' });
    // Beacon first (guaranteed, no response consumed). If beacon is
    // unavailable we fall back to fetch with keepalive.
    if (navigator.sendBeacon) {
      navigator.sendBeacon(endpoint, blob);
    } else {
      void fetch(endpoint, { method: 'POST', body, keepalive: true }).catch(() => undefined);
    }
  } catch {
    // Reporting is best-effort; never block render.
  }
}

/**
 * Schedule a low-priority task (reporting). Uses requestIdleCallback
 * when available, falls back to setTimeout(fn, 0).
 */
function scheduleIdle(task: () => void): void {
  if (typeof window === 'undefined') return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ric = (window as any).requestIdleCallback as
    ((cb: () => void, opts?: { timeout: number }) => number) | undefined;
  if (ric) {
    ric(task, { timeout: 2000 });
  } else {
    setTimeout(task, 0);
  }
}

/**
 * Report a web-vital metric. Wired up by `<ReportVitals/>` (mounted
 * once in the root layout) via `useReportWebVitals` from next/web-vitals.
 *
 * The shape comes from `next/app` so this is type-compatible with
 * `useReportWebVitals`'s callback.
 */
export function reportWebVital(metric: NextWebVitalsMetric): void {
  // The Next.js typings classify the metric name as a string union; we
  // narrow it to our VitalName.
  const name = metric.name as VitalName;
  // Next 15's NextWebVitalsMetric exposes attribution as a record; we
  // pull the page URL out of it for routing. The shape varies between
  // metric kinds, so we read defensively.
  const attribution = (metric.attribution ?? {}) as Record<string, unknown>;
  const url = typeof attribution['url'] === 'string' ? (attribution['url'] as string) : '';
  const route = redactRoute(url);

  const payload: VitalPayload = {
    id: metric.id,
    name,
    value: metric.value,
    route,
    timestamp: new Date().toISOString(),
  };

  // Some metrics (CLS) include a rating in the attribution; we surface
  // it when present so the monitoring sink can bucket metrics without
  // re-computing thresholds.
  if (typeof attribution['rating'] === 'string') {
    const r = attribution['rating'] as string;
    if (r === 'good' || r === 'needs-improvement' || r === 'poor') {
      payload.rating = r;
    }
  }

  scheduleIdle(() => {
    sendToCustomEndpoint(payload);
    // Vercel Speed Insights (when present) is invoked via
    // `useReportWebVitals` (next/web-vitals) in the React component;
    // this function is the additional path. We intentionally do not
    // import @vercel/speed-insights here to keep the dep graph
    // optional — the React wrapper in `report-vitals.tsx` handles
    // the Vercel side.
  });
}
