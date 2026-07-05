'use client';

/**
 * useInstallPrompt — capture the beforeinstallprompt event and
 * expose a one-click install() for the UI (ISD §13.G, §13.N).
 *
 * The PWA install prompt is fire-once per page-load: the browser
 * fires `beforeinstallprompt` only when the manifest + service worker
 * are valid. We capture it, defer the prompt until the user clicks
 * the "Install" button, and listen for `appinstalled` so the button
 * can hide itself once the app is installed.
 *
 * No UI is rendered — the consumer (InstallButton) reads
 * { canInstall, promptInstall, isInstalled } and decides what to do.
 */

import { useCallback, useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export interface InstallPromptState {
  canInstall: boolean;
  isInstalled: boolean;
  promptInstall: () => Promise<'accepted' | 'dismissed' | 'unavailable'>;
}

/**
 * Hook that captures `beforeinstallprompt` and exposes an install
 * action. Safe to call from any client component; event listeners
 * are installed exactly once.
 */
export function useInstallPrompt(): InstallPromptState {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleBeforeInstall = (e: Event) => {
      // Prevent the automatic browser prompt so we can show our own UI.
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    // Detect already-installed (iOS Safari has no appinstalled event).
    const isStandalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window.navigator as any).standalone === true;
    if (isStandalone) setIsInstalled(true);

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    if (!deferredPrompt) return 'unavailable';
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      // The browser will only let us use the prompt once. Clear it.
      setDeferredPrompt(null);
      return choice.outcome;
    } catch (err) {
      console.warn('[useInstallPrompt] prompt failed:', err);
      return 'unavailable';
    }
  }, [deferredPrompt]);

  return {
    canInstall: deferredPrompt !== null && !isInstalled,
    isInstalled,
    promptInstall,
  };
}
