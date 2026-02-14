// apps/frontend/src/components/mobile/PullToRefresh.tsx

'use client';

import { ReactNode, useState, useRef, TouchEvent } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';

interface PullToRefreshProps {
  children: ReactNode;
  onRefresh: () => Promise<void>;
  threshold?: number;
  disabled?: boolean;
}

export function PullToRefresh({ 
  children, 
  onRefresh, 
  threshold = 80,
  disabled = false 
}: PullToRefreshProps) {
  const [isPulling, setIsPulling] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const startY = useRef(0);
  const currentY = useRef(0);

  const handleTouchStart = (e: TouchEvent) => {
    if (disabled || isRefreshing) return;
    
    // Only trigger if at the top of the page
    if (window.scrollY === 0) {
      startY.current = e.touches[0].clientY;
    }
  };

  const handleTouchMove = (e: TouchEvent) => {
    if (disabled || isRefreshing || window.scrollY > 0) return;

    currentY.current = e.touches[0].clientY;
    const distance = currentY.current - startY.current;

    if (distance > 0) {
      // Apply resistance - pull gets harder as you go further
      const resistance = 2.5;
      const adjustedDistance = Math.min(distance / resistance, threshold * 1.5);
      
      setPullDistance(adjustedDistance);
      setIsPulling(adjustedDistance >= threshold);
      
      // Prevent default scrolling when pulling down
      if (distance > 10) {
        e.preventDefault();
      }
    }
  };

  const handleTouchEnd = async () => {
    if (disabled || isRefreshing) return;

    if (isPulling && pullDistance >= threshold) {
      setIsRefreshing(true);
      
      try {
        await onRefresh();
      } catch (error) {
        console.error('Refresh failed:', error);
      } finally {
        setIsRefreshing(false);
      }
    }
    
    setPullDistance(0);
    setIsPulling(false);
  };

  const rotation = Math.min((pullDistance / threshold) * 360, 360);
  const opacity = Math.min(pullDistance / threshold, 1);

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="relative overflow-hidden"
    >
      {/* Pull indicator */}
      <div
        className="absolute top-0 left-0 right-0 flex items-center justify-center transition-all duration-200 pointer-events-none"
        style={{ 
          height: `${pullDistance}px`,
          opacity: opacity
        }}
      >
        <div className="flex flex-col items-center">
          {isRefreshing ? (
            <Loader2 className="h-6 w-6 text-blue-600 animate-spin" />
          ) : (
            <RefreshCw 
              className="h-6 w-6 text-blue-600 transition-transform duration-200" 
              style={{ transform: `rotate(${rotation}deg)` }}
            />
          )}
          <span className="text-xs text-gray-500 mt-1">
            {isRefreshing 
              ? 'Refreshing...' 
              : isPulling 
                ? 'Release to refresh' 
                : 'Pull to refresh'}
          </span>
        </div>
      </div>

      {/* Content */}
      <div
        className="transition-transform duration-200"
        style={pullDistance > 0 ? { transform: `translateY(${pullDistance}px)` } : undefined}
      >
        {children}
      </div>
    </div>
  );
}
