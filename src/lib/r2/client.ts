import 'server-only';

import { S3Client } from '@aws-sdk/client-s3';
import { getServerEnv } from '@/lib/env';

let _client: S3Client | null = null;

/**
 * Returns a memoized S3Client configured for Cloudflare R2.
 *
 * Memoized to avoid re-instantiation on every request in serverless environments.
 * Uses `region: 'auto'` as required by Cloudflare R2's S3-compatible API.
 *
 * @throws if R2 environment variables are missing (via getServerEnv())
 */
export function getR2Client(): S3Client {
  if (_client) return _client;

  const env = getServerEnv();

  _client = new S3Client({
    region: 'auto',
    endpoint: env.R2_ENDPOINT,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  });

  return _client;
}

/** Reset memoized client (for testing with dependency injection). */
export function _resetR2Client(): void {
  _client = null;
}
