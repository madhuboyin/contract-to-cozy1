import { api } from '@/lib/api/client';
import type { ToolLifecycleEventDTO } from '@/types';

const SESSION_KEY = 'ctc:tool-lifecycle-session';
const STARTED_AT_PREFIX = 'ctc:tool-started-at:';
const RECENT_EVENT_PREFIX = 'ctc:tool-lifecycle-recent:';

declare global {
  interface Window {
    __ctcToolLifecycleAcceptanceSink?: (
      propertyId: string,
      events: ToolLifecycleEventDTO[],
    ) => void;
  }
}

function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function getToolLifecycleSessionKey(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const existing = window.sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const created = randomId();
    window.sessionStorage.setItem(SESSION_KEY, created);
    return created;
  } catch {
    return null;
  }
}

function startedAtKey(propertyId: string, toolId: string, sourceActionId?: string | null): string {
  return `${STARTED_AT_PREFIX}${propertyId}:${toolId}:${sourceActionId ?? 'unattributed'}`;
}

function recentEventKey(
  propertyId: string,
  toolId: string,
  stage: ToolLifecycleEventDTO['stage'],
  sourceActionId?: string | null,
): string {
  return `${RECENT_EVENT_PREFIX}${propertyId}:${toolId}:${stage}:${sourceActionId ?? 'unattributed'}`;
}

function enrichEvent(propertyId: string, event: ToolLifecycleEventDTO): ToolLifecycleEventDTO {
  const enriched = { ...event, sessionKey: event.sessionKey ?? getToolLifecycleSessionKey() };
  if (typeof window === 'undefined') return enriched;

  try {
    const key = startedAtKey(propertyId, event.toolId, event.sourceActionId);
    if (event.stage === 'STARTED') {
      window.sessionStorage.setItem(key, String(Date.now()));
    } else if (event.stage === 'COMPLETED' && enriched.durationSeconds == null) {
      const startedAt = Number(window.sessionStorage.getItem(key));
      if (Number.isFinite(startedAt) && startedAt > 0) {
        enriched.durationSeconds = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
      }
      window.sessionStorage.removeItem(key);
    }
  } catch {
    // Lifecycle telemetry must never block the primary workflow.
  }
  return enriched;
}

function shouldSendEvent(propertyId: string, event: ToolLifecycleEventDTO): boolean {
  if (typeof window === 'undefined') return true;
  if (event.stage !== 'STARTED' && event.stage !== 'OUTPUT_GENERATED' && event.stage !== 'COMPLETED') return true;
  try {
    const key = recentEventKey(propertyId, event.toolId, event.stage, event.sourceActionId);
    const last = Number(window.sessionStorage.getItem(key));
    const now = Date.now();
    if (Number.isFinite(last) && now - last < 5_000) return false;
    window.sessionStorage.setItem(key, String(now));
  } catch {
    return true;
  }
  return true;
}

export function hasRecentToolCompletion(
  propertyId: string,
  toolId: string,
  sourceActionId?: string | null,
): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const key = recentEventKey(propertyId, toolId, 'COMPLETED', sourceActionId);
    const completedAt = Number(window.sessionStorage.getItem(key));
    return Number.isFinite(completedAt) && Date.now() - completedAt < 30 * 60_000;
  } catch {
    return false;
  }
}

export function persistToolLifecycleEvents(
  propertyId: string | null | undefined,
  events: ToolLifecycleEventDTO[],
): void {
  if (!propertyId || events.length === 0) return;
  const enriched = events
    .filter((event) => shouldSendEvent(propertyId, event))
    .map((event) => enrichEvent(propertyId, event));
  if (enriched.length === 0) return;
  if (
    process.env.NEXT_PUBLIC_TOOL_DISCOVERY_ACCEPTANCE_FIXTURE === '1'
    && typeof window !== 'undefined'
    && typeof window.__ctcToolLifecycleAcceptanceSink === 'function'
  ) {
    window.__ctcToolLifecycleAcceptanceSink(propertyId, enriched);
    return;
  }
  void api.recordToolLifecycleEvents(propertyId, enriched).catch(() => undefined);
}

export function persistToolLifecycleEvent(
  propertyId: string | null | undefined,
  event: ToolLifecycleEventDTO,
): void {
  persistToolLifecycleEvents(propertyId, [event]);
}
