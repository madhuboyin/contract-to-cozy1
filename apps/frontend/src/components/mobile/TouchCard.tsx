// apps/frontend/src/components/mobile/TouchCard.tsx

'use client';

import { cn } from '@/lib/utils';
import { ReactNode, useEffect, useRef } from 'react';

interface TouchCardProps {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
  href?: string;
}

export function TouchCard({ 
  children, 
  onClick, 
  className, 
  disabled = false,
  href 
}: TouchCardProps) {
  const baseClasses = cn(
    "bg-white rounded-lg shadow-sm border border-gray-200",
    "transition-all duration-150",
    "min-h-[60px] p-4", // Minimum touch target size (48px + padding)
    className
  );

  const interactiveClasses = cn(
    "cursor-pointer",
    "active:scale-[0.98] active:shadow-md",
    "hover:shadow-md hover:border-gray-300",
    disabled && "opacity-50 cursor-not-allowed active:scale-100"
  );

  if (href) {
    return (
      <a
        href={href}
        className={cn(baseClasses, interactiveClasses)}
      >
        {children}
      </a>
    );
  }

  if (onClick) {
    return (
      <button
        onClick={disabled ? undefined : onClick}
        disabled={disabled}
        className={cn(baseClasses, interactiveClasses, "w-full text-left")}
      >
        {children}
      </button>
    );
  }

  return (
    <div className={baseClasses}>
      {children}
    </div>
  );
}

// Swipeable card for dismissible items
export function SwipeCard({
  children,
  onSwipeLeft,
  onSwipeRight,
  className
}: {
  children: ReactNode;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  className?: string;
}) {
  // Track active document listeners so we can remove them on unmount
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      cleanupRef.current?.();
    };
  }, []);

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    const startX = touch.clientX;

    const handleTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      const currentX = touch.clientX;
      const diff = currentX - startX;

      // Visual feedback during swipe
      const element = e.target as HTMLElement;
      element.style.transform = `translateX(${diff}px)`;
      element.style.opacity = String(1 - Math.abs(diff) / 300);
    };

    const handleTouchEnd = (e: TouchEvent) => {
      const touch = e.changedTouches[0];
      const endX = touch.clientX;
      const diff = endX - startX;

      const element = e.target as HTMLElement;
      element.style.transform = '';
      element.style.opacity = '1';

      // Trigger callbacks based on swipe direction
      if (diff < -100 && onSwipeLeft) {
        onSwipeLeft();
      } else if (diff > 100 && onSwipeRight) {
        onSwipeRight();
      }

      removeListeners();
    };

    const removeListeners = () => {
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
      cleanupRef.current = null;
    };

    // Remove any leftover listeners from a previous swipe
    cleanupRef.current?.();

    document.addEventListener('touchmove', handleTouchMove);
    document.addEventListener('touchend', handleTouchEnd);
    cleanupRef.current = removeListeners;
  };

  return (
    <div
      onTouchStart={handleTouchStart}
      className={cn(
        "transition-all duration-200",
        className
      )}
    >
      <TouchCard>
        {children}
      </TouchCard>
    </div>
  );
}