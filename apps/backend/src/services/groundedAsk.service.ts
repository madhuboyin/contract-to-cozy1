import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { getAggregationPropertyContext } from './aggregationContext/context';
import { geminiService } from './gemini.service';
import { GroundedAskResponseSchema, type GroundedAskProposalInput } from '../productFramework/groundedAsk.contract';
import { capturePropertyFact } from '../modules/propertyContext/application/capturePropertyFact';
import { guidanceJourneyService } from './guidanceEngine/guidanceJourney.service';
import { resolvePropertyAccess, ROLE_RANK } from './propertyAccess.service';
import { APIError } from '../middleware/error.middleware';
import { KnowledgeHubService, type KnowledgeHubArticleListItem } from './knowledgeHub.service';
import { selectAskGeneralGuidance, type AskGeneralGuidanceEntry } from './ask/askGeneralGuidanceCatalog';
import { selectRelevantAskFacts } from './ask/askPromptMinimization';
import {
  selectAndRenderAskRemoteFallbackClaims,
  type AskRemoteFallbackFact,
} from './ask/askRemoteFallbackTypedClaims';

const humanize = (key: string) => key.split('.').pop()!.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ').replace(/^./, (letter) => letter.toUpperCase());
const knowledgeHub = new KnowledgeHubService();

const GUIDANCE_STOP_WORDS = new Set(['about', 'after', 'and', 'are', 'can', 'does', 'for', 'from', 'home', 'how', 'should', 'that', 'the', 'this', 'what', 'when', 'with', 'your']);
function guidanceTokens(value: string): Set<string> {
  return new Set(value.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 2 && !GUIDANCE_STOP_WORDS.has(token)));
}

type GeneralGuidanceSource =
  | { kind: 'PUBLISHED_ARTICLE'; article: KnowledgeHubArticleListItem }
  | { kind: 'CURATED_CATALOG'; entry: AskGeneralGuidanceEntry };

async function approvedGeneralGuidance(message: string): Promise<GeneralGuidanceSource | null> {
  const question = guidanceTokens(message);
  if (!question.size) return null;
  let articles: KnowledgeHubArticleListItem[] = [];
  try {
    articles = await knowledgeHub.getPublishedKnowledgeArticles();
  } catch {
    // The code-owned catalog remains available when editorial storage is
    // temporarily unavailable; no unapproved model prose is substituted.
  }
  const ranked = articles.map((article) => {
    const searchable = [article.title, article.subtitle, article.excerpt, ...article.categories.flatMap((category) => [category.name, category.slug])]
      .filter((value): value is string => Boolean(value)).join(' ');
    const articleTokens = guidanceTokens(searchable);
    const score = [...question].filter((token) => articleTokens.has(token)).length;
    return { article, score };
  }).filter(({ article, score }) => score > 0 && Boolean(article.excerpt?.trim() || article.subtitle?.trim()))
    .sort((left, right) => right.score - left.score || Number(right.article.featured) - Number(left.article.featured) || left.article.sortOrder - right.article.sortOrder);
  if (ranked[0]?.article) return { kind: 'PUBLISHED_ARTICLE', article: ranked[0].article };
  const entry = selectAskGeneralGuidance(message);
  return entry ? { kind: 'CURATED_CATALOG', entry } : null;
}

export async function answerGroundedAsk(input: { userId: string; sessionId: string; message: string; propertyId?: string }) {
  const context = input.propertyId
    ? await getAggregationPropertyContext(input.propertyId, input.userId, 'SEARCH_ASSISTANT')
    : null;
  const facts = context ? Object.values(context.facts) : [];
  const generalGuidance = context ? null : await approvedGeneralGuidance(input.message);
  const generalId = generalGuidance?.kind === 'PUBLISHED_ARTICLE' ? generalGuidance.article.slug : generalGuidance?.entry.id;
  const generalTitle = generalGuidance?.kind === 'PUBLISHED_ARTICLE' ? generalGuidance.article.title : generalGuidance?.entry.title;
  const generalText = generalGuidance?.kind === 'PUBLISHED_ARTICLE'
    ? generalGuidance.article.excerpt?.trim() || generalGuidance.article.subtitle!.trim()
    : generalGuidance?.entry.guidance;
  const generalObservedAt = generalGuidance?.kind === 'PUBLISHED_ARTICLE' ? generalGuidance.article.publishedAt : null;
  const generalSource = generalGuidance?.kind === 'PUBLISHED_ARTICLE' ? 'ContractToCozy Knowledge Hub' : 'ContractToCozy curated guidance v1';
  const relevantFacts = selectRelevantAskFacts(input.message, facts);
  const knownCandidates: AskRemoteFallbackFact[] = relevantFacts.flatMap((selected) => {
    const fact = context?.facts[selected.key];
    return fact?.state === 'KNOWN' && fact.value !== null ? [{
      key: fact.key,
      value: fact.value,
      source: fact.source,
      observedAt: fact.observedAt,
      confidence: fact.confidence,
    }] : [];
  });
  const rendered = context ? await selectAndRenderAskRemoteFallbackClaims({
    question: input.message,
    facts: knownCandidates,
    provider: { select: (request) => geminiService.selectAskRemoteFallbackTypedClaims(request) },
  }) : [];
  const usedFactKeys = new Set(rendered.flatMap((claim) => claim.facts.map((fact) => fact.key)));
  const known = facts.filter((fact) => usedFactKeys.has(fact.key));
  const missing = relevantFacts.filter((fact) => fact.state !== 'KNOWN');
  const averageConfidence = known.length === 0 ? null : known.reduce((sum, fact) => sum + (fact.confidence ?? (fact.verified ? 1 : 0.6)), 0) / known.length;
  const confidenceLabel = averageConfidence == null || averageConfidence < 0.55 ? 'LOW' : averageConfidence < 0.8 ? 'MEDIUM' : 'HIGH';
  return GroundedAskResponseSchema.parse({
    text: rendered.length
      ? rendered.map((claim) => claim.text).join(' ')
      : context
        ? 'The current Living Home Record does not contain a supported severity, deadline, or cost comparison for this question. Ask will not generate an unsupported property-specific answer.'
        : generalGuidance
          ? generalText!
          : 'No relevant published Knowledge Hub guidance is available for this question. Ask will not invent general advice from an unapproved source.',
    groundingMode: context ? 'PROPERTY' : 'GENERAL',
    knownFacts: context
      ? known.map((fact) => ({ key: fact.key, label: humanize(fact.key), value: fact.value, source: fact.source, observedAt: fact.observedAt }))
      : generalGuidance ? [{ key: `knowledge.guidance.${generalId}`, label: generalTitle!, value: generalText, source: generalSource, observedAt: generalObservedAt }] : [],
    assumptions: context
      ? (known.length ? [] : ['No supported typed claim could be reconstructed from the Living Home Record.'])
      : [generalGuidance ? 'This general answer uses an approved guidance source and does not depend on a property record.' : 'No matching approved general-guidance source was available.'],
    missingFacts: missing.map((fact) => fact.key),
    evidence: context
      ? known.map((fact) => ({ factKey: fact.key, label: humanize(fact.key), source: fact.source, observedAt: fact.observedAt, confidence: fact.confidence }))
      : generalGuidance ? [{ factKey: `knowledge.guidance.${generalId}`, label: generalTitle!, source: generalSource, observedAt: generalObservedAt, confidence: 1 }] : [],
    confidence: {
      score: context ? (averageConfidence == null ? null : Number(averageConfidence.toFixed(4))) : generalGuidance ? 1 : null,
      label: context ? confidenceLabel : generalGuidance ? 'HIGH' : 'LOW',
      rationale: context ? `${known.length} cited or question-relevant facts support this answer; ${missing.length} relevant facts remain unknown, stale, or conflicted.` : generalGuidance?.kind === 'PUBLISHED_ARTICLE' ? 'The answer is reconstructed from a published Knowledge Hub article.' : generalGuidance ? 'The answer is reconstructed from the bounded code-owned general-guidance catalog.' : 'No approved general-guidance source matched the question.',
    },
    safetyBoundary: 'This answer is educational and does not replace emergency services, a licensed professional, controlling contract or policy language, or an authority having jurisdiction.',
    nextAction: context
      ? (known.length ? 'Review the cited facts and correct or add evidence before acting on a material recommendation.' : 'Add or verify the relevant home facts before relying on this answer for a material action.')
      : generalGuidance?.kind === 'PUBLISHED_ARTICLE' ? `Read “${generalTitle}” in the Knowledge Hub for the full published guidance.` : generalGuidance ? 'Use this as a general maintenance starting point and verify the equipment manufacturer guidance or consult a qualified professional when conditions are uncertain.' : 'Browse the Knowledge Hub or ask a record-specific question after selecting a property.',
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
