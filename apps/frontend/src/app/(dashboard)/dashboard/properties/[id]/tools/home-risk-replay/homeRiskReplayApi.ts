import { api } from '@/lib/api/client';
import type {
  HomeRiskReplayDetail,
  HomeRiskReplayRunSummary,
  HomeRiskReplayWindowType,
} from '@/components/features/homeRiskReplay/types';

export interface GenerateHomeRiskReplayInput {
  windowType: HomeRiskReplayWindowType;
  windowStart?: string | null;
  windowEnd?: string | null;
  forceRegenerate?: boolean;
}

export async function listHomeRiskReplayRuns(propertyId: string, limit = 12) {
  const res = await api.get(`/api/properties/${propertyId}/risk-replay/runs?limit=${limit}`);
  return (res.data?.runs ?? []) as HomeRiskReplayRunSummary[];
}

export async function getHomeRiskReplayDetail(propertyId: string, replayRunId: string) {
  const res = await api.get(`/api/properties/${propertyId}/risk-replay/runs/${replayRunId}`);
  const replay = res.data?.replay as HomeRiskReplayDetail | undefined;

  if (!replay) {
    throw new Error('Replay detail was missing from the response.');
  }

  return replay;
}

export async function generateHomeRiskReplay(propertyId: string, input: GenerateHomeRiskReplayInput) {
  const res = await api.post(`/api/properties/${propertyId}/risk-replay/runs`, input);
  const replay = res.data?.replay as HomeRiskReplayDetail | undefined;

  if (!replay) {
    throw new Error('Replay result was missing from the response.');
  }

  return {
    replay,
    reused: Boolean(res.data?.reused),
  };
}

