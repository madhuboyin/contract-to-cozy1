import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { readAskOperationalControls } from '../../config/askOperationalControls';
import { ASK_RESPONSE_SCHEMA_VERSION, type AskPresentationBlock } from '../../productFramework/ask/ask.contract';
import { getAskOperationDefinition, type AskOperationId } from './askOperationRegistry';
import { resolvePropertyAccess } from '../propertyAccess.service';

export type AskNotificationContinuationInput = {
  userId: string;
  propertyId: string;
  triggerKey: string;
  operationId: Extract<AskOperationId, 'REFINANCE_ANALYSIS' | 'MAINTENANCE_STATUS'>;
  question: string;
  reasonCode: string;
  title: string;
  body: string;
  tone: 'DEFAULT' | 'CAUTION' | 'POSITIVE' | 'CRITICAL';
  details: Array<{ label: string; value: string }>;
  domainAction: { id: string; label: string; href: string };
  parameters: Record<string, unknown>;
  suggestions: string[];
};

function stableId(prefix: string, value: string): string {
  return `${prefix}-${createHash('sha256').update(value).digest('hex').slice(0, 32)}`;
}

export async function createAskNotificationContinuation(input: AskNotificationContinuationInput): Promise<{
  executionId: string;
  sessionId: string;
  actionUrl: string;
}> {
  const access = await resolvePropertyAccess(input.userId, input.propertyId);
  if (!access) throw new Error('Property access is unavailable for this Ask notification continuation.');

  const controls = readAskOperationalControls();
  const expiresAt = new Date(Date.now() + controls.rawConversationRetentionDays * 24 * 60 * 60 * 1000);
  const definition = getAskOperationDefinition(input.operationId);
  const identity = `${input.userId}:${input.propertyId}:${input.triggerKey}`;
  const sessionId = stableId('ask-notification-session', identity);
  const clientRequestId = stableId('ask-notification-execution', identity);
  const domainAction = { ...input.domainAction, style: 'SECONDARY' as const };
  const blocks: AskPresentationBlock[] = [
    {
      type: 'SUMMARY',
      id: 'monitor-trigger-summary',
      title: input.title,
      body: input.body,
      tone: input.tone,
      actions: [domainAction],
    },
    {
      type: 'WORKFLOW_PROGRESS',
      id: 'monitor-trigger-details',
      title: 'What changed and what to do next',
      status: 'PENDING',
      description: 'This result was created from a governed monitor signal. Review the recorded details before taking action.',
      details: input.details,
      actions: [domainAction],
    },
  ];

  const execution = await prisma.$transaction(async (tx) => {
    await tx.askSession.upsert({
      where: { id: sessionId },
      create: { id: sessionId, userId: input.userId, propertyId: input.propertyId, title: input.title.slice(0, 120), expiresAt },
      update: { lastActiveAt: new Date(), expiresAt },
    });
    const existing = await tx.askExecution.findUnique({
      where: { userId_clientRequestId: { userId: input.userId, clientRequestId } },
    });
    if (existing) return existing;
    const created = await tx.askExecution.create({
      data: {
        sessionId,
        userId: input.userId,
        propertyId: input.propertyId,
        clientRequestId,
        message: input.question,
        launchContextJson: {
          surface: 'MONITOR_NOTIFICATION',
          entityType: 'MONITOR_SIGNAL',
          actionId: input.triggerKey,
          returnTo: input.domainAction.href,
        } as Prisma.InputJsonValue,
        operationId: definition.operationId,
        operationVersion: definition.version,
        intentFamily: definition.family,
        intentConfidence: 1,
        status: 'ANSWERED',
        reasonCode: input.reasonCode,
        parametersJson: input.parameters as Prisma.InputJsonValue,
        resultJson: {
          schemaVersion: ASK_RESPONSE_SCHEMA_VERSION,
          blocks,
          captureRequests: [],
          confirmation: null,
          clarification: null,
          suggestions: input.suggestions.slice(0, 5),
        } as Prisma.InputJsonValue,
        completedAt: new Date(),
        expiresAt,
      },
    });
    await tx.askExecutionEvent.create({
      data: {
        executionId: created.id,
        eventType: 'MONITOR_NOTIFICATION_CREATED',
        metadataJson: { triggerKey: input.triggerKey, operationId: input.operationId } as Prisma.InputJsonValue,
      },
    });
    return created;
  });

  const actionUrl = `/dashboard/ask?propertyId=${encodeURIComponent(input.propertyId)}&sessionId=${encodeURIComponent(sessionId)}&executionId=${encodeURIComponent(execution.id)}&from=notification`;
  return { executionId: execution.id, sessionId, actionUrl };
}
