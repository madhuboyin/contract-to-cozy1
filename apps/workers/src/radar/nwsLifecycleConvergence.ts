import { createHash } from 'node:crypto';
import {
  canonicalRadarObservationSchema,
  type CanonicalRadarObservation,
} from '@worker-shared/modules/homeEventRadar/contracts';
import type { SevereWeatherAlert } from '@worker-shared/services/severeWeatherAlert.service';
import { prisma } from '../lib/prisma';

const ACTIVE_LIFECYCLE_STATUSES = ['active', 'updated'] as const;
export const DEFAULT_NWS_STALE_AFTER_HOURS = 48;
const MAX_RECONCILIATION_BATCH = 500;

type LifecycleCandidate = {
  id: string;
  providerEventId: string | null;
  endAt: Date | null;
  observedAt: Date;
  revisions: Array<{
    normalizedJson: unknown;
    rawPayloadJson: unknown;
  }>;
};

type LifecycleDb = {
  radarEvent: {
    findMany(input: Record<string, unknown>): Promise<LifecycleCandidate[]>;
  };
};

export type NwsLifecycleReason =
  | 'provider_clear'
  | 'provider_retraction'
  | 'provider_expiration'
  | 'stale_safety_net';

export type NwsLifecycleObservation = {
  observation: CanonicalRadarObservation;
  reason: NwsLifecycleReason;
  radarEventId: string;
};

export type NwsLifecycleConvergenceInput = {
  sourceDefinitionId: string;
  observedAt: Date;
  currentAlerts: readonly SevereWeatherAlert[];
  allowStaleSafetyNet: boolean;
  staleAfterHours?: number;
};

function boundedStaleHours(value: number | undefined): number {
  if (!Number.isFinite(value)) return DEFAULT_NWS_STALE_AFTER_HOURS;
  return Math.min(Math.max(Math.trunc(value as number), 6), 168);
}

function lifecycleRevision(
  status: CanonicalRadarObservation['lifecycleStatus'],
  reason: NwsLifecycleReason,
  providerEventId: string,
  supersedingProviderEventId?: string,
): string {
  const evidence = [
    status,
    reason,
    providerEventId,
    supersedingProviderEventId ?? '',
  ].join('|');
  return `radar-lifecycle:${status}:${createHash('sha256').update(evidence).digest('hex').slice(0, 32)}`;
}

function referenceClosures(alerts: readonly SevereWeatherAlert[]) {
  const currentIds = new Set(alerts.map((alert) => alert.nwsAlertId.trim()));
  const closures = new Map<string, {
    status: 'resolved' | 'retracted';
    reason: 'provider_clear' | 'provider_retraction';
    supersedingProviderEventId: string;
  }>();
  const ordered = [...alerts].sort((a, b) => a.nwsAlertId.localeCompare(b.nwsAlertId));
  for (const alert of ordered) {
    const isCancellation = alert.messageType?.toLowerCase() === 'cancel';
    for (const rawReference of alert.referencedAlertIds) {
      const referencedId = rawReference.trim();
      if (!referencedId || currentIds.has(referencedId)) continue;
      const candidate = {
        status: isCancellation ? 'retracted' as const : 'resolved' as const,
        reason: isCancellation ? 'provider_retraction' as const : 'provider_clear' as const,
        supersedingProviderEventId: alert.nwsAlertId.trim(),
      };
      const existing = closures.get(referencedId);
      if (!existing || candidate.status === 'retracted') closures.set(referencedId, candidate);
    }
  }
  return closures;
}

function closureObservation(
  candidate: LifecycleCandidate,
  input: {
    sourceDefinitionId: string;
    observedAt: Date;
    status: 'resolved' | 'expired' | 'retracted';
    reason: NwsLifecycleReason;
    supersedingProviderEventId?: string;
  },
): CanonicalRadarObservation {
  const latestRevision = candidate.revisions[0];
  if (!latestRevision) {
    throw new Error(`Radar event ${candidate.id} has no immutable revision evidence`);
  }
  const normalized = canonicalRadarObservationSchema.omit({ rawPayload: true }).parse(
    latestRevision.normalizedJson,
  );
  const providerEventId = candidate.providerEventId?.trim();
  if (!providerEventId) {
    throw new Error(`Radar event ${candidate.id} has no provider event identity`);
  }
  return canonicalRadarObservationSchema.parse({
    ...normalized,
    sourceDefinitionId: input.sourceDefinitionId,
    providerEventId,
    providerRevision: lifecycleRevision(
      input.status,
      input.reason,
      providerEventId,
      input.supersedingProviderEventId,
    ),
    lifecycleStatus: input.status,
    observedAt: input.observedAt.toISOString(),
    rawPayload: {
      provider: 'National Weather Service',
      lifecycleEvidence: {
        reason: input.reason,
        observedAt: input.observedAt.toISOString(),
        ...(input.supersedingProviderEventId
          ? { supersedingProviderEventId: input.supersedingProviderEventId }
          : {}),
      },
      priorProviderPayload: latestRevision.rawPayloadJson,
    },
  });
}

export class NwsLifecycleConvergenceService {
  constructor(private readonly db: LifecycleDb = prisma as unknown as LifecycleDb) {}

  async buildObservations(
    input: NwsLifecycleConvergenceInput,
  ): Promise<NwsLifecycleObservation[]> {
    const references = referenceClosures(input.currentAlerts);
    const currentIds = new Set(input.currentAlerts.map((alert) => alert.nwsAlertId.trim()));
    const staleHours = boundedStaleHours(input.staleAfterHours);
    const staleBefore = new Date(input.observedAt.getTime() - staleHours * 60 * 60 * 1_000);
    const filters: Record<string, unknown>[] = [
      { endAt: { lte: input.observedAt } },
    ];
    if (references.size > 0) {
      filters.push({ providerEventId: { in: [...references.keys()] } });
    }
    if (input.allowStaleSafetyNet) {
      filters.push({
        endAt: null,
        observedAt: { lte: staleBefore },
      });
    }

    const output: NwsLifecycleObservation[] = [];
    let cursor: string | undefined;
    do {
      const candidates = await this.db.radarEvent.findMany({
        where: {
          sourceDefinitionId: input.sourceDefinitionId,
          status: { in: [...ACTIVE_LIFECYCLE_STATUSES] },
          ...(currentIds.size > 0
            ? { providerEventId: { notIn: [...currentIds] } }
            : {}),
          OR: filters,
        },
        select: {
          id: true,
          providerEventId: true,
          endAt: true,
          observedAt: true,
          revisions: {
            orderBy: [{ observedAt: 'desc' }, { id: 'desc' }],
            take: 1,
            select: {
              normalizedJson: true,
              rawPayloadJson: true,
            },
          },
        },
        orderBy: { id: 'asc' },
        take: MAX_RECONCILIATION_BATCH,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });

      for (const candidate of candidates) {
        const providerEventId = candidate.providerEventId?.trim();
        if (!providerEventId) continue;
        const reference = references.get(providerEventId);
        let status: 'resolved' | 'expired' | 'retracted';
        let reason: NwsLifecycleReason;
        let supersedingProviderEventId: string | undefined;
        if (reference) {
          status = reference.status;
          reason = reference.reason;
          supersedingProviderEventId = reference.supersedingProviderEventId;
        } else if (candidate.endAt && candidate.endAt <= input.observedAt) {
          status = 'expired';
          reason = 'provider_expiration';
        } else if (
          input.allowStaleSafetyNet &&
          !candidate.endAt &&
          candidate.observedAt <= staleBefore
        ) {
          status = 'expired';
          reason = 'stale_safety_net';
        } else {
          continue;
        }
        output.push({
          observation: closureObservation(candidate, {
            sourceDefinitionId: input.sourceDefinitionId,
            observedAt: input.observedAt,
            status,
            reason,
            supersedingProviderEventId,
          }),
          reason,
          radarEventId: candidate.id,
        });
      }

      cursor = candidates.length === MAX_RECONCILIATION_BATCH
        ? candidates[candidates.length - 1]?.id
        : undefined;
    } while (cursor);

    return output;
  }
}

export const nwsLifecycleConvergenceService = new NwsLifecycleConvergenceService();
