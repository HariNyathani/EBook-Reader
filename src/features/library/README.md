# Library Management & Dashboard Foundation

This module implements the approved user's reading dashboard and library management system.

## Overview

The library feature provides:

- **Catalog browsing** with search, sort, and pagination
- **Personal library** ("My Library") for users to save books
- **Reading progress display** (percentage from `reading_progress` table)
- **Book details page** with cover, metadata, and actions
- **Cached data layer** using Next.js `unstable_cache` with per-user isolation

## Architecture

### Data Layer

#### Queries (`queries.ts`)

All queries are wrapped in `unstable_cache` for performance:

- **`getCatalog(options)`** — Paginated, sorted, searchable catalog of all books
  - Shared cache (same for all approved users)
  - Tagged with `library` for invalidation on admin upload/delete
  - Supports search (ilike on title/author), sort (recent/title/author), pagination

- **`getBookById(id)`** — Single book lookup
  - Cached with `library` tag
  - Returns `null` if not found (page returns 404)

- **`getMyLibrary(userId)`** — User's saved books
  - Per-user cache (ISD §8.Z)
  - Includes userId in cache key to prevent cross-user leakage
  - Joins `user_libraries` with `books`

- **`getProgressMap(userId)`** — Reading progress for user
  - Per-user cache (ISD §8.Z)
  - Returns `Record<bookId, percentage>`
  - Merged with catalog/library views

#### Actions (`actions.ts`)

Server Actions for library management:

- **`addToLibraryAction({ bookId })`** — Add book to user's library
  - Requires `requireApproved()`
  - Derives `userId` from session claims (never from client)
  - Idempotent via unique constraint (user_id, book_id)
  - Revalidates per-user library tag

- **`removeFromLibraryAction({ bookId })`** — Remove book from user's library
  - Same security model as add
  - Idempotent (no-op if not in library)

Both actions use the request-scoped server client (RLS enforces ownership).

### Cache Strategy (ISD §8.L, §8.Z)

Cache tags:

- `library` — Shared catalog cache (invalidated by admin upload/delete)
- `library:{userId}` — Per-user library cache (ISD §8.Z)
- `progress:{userId}` — Per-user progress cache (ISD §8.Z)

**Critical**: Per-user caches **must** include `userId` in both cache key and tag to prevent cross-user data leakage.

Invalidation:

- Admin upload/delete calls `revalidateTag('library')` (Phase 6)
- Library add/remove calls `revalidateTag(userLibraryTag(userId))`
- Progress writes (reader phase) will call `revalidateTag(progressTag(userId))`

### View Models (`types/library.ts`)

- **`BookWithProgress`** — Book with progress percentage and library membership
- **`CatalogView`** — Paginated catalog response
- **`MyLibraryView`** — User's saved books

### Components

#### Server Components

- **`LibraryGrid`** — Responsive grid of book cards
  - Displays covers, metadata, progress badges
  - Action buttons (Read, Add/Remove)

- **`CatalogToolbar`** — Search and sort controls
  - URL-driven (updates searchParams)
  - No client state

#### Client Components

- **`BookCardActions`** — Add/remove library toggle
  - Uses `useActionState` for optimistic UI
  - Shows toast on success/error
  - Revalidates per-user cache

- **`ProgressBadge`** — Reading progress indicator
  - Shows 0-100% with color coding
  - "Not started" for 0%

- **`EmptyState`** — Reusable empty state component

### Pages

#### Dashboard (`/dashboard`)

Server Component that:

1. Calls `requireApproved()`
2. Fetches catalog, user library, and progress map in parallel
3. Composes `BookWithProgress` view models
4. Renders "My Library" section (if any books saved)
5. Renders "Browse Catalog" with toolbar and grid
6. Shows pagination controls

URL-driven search/sort/pagination (no client state).

#### Book Details (`/dashboard/books/[id]`)

Server Component that:

1. Calls `requireApproved()`
2. Fetches book, user library, and progress map
3. Shows large cover, metadata, progress
4. Displays "Read" CTA and add/remove button
5. Returns `notFound()` if book doesn't exist

### Routes

Added to `src/lib/routes.ts`:

- `BOOK_DETAILS: (bookId: string) => /dashboard/books/${bookId}`

### Loading States

- `dashboard/loading.tsx` — Grid skeleton
- `dashboard/books/[id]/loading.tsx` — Details skeleton

## Security (ISD §8.Z)

- **Approval Enforcement**: All routes call `requireApproved()`
- **User ID Derivation**: Actions derive `userId` from session claims (never from client)
- **RLS Enforcement**: Uses request-scoped server client (not service-role)
- **Cache Isolation**: Per-user caches include `userId` in key and tag
- **No R2 URLs**: Covers served via `/api/covers/[id]`, not direct R2 URLs

## Performance (ISD §8.Y)

- **Caching**: `unstable_cache` with appropriate tags
- **Parallel Fetching**: Dashboard fetches catalog, library, and progress in parallel
- **Pagination**: 24 books per page (configurable in `constants.ts`)
- **Cover Caching**: Covers cached with `private, max-age=3600` (Phase 6)

## Testing

Unit tests in `tests/unit/library.test.ts` cover:

- Schema validation (libraryMutationSchema, catalogParamsSchema)
- Cache tag helpers (per-user isolation)
- Constants and configuration

**Critical**: Cache isolation tests verify that different userIds produce different cache tags.

## Integration Points

- **Phase 6**: Consumes `/api/covers/[id]` for book covers
- **Phase 6**: `revalidateTag('library')` on admin upload/delete
- **Future Reader Phase**: Will link to `/reader/[bookId]` and write to `reading_progress`

## Future Work

- Reading progress writes (reader phase)
- CFI sync for precise reading positions
- Highlights/annotations (SAD §7 future)
- Recommendations (future)

## Edge Cases

- Empty catalog → "No books yet" empty state
- Empty library → "My Library" section hidden
- Book deleted by admin → Cover 404s, details page returns `notFound()`
- Progress row absent → Badge shows "Not started" (0%)
- Adding already-added book → Idempotent success (unique constraint)
- Removing book not in library → Idempotent success (no-op)
- Concurrent add/remove → Optimistic UI reconciles with action result
