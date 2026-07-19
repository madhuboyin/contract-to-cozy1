import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { getAggregationPropertyContext } from './aggregationContext/context';
import { geminiService } from './gemini.service';
import { GroundedAskResponseSchema, type GroundedAskProposalInput } from '../productFramework/groundedAsk.contract';
import { capturePropertyFact } from '../modules/propertyContext/application/capturePropertyFact';
import { guidanceJourneyService } from './guidanceEngine/guidanceJourney.service';
import { resolvePropertyAccess, ROLE_RANK } from './propertyAccess.service';
import { APIError } from '../middleware/error.middleware';

const humanize = (key: string) => key.split('.').pop()!.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ').replace(/^./, (letter) => letter.toUpperCase());

export async function answerGroundedAsk(input: { userId: string; sessionId: string; message: string; propertyId?: string }) {
  const context = input.propertyId
    ? await getAggregationPropertyContext(input.propertyId, input.userId, 'SEARCH_ASSISTANT')
    : null;
  const rawText = await geminiService.sendMessageToChat(input.userId, input.sessionId, input.message, input.propertyId);
  const facts = context ? Object.values(context.facts) : [];
  const citedFactKeys = new Set([...rawText.matchAll(/\[fact:([a-zA-Z0-9._-]+)\]/g)].map((match) => match[1]));
  const messageTokens = new Set(input.message.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 2));
  const isLexicallyRelevant = (key: string) => key.toLowerCase().split(/[^a-z0-9]+/).some((token) => token.length > 2 && messageTokens.has(token));
  const relevantFacts = facts.filter((fact) => citedFactKeys.has(fact.key) || (!citedFactKeys.size && isLexicallyRelevant(fact.key)));
  const known = relevantFacts.filter((fact) => fact.state === 'KNOWN');
  const missing = relevantFacts.filter((fact) => fact.state !== 'KNOWN');
  const averageConfidence = known.length === 0 ? null : known.reduce((sum, fact) => sum + (fact.confidence ?? (fact.verified ? 1 : 0.6)), 0) / known.length;
  const confidenceLabel = averageConfidence == null || averageConfidence < 0.55 ? 'LOW' : averageConfidence < 0.8 ? 'MEDIUM' : 'HIGH';
  return GroundedAskResponseSchema.parse({
    text: rawText.replace(/\s*\[fact:[a-zA-Z0-9._-]+\]/g, '').trim(),
    groundingMode: context ? 'PROPERTY' : 'GENERAL',
    knownFacts: known.map((fact) => ({ key: fact.key, label: humanize(fact.key), value: fact.value, source: fact.source, observedAt: fact.observedAt })),
    assumptions: context
      ? (known.length ? [] : ['No Living Home Record fact was identified as evidence for this answer.'])
      : ['No property was selected, so this answer is general educational guidance.'],
    missingFacts: missing.map((fact) => fact.key),
    evidence: known.map((fact) => ({ factKey: fact.key, label: humanize(fact.key), source: fact.source, observedAt: fact.observedAt, confidence: fact.confidence })),
    confidence: {
      score: averageConfidence == null ? null : Number(averageConfidence.toFixed(4)),
      label: confidenceLabel,
      rationale: context ? `${known.length} cited or question-relevant facts support this answer; ${missing.length} relevant facts remain unknown, stale, or conflicted.` : 'General guidance is not supported by a selected Living Home Record.',
    },
    safetyBoundary: 'This answer is educational and does not replace emergency services, a licensed professional, controlling contract or policy language, or an authority having jurisdiction.',
    nextAction: context
      ? (known.length ? 'Review the cited facts and correct or add evidence before acting on a material recommendation.' : 'Add or verify the relevant home facts before relying on this answer for a material action.')
      : 'Select a property to receive an answer grounded in its Living Home Record.',
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
  const proposal = await prisma.groundedAskProposal.findFirst({ where: { id: proposalId, userId }, include: { artifact: true } });
  if (!proposal) return null;
  if (proposal.artifact) return proposal.artifact;
  if (proposal.status === 'CONFIRMED') throw new Error('Confirmed proposal is missing its execution artifact.');
  if (proposal.status !== 'PENDING') throw new Error('Only pending proposals can be confirmed.');
  if (proposal.propertyId) await getAggregationPropertyContext(proposal.propertyId, userId, 'SEARCH_ASSISTANT');
  if (proposal.propertyId && ['ADD_FACT', 'CORRECT_FACT', 'CREATE_TASK', 'START_JOURNEY', 'COMPARE_OPTIONS'].includes(proposal.kind)) {
    const access = await resolvePropertyAccess(userId, proposal.propertyId);
    if (!access || ROLE_RANK[access.role] < ROLE_RANK.CONTRIBUTOR) {
      throw new APIError('Contributor access is required to confirm this Ask proposal.', 403, 'GROUNDED_ASK_CONTRIBUTOR_REQUIRED');
    }
  }
  const payload = proposal.payloadJson as Record<string, unknown>;

  if (proposal.kind === 'ADD_FACT' || proposal.kind === 'CORRECT_FACT') {
    if (!proposal.propertyId) throw new Error('Fact proposal has no property context.');
    const claimed = await prisma.groundedAskProposal.updateMany({
      where: { id: proposal.id, userId, status: 'PENDING' },
      data: { status: 'CONFIRMED', confirmedAt: new Date() },
    });
    if (claimed.count === 0) throw new Error('Proposal was already handled.');
    try {
      const captured = await capturePropertyFact(proposal.propertyId, userId, String(payload.factKey), {
        value: payload.value,
        sourceType: 'USER_REPORTED',
        confidence: 0.9,
      });
      return await prisma.groundedAskArtifact.create({
        data: {
          proposalId: proposal.id, userId, propertyId: proposal.propertyId,
          artifactType: 'PropertyFact',
          artifactJson: {
            proposalSummary: proposal.summary,
            factKey: payload.factKey,
            operation: proposal.kind,
            contextVersion: captured.contextVersion,
            evidenceIds: captured.evidenceIds,
            confirmedByUserId: userId,
          } as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      await prisma.groundedAskProposal.updateMany({
        where: { id: proposal.id, userId, status: 'CONFIRMED' },
        data: { status: 'PENDING', confirmedAt: null },
      });
      throw error;
    }
  }

  if (proposal.kind === 'START_JOURNEY') {
    if (!proposal.propertyId) throw new Error('Journey proposal has no property context.');
    const claimed = await prisma.groundedAskProposal.updateMany({
      where: { id: proposal.id, userId, status: 'PENDING' },
      data: { status: 'CONFIRMED', confirmedAt: new Date() },
    });
    if (claimed.count === 0) throw new Error('Proposal was already handled.');
    try {
      const journey = await guidanceJourneyService.createUserInitiatedJourney(proposal.propertyId, {
        scopeCategory: payload.scopeCategory as 'ITEM' | 'SERVICE',
        scopeId: String(payload.scopeId),
        issueType: String(payload.issueType),
        inventoryItemId: typeof payload.inventoryItemId === 'string' ? payload.inventoryItemId : null,
        serviceKey: typeof payload.serviceKey === 'string' ? payload.serviceKey : null,
      }, userId);
      return await prisma.groundedAskArtifact.create({
        data: {
          proposalId: proposal.id, userId, propertyId: proposal.propertyId,
          artifactType: 'GuidanceJourney',
          artifactJson: { proposalSummary: proposal.summary, linkedEntity: { type: 'GuidanceJourney', id: journey.id }, confirmedByUserId: userId } as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      await prisma.groundedAskProposal.updateMany({
        where: { id: proposal.id, userId, status: 'CONFIRMED' },
        data: { status: 'PENDING', confirmedAt: null },
      });
      throw error;
    }
  }

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
    if (proposal.kind === 'COMPARE_OPTIONS') {
      if (!proposal.propertyId) throw new Error('Comparison proposal has no property context.');
      const inventoryItemId = typeof payload.inventoryItemId === 'string' ? payload.inventoryItemId : null;
      if (inventoryItemId) {
        const item = await tx.inventoryItem.findFirst({ where: { id: inventoryItemId, propertyId: proposal.propertyId }, select: { id: true } });
        if (!item) throw new Error('Comparison inventory item does not belong to the selected property.');
      }
      const workspace = await tx.quoteComparisonWorkspace.create({
        data: {
          propertyId: proposal.propertyId,
          createdByUserId: userId,
          inventoryItemId,
          scopeSummary: String(payload.scopeSummary),
          notes: typeof payload.notes === 'string' ? payload.notes : `Created from Grounded Ask proposal ${proposal.id}`,
        },
      });
      linkedEntity = { type: 'QuoteComparisonWorkspace', id: workspace.id };
    }
    if (proposal.kind === 'UPLOAD_EVIDENCE') {
      if (!proposal.propertyId) throw new Error('Evidence proposal has no property context.');
      const document = await tx.document.findFirst({
        where: { id: String(payload.documentId), propertyId: proposal.propertyId, uploadedBy: userId },
        select: { id: true },
      });
      if (!document) throw new Error('Uploaded evidence was not found for this user and property.');
      linkedEntity = { type: 'Document', id: document.id };
    }
    return tx.groundedAskArtifact.create({
      data: {
        proposalId: proposal.id, userId, propertyId: proposal.propertyId,
        artifactType: linkedEntity?.type ?? proposal.kind,
        artifactJson: {
          proposalSummary: proposal.summary,
          payload,
          linkedEntity,
          note: proposal.kind === 'ADD_NOTE' ? String(payload.note) : undefined,
          confirmedByUserId: userId,
        } as Prisma.InputJsonValue,
      },
    });
  });
}

export async function rejectGroundedAskProposal(userId: string, proposalId: string) {
  return prisma.groundedAskProposal.updateMany({ where: { id: proposalId, userId, status: 'PENDING' }, data: { status: 'REJECTED', rejectedAt: new Date() } });
}
