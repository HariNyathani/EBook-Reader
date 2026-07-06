'use client';

import { cn } from '@/lib/utils/cn';
import { motion, HTMLMotionProps } from 'framer-motion';

type ButtonVariant = 'primary' | 'ghost' | 'glass';

interface ButtonProps extends Omit<HTMLMotionProps<"button">, "className"> {
  variant?: ButtonVariant;
  className?: string;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-foreground text-background hover:opacity-90 shadow-glass focus-visible:outline-offset-2 focus-visible:outline-foreground',
  ghost: 'bg-transparent hover:bg-foreground/5 text-foreground',
  glass: 'glass-panel hover:bg-white/80 text-foreground font-semibold',
};

/**
 * Premium, fluid button using Framer Motion.
 */
export function Button({ variant = 'primary', className, children, ...props }: ButtonProps) {
  return (
    <motion.button
      whileTap={{ scale: 0.95 }}
      whileHover={{ scale: 1.02 }}
      {...props}
      className={cn(
        'inline-flex cursor-pointer items-center justify-center rounded-xl px-4 py-2 text-sm font-medium',
        'transition-colors duration-150',
        'focus-visible:outline focus-visible:outline-2',
        'disabled:pointer-events-none disabled:opacity-50',
        variantClasses[variant],
        className,
      )}
    >
      {children}
    </motion.button>
  );
}
