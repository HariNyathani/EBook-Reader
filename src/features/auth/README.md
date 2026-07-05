# Feature: Auth

## Responsibility Boundary

This feature owns all authentication UI and Server Actions:

- Sign-in / sign-up forms
- Password reset (future)
- Sign-out action
- Pending-approval status display

## Populated In

- **Phase 4**: Login form, register form, Server Actions calling `@supabase/ssr`
- **Phase 4**: Sign-out Server Action, pending-approval page logic
- **Phase 4**: Admin user-approval Server Actions (using `createAdminClient`)

## Directory Structure (to be created in Phase 4)

```
features/auth/
├── components/
│   ├── login-form.tsx      # 'use client' — controlled form
│   └── register-form.tsx   # 'use client'
└── actions/
    ├── sign-in.ts           # Server Action
    ├── sign-up.ts           # Server Action
    ├── sign-out.ts          # Server Action
    └── approve-user.ts      # Server Action (admin only)
```

## Cross-Feature Dependencies

- `@/lib/supabase/server` — authenticated server actions
- `@/lib/supabase/admin` — `createAdminClient` for approval mutations
- `@/lib/routes` — `ROUTES` for post-auth redirects
- `@/lib/result` — `ActionResult` return type
