import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../../lib/prisma';
import {
  radarSourceRunCompletionSchema,
  type RadarSourceRunCompletion,
  type RadarSourceRunCompletionInput,
} from '../contracts';
import {
  RadarSourceRegistryService,
  radarSourceRegistryService,
} from './radarSourceRegistry.service';
import type { WorkerTriggerType } from '../../../config/workerExecutionPolicy';

type RunDb = Pick<
  typeof prisma,
  'radarSourceDefinition' | 'radarSourceRun' | 'radarSourceHealth' | '$transaction'
>;

const beginRunSchema = z.object({
  sourceKey: z.string().min(1),
  correlationId: z.string().min(1).max(200),
  attempt: z.number().int().positive().default(1),
  triggerType: z.enum(['scheduled', 'manual', 'poller']).default('scheduled'),
  startedAt: z.coerce.date().default(() => new Date()),
  metadataJson: z.record(z.string(), z.unknown()).optional(),
});

export type BeginRadarSourceRunInput = z.input<typeof beginRunSchema>;

export type BeginRadarSourceRunResult = {
  runnable: boolean;
  reason: string;
  run: {
    id: string;
    sourceDefinitionId: string;
    status: string;
    correlationId: string;
    attempt: number;
  };
};

export class RadarSourceRunConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RadarSourceRunConflictError';
  }
}

function jsonInput(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export class RadarSourceRunService {
  constructor(
    private readonly db: RunDb = prisma,
    private readonly registry: RadarSourceRegistryService = radarSourceRegistryService,
  ) {}

  async begin(
    input: BeginRadarSourceRunInput,
    env: NodeJS.ProcessEnv = process.env,
  ): Promise<BeginRadarSourceRunResult> {
    const parsed = beginRunSchema.parse(input);
    const source = await this.db.radarSourceDefinition.findUnique({
      where: { key: parsed.sourceKey },
      include: { coverage: true, health: true },
    });
    if (!source) throw new Error(`Unknown Radar source: ${parsed.sourceKey}`);

    const decision = this.registry.executionDecision(
      source,
      parsed.triggerType as WorkerTriggerType,
      env,
    );
    const hasCoverage = source.coverage.length > 0;
    const runnable = decision.allowed && hasCoverage;
    const reason = !decision.allowed
      ? decision.reason
      : !hasCoverage
        ? 'no configured source coverage'
        : 'source is runnable';
    const skipCode = !decision.allowed ? 'EXECUTION_POLICY_BLOCKED' : 'NO_CONFIGURED_COVERAGE';

    const run = await this.db.radarSourceRun.upsert({
      where: {
        sourceDefinitionId_correlationId_attempt: {
          sourceDefinitionId: source.id,
          correlationId: parsed.correlationId,
          attempt: parsed.attempt,
        },
      },
      create: {
        sourceDefinitionId: source.id,
        status: runnable ? 'started' : 'skipped',
        correlationId: parsed.correlationId,
        adapterVersion: source.adapterVersion,
        startedAt: parsed.startedAt,
        ...(!runnable ? {
          finishedAt: parsed.startedAt,
          errorCode: skipCode,
          errorMessage: reason,
        } : {}),
        metadataJson: jsonInput({
          ...(parsed.metadataJson ?? {}),
          triggerType: parsed.triggerType,
          executionDecision: decision,
        }),
        attempt: parsed.attempt,
      },
      // Idempotent retry of the same attempt must not reset a finalized run.
      update: {},
    });

    await this.db.radarSourceHealth.upsert({
      where: { sourceDefinitionId: source.id },
      create: {
        sourceDefinitionId: source.id,
        status: !source.isEnabled ? 'disabled' : 'unknown',
        lastAttemptAt: parsed.startedAt,
        ...(!runnable ? { message: reason } : {}),
      },
      update: {
        lastAttemptAt: parsed.startedAt,
        ...(!source.isEnabled ? { status: 'disabled' as const } : {}),
        ...(!runnable ? { message: reason } : {}),
      },
    });

    return {
      runnable: run.status === 'started',
      reason: run.status === 'started' ? 'source is runnable' : run.errorMessage ?? reason,
      run,
    };
  }

  async complete(
    runId: string,
    input: RadarSourceRunCompletionInput,
  ) {
    const completion = radarSourceRunCompletionSchema.parse(input);

    return this.db.$transaction(async (tx) => {
      const run = await tx.radarSourceRun.findUnique({
        where: { id: runId },
        include: { sourceDefinition: true },
      });
      if (!run) throw new Error(`Unknown Radar source run: ${runId}`);

      if (run.status !== 'started') {
        if (run.status === completion.status) return run;
        throw new RadarSourceRunConflictError(
          `Radar source run ${runId} is already ${run.status}; cannot complete as ${completion.status}`,
        );
      }

      const currentHealth = await tx.radarSourceHealth.findUnique({
        where: { sourceDefinitionId: run.sourceDefinitionId },
      });
      const health = this.healthTransition(
        run.sourceDefinition.isEnabled,
        currentHealth,
        completion,
      );

      const [updatedRun] = await Promise.all([
        tx.radarSourceRun.update({
          where: { id: runId },
          data: {
            status: completion.status,
            finishedAt: completion.finishedAt,
            dataFreshThrough: completion.dataFreshThrough ?? null,
            observationsReceived: completion.observationsReceived,
            observationsRejected: completion.observationsRejected,
            eventsCreated: completion.eventsCreated,
            eventsUpdated: completion.eventsUpdated,
            eventsResolved: completion.eventsResolved,
            propertiesEvaluated: completion.propertiesEvaluated,
            matchesCreated: completion.matchesCreated,
            rateLimitJson: completion.rateLimitJson
              ? jsonInput(completion.rateLimitJson)
              : Prisma.JsonNull,
            errorCode: completion.errorCode ?? null,
            errorMessage: completion.errorMessage ?? null,
            metadataJson: completion.metadataJson
              ? jsonInput(completion.metadataJson)
              : undefined,
          },
        }),
        tx.radarSourceHealth.upsert({
          where: { sourceDefinitionId: run.sourceDefinitionId },
          create: {
            sourceDefinitionId: run.sourceDefinitionId,
            ...health,
          },
          update: health,
        }),
      ]);

      return updatedRun;
    });
  }

  healthTransition(
    sourceEnabled: boolean,
    currentHealth: {
      status: string;
      lastSuccessAt: Date | null;
      dataFreshThrough: Date | null;
      consecutiveFailures: number;
    } | null,
    completion: RadarSourceRunCompletion,
  ) {
    if (!sourceEnabled) {
      return {
        status: 'disabled' as const,
        lastAttemptAt: completion.finishedAt,
        message: 'Source is disabled',
      };
    }

    if (completion.status === 'success' || completion.status === 'successful_empty') {
      return {
        status: 'healthy' as const,
        lastAttemptAt: completion.finishedAt,
        lastSuccessAt: completion.finishedAt,
        dataFreshThrough: completion.dataFreshThrough ?? completion.finishedAt,
        consecutiveFailures: 0,
        message: completion.status === 'successful_empty'
          ? 'Provider completed successfully with no observations'
          : null,
      };
    }

    if (completion.status === 'partial' || completion.status === 'failed') {
      return {
        status: completion.status === 'partial' ? 'degraded' as const : 'failed' as const,
        lastAttemptAt: completion.finishedAt,
        lastSuccessAt: currentHealth?.lastSuccessAt ?? null,
        dataFreshThrough: completion.dataFreshThrough ?? currentHealth?.dataFreshThrough ?? null,
        consecutiveFailures: (currentHealth?.consecutiveFailures ?? 0) + 1,
        message: completion.errorMessage ??
          (completion.status === 'partial' ? 'Source run completed partially' : 'Source run failed'),
      };
    }

    return {
      status: (currentHealth?.status === 'healthy' ? 'healthy' : 'unknown') as 'healthy' | 'unknown',
      lastAttemptAt: completion.finishedAt,
      lastSuccessAt: currentHealth?.lastSuccessAt ?? null,
      dataFreshThrough: currentHealth?.dataFreshThrough ?? null,
      consecutiveFailures: currentHealth?.consecutiveFailures ?? 0,
      message: completion.errorMessage ?? 'Source run was skipped',
    };
  }
}

export const radarSourceRunService = new RadarSourceRunService();
