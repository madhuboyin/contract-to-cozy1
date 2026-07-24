'use client';

import React from 'react';
import { track } from '@/lib/analytics/events';

type CapabilityImpressionInput = {
  capabilityId: string;
  propertyId?: string | null;
  surface: 'unified_home' | 'explore_tools' | 'command_palette' | 'workflow';
  registryVersion: string;
  recommendationReason?: string | null;
  contextVersion?: string | null;
  enabled?: boolean;
};

const EXPOSURE_MS = 750;
const VISIBILITY_THRESHOLD = 0.5;

function impressionKey(input: CapabilityImpressionInput): string {
  return [
    'ctc:capability-impression',
    input.registryVersion,
    input.surface,
    input.propertyId ?? 'global',
    input.capabilityId,
  ].join(':');
}

export function useCapabilityImpression<T extends HTMLElement>(
  input: CapabilityImpressionInput,
): React.RefCallback<T> {
  const [element, setElement] = React.useState<T | null>(null);
  const inputRef = React.useRef(input);
  inputRef.current = input;

  React.useEffect(() => {
    if (!element || input.enabled === false || typeof IntersectionObserver === 'undefined') {
      return undefined;
    }

    let visibleEnough = false;
    let timer: number | null = null;
    let recorded = false;
    const key = impressionKey(input);

    try {
      recorded = window.sessionStorage.getItem(key) === '1';
    } catch {
      recorded = false;
    }
    if (recorded) return undefined;

    const clearExposure = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
    };

    const record = () => {
      timer = null;
      if (recorded || !visibleEnough || document.visibilityState !== 'visible') return;
      recorded = true;
      try {
        window.sessionStorage.setItem(key, '1');
      } catch {
        // Telemetry storage failures must not affect discovery.
      }
      const current = inputRef.current;
      track('tool_discovery_impression', {
        propertyId: current.propertyId,
        surface: current.surface,
        toolIds: [current.capabilityId],
        recommendationReasons: current.recommendationReason
          ? [current.recommendationReason]
          : undefined,
        contextVersion: current.contextVersion,
      });
    };

    const startExposure = () => {
      clearExposure();
      if (recorded || !visibleEnough || document.visibilityState !== 'visible') return;
      timer = window.setTimeout(record, EXPOSURE_MS);
    };

    const observer = new IntersectionObserver(([entry]) => {
      visibleEnough = Boolean(
        entry?.isIntersecting && entry.intersectionRatio >= VISIBILITY_THRESHOLD,
      );
      if (visibleEnough) startExposure();
      else clearExposure();
    }, { threshold: [VISIBILITY_THRESHOLD] });

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') startExposure();
      else clearExposure();
    };

    observer.observe(element);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      clearExposure();
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [
    element,
    input.capabilityId,
    input.contextVersion,
    input.enabled,
    input.propertyId,
    input.recommendationReason,
    input.registryVersion,
    input.surface,
  ]);

  return React.useCallback((node: T | null) => setElement(node), []);
}
