import 'server-only';

import StreamZip from 'node-stream-zip';
import { writeFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import type { MetadataExtractor, EpubMetadata, ExtractInput } from './types';
import { assertValidEpub } from './validate';
import { parseContainer, parseOpf } from './opf';
import { normalizeCoverToJpeg } from './cover';
import { EpubInvalidError } from './errors';
import { getMaxUploadBytes } from '@/features/admin/upload/constants';

/**
 * Derives a human-readable title from a filename.
 * Strips extension, replaces hyphens/underscores with spaces, trims.
 */
function deriveTitleFromFilename(filename: string): string {
  const withoutExt = filename.replace(/\.[^.]+$/, '');
  return withoutExt.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Untitled';
}

/**
 * Real EPUB metadata extractor using node-stream-zip + fast-xml-parser + sharp.
 *
 * Implementation (ISD §7.G stream-zip-extractor.ts):
 * 1. Materialize input to a Buffer (bounded by MAX_UPLOAD_BYTES)
 * 2. Open with node-stream-zip (async API)
 * 3. Validate EPUB structure (mimetype, container.xml, no encryption.xml)
 * 4. Read container.xml → parseContainer → get OPF path
 * 5. Read OPF → parseOpf → extract title, author, cover href
 * 6. If cover href found, read cover entry → normalizeCoverToJpeg
 * 7. Apply form overrides (formTitle/formAuthor take precedence)
 * 8. Always close the zip (finally block)
 *
 * Error handling (ISD §7.X):
 * - EpubInvalidError / EpubEncryptedError → throw (upload action maps to INVALID_FILE)
 * - EpubParseError → throw (upload action maps to INVALID_FILE)
 * - Cover extraction/normalization failure → drop cover gracefully (book still created)
 * - Missing title/author → fallback to filename/null
 *
 * Security (ISD §7.Z):
 * - Validates EPUB structure before trusting content
 * - Rejects DRM/encrypted archives
 * - XXE-safe XML parsing (fast-xml-parser configured with allowDoctype: false)
 * - Cover re-encoded through sharp (strips malicious payloads)
 * - Zip entry paths validated (no path traversal)
 *
 * Performance (ISD §7.Y):
 * - Does NOT extract the whole archive — reads only container.xml, OPF, and cover entry
 * - Bounded by MAX_UPLOAD_BYTES
 * - Single zip handle per extraction (closed in finally)
 */
export const streamZipExtractor: MetadataExtractor = {
  async extract(input: ExtractInput): Promise<EpubMetadata> {
    const maxBytes = getMaxUploadBytes();

    // Step 1: Materialize input to a Buffer and write to a temp file
    // node-stream-zip requires a file path, so we write to a temp file first
    let buffer: Buffer;
    if (input.fileBytes instanceof Uint8Array) {
      if (input.fileBytes.byteLength > maxBytes) {
        throw new EpubInvalidError(
          `EPUB exceeds maximum size of ${Math.round(maxBytes / 1_048_576)} MB`,
        );
      }
      buffer = Buffer.from(input.fileBytes);
    } else {
      // ReadableStream — collect chunks into a buffer (bounded)
      const reader = input.fileBytes.getReader();
      const chunks: Uint8Array[] = [];
      let totalBytes = 0;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          totalBytes += value.byteLength;
          if (totalBytes > maxBytes) {
            throw new EpubInvalidError(
              `EPUB exceeds maximum size of ${Math.round(maxBytes / 1_048_576)} MB`,
            );
          }

          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }

      // Concatenate chunks
      buffer = Buffer.concat(chunks, totalBytes);
    }

    // Write to temp file for node-stream-zip
    const tempPath = join(tmpdir(), `epub-${Date.now()}-${Math.random().toString(36)}.epub`);
    await writeFile(tempPath, buffer);

    // Step 2: Open with node-stream-zip
    const zip = new StreamZip.async({ file: tempPath });

    try {
      // Step 3: Validate EPUB structure
      await assertValidEpub(zip);

      // Step 4: Read container.xml → parseContainer
      const containerXml = await zip.entryData('META-INF/container.xml');
      const containerStr = containerXml.toString('utf-8');
      const { opfPath } = parseContainer(containerStr);

      // Step 5: Read OPF → parseOpf
      const opfXml = await zip.entryData(opfPath);
      const opfStr = opfXml.toString('utf-8');
      const { title: parsedTitle, author: parsedAuthor, coverHref } = parseOpf(opfStr, opfPath);

      // Step 6: Extract cover if href found
      let cover: { bytes: Uint8Array; contentType: string } | undefined;
      if (coverHref) {
        try {
          const coverBytes = await zip.entryData(coverHref);
          const normalized = await normalizeCoverToJpeg(new Uint8Array(coverBytes));
          cover = normalized;
        } catch (err) {
          // Cover extraction/normalization failed — drop cover gracefully (ISD §7.X)
          console.warn(
            `[streamZipExtractor] Cover extraction failed for ${coverHref}:`,
            err instanceof Error ? err.message : err,
          );
          cover = undefined;
        }
      }

      // Step 7: Apply form overrides
      const title = input.formTitle?.trim() || parsedTitle || deriveTitleFromFilename(input.filename);
      const author = input.formAuthor?.trim() || parsedAuthor || null;

      // Step 8: Return metadata (zip closed in finally)
      return {
        title,
        author,
        ...(cover ? { cover } : {}),
      };
    } finally {
      // Always close the zip and clean up temp file to avoid file-descriptor leaks
      await zip.close();
      try {
        await unlink(tempPath);
      } catch (cleanupErr) {
        // Best-effort cleanup — log but don't throw
        console.warn('[streamZipExtractor] Failed to clean up temp file:', cleanupErr);
      }
    }
  },
};
