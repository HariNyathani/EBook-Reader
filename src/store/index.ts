/**
 * Barrel for all Zustand stores.
 * Import as: import { useReaderStore, useUiStore } from '@/store';
 *
 * NOTE: These are client-only modules ('use client').
 * Do not import from Server Components or server-only modules.
 */
export { useReaderStore } from './reader-store';
export { useUiStore } from './ui-store';
