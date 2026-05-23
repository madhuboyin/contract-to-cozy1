import { cn } from '@/lib/utils';
import React from 'react';

interface ScrollFadeXProps {
  children: React.ReactNode;
  className?: string;
  /** Tailwind `from-*` class matching the parent background, e.g. "from-white", "from-gray-50" */
  fromColor?: string;
  /** Hide the fade on md+ screens (default true — desktop width makes overflow obvious) */
  desktopHide?: boolean;
}

/**
 * Wraps a horizontal-scroll container with a right-edge gradient fade that
 * signals to mobile users that content scrolls further. Zero JS — pure CSS.
 */
export function ScrollFadeX({
  children,
  className,
  fromColor = 'from-white',
  desktopHide = true,
}: ScrollFadeXProps) {
  return (
    <div className={cn('relative', className)}>
      <div
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l to-transparent',
          fromColor,
          desktopHide && 'md:hidden',
        )}
      />
      {children}
    </div>
  );
}
