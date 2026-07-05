/**
 * Single source of truth for all route path strings.
 *
 * Used by:
 * - Middleware (Phase 4) for guard logic
 * - <Link> components throughout the app
 * - Server-side redirects
 *
 * FROZEN CONTRACT: downstream phases must not rename these keys.
 */
export const ROUTES = Object.freeze({
  /** Auth routes (no auth guard) */
  LOGIN: '/login',
  REGISTER: '/register',
  PENDING_APPROVAL: '/pending-approval',

  /** App routes (require auth + approval) */
  DASHBOARD: '/dashboard',
  /**
   * Dynamic reader route — call as a function to get the path string.
   * Example: ROUTES.READER('abc-123') === '/reader/abc-123'
   */
  READER: (bookId: string) => `/reader/${bookId}`,

  /** Admin routes (require auth + admin claim) */
  ADMIN: '/admin',
  ADMIN_UPLOADS: '/admin/uploads',
  ADMIN_APPROVALS: '/admin/approvals',
} as const);
