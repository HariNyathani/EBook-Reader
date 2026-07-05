# features/auth — Authentication & Authorization Surface

## Phase 4 — Complete

### Server Actions (`actions.ts`)

All return `ActionResult<T>` from `@/lib/result`. Never throw to the client.

| Action                                | Input           | Behavior                                                                                                                                     |
| ------------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `signUpAction(formData)`              | email, password | Registers via Supabase Auth; trigger creates unapproved profile. Redirects to /pending-approval on success.                                  |
| `signInAction(formData, redirectTo?)` | email, password | Signs in; sets session cookie via SSR client. Redirects to `redirectTo` (same-origin only) or /dashboard. Generic invalid-credentials error. |
| `signOutAction()`                     | —               | Signs out; redirects to /login.                                                                                                              |

### Session Helpers (`session.ts`) — `server-only`

The canonical server-side authorization utilities. **Every protected feature must use these.**

| Helper              | Returns                 | Use case                                                  |
| ------------------- | ----------------------- | --------------------------------------------------------- |
| `getSession()`      | `Session \| null`       | Raw session (prefer getClaims for auth logic)             |
| `getClaims()`       | `Claims \| null`        | Decoded top-level JWT claims (fail-closed if hook absent) |
| `requireApproved()` | `Claims` (or redirects) | Guard in `(app)/*` layouts and protected Server Actions   |
| `requireAdmin()`    | `Claims` (or redirects) | Guard in `admin/*` layouts and admin Server Actions       |

**`Claims` type:** `{ userId: string; isApproved: boolean; isAdmin: boolean }`

### Schemas (`schemas.ts`)

- `credentialsSchema` — email + password (min 8, max 72 chars)
- `registerSchema` — same as credentials for MVP

### Components (`components/`)

| Component       | Kind           | Purpose                                                |
| --------------- | -------------- | ------------------------------------------------------ |
| `LoginForm`     | `'use client'` | `useActionState` + `signInAction`, inline errors       |
| `RegisterForm`  | `'use client'` | `useActionState` + `signUpAction`, redirect to pending |
| `SignOutButton` | `'use client'` | Form wrapping `signOutAction`                          |

### Authorization Contract

Every protected Server Action in this project must begin with:

```ts
await requireApproved(); // or requireAdmin() for admin-only actions
```

This is established in `setUserApprovalAction` (see `features/admin/actions.ts`) and must be followed by all future feature phases.

### Security Notes

- Generic auth error messages prevent user enumeration.
- `redirectTo` is sanitized to same-origin paths only (prevents open redirect).
- Claims are baked into the JWT by the Phase 3 hook — no DB round-trip in middleware.
- Authorization at three layers: middleware (edge) → layout guard → action-level check.
