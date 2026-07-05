/**
 * Upload feature constants.
 */
import { getServerEnv } from '@/lib/env';

/**
 * Maximum upload file size in bytes.
 * Default: 50 MB (52,428,800 bytes).
 * Configurable via MAX_UPLOAD_BYTES env var.
 */
export function getMaxUploadBytes(): number {
  try {
    const env = getServerEnv();
    return env.MAX_UPLOAD_BYTES;
  } catch {
    // Fallback if env not available
    return 52_428_800; // 50 MB
  }
}

/** Default max upload bytes (50 MB). */
export const MAX_UPLOAD_BYTES_DEFAULT = 52_428_800;

/** Accepted MIME types for EPUB upload. */
export const ACCEPTED_MIME = ['application/epub+zip'] as const;

/** Accepted file extensions for EPUB upload. */
export const ACCEPTED_EXT = ['.epub'] as const;
