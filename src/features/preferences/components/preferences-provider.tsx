'use client';

/**
 * PreferencesProvider — hydration + sync host (ISD §12.I, §12.J).
 *
 * Mounts the cloud-sync hook in the (app) layout so preferences are
 * hydrated as soon as an authenticated, approved user lands on any
 * authed page. Renders children unchanged.
 *
 * The provider is intentionally minimal — all the real work lives in
 * `usePreferencesSync` (subscription to the store) and
 * `getPreferencesAction` (server fetch).
 *
 * The provider must be a client component (it uses a hook), but it
 * simply renders its children; it does not introduce any visible UI.
 */

import type { ReactNode } from 'react';
import { usePreferencesSync } from '../sync';

interface PreferencesProviderProps {
  children: ReactNode;
}

export function PreferencesProvider({ children }: PreferencesProviderProps) {
  usePreferencesSync();
  return <>{children}</>;
}
