import 'server-only';

/**
 * EPUB processing error hierarchy.
 *
 * These errors are thrown by the metadata extractor and caught by the upload pipeline.
 * They are translated to user-friendly ActionResult failures in uploadBookAction.
 */

/**
 * Base class for all EPUB processing errors.
 */
export class EpubError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'EpubError';
  }
}

/**
 * The file is not a valid EPUB (missing mimetype, container.xml, or OPF).
 * Maps to INVALID_FILE in uploadBookAction.
 */
export class EpubInvalidError extends EpubError {
  constructor(message = 'Invalid EPUB file structure', cause?: unknown) {
    super(message, cause);
    this.name = 'EpubInvalidError';
  }
}

/**
 * The EPUB is encrypted or DRM-protected (META-INF/encryption.xml present).
 * Maps to INVALID_FILE in uploadBookAction.
 */
export class EpubEncryptedError extends EpubError {
  constructor(
    message = 'EPUB is encrypted or DRM-protected and cannot be processed',
    cause?: unknown,
  ) {
    super(message, cause);
    this.name = 'EpubEncryptedError';
  }
}

/**
 * OPF or container XML parsing failed (malformed XML, missing required fields).
 * Maps to INVALID_FILE in uploadBookAction.
 */
export class EpubParseError extends EpubError {
  constructor(message = 'Failed to parse EPUB metadata', cause?: unknown) {
    super(message, cause);
    this.name = 'EpubParseError';
  }
}
