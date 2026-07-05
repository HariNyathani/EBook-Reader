# Feature: Library

## Responsibility Boundary

This feature owns the user's book library browsing experience:

- Book grid display (using `BookCard` from `@/components`)
- Library membership management (add/remove books from personal shelf)
- Book search and filtering (Phase 7+ scope)

## Populated In

- **Phase 5**: Library Server Component, `getLibrary` data fetching, `BookCard` wiring
- **Phase 5**: `user_libraries` upsert/delete Server Actions
- **Phase 7+**: Search, pagination, sorting

## Directory Structure (to be created in Phase 5)

```
features/library/
├── components/
│   └── book-grid.tsx      # Server Component — renders BookCard list
├── actions/
│   └── library.ts          # addToLibrary / removeFromLibrary Server Actions
└── queries/
    └── get-library.ts      # Supabase server-side query helper
```

## Cross-Feature Dependencies

- `@/components` — `BookCard`
- `@/lib/supabase/server` — authenticated queries
- `@/types` — `Book`, `UserLibraryEntry`
