/**
 * Barrel for shared Zod validation primitives.
 * Domain-object schemas (upload payloads, form inputs) are added in the phases that own those flows.
 */
export { uuidSchema, emailSchema, nonEmptyString, parseOrThrow, parseResult } from './primitives';
