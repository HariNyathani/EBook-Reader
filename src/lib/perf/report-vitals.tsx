'use client';

/**
 * ReportVitals — wire-up component for Web Vitals monitoring.
 *
 * Mounts once in the root layout and uses Next.js's
 * `useReportWebVitals` hook to capture LCP/INP/CLS/FCP/TTFB. The
 * metric is forwarded to:
 *
 *   1. The custom `reportWebVital` sink (PII-free payload, optional
 *      custom beacon via NEXT_PUBLIC_VITALS_ENDPOINT).
 *   2. Vercel Speed Insights (when installed and enabled via
 *      NEXT_PUBLIC_SPEED_INSIGHTS — defaults to enabled when the
 *      package is present).
 *
 * Performance: rendering this component has near-zero cost — it
 * only registers a callback. The actual metric reporting is
 * scheduled on the next idle slot.
 *
 * Accessibility: no visible UI. The component is mounted for
 * authenticated and unauthenticated users alike.
 */

import { useReportWebVitals } from 'next/web-vitals';
import { reportWebVital, type VitalPayload } from './web-vitals';

// @vercel/speed-insights is optional. We import dynamically so a
// build without the dep still works. The function shape is the
// same as the one passed to useReportWebVitals.
type SpeedInsightsFn = (metric: { id: string; name: string; value: number }) => void;

let speedInsightsFn: SpeedInsightsFn | null = null;
try {
  // The package may not be installed in some environments; the
  // try/catch keeps the build green and the runtime functional.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  speedInsightsFn = require('@vercel/speed-insights').speedInsights as SpeedInsightsFn;
} catch {
  speedInsightsFn = null;
}

/**
 * <ReportVitals/> — mount once in the root layout. Renders nothing.
 */
export function ReportVitals() {
  useReportWebVitals((metric) => {
    // 1. Forward to our PII-free custom sink.
    reportWebVital({
      id: metric.id,
      name: metric.name as VitalPayload['name'],
      value: metric.value,
      // Next 15's NextWebVitalsMetric doesn't expose `rating` and
      // `navigationType` in its typings, but the runtime values may
      // include them; we forward them when present.
      ...(('rating' in metric && metric.rating
        ? { rating: metric.rating as VitalPayload['rating'] }
        : {}) as object),
    } as Parameters<typeof reportWebVital>[0]);

    // 2. Forward to Vercel Speed Insights when available.
    if (speedInsightsFn) {
      try {
        speedInsightsFn({
          id: metric.id,
          name: metric.name,
          value: metric.value,
        });
      } catch {
        // Never let monitoring break the app.
      }
    }
  });

  return null;
}
