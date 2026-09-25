import type { AskExecutionResponse } from './types';

// ASK_COZY_INLINE_WORKSPACE_FRD §11.10 IW-PRES-021 (FRD v1.95): folding and pinning earlier results. Both only change
// what is shown: they never re-run the request, and nothing about a result is stored here except its execution id.
export type ConversationView = { folded: string[]; pinned: string[] };
export const EMPTY_CONVERSATION_VIEW: ConversationView = { folded: [], pinned: [] };
const PREFIX = 'ctc:ask-conversation-view:v1:';
const LIMIT = 100;
export const conversationViewKey = (sessionId: string) => `${PREFIX}${sessionId}`;

const ids = (value: unknown): string[] => (Array.isArray(value)
  ? Array.from(new Set(value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0 && entry.length <= 120))).slice(0, LIMIT)
  : []);

export function readConversationView(storage: Storage, sessionId: string): ConversationView {
  try {
    const value = JSON.parse(storage.getItem(conversationViewKey(sessionId)) ?? 'null');
    if (!value || typeof value !== 'object') return EMPTY_CONVERSATION_VIEW;
    return { folded: ids(value.folded), pinned: ids(value.pinned) };
  } catch { return EMPTY_CONVERSATION_VIEW; }
}

export function writeConversationView(storage: Storage, sessionId: string, view: ConversationView) {
  try { storage.setItem(conversationViewKey(sessionId), JSON.stringify({ folded: ids(view.folded), pinned: ids(view.pinned) })); } catch { /* Storage unavailable: keep the in-memory view. */ }
}

export function toggleId(list: readonly string[], id: string): string[] {
  return list.includes(id) ? list.filter((entry) => entry !== id) : [...list, id].slice(-LIMIT);
}

/** Drops ids for results that are no longer in the conversation (a deleted or redacted result cannot stay pinned). */
export function reconcileConversationView(view: ConversationView, executions: readonly Pick<AskExecutionResponse, 'executionId'>[]): ConversationView {
  const present = new Set(executions.map((execution) => execution.executionId));
  const folded = view.folded.filter((id) => present.has(id));
  const pinned = view.pinned.filter((id) => present.has(id));
  return folded.length === view.folded.length && pinned.length === view.pinned.length ? view : { folded, pinned };
}

/**
 * A one-line headline for a folded or pinned result: the result's own summary title, else the first block title, else the
 * question. It is taken from the result as shown, never generated.
 */
export function resultHeadline(execution: Pick<AskExecutionResponse, 'blocks' | 'question'>): string {
  const summary = execution.blocks.find((block) => block.type === 'SUMMARY' && block.title.trim());
  const titled = summary ?? execution.blocks.find((block) => 'title' in block && typeof block.title === 'string' && block.title.trim());
  const text = titled && 'title' in titled && typeof titled.title === 'string' ? titled.title.trim() : execution.question.trim();
  return text.length > 140 ? `${text.slice(0, 139).trimEnd()}…` : text;
}

/**
 * Only a settled result can fold: one still waiting on the homeowner (a confirmation, a question, a missing detail or a
 * property choice) stays open so the decision cannot be hidden.
 */
export function canFoldResult(execution: Pick<AskExecutionResponse, 'status' | 'confirmation' | 'clarification' | 'captureRequests'>): boolean {
  return !execution.confirmation && !execution.clarification && execution.captureRequests.length === 0
    && !['NEEDS_CONFIRMATION', 'NEEDS_PROPERTY', 'NEEDS_CONTEXT', 'NEEDS_ENTITY', 'NEEDS_CLARIFICATION', 'RUNNING'].includes(execution.status);
}
