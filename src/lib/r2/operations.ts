import 'server-only';

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getServerEnv } from '@/lib/env';
import { getR2Client } from './client';
import { mapSdkError } from './errors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface R2PutParams {
  /** R2 object key — never a full URL. */
  key: string;
  /** The object body to upload. */
  body: Buffer | Uint8Array | ReadableStream | Blob | string;
  contentType: string;
  /** Optional Cache-Control header stored with the object. */
  cacheControl?: string;
}

export interface R2GetResult {
  /** Web ReadableStream of the object body. Streams — never buffered entirely. */
  body: ReadableStream<Uint8Array>;
  contentType: string;
  contentLength: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns the R2 bucket name from validated env. */
function getBucket(): string {
  return getServerEnv().R2_BUCKET;
}

/**
 * Converts the AWS SDK readable stream to a Web API ReadableStream.
 * This is required for Next.js Route Handler `Response` bodies.
 * Never buffers the full object — memory-safe for large EPUBs (SAD §2 rationale).
 */
function sdkStreamToWebReadable(sdkBody: NonNullable<unknown>): ReadableStream<Uint8Array> {
  // The AWS SDK body implements the async iterable protocol
  const asyncIterable = sdkBody as AsyncIterable<Uint8Array>;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of asyncIterable) {
          controller.enqueue(chunk);
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
}

// Allow injecting a mock client for unit tests
let _clientOverride: S3Client | null = null;
export function _setR2ClientOverride(client: S3Client | null): void {
  _clientOverride = client;
}
function getClient(): S3Client {
  return _clientOverride ?? getR2Client();
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

/**
 * Uploads an object to R2.
 *
 * @param params - key, body, contentType, optional cacheControl
 * @throws {R2Error} on failure
 *
 * Intended consumers:
 * - Admin upload Server Action (EPUB + cover files)
 */
export async function putObject(params: R2PutParams): Promise<void> {
  const { key, body, contentType, cacheControl } = params;
  try {
    await getClient().send(
      new PutObjectCommand({
        Bucket: getBucket(),
        Key: key,
        // ISD-NOTE: AWS SDK Body accepts Buffer/Uint8Array/string/ReadableStream/Blob.
        // We cast to unknown first to satisfy strict TS without the impossible Parameters<> trick.
        Body: body as unknown as Uint8Array,
        ContentType: contentType,
        ...(cacheControl ? { CacheControl: cacheControl } : {}),
      }),
    );
  } catch (err) {
    throw mapSdkError(key, err);
  }
}

/**
 * Streams an object from R2 as a Web ReadableStream.
 * Never buffers the full object — safe for large EPUB files.
 *
 * @param key - R2 object key (never a URL)
 * @throws {R2NotFoundError} if the key does not exist
 * @throws {R2AccessError} if credentials are invalid
 * @throws {R2UnknownError} for other failures
 *
 * Intended consumer:
 * - GET /api/books/[id]/file Route Handler (secure EPUB delivery, SAD §2.1)
 */
export async function getObjectStream(key: string): Promise<R2GetResult> {
  try {
    const response = await getClient().send(
      new GetObjectCommand({ Bucket: getBucket(), Key: key }),
    );

    if (!response.Body) {
      // Empty object — return an empty stream. Handler decides how to respond.
      return {
        body: new ReadableStream({ start: (c) => c.close() }),
        contentType: response.ContentType ?? 'application/octet-stream',
        contentLength: 0,
      };
    }

    return {
      body: sdkStreamToWebReadable(response.Body),
      contentType: response.ContentType ?? 'application/epub+zip',
      contentLength: response.ContentLength ?? 0,
    };
  } catch (err) {
    throw mapSdkError(key, err);
  }
}

/**
 * Deletes an object from R2 by key.
 * Used by the upload rollback logic (SAD §6.1 step 8) to remove orphaned objects.
 *
 * @param key - R2 object key
 * @throws {R2Error} on failure
 */
export async function deleteObject(key: string): Promise<void> {
  try {
    await getClient().send(new DeleteObjectCommand({ Bucket: getBucket(), Key: key }));
  } catch (err) {
    throw mapSdkError(key, err);
  }
}

/**
 * Generates a short-lived signed URL for reading an R2 object.
 * Default TTL is 300 seconds (5 minutes) as specified in SAD §1.2.
 *
 * Used for cover image delivery. EPUBs are streamed directly (not via signed URL)
 * to enforce the no-cache policy (SAD §2.1).
 *
 * @param key - R2 object key
 * @param expiresInSeconds - TTL in seconds, max 300
 * @throws {R2Error} on failure
 *
 * Intended consumer:
 * - GET /api/covers/[id] Route Handler
 */
export async function getSignedReadUrl(key: string, expiresInSeconds = 300): Promise<string> {
  try {
    const command = new GetObjectCommand({ Bucket: getBucket(), Key: key });
    return await getSignedUrl(getClient(), command, { expiresIn: expiresInSeconds });
  } catch (err) {
    throw mapSdkError(key, err);
  }
}
