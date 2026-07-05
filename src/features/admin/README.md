# Feature: Admin

## Responsibility Boundary

This feature owns the admin-panel UI and admin-specific data flows:

- Admin overview dashboard with key statistics
- User management (list, search, filter, approve/revoke, grant/revoke admin)
- Book upload pipeline UI
- Book listing and deletion

## Populated In

- **Phase 4**: Initial approval list, approve/reject actions (auth guard wired)
- **Phase 5**: Full user management surface, admin overview dashboard, self-protection guards
- **Phase 6**: Upload UI — drag-drop EPUB, metadata extraction, R2 upload, DB record creation; book listing and deletion

## Directory Structure

```
features/admin/
├── actions.ts              # setUserApprovalAction, setUserAdminAction (Server Actions)
├── schemas.ts              # approvalSchema, adminToggleSchema (Zod)
├── queries.ts              # getAdminStats, listUsers (server-only reads)
├── constants.ts            # ADMIN_USERS_PAGE_SIZE, USER_FILTERS
├── upload/
│   ├── actions.ts          # uploadBookAction (Phase 6)
│   ├── schemas.ts          # uploadMetaSchema, deleteBookSchema (Phase 6)
│   ├── constants.ts        # MAX_UPLOAD_BYTES, ACCEPTED_MIME (Phase 6)
│   └── components/
│       ├── upload-zone.tsx     # 'use client' drag-drop (Phase 6)
│       └── upload-form.tsx     # 'use client' metadata form (Phase 6)
├── books/
│   ├── actions.ts          # deleteBookAction (Phase 6)
│   ├── queries.ts          # listBooks (Phase 6)
│   └── components/
│       └── admin-books-table.tsx  # Phase 6
└── components/
    ├── users-table.tsx         # Server Component — all users table
    ├── user-row-actions.tsx    # 'use client' — approve/revoke/admin buttons
    └── stat-card.tsx           # Presentational count card
```

## Cross-Feature Dependencies

- `@/lib/supabase/admin` — `createAdminClient` for RLS-bypassing mutations
- `@/lib/r2` — `putObject`, `deleteObject` for upload pipeline (Phase 6)
- `@/lib/constants` — `epubKey`, `coverKey` builders (Phase 6)
- `@/lib/result` — `ActionResult`
- `@/features/auth/session` — `requireAdmin`, `getClaims`

## Security

- Three-layer authorization: middleware → layout guard → Server Action guard
- Self-protection guards: admin cannot revoke own admin/approval
- Last-admin guard: system cannot drop to zero admins
- Service-role client used ONLY inside admin server code, never imported client-side
