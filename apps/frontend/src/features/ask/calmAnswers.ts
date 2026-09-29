import { useEffect, useState } from 'react';
import type { AskExecutionResponse } from './types';

// ASK_COZY_INLINE_WORKSPACE_FRD §11.11 (IW-CALM-001..012, FRD v1.111): calm conversational answers. Slice A adopted the
// Maintenance answer, and Inventory followed (ACUI I-1, FRD v1.121) Warranties after it (W-1, v1.124) Claims after that (C-1, v1.127) Home Event Radar after that (R-1, v1.132) Documents after that (D-1, v1.135) and Property Summary's two already-focused sub-answers (rooms, completeness) after that (Property Summary P-1); a result of any other domain, and Property Summary's own vague-overview dump, keeps its current rendering (IW-CALM-012: no half-converted domain).
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
  const blocks = execution.blocks;
  // Property Summary P-1: only its two already-focused sub-answers (an explicit room or completeness question) are
  // calm-adopted, never the vague-overview dump that embeds a copy of every domain's own list (ASK_COZY_CONVERSATIONAL_UI_GAP_AUDIT.md
  // §16). The dump is the only branch that ever declares the core-facts TABLE, so its absence is what distinguishes a
  // focused sub-answer from the dump -- both `property-rooms` and `property-completeness` are also reachable from
  // inside the dump, where they must NOT flip the whole execution into calm mode.
  const isPropertySummaryDump = blocks.some((block) => block.type === 'TABLE' && block.id === 'property-core-facts');
  const hasFocusedRoomsOrCompleteness = blocks.some((block) => block.type === 'GROUPED_LIST' && (block.id === 'property-rooms' || block.id === 'property-completeness'));
  // Property Summary P-2's synthesized vague-overview answer declares only its own SUMMARY and EVIDENCE blocks -- no
  // list of its own to identify it by, so its own SUMMARY id is the signal (gated the same way as the dump exclusion,
  // and excluded when the room/completeness clause below already claims the execution).
  const isPropertySummarySynthesis = !isPropertySummaryDump && !hasFocusedRoomsOrCompleteness
    && blocks.some((block) => block.type === 'SUMMARY' && block.id === 'property-summary');
  return isPropertySummarySynthesis || blocks.some((block) => (block.type === 'GROUPED_LIST' && (
    block.id === 'maintenance-groups' || block.id === 'inventory-results' || block.id === 'warranty-results' || block.id === 'incident-claim-list' || block.id === 'home-event-radar-feed' || block.id === 'document-lookup-groups'
    || (block.id === 'property-rooms' && block.presentation?.pattern === 'ROOM_MAP' && block.presentation.focused === true)
    || (block.id === 'property-completeness' && !isPropertySummaryDump)
  )) || (block.type === 'PRIORITY_LIST' && block.id === 'home-actions-priority-list'));
}

/** IW-CONV-047: a calm Home Actions answer keeps the governed ranked view as its one artifact. */
export function calmArtifactBlocks(blocks: AskExecutionResponse['blocks']): AskExecutionResponse['blocks'] {
  if (!blocks.some((block) => block.type === 'PRIORITY_LIST' && block.id === 'home-actions-priority-list')) return blocks;
  return blocks.filter((block) => !(block.type === 'GROUPED_LIST' && block.id === 'home-actions-list'));
}

/** IW-CALM-001: the headline is the producer's own sentence, else the result's title. Never generated here. */
export function calmHeadline(execution: Pick<AskExecutionResponse, 'blocks' | 'question'>): { headline: string; supportLine: string | null } | null {
  const summary = execution.blocks.find((block) => block.type === 'SUMMARY');
  if (!summary || summary.type !== 'SUMMARY') return null;
  return { headline: summary.headline?.trim() || summary.title, supportLine: summary.supportLine?.trim() || null };
}
