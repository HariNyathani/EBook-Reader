/**
 * R2 error hierarchy.
 *
 * Callers (Route Handlers, Server Actions) translate these to HTTP status codes
 * or ActionResult errors. The R2 layer itself always throws typed errors, never raw SDK errors.
 */

/** Base class for all R2 errors. */
export class R2Error extends Error {
  constructor(
    message: string,
    public readonly key: string,
    // ISD-NOTE: cause is declared separately to avoid TS4115 (override required for Error.cause)
    cause?: unknown,
  ) {
    super(message, { cause });
    this.name = 'R2Error';
  }
}

/** The requested object key does not exist in the bucket. Maps to HTTP 404. */
export class R2NotFoundError extends R2Error {
  constructor(key: string, cause?: unknown) {
    super(`R2 object not found: "${key}"`, key, cause);
    this.name = 'R2NotFoundError';
  }
}

/** Access was denied (wrong credentials, wrong bucket, or misconfigured policy). Maps to HTTP 403. */
export class R2AccessError extends R2Error {
  constructor(key: string, cause?: unknown) {
    super(`R2 access denied for key: "${key}"`, key, cause);
    this.name = 'R2AccessError';
  }
}

/** Unexpected R2/S3 error not covered by the above cases. Maps to HTTP 500. */
export class R2UnknownError extends R2Error {
  constructor(key: string, cause?: unknown) {
    super(`Unexpected R2 error for key: "${key}"`, key, cause);
    this.name = 'R2UnknownError';
  }
}

/**
 * Maps an AWS SDK error to a typed R2Error subclass.
 * Inspects the error `name` and `$metadata.httpStatusCode`.
 */
export function mapSdkError(key: string, error: unknown): R2Error {
  if (error instanceof R2Error) return error;

  const err = error as {
    name?: string;
    $metadata?: { httpStatusCode?: number };
    message?: string;
  };

  const status = err.$metadata?.httpStatusCode;
  const name = err.name ?? '';

  if (name === 'NoSuchKey' || status === 404) {
    return new R2NotFoundError(key, error);
  }
  if (name === 'AccessDenied' || name === 'InvalidAccessKeyId' || status === 403) {
    return new R2AccessError(key, error);
  }

  return new R2UnknownError(key, error);
}
