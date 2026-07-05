/**
 * Admin feature constants.
 */

/** Page size for admin user management table. */
export const ADMIN_USERS_PAGE_SIZE = 25;

/** User filter options for admin user list. */
export const USER_FILTERS = ['all', 'pending', 'approved', 'admin'] as const;

export type UserFilter = (typeof USER_FILTERS)[number];
