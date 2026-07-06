'use client';

/**
 * useReaderControls — keyboard shortcut handler (ISD §11.B, §11.G).
 *
 * Maps a fixed set of keyboard shortcuts to engine commands and UI
 * toggles. The handler is a no-op when focus is inside an editable
 * element (input, textarea, contenteditable) so it doesn't steal keys
 * from the search box or typography controls.
 *
 * Shortcuts:
 *   ←/PageUp         → prev
 *   →/PageDown/Space/Enter → next
 *   Esc              → close panel / hide chrome
 *   /                → open search
 *   t                → cycle theme
 *   +/=              → increase font size
 *   -                → decrease font size
 *   c                → toggle chrome
 *   f                → toggle fullscreen
 */

import { useEffect } from 'react';
import { useReaderStore } from '@/store/reader-store';
import { useUiStore } from '@/store/ui-store';
import { FONT_SIZE_MAX, FONT_SIZE_MIN, FONT_SIZE_STEP, SHORTCUTS } from '../constants';

interface UseReaderControlsParams {
  /** Imperative engine controls. */
  next: () => void;
  prev: () => void;
  /** Toggle chrome (used by 'c'). */
  toggleChrome: () => void;
  /** Toggle native fullscreen (used by 'f'). */
  toggleFullscreen: () => void;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  // <div role="textbox"> and similar ARIA textbox roles should also be skipped
  if (target.getAttribute('role') === 'textbox') return true;
  return false;
}

function keyOf(e: KeyboardEvent): string {
  // Normalise: lowercase the key. Skip ctrl/alt/meta combos entirely
  // (we only bind single-key shortcuts).
  if (e.ctrlKey || e.metaKey || e.altKey) return '';
  return e.key.toLowerCase();
}

export function useReaderControls({
  next,
  prev,
  toggleChrome,
  toggleFullscreen,
}: UseReaderControlsParams): void {
  // Store setters/actions (stable across renders).
  const setFontSize = useReaderStore((s) => s.setFontSize);
  const fontSize = useReaderStore((s) => s.fontSize);
  const setTheme = useReaderStore((s) => s.setTheme);
  const theme = useReaderStore((s) => s.theme);

  const closePanel = useUiStore((s) => s.closePanel);
  const activePanel = useUiStore((s) => s.activePanel);
  const openPanel = useUiStore((s) => s.setActivePanel);
  const setChromeVisible = useUiStore((s) => s.setChromeVisible);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't fire while editing.
      if (isEditableTarget(e.target)) return;
      const key = keyOf(e);
      if (!key) return;

      // Escape — close panel if any, else hide chrome. Always preventDefault
      // so the browser doesn't trigger its own Escape behaviour (e.g.
      // exiting fullscreen unexpectedly).
      if ((SHORTCUTS.close.keys as readonly string[]).includes(key)) {
        if (activePanel !== 'none') {
          closePanel();
        } else {
          setChromeVisible(false);
        }
        e.preventDefault();
        return;
      }

      // Navigation.
      if ((SHORTCUTS.prev.keys as readonly string[]).includes(key)) {
        e.preventDefault();
        prev();
        // Reveal chrome on activity (handled by useChromeVisibility too,
        // but doing it here keeps navigation snappy).
        setChromeVisible(true);
        return;
      }
      if ((SHORTCUTS.next.keys as readonly string[]).includes(key)) {
        e.preventDefault();
        next();
        setChromeVisible(true);
        return;
      }

      // Open search.
      if ((SHORTCUTS.search.keys as readonly string[]).includes(key)) {
        e.preventDefault();
        openPanel('search');
        return;
      }

      // Cycle theme.
      if ((SHORTCUTS.cycleTheme.keys as readonly string[]).includes(key)) {
        e.preventDefault();
        const order: Array<'light' | 'sepia' | 'dark'> = ['light', 'sepia', 'dark'];
        const idx = order.indexOf(theme);
        const nextTheme = order[(idx + 1) % order.length]!;
        setTheme(nextTheme);
        return;
      }

      // Font size +/−
      if ((SHORTCUTS.increaseFont.keys as readonly string[]).includes(key)) {
        e.preventDefault();
        setFontSize(Math.min(FONT_SIZE_MAX, fontSize + FONT_SIZE_STEP));
        return;
      }
      if ((SHORTCUTS.decreaseFont.keys as readonly string[]).includes(key)) {
        e.preventDefault();
        setFontSize(Math.max(FONT_SIZE_MIN, fontSize - FONT_SIZE_STEP));
        return;
      }

      // Toggle chrome.
      if ((SHORTCUTS.toggleChrome.keys as readonly string[]).includes(key)) {
        e.preventDefault();
        toggleChrome();
        return;
      }

      // Toggle fullscreen.
      if ((SHORTCUTS.toggleFullscreen.keys as readonly string[]).includes(key)) {
        e.preventDefault();
        toggleFullscreen();
        return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [
    next,
    prev,
    toggleChrome,
    toggleFullscreen,
    closePanel,
    activePanel,
    openPanel,
    setChromeVisible,
    setFontSize,
    fontSize,
    setTheme,
    theme,
  ]);
}
