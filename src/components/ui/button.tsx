'use client';

import { cn } from '@/lib/utils/cn';
import type { ButtonHTMLAttributes } from 'react';

type ButtonVariant = 'primary' | 'ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-foreground text-background hover:opacity-90 focus-visible:outline-offset-2 focus-visible:outline-foreground',
  ghost: 'bg-transparent hover:bg-foreground/10 text-foreground',
};

/**
 * Minimal typed button with variant prop.
 * No business logic — purely presentational.
 * Phase 5+ may extend with loading/disabled states.
 */
export function Button({ variant = 'primary', className, children, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={cn(
        'inline-flex cursor-pointer items-center justify-center rounded-md px-4 py-2 text-sm font-medium',
        'transition-colors duration-150',
        'focus-visible:outline focus-visible:outline-2',
        'disabled:pointer-events-none disabled:opacity-50',
        variantClasses[variant],
        className,
      )}
    >
      {children}
    </button>
  );
}
