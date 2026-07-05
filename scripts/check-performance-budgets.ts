#!/usr/bin/env tsx
/**
 * Performance budgets gate (Phase 14 §14.G, Phase 16 §16.Y).
 *
 * Reads performance-budgets.json and the Next.js build output, then
 * asserts every route's first-load JS is within its declared budget.
 * Fails the script (and the CI job) on any violation.
 *
 * The build output uses the App Router manifests:
 *   - .next/build-manifest.json: shared root chunks + Pages Router pages
 *   - .next/app-build-manifest.json: App Router pages
 *
 * For each budgeted route, we sum the GZIPPED size of the route's
 * page-specific chunks (which already include the shared root
 * chunks). We use gzipped sizes because that is what users actually
 * download and what Next.js reports in its build output.
 *
 * Exits 0 on success, 1 on any budget violation.
 */

import { readFileSync, existsSync, statSync, readdirSync, readFile } from 'node:fs';
import { resolve, join } from 'node:path';
import { promisify } from 'node:util';
import { gzipSync } from 'node:zlib';

const readFileAsync = promisify(readFile);

interface BudgetFile {
  firstLoadJsPerRoute: Record<string, number>;
  totalShellSize: { maxKb: number };
}

interface BuildManifest {
  rootMainFiles: string[];
  pages: Record<string, string[]>;
}

interface AppBuildManifest {
  pages: Record<string, string[]>;
}

function bytesToKb(bytes: number): number {
  return Math.round((bytes / 1024) * 10) / 10;
}

interface ChunkInfo {
  /** Gzipped size in bytes. */
  gzSize: number;
  /** Uncompressed size in bytes. */
  rawSize: number;
}

/**
 * Walk .next/static/ and produce a map of path -> gzipped size.
 * We use gzipped size because that is what is actually shipped
 * over the wire (when Content-Encoding: gzip is used by the CDN).
 */
function walkJsFiles(dir: string, dotNextDir: string, out: Map<string, ChunkInfo>): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkJsFiles(full, dotNextDir, out);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      try {
        const stat = statSync(full);
        const rel = full.slice(dotNextDir.length + 1);
        // Read + gzip synchronously; chunks are small enough.
        const buf = readFileSync(full);
        const gz = gzipSync(buf, { level: 9 });
        out.set(rel, { gzSize: gz.length, rawSize: stat.size });
      } catch {
        // ignore
      }
    }
  }
}

function sizeFor(chunkPath: string, sizes: Map<string, ChunkInfo>): number {
  // The manifest entries are like "static/chunks/foo.js"; the
  // .next/ tree stores them under .next/static/...; our size map
  // is keyed with the path RELATIVE TO .next/. So we match the
  // trailing portion.
  for (const [key, value] of sizes) {
    if (key === chunkPath) return value.gzSize;
    if (key.endsWith('/' + chunkPath)) return value.gzSize;
    if (key.endsWith(chunkPath)) return value.gzSize;
  }
  return 0;
}

async function main() {
  const root = process.cwd();
  const buildManifestPath = resolve(root, '.next/build-manifest.json');
  const appManifestPath = resolve(root, '.next/app-build-manifest.json');
  const budgetsPath = resolve(root, 'performance-budgets.json');
  const staticDir = resolve(root, '.next/static');

  if (!existsSync(budgetsPath)) {
    console.error('[budgets] performance-budgets.json not found');
    process.exit(2);
  }
  if (!existsSync(buildManifestPath) || !existsSync(appManifestPath)) {
    console.error('[budgets] Build output not found. Run `pnpm build` first.');
    process.exit(2);
  }

  const budgets = JSON.parse(readFileSync(budgetsPath, 'utf-8')) as BudgetFile;
  const buildManifest = JSON.parse(readFileSync(buildManifestPath, 'utf-8')) as BuildManifest;
  const appManifest = JSON.parse(readFileSync(appManifestPath, 'utf-8')) as AppBuildManifest;

  const sizes = new Map<string, ChunkInfo>();
  walkJsFiles(staticDir, resolve(staticDir, '..'), sizes);
  console.log(`[budgets] Indexed ${sizes.size} JS chunks.`);

  // Shared baseline (gzip) for the totalShellSize assertion.
  const sharedGzBytes = buildManifest.rootMainFiles.reduce((acc, f) => acc + sizeFor(f, sizes), 0);
  const sharedKb = bytesToKb(sharedGzBytes);
  console.log(`[budgets] Shared shell size (gzipped): ${sharedKb}KB`);

  if (sharedKb > budgets.totalShellSize.maxKb) {
    console.error(
      `[budgets] Shared shell ${sharedKb}KB exceeds totalShellSize.maxKb=${budgets.totalShellSize.maxKb}KB`,
    );
    process.exit(1);
  }

  // Per-route: the app-build-manifest entries ALREADY include the
  // shared rootMainFiles, so summing the unique page entries IS
  // the total first-load. No need to add the shared set separately.
  const violations: string[] = [];
  const allAppPages = new Set(Object.keys(appManifest.pages));

  for (const [budgetKey, budget] of Object.entries(budgets.firstLoadJsPerRoute)) {
    if (budgetKey.startsWith('$')) continue;
    // The manifest key includes the route group (e.g. "/(app)/dashboard/page"),
    // so we match by the trailing path segment after the route group.
    const lastSeg = budgetKey.split('/').filter(Boolean).pop() ?? '';
    const candidates = [...allAppPages].filter((p) => {
      if (budgetKey === '/') return p === '/page' || p === '/_not-found/page';
      // The manifest key looks like "/(group)/foo/page" or "/foo/page".
      // We match by suffix on the last path segment.
      if (lastSeg && p.endsWith('/' + lastSeg + '/page')) return true;
      // Also handle dynamic segments like /reader/[bookId]
      if (budgetKey.includes('[') && p.includes(budgetKey)) return true;
      return p.startsWith(budgetKey + '/') || p === budgetKey;
    });

    if (candidates.length === 0) {
      console.warn(`[budgets] No manifest entry for ${budgetKey}; skipping`);
      continue;
    }

    const pageKey = candidates.find((c) => c.endsWith('/page')) ?? candidates[0] ?? '';
    const pageFiles = appManifest.pages[pageKey] ?? [];
    const uniqueChunks = new Set<string>(pageFiles);
    const totalGzBytes = [...uniqueChunks].reduce((acc, f) => acc + sizeFor(f, sizes), 0);
    const totalKb = bytesToKb(totalGzBytes);
    const status = totalKb > budget ? 'OVER' : 'OK';
    console.log(`  [${status}] ${budgetKey}: ${totalKb}KB (budget ${budget}KB)`);
    if (totalKb > budget) {
      violations.push(`${budgetKey}: ${totalKb}KB > ${budget}KB`);
    }
  }

  if (violations.length > 0) {
    console.error('[budgets] VIOLATIONS:');
    for (const v of violations) console.error(`  - ${v}`);
    process.exit(1);
  }
  console.log('[budgets] All routes within budget.');
}

void main().catch((err) => {
  console.error('[budgets] Unhandled error:', err);
  process.exit(1);
});
