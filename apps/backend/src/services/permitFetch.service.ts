import { prisma } from '../lib/prisma';

type PermitFetchTrigger = 'PROPERTY_ONBOARDING' | 'USER_REQUEST' | 'SCHEDULED';
import { logger } from '../lib/logger';
import { APIError } from '../middleware/error.middleware';
import { socrataAdapter } from './permitAdapters/socrata.adapter';
import { accelaAdapter } from './permitAdapters/accela.adapter';
import { permitNormalizer, PropertyAddress } from './permitAdapters/permitNormalizer';
import { getPermitFetchQueue, getDetectUnpermittedWorkQueue } from './JobQueue.service';
import { checkPermitWorkerContext } from './projectCompliance/permitWorkerContext.service';
import { JOB_REGISTRY } from '../config/workerJobRegistry';
import { evaluateWorkerExecution } from '../config/workerExecutionPolicy';

function buildNormalizedKey(city: string, state: string): string {
  const citySlug = city.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const stateUpper = state.toUpperCase();
  return `US-${stateUpper}-${citySlug}`;
}

async function resolvePropertyAddress(propertyId: string): Promise<PropertyAddress & { normalizedKey: string }> {
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { address: true, city: true, state: true, zipCode: true },
  });

  if (!property) {
    throw new APIError('Property not found', 404, 'NOT_FOUND');
  }

  return {
    street: property.address ?? '',
    city: property.city ?? '',
    state: property.state ?? '',
    postalCode: property.zipCode ?? undefined,
    normalizedKey: buildNormalizedKey(property.city ?? '', property.state ?? ''),
  };
}

export class PermitFetchService {
  async triggerFetch(propertyId: string, trigger: PermitFetchTrigger): Promise<{ fetchJobId: string }> {
    // Cross-cutting W4 fix: this on-demand enqueue previously bypassed
    // evaluateWorkerExecution entirely, so a
    // WORKER_JOB_PERMIT_FETCH_ENABLED=false override (or the group
    // WORKER_EXTERNAL_INGEST_ENABLED flag this job's externalProvider
    // requires) had zero effect. This is the user's primary requested
    // action, so a blocked decision fails the request rather than
    // silently doing nothing.
    const registryEntry = JOB_REGISTRY.find((j) => j.key === 'permit-fetch');
    const decision = registryEntry
      ? evaluateWorkerExecution('permit-fetch', 'manual', registryEntry)
      : { allowed: false, reason: 'missing registry entry' };
    if (!decision.allowed) {
      throw new APIError(
        `Permit history fetch is not currently enabled (${decision.reason}).`,
        503,
        'WORKER_JOB_DISABLED',
      );
    }

    const addressInfo = await resolvePropertyAddress(propertyId);

    const dataSource = await prisma.permitDataSource.findFirst({
      where: { normalizedCoverageKey: addressInfo.normalizedKey, status: 'ACTIVE' },
    });

    if (!dataSource) {
      const job = await prisma.permitFetchJob.create({
        data: {
          propertyId,
          dataSourceId: null,
          trigger,
          status: 'NO_DATA_SOURCE',
          startedAt: new Date(),
          completedAt: new Date(),
        },
      });
      return { fetchJobId: job.id };
    }

    const job = await prisma.permitFetchJob.create({
      data: {
        propertyId,
        dataSourceId: dataSource.id,
        trigger,
        status: 'QUEUED',
        startedAt: new Date(),
      },
    });

    await getPermitFetchQueue().add('fetch-permit-history', { fetchJobId: job.id, propertyId });

    return { fetchJobId: job.id };
  }

  async runFetch(fetchJobId: string): Promise<void> {
    const job = await prisma.permitFetchJob.findUnique({
      where: { id: fetchJobId },
      include: {
        dataSource: true,
        property: { select: { address: true, city: true, state: true, zipCode: true } },
      },
    });

    if (!job) throw new Error(`PermitFetchJob ${fetchJobId} not found`);

    const contextCheck = await checkPermitWorkerContext(job.propertyId);
    if (!contextCheck.allowed) {
      await prisma.permitFetchJob.update({
        where: { id: fetchJobId },
        data: {
          status: 'FAILED',
          errorMessage: `PROPERTY_CONTEXT_RECHECK_BLOCKED:${contextCheck.reasonCodes.join(',')}`,
          completedAt: new Date(),
        },
      });
      logger.info(
        { fetchJobId, propertyId: job.propertyId, reasonCodes: contextCheck.reasonCodes },
        '[PermitFetchService] skipped after property context recheck',
      );
      return;
    }

    await prisma.permitFetchJob.update({
      where: { id: fetchJobId },
      data: { status: 'RUNNING' },
    });

    const startMs = Date.now();

    try {
      const dataSource = job.dataSource!;
      const propertyAddress: PropertyAddress = {
        street: job.property.address ?? '',
        city: job.property.city ?? '',
        state: job.property.state ?? '',
        postalCode: job.property.zipCode ?? undefined,
      };

      let rawRecords;
      if (dataSource.adapterType === 'SOCRATA') {
        rawRecords = await socrataAdapter.fetchPermits(dataSource, propertyAddress);
      } else if (dataSource.adapterType === 'ACCELA') {
        rawRecords = await accelaAdapter.fetchPermits(dataSource, propertyAddress);
      } else {
        throw new Error(`Unknown adapter type: ${dataSource.adapterType}`);
      }

      const normalized = rawRecords.map((r) =>
        permitNormalizer.normalize(r, dataSource, job.propertyId),
      );

      let inserted = 0;
      for (const record of normalized) {
        try {
          await prisma.propertyPermitRecord.upsert({
            where: { dedupeKey: record.dedupeKey },
            create: record as any,
            update: {},
          });
          inserted++;
        } catch (err) {
          logger.warn({ err, dedupeKey: record.dedupeKey }, '[PermitFetchService] upsert skipped');
        }
      }

      await prisma.permitFetchJob.update({
        where: { id: fetchJobId },
        data: {
          status: 'COMPLETED',
          permitsFound: rawRecords.length,
          permitsInserted: inserted,
          completedAt: new Date(),
          durationMs: Date.now() - startMs,
        },
      });

      await prisma.permitDataSource.update({
        where: { id: dataSource.id },
        data: { lastFetchAt: new Date(), totalPermitsFetched: { increment: inserted } },
      });

      // Cross-cutting W4 fix: gate the chained follow-up job too. Unlike
      // triggerFetch above, this is an automatic secondary step after a
      // successful fetch, not the user's primary action — a blocked
      // decision is logged and skipped, not thrown, so it never turns an
      // otherwise-successful permit fetch into a failure.
      const dtRegistryEntry = JOB_REGISTRY.find((j) => j.key === 'detect-unpermitted-work');
      const dtDecision = dtRegistryEntry
        ? evaluateWorkerExecution('detect-unpermitted-work', 'manual', dtRegistryEntry)
        : { allowed: false, reason: 'missing registry entry' };
      if (dtDecision.allowed) {
        await getDetectUnpermittedWorkQueue().add('detect-unpermitted-work', { propertyId: job.propertyId });
      } else {
        logger.info(
          { propertyId: job.propertyId, reason: dtDecision.reason },
          '[PermitFetchService] detect-unpermitted-work enqueue skipped by worker execution policy',
        );
      }
    } catch (err: any) {
      logger.error({ err, fetchJobId }, '[PermitFetchService] runFetch failed');
      await prisma.permitFetchJob.update({
        where: { id: fetchJobId },
        data: {
          status: 'FAILED',
          errorMessage: err?.message ?? 'Unknown error',
          completedAt: new Date(),
          durationMs: Date.now() - startMs,
        },
      });
      if (job.dataSourceId) {
        await prisma.permitDataSource.update({
          where: { id: job.dataSourceId },
          data: { lastFetchError: err?.message ?? 'Unknown error' },
        });
      }
      throw err;
    }
  }

  async getLatestFetchStatus(propertyId: string) {
    const job = await prisma.permitFetchJob.findFirst({
      where: { propertyId },
      orderBy: { startedAt: 'desc' },
      include: { dataSource: { select: { name: true } } },
    });

    if (!job) return null;

    return {
      id: job.id,
      status: job.status,
      dataSourceName: job.dataSource?.name,
      permitsFound: job.permitsFound,
      permitsInserted: job.permitsInserted,
      errorMessage: job.errorMessage,
      startedAt: job.startedAt.toISOString(),
      completedAt: job.completedAt?.toISOString(),
    };
  }
}

export const permitFetchService = new PermitFetchService();
