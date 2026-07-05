# Feature: Admin

## Responsibility Boundary

This feature owns the admin-panel UI and admin-specific data flows:

- User approval queue management
- Book upload pipeline UI
- Admin dashboard statistics (future)

## Populated In

- **Phase 4**: Approval list, approve/reject actions (auth guard wired)
- **Phase 6**: Upload UI — drag-drop EPUB, metadata extraction, R2 upload, DB record creation
- **Phase 7+**: Admin analytics, book deletion

## Directory Structure (to be created in Phase 4/6)

```
features/admin/
├── components/
│   ├── approval-list.tsx   # Server Component — unapproved users table
│   └── upload-dropzone.tsx # 'use client' — drag-drop EPUB uploader
├── actions/
│   ├── approve-user.ts      # Server Action (admin service-role)
│   └── upload-book.ts       # Server Action: multipart → R2 → DB
└── queries/
    └── get-pending-users.ts # Admin Supabase query
```

## Cross-Feature Dependencies

- `@/lib/supabase/admin` — `createAdminClient` for RLS-bypassing mutations
- `@/lib/r2` — `putObject`, `deleteObject` for upload pipeline
- `@/lib/constants` — `epubKey`, `coverKey` builders
- `@/lib/result` — `ActionResult`
