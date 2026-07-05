/**
 * R2 module barrel.
 *
 * Exports R2 operation functions and typed errors.
 * Does NOT re-export the raw S3Client — callers must never construct their own client.
 *
 * Intended Route Handlers (to be created in later phases):
 * - GET /api/books/[id]/file  → getObjectStream(epubKey(id)) + epubDeliveryHeaders()
 * - GET /api/covers/[id]      → getSignedReadUrl(coverKey(id)) + 302 redirect or inline serve
 * - POST /api/admin/upload    → putObject({ key: epubKey(id), ... })
 * - DELETE /api/admin/books/[id] → deleteObject(epubKey(id)) + deleteObject(coverKey(id))
 */
export {
  putObject,
  getObjectStream,
  deleteObject,
  getSignedReadUrl,
  _setR2ClientOverride,
} from './operations';
export type { R2PutParams, R2GetResult } from './operations';
export { R2Error, R2NotFoundError, R2AccessError, R2UnknownError, mapSdkError } from './errors';
