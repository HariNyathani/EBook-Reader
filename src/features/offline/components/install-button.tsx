'use client';

/**
 * InstallButton — surfaces the PWA install prompt in the header.
 *
 * Renders nothing when:
 *   - the browser hasn't fired beforeinstallprompt (not eligible yet), or
 *   - the app is already installed (standalone display mode).
 *
 * Otherwise renders a small "Install" button that calls the deferred
 * prompt. On success (accepted) we fire a toast; the install state
 * update is handled by the useInstallPrompt hook.
 */

import { useInstallPrompt } from '../use-install-prompt';
import { useUiStore } from '@/store/ui-store';
import { cn } from '@/lib/utils/cn';

interface InstallButtonProps {
  className?: string;
}

export function InstallButton({ className }: InstallButtonProps) {
  const { canInstall, promptInstall, isInstalled } = useInstallPrompt();
  const showToast = useUiStore((s) => s.showToast);

  if (isInstalled || !canInstall) return null;

  const handleClick = async () => {
    const outcome = await promptInstall();
    if (outcome === 'accepted') {
      showToast('App installed — open it from your home screen.', 'success');
    } else if (outcome === 'dismissed') {
      showToast('Install dismissed. You can install later from your browser menu.', 'info');
    } else {
      showToast('Install not available in this browser.', 'warning');
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="Install app"
      className={cn(
        'rounded-md border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-700 transition-colors hover:bg-indigo-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500',
        className,
      )}
    >
      Install
    </button>
  );
}
