/**
 * MANUAL CONTRACT — must stay in sync with Phase 3 migrations until Supabase type generation is enabled.
 * Field names use snake_case to match Postgres/Supabase row shape (avoids mapping churn).
 * See: src/types/database.ts (generated in Phase 3) for the authoritative generated types.
 */

/** Represents a book stored in R2 and catalogued in the database. */
export interface Book {
  id: string;
  title: string;
  author: string | null;
  /** Object key in R2 — NOT a full URL. See constants.ts coverKey(). */
  cover_key: string | null;
  /** Object key in R2 — NOT a full URL. See constants.ts epubKey(). */
  file_key: string;
  /** Format enum — 'epub' only in MVP; extensible per SAD §7. */
  format: 'epub';
  created_at: string;
  updated_at: string;
}

/** Represents a user profile — source of truth for authorization claims. */
export interface Profile {
  /** Equal to the auth.users id from Supabase Auth. */
  id: string;
  email: string;
  is_approved: boolean;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
}

/** Association between a user and a book in their library. */
export interface UserLibraryEntry {
  id: string;
  user_id: string;
  book_id: string;
  added_at: string;
}

/** Tracks a user's reading position and completion percentage for a book. */
export interface ReadingProgress {
  id: string;
  user_id: string;
  book_id: string;
  /** EPUB CFI string for precise reading position. */
  cfi: string | null;
  /** Completion percentage: 0–100. */
  percentage: number;
  updated_at: string;
}
