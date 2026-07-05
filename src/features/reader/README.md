# Feature: Reader

## Responsibility Boundary

This feature owns all UI and client logic for the EPUB reading experience:

- Foliate-js iframe integration and lifecycle management
- Reading position tracking (CFI)
- Reader controls (theme, font size, margins)
- Table of contents navigation

## Populated In

- **Phase 5**: `useFoliate` hook, Foliate iframe component, CFI store wiring
- **Phase 5**: Offline progress sync via `idb-keyval` + Service Worker
- **Phase 5+**: Annotation support (SAD §7 future scope)

## Directory Structure (to be created in Phase 5)

```
features/reader/
├── components/
│   ├── foliate-frame.tsx   # 'use client' — sandboxed iframe wrapper
│   └── reader-controls.tsx # theme/font controls
├── hooks/
│   └── use-foliate.ts      # Foliate event bridge hook
└── actions/
    └── progress.ts          # Server Action: upsert reading_progress
```

## Cross-Feature Dependencies

- `@/store` — `useReaderStore` for local reader state
- `@/lib/r2` — `getObjectStream` for EPUB delivery (via Route Handler)
- `@/lib/supabase/server` — reading progress persistence
