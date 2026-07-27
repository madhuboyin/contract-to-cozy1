import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchRadarAnomalies,
  fetchRadarEventLineage,
  fetchRadarSources,
  replayRadarRun,
  runRadarSource,
  setRadarSourcePause,
  testRadarSource,
} from '@/lib/api/adminRadarSources';

const SOURCES_KEY = ['admin-radar-sources'];
const ANOMALIES_KEY = ['admin-radar-anomalies'];

export function useAdminRadarSources(enabled = true) {
  return useQuery({
    queryKey: SOURCES_KEY,
    queryFn: fetchRadarSources,
    enabled,
    staleTime: 30_000,
  });
}

export function useAdminRadarAnomalies(enabled = true) {
  return useQuery({
    queryKey: ANOMALIES_KEY,
    queryFn: fetchRadarAnomalies,
    enabled,
    staleTime: 30_000,
  });
}

export function useAdminRadarCommand() {
  const client = useQueryClient();
  const invalidate = () => {
    client.invalidateQueries({ queryKey: SOURCES_KEY });
    client.invalidateQueries({ queryKey: ANOMALIES_KEY });
  };
  return {
    testFetch: useMutation({
      mutationFn: ({ sourceKey, propertyId }: { sourceKey: string; propertyId?: string }) =>
        testRadarSource(sourceKey, propertyId),
      onSuccess: invalidate,
    }),
    run: useMutation({
      mutationFn: ({ sourceKey, propertyId }: { sourceKey: string; propertyId: string }) =>
        runRadarSource(sourceKey, propertyId),
      onSuccess: invalidate,
    }),
    pause: useMutation({
      mutationFn: ({ sourceKey, paused, reason }: { sourceKey: string; paused: boolean; reason: string }) =>
        setRadarSourcePause(sourceKey, paused, reason),
      onSuccess: invalidate,
    }),
    replay: useMutation({
      mutationFn: (runId: string) => replayRadarRun(runId),
      onSuccess: invalidate,
    }),
    lineage: useMutation({
      mutationFn: (eventId: string) => fetchRadarEventLineage(eventId),
    }),
  };
}
