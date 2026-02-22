import { api } from './client';

export type PulseSummaryKind = 'HEALTH' | 'RISK' | 'FINANCIAL';
export type PulseSeverity = 'LOW' | 'MEDIUM' | 'HIGH';
export type PulseMicroActionStatus = 'PENDING' | 'COMPLETED' | 'DISMISSED' | 'EXPIRED';

export type MorningHomePulsePayload = {
  title: 'Morning Home Pulse';
  dateLabel: string;
  summary: Array<{
    kind: PulseSummaryKind;
    label: string;
    value: number;
    delta: number;
    reason: string;
  }>;
  weatherInsight: {
    headline: string;
    detail: string;
    severity: PulseSeverity;
  };
  microAction: {
    actionId: string;
    title: string;
    detail: string;
    cta: string;
    etaMinutes: number;
  };
  homeWin: {
    headline: string;
    detail: string;
  };
  surprise: {
    headline: string;
    detail: string;
  };
};

export type DailySnapshotDTO = {
  id: string;
  propertyId: string;
  snapshotDate: string;
  payload: MorningHomePulsePayload;
  microAction: {
    id: string;
    status: PulseMicroActionStatus;
    title: string;
    description: string | null;
    ctaLabel: string | null;
    etaMinutes: number | null;
    completedAt: string | null;
    dismissedAt: string | null;
  } | null;
  streaks: {
    dailyPulseCheckin: number;
    microActionCompleted: number;
    noOverdueTasks: number;
  };
  generatedAt: string;
};

type CachedSnapshot = {
  snapshot: DailySnapshotDTO;
  fetchedAt: number;
};

type GetDailySnapshotOptions = {
  force?: boolean;
  allowStaleOnRateLimit?: boolean;
};

const SNAPSHOT_CACHE_TTL_MS = 2 * 60 * 1000;
const snapshotCache = new Map<string, CachedSnapshot>();
const inFlightSnapshotRequests = new Map<string, Promise<DailySnapshotDTO>>();

function isRateLimitedError(error: unknown): boolean {
  const anyErr = error as { status?: number | string; message?: string } | undefined;
  if (!anyErr) return false;
  if (anyErr.status === 429 || anyErr.status === '429') return true;
  return String(anyErr.message || '').toLowerCase().includes('too many requests');
}

function getFreshCachedSnapshot(propertyId: string): DailySnapshotDTO | null {
  const cached = snapshotCache.get(propertyId);
  if (!cached) return null;
  if (Date.now() - cached.fetchedAt > SNAPSHOT_CACHE_TTL_MS) return null;
  return cached.snapshot;
}

function setSnapshotCache(propertyId: string, snapshot: DailySnapshotDTO) {
  snapshotCache.set(propertyId, { snapshot, fetchedAt: Date.now() });
}

export async function getDailySnapshot(
  propertyId: string,
  options: GetDailySnapshotOptions = {}
): Promise<DailySnapshotDTO> {
  const { force = false, allowStaleOnRateLimit = true } = options;

  const freshCached = getFreshCachedSnapshot(propertyId);
  if (!force && freshCached) {
    return freshCached;
  }

  const inFlight = inFlightSnapshotRequests.get(propertyId);
  if (inFlight) {
    return inFlight;
  }

  const request = api
    .get<{ snapshot: DailySnapshotDTO }>(`/api/properties/${propertyId}/daily-snapshot`)
    .then((res) => {
      setSnapshotCache(propertyId, res.data.snapshot);
      return res.data.snapshot;
    })
    .catch((error) => {
      if (allowStaleOnRateLimit && isRateLimitedError(error)) {
        const stale = snapshotCache.get(propertyId)?.snapshot;
        if (stale) {
          return stale;
        }
      }
      throw error;
    })
    .finally(() => {
      inFlightSnapshotRequests.delete(propertyId);
    });

  inFlightSnapshotRequests.set(propertyId, request);
  return request;
}

export async function checkinDailySnapshot(
  propertyId: string
): Promise<{ streaks: DailySnapshotDTO['streaks'] }> {
  const res = await api.post<{ streaks: DailySnapshotDTO['streaks'] }>(
    `/api/properties/${propertyId}/daily-snapshot/checkin`
  );
  return res.data;
}

export async function completeMicroAction(
  propertyId: string,
  actionId: string
): Promise<{ actionId: string; status: PulseMicroActionStatus; streaks: DailySnapshotDTO['streaks'] }> {
  const res = await api.post<{
    actionId: string;
    status: PulseMicroActionStatus;
    streaks: DailySnapshotDTO['streaks'];
  }>(`/api/properties/${propertyId}/micro-actions/${actionId}/complete`);
  return res.data;
}

export async function dismissMicroAction(
  propertyId: string,
  actionId: string
): Promise<{ actionId: string; status: PulseMicroActionStatus; streaks: DailySnapshotDTO['streaks'] }> {
  const res = await api.post<{
    actionId: string;
    status: PulseMicroActionStatus;
    streaks: DailySnapshotDTO['streaks'];
  }>(`/api/properties/${propertyId}/micro-actions/${actionId}/dismiss`);
  return res.data;
}
