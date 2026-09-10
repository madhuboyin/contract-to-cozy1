import type { JobsOptions } from 'bullmq';
import { PropertyExternalMatchStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import {
  PROPERTY_ENRICHMENT_JOB_NAME,
  propertyEnrichmentJobId,
} from '../jobs/propertyEnrichment.job';
import {
  PROPERTY_ENRICHMENT_CONTRACT_VERSION,
  RENTCAST_PROVIDER,
  type PropertyEnrichmentJobPayload,
} from './contracts';

export const PROPERTY_ENRICHMENT_CONTRACT_REPLAY_LIMIT = 250;

interface StaleIdentityRow {
  propertyId: string;
  property: { addressIdentityVersion: number };
}

interface StaleIdentityRepository {
  findMany(args: {
    where: {
      provider: typeof RENTCAST_PROVIDER;
      contractVersion: { lt: number };
      matchStatus: { in: PropertyExternalMatchStatus[] };
    };
    select: {
      propertyId: true;
      property: { select: { addressIdentityVersion: true } };
    };
    orderBy: { updatedAt: 'asc' };
    take: number;
  }): Promise<StaleIdentityRow[]>;
}

interface EnrichmentQueue {
  add(
    name: string,
    data: PropertyEnrichmentJobPayload,
    options: JobsOptions,
  ): Promise<unknown>;
}

export interface ContractReplayResult {
  selected: number;
  enqueued: number;
  failed: number;
}

/**
 * Replays only stale negative decisions whose matching semantics changed.
 * The batch is intentionally bounded; successful processing upgrades the
 * durable identity contract version and removes it from future startup scans.
 */
export async function requeueStalePropertyEnrichmentContracts(
  queue: EnrichmentQueue,
  repository: StaleIdentityRepository = prisma.propertyExternalIdentity,
): Promise<ContractReplayResult> {
  const identities = await repository.findMany({
    where: {
      provider: RENTCAST_PROVIDER,
      contractVersion: { lt: PROPERTY_ENRICHMENT_CONTRACT_VERSION },
      matchStatus: {
        in: [PropertyExternalMatchStatus.NO_MATCH, PropertyExternalMatchStatus.AMBIGUOUS],
      },
    },
    select: {
      propertyId: true,
      property: { select: { addressIdentityVersion: true } },
    },
    orderBy: { updatedAt: 'asc' },
    take: PROPERTY_ENRICHMENT_CONTRACT_REPLAY_LIMIT,
  });

  let enqueued = 0;
  let failed = 0;
  for (const identity of identities) {
    const addressVersion = identity.property.addressIdentityVersion;
    try {
      await queue.add(
        PROPERTY_ENRICHMENT_JOB_NAME,
        {
          propertyId: identity.propertyId,
          provider: RENTCAST_PROVIDER,
          addressVersion,
          contractVersion: PROPERTY_ENRICHMENT_CONTRACT_VERSION,
        },
        {
          jobId: propertyEnrichmentJobId(identity.propertyId, addressVersion),
          attempts: 3,
          backoff: { type: 'exponential', delay: 5_000 },
        },
      );
      enqueued += 1;
    } catch {
      failed += 1;
    }
  }

  return { selected: identities.length, enqueued, failed };
}
