import { useEffect, useState } from 'react';
import type { AskExecutionResponse } from './types';

// ASK_COZY_INLINE_WORKSPACE_FRD §11.11 (IW-CALM-001..012, FRD v1.111): calm conversational answers. Slice A adopts the
// Maintenance answer only; a result of any other domain keeps its current rendering (IW-CALM-012: no half-converted domain).
// Default (September 25, 2026): calm is ON for everyone. `?calm=0` returns to the previous presentation and is remembered on that
// browser; `NEXT_PUBLIC_ASK_CALM_ANSWERS=false` at build time is the release kill switch.

export const CALM_ANSWERS_STORAGE_KEY = 'ctc:ask-calm-answers';

type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;

/**
 * The homeowner's setting. `?calm=1` or `?calm=0` in the address sets and remembers it; otherwise the remembered value
 * applies; otherwise the build default (on).
 */
export function resolveCalmPreference(search: string, storage: PreferenceStorage | null, buildDefault: boolean): boolean {
  const requested = new URLSearchParams(search).get('calm');
  if (requested === '1' || requested === '0') {
    try { storage?.setItem(CALM_ANSWERS_STORAGE_KEY, requested); } catch { /* Storage unavailable: use it for this view only. */ }
    return requested === '1';
  }
  try {
    const stored = storage?.getItem(CALM_ANSWERS_STORAGE_KEY);
    if (stored === '1') return true;
    if (stored === '0') return false;
  } catch { /* Storage unavailable: fall through to the build default. */ }
  return buildDefault;
}

/** Reads the setting after mount so the server and first client render agree. */
export function useCalmAnswers(): boolean {
  const buildDefault = process.env.NEXT_PUBLIC_ASK_CALM_ANSWERS !== 'false';
  const [calm, setCalm] = useState(buildDefault);
  useEffect(() => {
    let storage: Storage | null = null;
    try { storage = window.localStorage; } catch { storage = null; }
    setCalm(resolveCalmPreference(window.location.search, storage, buildDefault));
  }, [buildDefault]);
  return calm;
}

/** The domains that have adopted the calm anatomy. Identified by the block the domain's own handler declares. */
export function isCalmAdopter(execution: Pick<AskExecutionResponse, 'blocks'>): boolean {
  return execution.blocks.some((block) => block.type === 'GROUPED_LIST' && block.id === 'maintenance-groups');
}

/** IW-CALM-001: the headline is the producer's own sentence, else the result's title. Never generated here. */
export function calmHeadline(execution: Pick<AskExecutionResponse, 'blocks' | 'question'>): { headline: string; supportLine: string | null } | null {
  const summary = execution.blocks.find((block) => block.type === 'SUMMARY');
  if (!summary || summary.type !== 'SUMMARY') return null;
  return { headline: summary.headline?.trim() || summary.title, supportLine: summary.supportLine?.trim() || null };
}
