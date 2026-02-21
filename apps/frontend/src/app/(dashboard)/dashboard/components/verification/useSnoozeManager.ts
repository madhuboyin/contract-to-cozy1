// apps/frontend/src/app/(dashboard)/dashboard/components/verification/useSnoozeManager.ts
'use client';

import { useCallback, useEffect, useState } from 'react';

const SNOOZE_STORAGE_KEY = 'ctc.discovery-nudges.snooze.v1';
const SNOOZE_WINDOW_MS = 24 * 60 * 60 * 1000;

type SnoozeMap = Record<string, number>;

function readSnoozeMap(): SnoozeMap {
  if (typeof window === 'undefined') return {};

  try {
    const raw = window.localStorage.getItem(SNOOZE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};

    return Object.entries(parsed as Record<string, unknown>).reduce<SnoozeMap>((acc, [id, value]) => {
      const expiry = Number(value);
      if (!id || !Number.isFinite(expiry)) return acc;
      acc[id] = expiry;
      return acc;
    }, {});
  } catch {
    return {};
  }
}

function writeSnoozeMap(next: SnoozeMap) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(SNOOZE_STORAGE_KEY, JSON.stringify(next));
}

function pruneExpired(now = Date.now()): SnoozeMap {
  const current = readSnoozeMap();
  const pruned = Object.entries(current).reduce<SnoozeMap>((acc, [id, expiry]) => {
    if (expiry > now) {
      acc[id] = expiry;
    }
    return acc;
  }, {});

  writeSnoozeMap(pruned);
  return pruned;
}

export function useSnoozeManager() {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    pruneExpired();
  }, []);

  const touch = useCallback(() => {
    setVersion((current) => current + 1);
  }, []);

  const snoozeNudge = useCallback((id: string) => {
    if (!id || typeof window === 'undefined') return;
    const next = pruneExpired();
    next[id] = Date.now() + SNOOZE_WINDOW_MS;
    writeSnoozeMap(next);
    touch();
  }, [touch]);

  const getExclusionList = useCallback(() => {
    const map = pruneExpired();
    return Object.keys(map);
  }, []);

  return {
    snoozeNudge,
    getExclusionList,
    snoozeVersion: version,
  };
}
