import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { getAggregationPropertyContext } from './aggregationContext/context';
import { geminiService } from './gemini.service';
import { GroundedAskResponseSchema, type GroundedAskProposalInput } from '../productFramework/groundedAsk.contract';

const humanize = (key: string) => key.split('.').pop()!.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ').replace(/^./, (letter) => letter.toUpperCase());

export async function answerGroundedAsk(input: { userId: string; sessionId: string; message: string; propertyId?: string }) {
  const context = input.propertyId
    ? await getAggregationPropertyContext(input.propertyId, input.userId, 'SEARCH_ASSISTANT')
    : null;
  const text = await geminiService.sendMessageToChat(input.userId, input.sessionId, input.message, input.propertyId);
  const facts = context ? Object.values(context.facts) : [];
  const known = facts.filter((fact) => fact.state === 'KNOWN');
  const missing = facts.filter((fact) => fact.state !== 'KNOWN');
  const averageConfidence = known.length === 0 ? null : known.reduce((sum, fact) => sum + (fact.confidence ?? (fact.verified ? 1 : 0.6)), 0) / known.length;
  const confidenceLabel = averageConfidence == null || averageConfidence < 0.55 ? 'LOW' : averageConfidence < 0.8 ? 'MEDIUM' : 'HIGH';
  return GroundedAskResponseSchema.parse({
    text,
    groundingMode: context ? 'PROPERTY' : 'GENERAL',
    knownFacts: known.map((fact) => ({ key: fact.key, label: humanize(fact.key), value: fact.value, source: fact.source, observedAt: fact.observedAt })),
    assumptions: context ? [] : ['No property was selected, so this answer is general educational guidance.'],
    missingFacts: missing.map((fact) => fact.key),
    evidence: known.map((fact) => ({ factKey: fact.key, label: humanize(fact.key), source: fact.source, observedAt: fact.observedAt, confidence: fact.confidence })),
    confidence: {
      score: averageConfidence == null ? null : Number(averageConfidence.toFixed(4)),
      label: confidenceLabel,
      rationale: context ? `${known.length} current facts support this answer; ${missing.length} facts remain unknown, stale, or conflicted.` : 'General guidance is not supported by a selected Living Home Record.',
    },
    safetyBoundary: 'This answer is educational and does not replace emergency services, a licensed professional, controlling contract or policy language, or an authority having jurisdiction.',
    nextAction: context ? 'Review the cited facts and correct or add evidence before acting on a material recommendation.' : 'Select a property to receive an answer grounded in its Living Home Record.',
    proposals: [],
  });
}

export async function createGroundedAskProposal(userId: string, input: GroundedAskProposalInput) {
  if (input.propertyId) await getAggregationPropertyContext(input.propertyId, userId, 'SEARCH_ASSISTANT');
  return prisma.groundedAskProposal.create({
    data: {
      userId, propertyId: input.propertyId ?? null, sessionId: input.sessionId, kind: input.kind,
      summary: input.summary, payloadJson: input.payload as Prisma.InputJsonValue,
      evidenceJson: input.evidence as Prisma.InputJsonValue,
    },
  });
}

export async function confirmGroundedAskProposal(userId: string, proposalId: string) {
  const proposal = await prisma.groundedAskProposal.findFirst({ where: { id: proposalId, userId } });
  if (!proposal) return null;
  if (proposal.status === 'CONFIRMED') return prisma.groundedAskArtifact.findUnique({ where: { proposalId } });
  if (proposal.status !== 'PENDING') throw new Error('Only pending proposals can be confirmed.');
  if (proposal.propertyId) await getAggregationPropertyContext(proposal.propertyId, userId, 'SEARCH_ASSISTANT');
  const payload = proposal.payloadJson as Record<string, unknown>;
  return prisma.$transaction(async (tx) => {
    const existing = await tx.groundedAskArtifact.findUnique({ where: { proposalId } });
    if (existing) return existing;
    const claimed = await tx.groundedAskProposal.updateMany({ where: { id: proposal.id, userId, status: 'PENDING' }, data: { status: 'CONFIRMED', confirmedAt: new Date() } });
    if (claimed.count === 0) throw new Error('Proposal was already handled.');
    let linkedEntity: { type: string; id: string } | null = null;
    if (proposal.kind === 'CREATE_TASK') {
      if (!proposal.propertyId) throw new Error('Task proposal has no property context.');
      const actionKey = `grounded-ask:${proposal.id}`;
      const task = await tx.propertyMaintenanceTask.upsert({
        where: { propertyId_actionKey: { propertyId: proposal.propertyId, actionKey } },
        create: {
          propertyId: proposal.propertyId, title: String(payload.title),
          description: typeof payload.description === 'string' ? payload.description : null,
          source: 'USER_CREATED', actionKey,
          priority: payload.priority === 'HIGH' || payload.priority === 'LOW' || payload.priority === 'URGENT' ? payload.priority : 'MEDIUM',
          nextDueDate: typeof payload.nextDueDate === 'string' ? new Date(payload.nextDueDate) : null,
        },
        update: {},
      });
      linkedEntity = { type: 'PropertyMaintenanceTask', id: task.id };
    }
    return tx.groundedAskArtifact.create({
      data: {
        proposalId: proposal.id, userId, propertyId: proposal.propertyId,
        artifactType: linkedEntity?.type ?? proposal.kind,
        artifactJson: { proposalSummary: proposal.summary, payload, linkedEntity, confirmedByUserId: userId } as Prisma.InputJsonValue,
      },
    });
  });
}

export async function rejectGroundedAskProposal(userId: string, proposalId: string) {
  return prisma.groundedAskProposal.updateMany({ where: { id: proposalId, userId, status: 'PENDING' }, data: { status: 'REJECTED', rejectedAt: new Date() } });
}
