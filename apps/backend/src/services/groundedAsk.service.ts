// Ask Cozy Stage 3 retirement, 2026-09-14 (implementation plan §8/§9; FRD
// §23). createGroundedAskProposal/confirmGroundedAskProposal/
// rejectGroundedAskProposal (and the GroundedAskProposal/GroundedAskArtifact
// Prisma models backing them) are removed: all 7 legacy proposal kinds have
// had real, independent parity in the new AskExecution-based capture/confirm
// system since the EVIDENCE capture writer shipped, and this repo-wide grep
// confirmed zero current callers of the create/confirm/reject endpoints or
// their frontend API-client methods before deletion. This is a retirement of
// dead code, not a fix for a newly-discovered regression -- the legacy
// UPLOAD_EVIDENCE gap this system always had was already disclosed, not new.
//
// The replacement is not a literal behavior mirror -- two differences are
// intentional, approved scope changes, not gaps: ADD_NOTE's new-system
// equivalent (a conversationally-extracted EVENT of type NOTE) is
// necessarily property-scoped, where a legacy ADD_NOTE proposal could be
// created with no property at all; and evidence attachment now requires a
// same-batch, paired EVENT candidate (CAPTURE_EVIDENCE_CONFIRM), where the
// legacy UPLOAD_EVIDENCE proposal was a standalone, unpaired reference with
// no HomeEvent link. See groundedAskProposalRetirement.test.js for the
// retirement-completeness checks and a pointer to where confirm/reject/
// retry/evidence-attachment coverage for the replacement lives.
//
// answerGroundedAsk itself is NOT part of this retirement -- it remains the
// live GROUNDED_GUIDANCE operation handler, called directly by
// askOrchestrator.service.ts, and is untouched below.
import { getAggregationPropertyContext } from './aggregationContext/context';
import { geminiService } from './gemini.service';
import { GroundedAskResponseSchema } from '../productFramework/groundedAsk.contract';
import { KnowledgeHubService, type KnowledgeHubArticleListItem } from './knowledgeHub.service';
import { selectAskGeneralGuidance, type AskGeneralGuidanceEntry } from './ask/askGeneralGuidanceCatalog';
import { selectRelevantAskFacts } from './ask/askPromptMinimization';
import type { PropertyFact, PropertyFactSource } from '../modules/propertyContext';
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

export async function answerGroundedAsk(input: {
  userId: string;
  sessionId: string;
  message: string;
  propertyId?: string;
  // External review [P1] follow-up (MAINT-008): a task's own notes/
  // description can carry task-specific rationale ("unit is undersized,
  // run more in summer") that no property-aggregation fact will ever
  // capture. Previously the only way a caller could surface that was
  // folding it into the free-text question, which this function's fact
  // selection never actually reads (selectRelevantAskFacts scores fact
  // KEYS against the question, not fact values) -- so a task with real
  // notes but no matching aggregation fact still fell through to the
  // generic unsupported-answer text below. anchorFact lets a caller
  // (groundedGuidanceResult) supply exactly one pre-resolved, guaranteed-
  // relevant fact from outside the aggregation snapshot; it flows through
  // the SAME deterministic candidate-generation / Gemini-selection /
  // deterministic-rendering pipeline as every other fact (the model still
  // only ever selects a candidate, never originates text -- see
  // askRemoteFallbackTypedClaims.ts's own documented invariant), so it can
  // now actually appear in the answer, not just a decorative evidence line.
  anchorFact?: { key: string; value: string; source: PropertyFactSource; observedAt: string; confidence: number };
}) {
  const context = input.propertyId
    ? await getAggregationPropertyContext(input.propertyId, input.userId, 'SEARCH_ASSISTANT')
    : null;
  const anchorPropertyFact: PropertyFact | null = context && input.anchorFact ? {
    key: input.anchorFact.key,
    value: input.anchorFact.value,
    state: 'KNOWN',
    source: input.anchorFact.source,
    verified: false,
    confidence: input.anchorFact.confidence,
    observedAt: input.anchorFact.observedAt,
    validUntil: null,
    correctionPath: null,
  } : null;
  const facts = context ? [...Object.values(context.facts), ...(anchorPropertyFact ? [anchorPropertyFact] : [])] : [];
  const generalGuidance = context ? null : await approvedGeneralGuidance(input.message);
  const generalId = generalGuidance?.kind === 'PUBLISHED_ARTICLE' ? generalGuidance.article.slug : generalGuidance?.entry.id;
  const generalTitle = generalGuidance?.kind === 'PUBLISHED_ARTICLE' ? generalGuidance.article.title : generalGuidance?.entry.title;
  const generalText = generalGuidance?.kind === 'PUBLISHED_ARTICLE'
    ? generalGuidance.article.excerpt?.trim() || generalGuidance.article.subtitle!.trim()
    : generalGuidance?.entry.guidance;
  const generalObservedAt = generalGuidance?.kind === 'PUBLISHED_ARTICLE' ? generalGuidance.article.publishedAt : null;
  const generalSource = generalGuidance?.kind === 'PUBLISHED_ARTICLE' ? 'ContractToCozy Knowledge Hub' : 'ContractToCozy curated guidance v1';
  const scoredRelevantFacts = selectRelevantAskFacts(input.message, facts);
  // selectRelevantAskFacts ranks by token overlap between the QUESTION and
  // each fact's KEY -- built for descriptive aggregation keys like
  // "hvac.filterLastReplaced", not a fact we already know is relevant
  // because we resolved the exact task the question is about. Force it in
  // rather than leave its inclusion to a heuristic it wasn't designed for.
  const relevantFacts = anchorPropertyFact && !scoredRelevantFacts.some((fact) => fact.key === anchorPropertyFact.key)
    ? [{ key: anchorPropertyFact.key, state: anchorPropertyFact.state, value: anchorPropertyFact.value }, ...scoredRelevantFacts]
    : scoredRelevantFacts;
  const knownCandidates: AskRemoteFallbackFact[] = relevantFacts.flatMap((selected) => {
    const fact = anchorPropertyFact?.key === selected.key ? anchorPropertyFact : context?.facts[selected.key];
    return fact?.state === 'KNOWN' && fact.value !== null ? [{
      key: fact.key,
      value: selected.value,
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
