import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Combines class names with clsx and merges Tailwind conflicts with tailwind-merge.
 * This is the canonical way to build dynamic class strings throughout the app.
 *
 * @example cn('px-4 py-2', condition && 'bg-blue-500', 'hover:bg-blue-600')
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
