// apps/backend/src/services/agents/agentInvocationAudit.service.ts
//
// §7.3 / IPD-003: bounded append-only audit for every tool and governed LLM
// call in an agent run. Stores metadata, hashes, and references only — never
// raw property context, documents, secrets, or an unredacted prompt. Each row
// carries a creation-stamped expiresAt on the invocation retention clock.

import { createHash } from 'node:crypto';
import { prisma } from '../../lib/prisma';
import { addDays, readAgentRuntimeControls } from '../../config/agentRuntimeControls';

type AuditDb = Pick<typeof prisma, 'toolInvocation' | 'llmInvocation'>;

const REDACTION_VERSION = '1';

export function boundedHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex');
}

function invocationExpiry(now: Date): Date {
  return addDays(now, readAgentRuntimeControls().invocationRetentionDays);
}

export interface ToolInvocationRecord {
  runId: string;
  correlationId: string;
  sequence: number;
  toolId: string;
  toolVersion: string;
  operationId?: string | null;
  input: unknown;
  output?: unknown;
  outcome: 'OK' | 'EMPTY' | 'FAILED' | 'ABSTAINED';
  errorCode?: string | null;
  startedAt: Date;
  finishedAt: Date;
}

export async function recordToolInvocation(record: ToolInvocationRecord, db: AuditDb = prisma): Promise<void> {
  await db.toolInvocation.create({
    data: {
      runId: record.runId,
      correlationId: record.correlationId,
      sequence: record.sequence,
      toolId: record.toolId,
      toolVersion: record.toolVersion,
      operationId: record.operationId ?? null,
      inputHash: boundedHash(record.input),
      outputHash: record.output === undefined ? null : boundedHash(record.output),
      outcome: record.outcome,
      errorCode: record.errorCode ?? null,
      startedAt: record.startedAt,
      finishedAt: record.finishedAt,
      durationMs: Math.max(0, record.finishedAt.getTime() - record.startedAt.getTime()),
      redactionVersion: REDACTION_VERSION,
      expiresAt: invocationExpiry(record.finishedAt),
    },
  });
}

export interface LlmInvocationRecord {
  runId: string;
  correlationId: string;
  sequence: number;
  purpose: string;
  modelId: string;
  policyId?: string | null;
  prompt: unknown;
  response?: unknown;
  typedClaimIds: readonly string[];
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  outcome: 'OK' | 'REJECTED' | 'FAILED';
  errorCode?: string | null;
  startedAt: Date;
  finishedAt: Date;
}

export async function recordLlmInvocation(record: LlmInvocationRecord, db: AuditDb = prisma): Promise<void> {
  await db.llmInvocation.create({
    data: {
      runId: record.runId,
      correlationId: record.correlationId,
      sequence: record.sequence,
      purpose: record.purpose,
      modelId: record.modelId,
      policyId: record.policyId ?? null,
      promptHash: boundedHash(record.prompt),
      responseHash: record.response === undefined ? null : boundedHash(record.response),
      typedClaimIdsJson: [...record.typedClaimIds],
      inputTokens: record.inputTokens ?? 0,
      outputTokens: record.outputTokens ?? 0,
      costUsd: record.costUsd ?? 0,
      outcome: record.outcome,
      errorCode: record.errorCode ?? null,
      startedAt: record.startedAt,
      finishedAt: record.finishedAt,
      durationMs: Math.max(0, record.finishedAt.getTime() - record.startedAt.getTime()),
      redactionVersion: REDACTION_VERSION,
      expiresAt: invocationExpiry(record.finishedAt),
    },
  });
}
