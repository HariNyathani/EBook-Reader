# Preferences Feature — Implementation Notes (Phase 12)

## Overview

The Preferences feature provides **durable, cross-device reader
preferences** (theme, font family, font size, line height, margin,
alignment) with **local-first** persistence (instant restoration on
reload) and **optional cloud sync** via a versioned `user_preferences`
(jsonb) table with LWW reconciliation.

## Architecture

```
React (reader-store + ui-store)        ← LIVE state
        ↓
  zustand/persist (localStorage)       ← INSTANT local restore (partialize)
        ↓
usePreferencesSync (debounced 1s)
        ↓
savePreferencesAction (Server Action)  ← LWW by updated_at
        ↓
  user_preferences table (jsonb)       ← versioned envelope
```

- **Schema** (`schema.ts`): Versioned `Preferences` envelope; the
  reader slice maps 1:1 to the durable fields in `reader-store`.
  Reserved namespaces (`highlights`, `annotations`, `dictionary`) are
  declared optional in the Zod schema but NOT implemented here — they
  are placeholders for SAD §7 future features.
- **Migration** (`migrate.ts`): Upgrades older shapes to the current
  schema. Never throws — invalid or corrupt blobs fall back to
  defaults field-by-field.
- **Queries** (`queries.ts`): Server-side `getPreferences` reads the
  own-row (RLS) and migrates on read.
- **Actions** (`actions.ts`): `savePreferencesAction` performs an LWW
  conditional upsert — same semantics as Phase 10 progress writes.
- **Sync** (`sync.ts`): Client-side `usePreferencesSync` subscribes to
  the durable preference slice, debounces changes, and pushes to
  cloud. On mount, it fetches cloud preferences and reconciles by
  recency.
- **Provider** (`components/preferences-provider.tsx`): Mounts the
  sync hook once in the (app) layout. Renders children unchanged.
- **Settings** (`components/settings-form.tsx` + `app/(app)/settings/page.tsx`):
  Editable view of preferences with "Reset to defaults" and account
  info / sign-out.

## Files

```
src/features/preferences/
├── schema.ts                          # Versioned Preferences shape + Zod
├── migrate.ts                         # Forward-compatible upgrades
├── queries.ts                         # getPreferences (server-only)
├── actions.ts                         # savePreferencesAction
├── get-preferences-action.ts          # Thin client-callable action
├── sync.ts                            # Client hydration + push
├── components/
│   ├── preferences-provider.tsx       # Provider for the (app) layout
│   └── settings-form.tsx              # Editable preferences surface
└── README.md                          # This file
```

## State Flow

1. **Local restore on page load**: zustand `persist` reads the
   `reader-preferences` localStorage entry (migrated to the current
   schema). The reader-store rehydrates with the user's last-known
   preferences instantly — no flash of default theme.

2. **Cloud reconciliation**: `usePreferencesSync` runs in the
   `(app)/layout`. On mount, it fetches `user_preferences` (via
   `getPreferencesAction`). If the cloud `updated_at` is newer than
   the local timestamp, the cloud values are applied (each setter
   triggers the engine `setStyles` pipeline so the reader updates
   immediately). If local is newer, nothing happens — the next
   change will push the local value.

3. **User makes a change**: A setter in `reader-store` (e.g.,
   `setTheme('dark')`) updates the store. Two things happen:
   - The change is persisted to localStorage immediately (zustand
     `persist` sync write).
   - The change is detected by the `usePreferencesSync` subscription
     and a debounced (1s) push to the cloud is scheduled.

4. **Settings page**: A standard React Server Component renders the
   page (gated by `requireApproved()`), passes the user-id from
   claims to the client `SettingsForm`, which uses the same
   `TypographyPanel` / `ThemeSwitcher` components as the in-reader
   popovers. Changes flow through the same path as in-reader
   adjustments.

## Security

- All writes derive `user_id` from `requireApproved()` (session
  claims). Client input is never trusted as the user-id.
- RLS policies on `user_preferences` enforce own-row + approval.
- The `preferences` jsonb is validated on every server read and write
  via the versioned Zod schema. Malformed or corrupt blobs fall
  back to defaults; they never crash the app.
- LWW conditional upsert prevents a stale offline write from
  overwriting a newer value from another device.
- The local `lastUpdated` timestamp is internal sync metadata, not a
  user-visible preference; it lives in a separate `localStorage` key.

## Future Work (SAD §7)

The `preferences` jsonb column reserves three optional namespaces:

- `highlights` — per-book highlight settings (color, opacity, etc.)
- `annotations` — annotation style / display options
- `dictionary` — in-book dictionary preferences

These can be added without a schema change: extend the Zod schema,
bump `PREFERENCES_VERSION`, and implement the `migrate` function for
the new version. The local zustand store and the
`usePreferencesSync` hook already operate on the durable reader slice
only; future slices can be added independently.
