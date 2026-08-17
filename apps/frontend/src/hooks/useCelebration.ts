'use client';

import { useCallback, useState } from 'react';

export type MilestoneType = 'success' | 'savings' | 'scan' | 'cozy' | 'closing';

interface CelebrationState {
  type: MilestoneType | null;
  isOpen: boolean;
}

const SESSION_PREFIX = 'c2c_milestone_';
const shownMilestones = new Set<string>();

function hasBeenShown(key: string): boolean {
  return shownMilestones.has(`${SESSION_PREFIX}${key}`);
}

function markShown(key: string): void {
  shownMilestones.add(`${SESSION_PREFIX}${key}`);
}

/**
 * Manages milestone celebration state.
 * @param dedupKey  Unique key scoped to the feature context (e.g. propertyId or roomId).
 *                  Prevents the same milestone from replaying within the same session.
 */
export function useCelebration(dedupKey: string) {
  const [state, setState] = useState<CelebrationState>({ type: null, isOpen: false });

  const celebrate = useCallback(
    (type: MilestoneType) => {
      const key = `${dedupKey}:${type}`;
      if (hasBeenShown(key)) return;
      markShown(key);
      setState({ type, isOpen: true });
    },
    [dedupKey],
  );

  const dismiss = useCallback(() => {
    setState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  return { celebration: state, celebrate, dismiss };
}
