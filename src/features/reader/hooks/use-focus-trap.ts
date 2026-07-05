'use client';

/**
 * useFocusTrap — focus-trap utility for drawers/panels (ISD §11.BB).
 *
 * When a panel opens, focus must move into it; Tab/Shift+Tab cycle inside
 * it; Escape closes it. We hand-roll a small trap (no extra dependency)
 * that:
 *   - remembers the previously focused element
 *   - focuses the first focusable child on mount
 *   - listens for Tab and wraps around the boundaries
 *   - listens for Escape and invokes the supplied `onEscape` callback
 *   - restores focus to the previous element on unmount
 *
 * Usage:
 *   const ref = useRef<HTMLDivElement>(null);
 *   useFocusTrap(ref, { active: open, onEscape: () => setOpen(false) });
 */

import { useEffect, type RefObject } from 'react';

interface UseFocusTrapOptions {
  /** Whether the trap is currently active. */
  active: boolean;
  /** Called when Escape is pressed while the trap is active. */
  onEscape?: () => void;
  /**
   * If true, restore the previously focused element when the trap deactivates
   * or the component unmounts. Defaults to true.
   */
  restoreFocus?: boolean;
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  'object',
  'embed',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(', ');

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) =>
      !el.hasAttribute('aria-hidden') &&
      el.offsetParent !== null &&
      // Skip disabled controls
      !(el as HTMLButtonElement | HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement)
        .disabled,
  );
}

export function useFocusTrap<T extends HTMLElement>(
  ref: RefObject<T | null>,
  options: UseFocusTrapOptions,
): void {
  const { active, onEscape, restoreFocus = true } = options;

  useEffect(() => {
    if (!active) return;
    const container = ref.current;
    if (!container) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Move focus into the container. Defer one tick so the panel is
    // rendered before we attempt to focus inside it.
    const focusFirst = () => {
      const focusables = getFocusableElements(container);
      const first = focusables[0];
      if (first) {
        first.focus();
      } else {
        // No focusables — focus the container itself so Escape still works.
        container.setAttribute('tabindex', '-1');
        container.focus();
      }
    };
    const raf = requestAnimationFrame(focusFirst);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onEscape?.();
        return;
      }
      if (e.key !== 'Tab') return;

      const focusables = getFocusableElements(container);
      if (focusables.length === 0) {
        // No tabbables — keep focus on the container.
        e.preventDefault();
        return;
      }
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      const active = document.activeElement as HTMLElement | null;

      if (e.shiftKey) {
        if (active === first || !container.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last || !container.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', handleKeyDown);
      if (restoreFocus && previouslyFocused && typeof previouslyFocused.focus === 'function') {
        // Restore focus on cleanup, but only if the previously focused
        // element is still in the DOM and focusable.
        try {
          previouslyFocused.focus();
        } catch {
          // Ignore — element may have been removed.
        }
      }
    };
  }, [active, onEscape, restoreFocus, ref]);
}
