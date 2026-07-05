'use client';

/**
 * UI store — global UI state (sidebar, toasts, reader chrome/panels).
 *
 * Phase 11 (ISD §11.H): Additively extended with reader UI flags:
 *   - chromeVisible: boolean — whether the auto-hiding reader chrome is shown
 *   - activePanel: 'none' | 'toc' | 'search' | 'typography' | 'theme' — current panel
 *   - Setters ensure only one panel is open at a time.
 *
 * The PUBLIC SHAPE of this store is FROZEN — later phases add behavior without renaming.
 */

import { create } from 'zustand';

type ToastType = 'info' | 'success' | 'error' | 'warning';

interface Toast {
  message: string;
  type: ToastType;
}

/**
 * Active reader panel identifier.
 * ISD §11.L: Only one panel may be open at a time (mutually exclusive).
 */
export type ActivePanel = 'none' | 'toc' | 'search' | 'typography' | 'theme';

interface UiState {
  isSidebarOpen: boolean;
  toast: Toast | null;

  // Phase 11 additions (ISD §11.H): Reader UI state.

  /** Whether the reader chrome (toolbar + progress bar) is currently visible. */
  chromeVisible: boolean;
  /** Which reader panel is currently open (mutually exclusive). */
  activePanel: ActivePanel;
}

interface UiActions {
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  showToast: (message: string, type?: ToastType) => void;
  dismissToast: () => void;

  // Phase 11 additions: Reader UI setters.

  /** Set chrome visibility directly. */
  setChromeVisible: (visible: boolean) => void;
  /** Toggle chrome visibility. */
  toggleChrome: () => void;
  /**
   * Open a panel (and close any other panel, ensuring mutual exclusion).
   * Use 'none' to close all panels.
   */
  setActivePanel: (panel: ActivePanel) => void;
  /**
   * Toggle a panel: open it if closed, close it if already open.
   * If a different panel is open, switches to this one.
   */
  togglePanel: (panel: ActivePanel) => void;
  /** Close any open panel. */
  closePanel: () => void;
}

export const useUiStore = create<UiState & UiActions>()((set) => ({
  isSidebarOpen: false,
  toast: null,

  // Phase 11 defaults
  chromeVisible: true,
  activePanel: 'none',

  setSidebarOpen: (isSidebarOpen) => set({ isSidebarOpen }),
  toggleSidebar: () => set((s) => ({ isSidebarOpen: !s.isSidebarOpen })),
  showToast: (message, type = 'info') => set({ toast: { message, type } }),
  dismissToast: () => set({ toast: null }),

  // Phase 11 reader UI setters
  setChromeVisible: (chromeVisible) => set({ chromeVisible }),
  toggleChrome: () => set((s) => ({ chromeVisible: !s.chromeVisible })),
  setActivePanel: (activePanel) => set({ activePanel }),
  togglePanel: (panel) =>
    set((s) => ({
      activePanel: s.activePanel === panel ? 'none' : panel,
    })),
  closePanel: () => set({ activePanel: 'none' }),
}));
