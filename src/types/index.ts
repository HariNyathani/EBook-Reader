/**
 * Barrel re-export for all shared types.
 * Import as: import type { Book, Profile, ActionResult } from '@/types';
 */
export type { Book, Profile, UserLibraryEntry, ReadingProgress, UserPreferences } from './domain';
export type { ActionResult } from './action';

// Database-generated types — re-exported for convenience.
// For Row/Insert/Update generics, import directly from '@/types/database'.
export type { Database, Tables, InsertTables, UpdateTables, Enums } from './database';
