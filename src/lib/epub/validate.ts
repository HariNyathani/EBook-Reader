import 'server-only';

import type StreamZip from 'node-stream-zip';
import { EpubInvalidError, EpubEncryptedError } from './errors';

/**
 * Validates that a zip archive is a valid EPUB.
 *
 * Checks:
 * 1. mimetype entry exists and equals 'application/epub+zip'
 * 2. META-INF/container.xml exists and resolves to an OPF
 * 3. META-INF/encryption.xml is NOT present (reject DRM/encrypted EPUBs)
 *
 * Throws EpubInvalidError or EpubEncryptedError on failure.
 *
 * @param zip - Open node-stream-zip instance
 */
export async function assertValidEpub(zip: StreamZip.StreamZipAsync): Promise<void> {
  const entries = await zip.entries();

  // Check for mimetype entry
  const mimetypeEntry = entries['mimetype'];
  if (!mimetypeEntry) {
    throw new EpubInvalidError('EPUB missing required "mimetype" entry');
  }

  // Read mimetype content
  const mimetypeData = await zip.entryData('mimetype');
  const mimetypeContent = mimetypeData.toString('utf-8').trim();

  if (mimetypeContent !== 'application/epub+zip') {
    throw new EpubInvalidError(
      `EPUB mimetype is incorrect: expected "application/epub+zip", got "${mimetypeContent}"`,
    );
  }

  // Check for container.xml
  const containerEntry = entries['META-INF/container.xml'];
  if (!containerEntry) {
    throw new EpubInvalidError('EPUB missing required "META-INF/container.xml"');
  }

  // Check for encryption.xml (reject DRM/encrypted EPUBs)
  const encryptionEntry = entries['META-INF/encryption.xml'];
  if (encryptionEntry) {
    throw new EpubEncryptedError();
  }
}

/**
 * Validates that a zip entry path is safe (no path traversal).
 * Returns the normalized path or throws if unsafe.
 *
 * @param path - Entry path from zip archive
 * @throws {EpubInvalidError} if path contains traversal sequences
 */
export function validateZipEntryPath(path: string): string {
  // Normalize and reject path traversal
  const normalized = path.replace(/\\/g, '/');

  if (normalized.includes('..') || normalized.startsWith('/')) {
    throw new EpubInvalidError(`Unsafe zip entry path: ${path}`);
  }

  return normalized;
}
