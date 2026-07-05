/**
 * Unit tests for src/lib/r2/operations.ts
 *
 * Uses a mock S3Client injected via _setR2ClientOverride() to avoid needing
 * live R2 credentials. Proves:
 * 1. Correct command construction (Bucket + Key).
 * 2. Stream conversion shape.
 * 3. Error mapping (NoSuchKey → R2NotFoundError, AccessDenied → R2AccessError).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { S3Client } from '@aws-sdk/client-s3';

// ---------------------------------------------------------------------------
// Mock server-only and env before importing the module under test
// ---------------------------------------------------------------------------
vi.mock('server-only', () => ({}));

vi.mock('@/lib/env', () => ({
  getServerEnv: () => ({
    R2_ACCOUNT_ID: 'test-account',
    R2_ACCESS_KEY_ID: 'test-key-id',
    R2_SECRET_ACCESS_KEY: 'test-secret',
    R2_BUCKET: 'epub-reader-assets',
    R2_ENDPOINT: 'https://test-account.r2.cloudflarestorage.com',
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role',
  }),
}));

// ---------------------------------------------------------------------------
// Import after mocks are registered
// ---------------------------------------------------------------------------
import {
  putObject,
  getObjectStream,
  deleteObject,
  getSignedReadUrl,
  _setR2ClientOverride,
  R2NotFoundError,
  R2AccessError,
  R2UnknownError,
} from '@/lib/r2';

// ---------------------------------------------------------------------------
// Shared mock factory
// ---------------------------------------------------------------------------
function makeMockClient(sendImpl: (command: unknown) => unknown): S3Client {
  return { send: vi.fn().mockImplementation(sendImpl) } as unknown as S3Client;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  _setR2ClientOverride(null);
});

// ---------------------------------------------------------------------------
// putObject
// ---------------------------------------------------------------------------
describe('putObject', () => {
  it('sends PutObjectCommand with correct Bucket and Key', async () => {
    const sendMock = vi.fn().mockResolvedValue({});
    _setR2ClientOverride(makeMockClient(sendMock));

    await putObject({
      key: 'epubs/abc.epub',
      body: Buffer.from('data'),
      contentType: 'application/epub+zip',
    });

    expect(sendMock).toHaveBeenCalledOnce();
    const command = sendMock.mock.calls[0]?.[0] as { input: { Bucket: string; Key: string } };
    expect(command.input.Bucket).toBe('epub-reader-assets');
    expect(command.input.Key).toBe('epubs/abc.epub');
  });

  it('maps SDK error to R2UnknownError on failure', async () => {
    _setR2ClientOverride(
      makeMockClient(() => {
        throw { name: 'UnknownError', $metadata: { httpStatusCode: 500 } };
      }),
    );

    await expect(
      putObject({
        key: 'epubs/abc.epub',
        body: Buffer.from(''),
        contentType: 'application/epub+zip',
      }),
    ).rejects.toBeInstanceOf(R2UnknownError);
  });
});

// ---------------------------------------------------------------------------
// getObjectStream
// ---------------------------------------------------------------------------
describe('getObjectStream', () => {
  it('returns a ReadableStream, contentType, and contentLength', async () => {
    async function* fakeBody() {
      yield new Uint8Array([1, 2, 3]);
    }

    _setR2ClientOverride(
      makeMockClient(() => ({
        Body: fakeBody(),
        ContentType: 'application/epub+zip',
        ContentLength: 3,
      })),
    );

    const result = await getObjectStream('epubs/abc.epub');

    expect(result.body).toBeInstanceOf(ReadableStream);
    expect(result.contentType).toBe('application/epub+zip');
    expect(result.contentLength).toBe(3);
  });

  it('returns empty ReadableStream when Body is undefined', async () => {
    _setR2ClientOverride(
      makeMockClient(() => ({
        Body: undefined,
        ContentType: 'application/epub+zip',
        ContentLength: 0,
      })),
    );

    const result = await getObjectStream('epubs/abc.epub');
    expect(result.body).toBeInstanceOf(ReadableStream);
    expect(result.contentLength).toBe(0);
  });

  it('maps NoSuchKey to R2NotFoundError', async () => {
    _setR2ClientOverride(
      makeMockClient(() => {
        throw { name: 'NoSuchKey', $metadata: { httpStatusCode: 404 } };
      }),
    );

    await expect(getObjectStream('epubs/missing.epub')).rejects.toBeInstanceOf(R2NotFoundError);
  });

  it('maps AccessDenied to R2AccessError', async () => {
    _setR2ClientOverride(
      makeMockClient(() => {
        throw { name: 'AccessDenied', $metadata: { httpStatusCode: 403 } };
      }),
    );

    await expect(getObjectStream('epubs/abc.epub')).rejects.toBeInstanceOf(R2AccessError);
  });

  it('uses key in error message for NotFound', async () => {
    _setR2ClientOverride(
      makeMockClient(() => {
        throw { name: 'NoSuchKey', $metadata: { httpStatusCode: 404 } };
      }),
    );

    let err: R2NotFoundError | null = null;
    try {
      await getObjectStream('epubs/specific.epub');
    } catch (e: unknown) {
      err = e as R2NotFoundError;
    }
    expect(err?.key).toBe('epubs/specific.epub');
  });
});

// ---------------------------------------------------------------------------
// deleteObject
// ---------------------------------------------------------------------------
describe('deleteObject', () => {
  it('sends DeleteObjectCommand with correct Bucket and Key', async () => {
    const sendMock = vi.fn().mockResolvedValue({});
    _setR2ClientOverride(makeMockClient(sendMock));

    await deleteObject('covers/abc.jpg');

    const command = sendMock.mock.calls[0]?.[0] as { input: { Bucket: string; Key: string } };
    expect(command.input.Bucket).toBe('epub-reader-assets');
    expect(command.input.Key).toBe('covers/abc.jpg');
  });
});

// ---------------------------------------------------------------------------
// getSignedReadUrl
// ---------------------------------------------------------------------------
describe('getSignedReadUrl', () => {
  it('returns a string URL', async () => {
    // Mock getSignedUrl from s3-request-presigner
    vi.mock('@aws-sdk/s3-request-presigner', () => ({
      getSignedUrl: vi
        .fn()
        .mockResolvedValue('https://signed.example.com/covers/abc.jpg?token=abc'),
    }));

    _setR2ClientOverride(makeMockClient(() => ({})));

    const { getSignedReadUrl: freshGetSignedReadUrl } = await import('@/lib/r2/operations');
    const url = await freshGetSignedReadUrl('covers/abc.jpg', 300);

    expect(typeof url).toBe('string');
    expect(url).toContain('https://');
  });
});
