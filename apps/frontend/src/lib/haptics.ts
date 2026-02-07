// apps/frontend/src/lib/haptics.ts

import React from 'react';

/**
 * Haptic feedback utility for mobile devices
 * Provides tactile feedback for user interactions
 */

export const haptics = {
  /**
   * Light tap - for button presses, selection
   */
  light: () => {
    if (typeof window === 'undefined') return;
    
    if ('vibrate' in navigator) {
      navigator.vibrate(10);
    }
  },

  /**
   * Medium impact - for switches, toggles
   */
  medium: () => {
    if (typeof window === 'undefined') return;
    
    if ('vibrate' in navigator) {
      navigator.vibrate(20);
    }
  },

  /**
   * Heavy impact - for significant actions
   */
  heavy: () => {
    if (typeof window === 'undefined') return;
    
    if ('vibrate' in navigator) {
      navigator.vibrate(50);
    }
  },

  /**
   * Success pattern - for completed actions
   */
  success: () => {
    if (typeof window === 'undefined') return;
    
    if ('vibrate' in navigator) {
      navigator.vibrate([10, 50, 10]);
    }
  },

  /**
   * Error pattern - for failures or warnings
   */
  error: () => {
    if (typeof window === 'undefined') return;
    
    if ('vibrate' in navigator) {
      navigator.vibrate([50, 100, 50]);
    }
  },

  /**
   * Warning pattern - for alerts
   */
  warning: () => {
    if (typeof window === 'undefined') return;
    
    if ('vibrate' in navigator) {
      navigator.vibrate([30, 50, 30, 50, 30]);
    }
  },

  /**
   * Notification pattern - for incoming messages/updates
   */
  notification: () => {
    if (typeof window === 'undefined') return;
    
    if ('vibrate' in navigator) {
      navigator.vibrate([10, 30, 10, 30, 10]);
    }
  },

  /**
   * Selection pattern - for dragging or selecting items
   */
  selection: () => {
    if (typeof window === 'undefined') return;
    
    if ('vibrate' in navigator) {
      navigator.vibrate(5);
    }
  },

  /**
   * Custom vibration pattern
   * @param pattern - Array of vibration and pause durations in ms
   */
  custom: (pattern: number | number[]) => {
    if (typeof window === 'undefined') return;
    
    if ('vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
  },

  /**
   * Check if haptics are supported
   */
  isSupported: (): boolean => {
    if (typeof window === 'undefined') return false;
    return 'vibrate' in navigator;
  },
};

/**
 * Hook for using haptics in React components
 */
export function useHaptics() {
  return haptics;
}

/**
 * HOC to add haptic feedback to components
 */
export function withHaptics<P extends object>(
  Component: React.ComponentType<P>,
  hapticType: keyof typeof haptics = 'light'
) {
  return function HapticComponent(props: P) {
    const handleInteraction = () => {
      if (typeof hapticType === 'string' && hapticType in haptics) {
        (haptics as any)[hapticType as keyof typeof haptics]();
      }
    };

    return React.createElement(
      'div',
      {
        onClick: handleInteraction,
        onTouchStart: handleInteraction,
      },
      React.createElement(Component, props)
    );
  };
}