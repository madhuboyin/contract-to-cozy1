import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { HomeAction } from '../productFramework';
import { emitHomeActionsSurfaced, emitNorthStarLineageEvent } from './analytics';
import {
  getActivationFirstValue,
  getEntryContext,
  recordFirstActionResolution,
} from './entryContext.service';
import { getOrchestrationSummary } from './orchestration.service';
import { recordOrchestrationEvent } from './orchestrationEvent.service';
import { snoozeAction } from './orchestrationSnooze.service';

export const HOME_ACTION_COMMANDS = [
  'COMPLETE',
  'DEFER',
  'SNOOZE',
  'DISMISS',
  'ALREADY_DONE',
  'NOT_RELEVANT',
  'CORRECT_FACT',
] as const;

export const HomeActionCommandSchema = z.object({
  command: z.enum(HOME_ACTION_COMMANDS),
  reason: z.string().trim().min(1).max(1000).nullable().optional(),
  nextTriggerAt: z.string().datetime().nullable().optional(),
  consequenceAcknowledged: z.boolean().default(false),
}).superRefine((value, ctx) => {
  if (['DEFER', 'SNOOZE'].includes(value.command) && !value.nextTriggerAt) {
    ctx.addIssue({
      code: 'custom',
      path: ['nextTriggerAt'],
      message: `${value.command} requires a next trigger date.`,
    });
  }
  if (['DEFER', 'DISMISS', 'NOT_RELEVANT'].includes(value.command) && !value.consequenceAcknowledged) {
    ctx.addIssue({
      code: 'custom',
      path: ['consequenceAcknowledged'],
      message: `${value.command} requires consequence acknowledgement.`,
    });
  }
});

export type HomeActionCommandInput = z.infer<typeof HomeActionCommandSchema>;

type RankingComponents = {
  consequence: number;
  urgency: number;
  confidence: number;
  householdRelevance: number;
  actionability: number;
  missingContextPenalty: number;
};

export type RankedHomeAction = HomeAction & {
  ranking: {
    rank: number;
    score: number;
    explanation: string;
    components: RankingComponents;
  };
  deduplication: {
    canonicalKey: string;
    mergedActionIds: string[];
  };
};

const CONSEQUENCE_SCORE: Record<HomeAction['governance']['safetyTier'], number> = {
  SAFETY_EMERGENCY: 40,
  REGULATED_COVERAGE: 32,
  MATERIAL_FINANCIAL: 28,
  LOW_CONSEQUENCE: 12,
};

const URGENCY_SCORE: Record<HomeAction['priority'], number> = {
  NOW: 30,
  SOON: 22,
  PLAN: 12,
  CONSIDER: 4,
};

const JOB_SCORE: Record<HomeAction['job'], number> = {
  MAJOR_MOMENT: 12,
  DECIDE: 10,
  STAY_AHEAD: 8,
};

function normalizedSignal(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, '-').slice(0, 160);
}

export function homeActionCanonicalKey(action: HomeAction): string {
  const signal = normalizedSignal(action.signal);
  if (signal) return `signal:${signal}`;
  if (action.lineageId) return `lineage:${action.lineageId}`;
  return `entity:${action.source.entityId}`;
}

export function scoreHomeAction(action: HomeAction): { score: number; components: RankingComponents; explanation: string } {
  const confidence = Math.round((action.confidence.score ?? 0.5) * 10);
  const missingContextPenalty = Math.min(15, action.confidence.missing.length * 3);
  const actionability = action.primaryCta.href && action.primaryCta.label ? 8 : 0;
  const components: RankingComponents = {
    consequence: CONSEQUENCE_SCORE[action.governance.safetyTier],
    urgency: URGENCY_SCORE[action.priority],
    confidence,
    householdRelevance: JOB_SCORE[action.job],
    actionability,
    missingContextPenalty,
  };
  const score = components.consequence + components.urgency + components.confidence +
    components.householdRelevance + components.actionability - components.missingContextPenalty;
  const explanation = [
    `${action.priority === 'NOW' ? 'Immediate' : action.priority === 'SOON' ? 'Time-sensitive' : action.priority === 'PLAN' ? 'Plannable' : 'Optional'} timing`,
    `${action.governance.safetyTier.toLowerCase().replace(/_/g, ' ')} consequence`,
    `${action.confidence.label.toLowerCase()} confidence`,
    missingContextPenalty > 0 ? `${action.confidence.missing.length} missing context item${action.confidence.missing.length === 1 ? '' : 's'} lowered priority` : 'no missing-context penalty',
  ].join(' · ');
  return { score, components, explanation };
}

export function rankAndDeduplicateHomeActions(actions: HomeAction[]): RankedHomeAction[] {
  const byCanonicalKey = new Map<string, { winner: HomeAction; score: ReturnType<typeof scoreHomeAction>; ids: string[] }>();

  for (const action of actions) {
    const canonicalKey = homeActionCanonicalKey(action);
    const scored = scoreHomeAction(action);
    const current = byCanonicalKey.get(canonicalKey);
    if (!current) {
      byCanonicalKey.set(canonicalKey, { winner: action, score: scored, ids: [action.id] });
      continue;
    }
    current.ids.push(action.id);
    if (scored.score > current.score.score ||
      (scored.score === current.score.score && action.id.localeCompare(current.winner.id) < 0)) {
      current.winner = action;
      current.score = scored;
    }
  }

  return [...byCanonicalKey.entries()]
    .sort(([, a], [, b]) => b.score.score - a.score.score || a.winner.id.localeCompare(b.winner.id))
    .map(([canonicalKey, entry], index) => ({
      ...entry.winner,
      ranking: { rank: index + 1, ...entry.score },
      deduplication: {
        canonicalKey,
        mergedActionIds: [...new Set(entry.ids)].filter((id) => id !== entry.winner.id),
      },
    }));
}

export async function getHomeActionFeed(propertyId: string, userId: string) {
  const orchestration = await getOrchestrationSummary(propertyId, userId);
  const candidates: HomeAction[] = [...orchestration.homeActions];
  const entryContext = await getEntryContext(propertyId, userId);

  if (entryContext && !entryContext.firstValue.firstActionResolvedAt) {
    const activation = await getActivationFirstValue(propertyId, userId);
    candidates.push(activation.action);
    for (const bucket of Object.values(activation.plan)) candidates.push(...bucket);
  }

  const actions = rankAndDeduplicateHomeActions(candidates);
  emitHomeActionsSurfaced({ propertyId, userId, actions, source: 'phase2_home_actions' });

  return {
    contractVersion: 'phase2-v1',
    propertyId,
    generatedAt: new Date().toISOString(),
    actions,
    buckets: {
      NOW: actions.filter((action) => action.priority === 'NOW'),
      SOON: actions.filter((action) => action.priority === 'SOON'),
      PLAN: actions.filter((action) => action.priority === 'PLAN'),
      CONSIDER: actions.filter((action) => action.priority === 'CONSIDER'),
    },
    diagnostics: {
      candidateCount: candidates.length,
      surfacedCount: actions.length,
      duplicateCount: candidates.length - actions.length,
      suppressedCount: orchestration.suppressedActions.length,
      snoozedCount: orchestration.snoozedActions.length,
    },
  };
}

function validateNextTriggerAt(value: string | null | undefined): Date {
  const date = new Date(value ?? '');
  const max = new Date();
  max.setDate(max.getDate() + 365);
  if (!value || Number.isNaN(date.getTime()) || date <= new Date() || date > max) {
    throw new Error('The next trigger date must be in the future and within 365 days.');
  }
  return date;
}

function resolutionDisposition(command: HomeActionCommandInput['command']) {
  if (command === 'COMPLETE' || command === 'ALREADY_DONE') return 'COMPLETED' as const;
  if (command === 'DEFER' || command === 'SNOOZE') return 'INTENTIONALLY_DEFERRED' as const;
  return 'DELIBERATELY_DISMISSED' as const;
}

export async function executeHomeActionCommand(
  propertyId: string,
  actionId: string,
  userId: string,
  rawInput: unknown,
) {
  const input = HomeActionCommandSchema.parse(rawInput);
  const feed = await getHomeActionFeed(propertyId, userId);
  const action = feed.actions.find((candidate) => candidate.id === actionId);
  if (!action) throw new Error('Home action was not found or is no longer actionable.');
  if (!action.feedbackControls.includes(input.command)) {
    throw new Error(`${input.command} is not supported for this home action.`);
  }
  if (action.governance.safetyTier === 'SAFETY_EMERGENCY' &&
    ['DEFER', 'DISMISS', 'NOT_RELEVANT'].includes(input.command)) {
    throw new Error('Safety and emergency actions cannot be deferred or dismissed from the default action feed.');
  }

  if (input.command === 'CORRECT_FACT') {
    const correction = [action.primaryCta, ...action.secondaryCtas]
      .find((cta) => cta.kind === 'CORRECT_FACT');
    return {
      actionId,
      command: input.command,
      state: action.state,
      correctionHref: correction?.href ?? `/dashboard/properties/${propertyId}/onboarding`,
      recordedAt: new Date().toISOString(),
    };
  }

  const reason = input.reason ?? `${input.command.toLowerCase().replace(/_/g, ' ')} from Home`;
  const nextTriggerAt = ['DEFER', 'SNOOZE'].includes(input.command)
    ? validateNextTriggerAt(input.nextTriggerAt)
    : null;

  if (action.id.startsWith('activation:')) {
    const result = await recordFirstActionResolution(propertyId, userId, {
      disposition: resolutionDisposition(input.command),
      reason,
      consequenceAcknowledged: input.consequenceAcknowledged || ['COMPLETE', 'ALREADY_DONE'].includes(input.command),
      nextTriggerAt: nextTriggerAt?.toISOString() ?? null,
    });
    return { ...result, command: input.command };
  }

  if (nextTriggerAt) {
    await snoozeAction({ propertyId, actionKey: action.id, snoozeUntil: nextTriggerAt, snoozeReason: reason });
  } else {
    await recordOrchestrationEvent({
      propertyId,
      actionKey: action.id,
      actionType: ['COMPLETE', 'ALREADY_DONE'].includes(input.command)
        ? 'USER_MARKED_COMPLETE'
        : 'USER_DISMISSED',
      source: 'USER',
      createdBy: userId,
      payload: { command: input.command, reason, consequenceAcknowledged: input.consequenceAcknowledged },
    });
  }

  const resolvedAt = new Date();
  const disposition = resolutionDisposition(input.command);
  emitNorthStarLineageEvent({
    eventType: 'HOME_ACTION_RESOLUTION_RECORDED',
    propertyId,
    userId,
    occurredAt: resolvedAt,
    source: 'phase2_home_action_command',
    entryId: `home:${propertyId}`,
    triggerId: `trigger:home-action:${action.lineageId}`,
    signalId: action.lineageId,
    actionId: action.id,
    recommendationVersion: action.source.version ?? 'phase2-v1',
    journeyId: action.relatedJourneyId,
    executionId: randomUUID(),
    resolutionDisposition: disposition,
    verificationStatus: disposition === 'COMPLETED' ? 'PENDING' : 'NOT_REQUIRED',
    resolutionReason: reason,
    consequenceAcknowledged: input.consequenceAcknowledged || disposition === 'COMPLETED',
    nextTriggerAt: nextTriggerAt?.toISOString() ?? null,
    unresolvedSafetyRequirement: false,
  });

  return {
    actionId,
    command: input.command,
    state: nextTriggerAt ? 'SNOOZED' : disposition === 'COMPLETED' ? 'COMPLETED' : 'DISMISSED',
    nextTriggerAt: nextTriggerAt?.toISOString() ?? null,
    recordedAt: resolvedAt.toISOString(),
  };
}
