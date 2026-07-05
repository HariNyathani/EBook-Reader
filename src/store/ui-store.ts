'use client';

/**
 * UI store — global UI state (sidebar, toasts).
 * Minimal by design — feature-specific UI state lives in feature stores (future phases).
 */

import { create } from 'zustand';

type ToastType = 'info' | 'success' | 'error' | 'warning';

interface Toast {
  message: string;
  type: ToastType;
}

interface UiState {
  isSidebarOpen: boolean;
  toast: Toast | null;
}

interface UiActions {
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  showToast: (message: string, type?: ToastType) => void;
  dismissToast: () => void;
}

export const useUiStore = create<UiState & UiActions>()((set) => ({
  isSidebarOpen: false,
  toast: null,

  setSidebarOpen: (isSidebarOpen) => set({ isSidebarOpen }),
  toggleSidebar: () => set((s) => ({ isSidebarOpen: !s.isSidebarOpen })),
  showToast: (message, type = 'info') => set({ toast: { message, type } }),
  dismissToast: () => set({ toast: null }),
}));
