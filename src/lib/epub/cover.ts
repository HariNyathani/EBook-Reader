import 'server-only';

import sharp from 'sharp';

// ============================================================================
// Cover Normalization Constants
// ============================================================================

/** Maximum cover width in pixels (ISD §7.G cover.ts). */
export const COVER_MAX_WIDTH = 800;

/** JPEG quality for normalized covers (ISD §7.G cover.ts). */
export const COVER_JPEG_QUALITY = 80;

// ============================================================================
// Cover Normalization
// ============================================================================

/**
 * Normalizes a cover image to JPEG format with sane dimensions.
 *
 * Processing (ISD §7.G cover.ts):
 * 1. Auto-rotate based on EXIF orientation
 * 2. Resize to max width 800px (without enlargement)
 * 3. Transcode to JPEG at quality 80
 *
 * Security (ISD §7.Z): Re-encoding through sharp strips potentially malicious
 * embedded payloads and normalizes the format to JPEG.
 *
 * @param bytes - Raw image bytes (any format: PNG, GIF, WebP, JPEG, etc.)
 * @returns Normalized JPEG bytes with contentType: 'image/jpeg'
 * @throws If the image cannot be decoded (caller should drop cover gracefully)
 */
export async function normalizeCoverToJpeg(
  bytes: Uint8Array,
): Promise<{ bytes: Uint8Array; contentType: 'image/jpeg' }> {
  const buffer = await sharp(bytes)
    .rotate() // Auto-rotate based on EXIF orientation
    .resize({
      width: COVER_MAX_WIDTH,
      withoutEnlargement: true, // Don't upscale small covers
    })
    .jpeg({ quality: COVER_JPEG_QUALITY })
    .toBuffer();

  return {
    bytes: new Uint8Array(buffer),
    contentType: 'image/jpeg',
  };
}
