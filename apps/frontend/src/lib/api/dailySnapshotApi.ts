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

export async function getDailySnapshot(propertyId: string): Promise<DailySnapshotDTO> {
  const res = await api.get<{ snapshot: DailySnapshotDTO }>(
    `/api/properties/${propertyId}/daily-snapshot`
  );
  return res.data.snapshot;
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

