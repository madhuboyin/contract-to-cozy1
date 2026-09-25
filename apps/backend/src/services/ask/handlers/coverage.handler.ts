// Moved out of askOrchestrator.service.ts unchanged (decomposition, FRD v1.98;
// docs/architecture/ASK_ORCHESTRATOR_DECOMPOSITION_REVIEW.md). The handler registers itself, and the orchestrator
// re-exports the names below so existing imports keep working.
import { HouseholdRole } from '@prisma/client';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { type AskCaptureRequest, type AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import { getCoverageReviewItems, type CoverageReviewGroup } from '../../coverageGap.service';
import { getOrCreateCoverageComparison } from '../../coverageComparison.service';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { evaluateFeatureContext } from '../../../modules/propertyContext/application/evaluateFeatureContext';
import { APIError } from '../../../middleware/error.middleware';
import { humanDate, money } from '../askFormatting';
import { ensurePropertyAccess, MAX_RESULT_ITEMS } from '../askHandlerSupport';

const COVERAGE_GROUP_LABELS: Record<CoverageReviewGroup, string> = {
  NO_COVERAGE: 'No coverage confirmed',
  COVERAGE_UNCLEAR: 'Coverage unclear',
  EXPIRED: 'Expired coverage',
  EXPIRING_SOON: 'Expiring within 90 days',
  EVIDENCE_MISSING: 'Evidence missing',
};

function coverageContextLabel(value: string): string {
  const labels: Record<string, string> = {
    ITEM_CONFIRMATION: 'item confirmation', RESPONSIBILITY: 'responsibility', INSTALLATION_YEAR: 'installation year',
    CONDITION: 'condition', REPLACEMENT_VALUE: 'replacement value', COVERAGE_EVIDENCE: 'coverage evidence',
  };
  return labels[value] ?? value.toLowerCase().replace(/_/g, ' ');
}

async function coverageResult(userId: string, propertyId: string, message: string): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  const reviewHref = `/dashboard/properties/${encodeURIComponent(propertyId)}/inventory?tab=items&smart=gaps`;
  const allItems = await getCoverageReviewItems(propertyId);
  const expiryFocus = /\b(?:expire|expiring|expiry|renewal)\b/i.test(message);
  const evidenceFocus = /\b(?:evidence|document|proof)\b/i.test(message);
  const largestFocus = /\b(?:largest|highest|biggest|most exposure|expensive|high[ -]?value)\b/i.test(message);
  const focused = (expiryFocus
    ? allItems.filter((item) => item.group === 'EXPIRED' || item.group === 'EXPIRING_SOON')
    : evidenceFocus
      ? allItems.filter((item) => item.group === 'EVIDENCE_MISSING' || item.group === 'COVERAGE_UNCLEAR')
      : allItems)
    .sort((a, b) => largestFocus
      ? (b.exposureCents ?? -1) - (a.exposureCents ?? -1)
      : (a.expiryDate?.getTime() ?? Number.MAX_SAFE_INTEGER) - (b.expiryDate?.getTime() ?? Number.MAX_SAFE_INTEGER));

  const captureCandidate = focused.find((item) => item.group === 'COVERAGE_UNCLEAR');
  const evaluation = captureCandidate
    ? await evaluateFeatureContext(propertyId, userId, {
      featureKey: 'COVERAGE_INTELLIGENCE', operationKey: 'ASSESS_ITEM_COVERAGE',
      operationInput: {
        inventoryItemId: captureCandidate.inventoryItemId,
        responsibilityScope: captureCandidate.responsibilityScope,
        hasDisclosedEstimate: captureCandidate.replacementValueSource === 'ESTIMATED',
      },
    })
    : null;
  const activeRequirement = evaluation?.requirements[0];
  const canCapture = access.role !== HouseholdRole.VIEWER
    && activeRequirement
    && activeRequirement.capture.actionKey !== 'PERMISSION_REQUIRED';
  const captureRequests: AskCaptureRequest[] = canCapture ? [{
    requirementId: activeRequirement.requirementId,
    captureKey: activeRequirement.capture.captureKey,
    classification: activeRequirement.classification,
    state: activeRequirement.state,
    title: activeRequirement.capture.title,
    question: activeRequirement.capture.question,
    helpText: activeRequirement.capture.helpText ?? null,
    inputSchema: activeRequirement.capture.inputSchema,
    ...(activeRequirement.currentAnswer === undefined ? {} : { currentAnswer: activeRequirement.currentAnswer }),
    allowNotSure: activeRequirement.capture.allowNotSure,
    sensitivity: activeRequirement.capture.sensitivity,
    destinationLabel: 'Saved to this item’s Home Inventory coverage record',
    confirmationText: 'Save this coverage information and rerun the review.',
    expectedContextVersion: evaluation.contextVersion,
  }] : [];

  const grouped = new Map<CoverageReviewGroup, typeof focused>();
  for (const item of focused) grouped.set(item.group, [...(grouped.get(item.group) ?? []), item]);
  const groupOrder: CoverageReviewGroup[] = ['NO_COVERAGE', 'COVERAGE_UNCLEAR', 'EXPIRED', 'EXPIRING_SOON', 'EVIDENCE_MISSING'];
  const sections = groupOrder.flatMap((group) => {
    const records = grouped.get(group) ?? [];
    if (!records.length) return [];
    return [{
      id: group.toLowerCase(), title: COVERAGE_GROUP_LABELS[group], count: records.length,
      items: records.slice(0, MAX_RESULT_ITEMS).map((item) => ({
        id: item.inventoryItemId, title: item.itemName, description: item.detail, status: group,
        meta: [
          item.roomName ?? item.itemCategory?.toLowerCase().replace(/_/g, ' ') ?? 'Home inventory',
          item.exposureCents == null
            ? 'Replacement value not recorded'
            : `${new Intl.NumberFormat('en-US', { style: 'currency', currency: item.currency, maximumFractionDigits: 0 }).format(item.exposureCents / 100)} ${item.replacementValueSource === 'ESTIMATED' ? 'estimated' : 'recorded'} exposure`,
          item.expiryDate ? `${group === 'EXPIRED' ? 'Expired' : 'Expires'} ${humanDate(item.expiryDate)}` : null,
          item.coverageSources.length ? item.coverageSources.join(' + ') : 'No linked policy or warranty',
          item.missingContext.length ? `Needs: ${item.missingContext.map(coverageContextLabel).join(', ')}` : null,
        ].filter((value): value is string => Boolean(value)),
        href: `${reviewHref}&openItemId=${encodeURIComponent(item.inventoryItemId)}`,
      })),
    }];
  });

  const unclearCount = allItems.filter((item) => item.group === 'COVERAGE_UNCLEAR').length;
  const focusedUnclearCount = focused.filter((item) => item.group === 'COVERAGE_UNCLEAR').length;
  const confirmedGapCount = allItems.filter((item) => item.group === 'NO_COVERAGE' || item.group === 'EXPIRED').length;
  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY', id: 'coverage-summary',
    title: focused.length ? `${focused.length} item${focused.length === 1 ? '' : 's'} match this coverage review` : 'No matching coverage issue was found',
    body: allItems.length
      ? `${confirmedGapCount} confirmed missing or expired, ${unclearCount} unclear, and ${allItems.filter((item) => item.group === 'EVIDENCE_MISSING').length} missing supporting evidence. Unknown records remain separate from confirmed gaps.`
      : 'No material item-level issue is surfaced from the recorded inventory, policies, warranties, responsibilities, and evidence. This is a record review—not a guarantee that every loss is covered.',
    tone: confirmedGapCount || unclearCount ? 'CAUTION' : focused.length ? 'DEFAULT' : 'POSITIVE',
    actions: [{ id: 'open-coverage', label: 'Review or correct coverage', href: reviewHref, style: 'PRIMARY' }],
  }];
  if (sections.length) blocks.push({
    type: 'GROUPED_LIST', filters: [], id: 'coverage-groups', title: 'Coverage review',
    description: `${expiryFocus ? 'Showing expired and soon-to-expire records. ' : evidenceFocus ? 'Showing unclear records and missing evidence. ' : ''}Managed-elsewhere and coverage-not-required items are excluded.`,
    sections, actions: [],
  });
  if (focused.length) blocks.push({
    type: 'EVIDENCE', id: 'coverage-evidence', title: 'Sources and freshness',
    items: focused.slice(0, 30).map((item) => ({
      label: item.itemName,
      source: item.coverageSources.length ? `Home Inventory + ${item.coverageSources.join(' + ')}` : 'Home Inventory coverage record',
      observedAt: item.updatedAt.toISOString(),
    })),
  });
  blocks.push({
    type: 'BOUNDARY', id: 'coverage-boundary', title: 'Record review—not a coverage determination',
    body: 'A linked policy or warranty does not prove a particular loss is covered. Review current terms, exclusions, limits, deductibles, and authoritative documents with the provider before relying on protection.',
    severity: 'INFO', suggestions: [],
  });

  return {
    status: captureRequests.length || focusedUnclearCount ? 'READY_WITH_LIMITATIONS' : 'ANSWERED',
    reasonCode: captureRequests.length
      ? 'COVERAGE_CONTEXT_OPTIONAL'
      : access.role === HouseholdRole.VIEWER && focusedUnclearCount
        ? 'COVERAGE_CONTEXT_WRITE_PERMISSION_REQUIRED'
        : focusedUnclearCount ? 'COVERAGE_STATUS_UNCLEAR' : undefined,
    contextVersion: evaluation?.contextVersion ?? createHash('sha256').update(JSON.stringify(allItems.map((item) => ({ id: item.inventoryItemId, group: item.group, updatedAt: item.updatedAt })))).digest('hex'),
    parameters: captureCandidate ? {
      inventoryItemId: captureCandidate.inventoryItemId,
      responsibilityScope: captureCandidate.responsibilityScope,
      hasDisclosedEstimate: captureCandidate.replacementValueSource === 'ESTIMATED',
    } : undefined,
    captureRequests,
    blocks,
    suggestions: ['Which gaps have the largest exposure?', 'Show warranties expiring soon', 'Which items are missing coverage evidence?'],
  };
}

// Ask Cozy Stage 3, Phase 7 (implementation plan §13; FRD §31
// coverage/insurance candidate). Distinct from COVERAGE_GAPS above --
// per-inventory-item coverage confirmation -- this reads the per-policy
// CoverageComparison (current verified policy vs. alternative options/
// quotes, equivalence status, and any recorded KEEP/CHANGE/SHOP/DEFER/
// PROFESSIONAL_REVIEW decision), the same getOrCreateCoverageComparison
// call getCoverageComparisonWorkspace's own GET route already makes.
// Deliberately read-only: addCoverageComparisonOption (attach a quote/
// term) and recordCoverageDecision are both document/quote-dependent,
// stateful, multi-step writes, out of scope for this first slice.
//
// authorizeProperty inside coverageComparison.service.ts is a raw
// homeownerProfile.userId===userId check -- NOT resolvePropertyAccess,
// so it has no household-role gradient (verified by reading the service
// directly, not assumed equivalent to PropertySaleCaseService.getCase's
// own requireAccess, which Seller Prep's handler relies on to skip a
// redundant check). ensurePropertyAccess is therefore called first here,
// exactly like coverageResult above, to enforce this operation's own
// VIEWER role floor for the household; a legitimate non-owner household
// member who clears that check but is then rejected by the narrower
// authorizeProperty gets a disclosed BLOCKED result below, not a raw 404.
const COVERAGE_COMPARISON_EQUIVALENCE_LABELS: Record<string, string> = {
  BASELINE: 'Current policy',
  EQUIVALENT: 'Equivalent protection',
  NON_EQUIVALENT: 'Different protection',
  INDETERMINATE: 'Not enough confirmed facts to tell',
  MIXED: 'Mixed across options',
};

const COVERAGE_COMPARISON_DECISION_LABELS: Record<string, string> = {
  KEEP: 'Keep current policy',
  CHANGE: 'Switch policy',
  SHOP: 'Keep shopping',
  DEFER: 'Deferred decision',
  PROFESSIONAL_REVIEW: 'Requested professional review',
};

function coverageComparisonPremiumMeta(option: { annualPremium: unknown; currency: string }): string | null {
  if (option.annualPremium == null) return null;
  const amount = typeof option.annualPremium === 'number' ? option.annualPremium : Number(option.annualPremium);
  if (!Number.isFinite(amount)) return null;
  return option.currency === 'USD' ? `${money(amount)}/yr` : `${amount.toFixed(0)} ${option.currency}/yr`;
}

// IW-PRES-016 (FRD v1.86): two to four coverage options (the current policy and its alternatives) as a comparison
// strip; one option, or five and more, stay a grouped list. The premium is declared as an amount so bars are drawn when
// every option is in one currency, but no option is badged or marked leading: the cheapest premium is not the better
// policy when the protection differs, and that is what the equivalence status says.
export function coverageComparisonStrip(
  options: Array<{
    id: string; label: string; optionType: string; carrierName: string | null; annualPremium: unknown; currency: string;
    equivalenceStatus: string; materialUnknownsJson?: unknown; tradeoffsJson?: unknown;
  }>,
): Extract<AskPresentationBlock, { type: 'COMPARISON' }> | null {
  if (options.length < 2 || options.length > 4) return null;
  const count = (value: unknown) => (Array.isArray(value) ? value.length : 0);
  const amountOf = (option: { annualPremium: unknown; currency: string }) => {
    if (option.annualPremium == null) return null;
    const value = typeof option.annualPremium === 'number' ? option.annualPremium : Number(option.annualPremium);
    return Number.isFinite(value) && value >= 0 && /^[A-Za-z]{3}$/.test(option.currency) ? { value, currency: option.currency.toUpperCase() } : null;
  };
  return {
    type: 'COMPARISON', id: 'coverage-comparison-options', title: 'Options',
    description: 'Your current verified policy alongside any alternative quotes or policy terms compared against it. A lower premium is not a better policy when the protection differs.',
    options: options.map((option) => {
      const baseline = option.optionType === 'CURRENT_POLICY';
      const unknowns = count(option.materialUnknownsJson);
      const tradeoffs = count(option.tradeoffsJson);
      const equivalence = COVERAGE_COMPARISON_EQUIVALENCE_LABELS[option.equivalenceStatus] ?? option.equivalenceStatus;
      const premium = coverageComparisonPremiumMeta(option);
      return {
        id: option.id, label: option.label, summary: baseline ? 'Your current verified policy' : option.carrierName ?? null,
        amount: amountOf(option),
        attributes: [
          { label: 'Annual premium', value: premium ?? 'Premium not recorded', tone: premium ? 'DEFAULT' as const : 'CAUTION' as const },
          { label: 'Protection compared with current', value: equivalence,
            tone: baseline ? 'DEFAULT' as const : option.equivalenceStatus === 'EQUIVALENT' ? 'POSITIVE' as const : 'CAUTION' as const },
          ...(baseline ? [] : [
            { label: 'Differences found', value: tradeoffs ? `${tradeoffs} ${tradeoffs === 1 ? 'difference' : 'differences'}` : 'None recorded', tone: tradeoffs ? 'CAUTION' as const : 'DEFAULT' as const },
            { label: 'Facts to confirm', value: unknowns ? `${unknowns} unconfirmed` : 'None', tone: unknowns ? 'CAUTION' as const : 'DEFAULT' as const },
          ]),
        ],
        actions: [],
      };
    }),
    actions: [],
  };
}

async function coverageComparisonStatusResult(userId: string, propertyId: string): Promise<AskOperationResult> {
  await ensurePropertyAccess(userId, propertyId);
  const href = `/dashboard/properties/${encodeURIComponent(propertyId)}/tools/coverage-options`;

  let result: Awaited<ReturnType<typeof getOrCreateCoverageComparison>>;
  try {
    result = await getOrCreateCoverageComparison(propertyId, userId);
  } catch (error) {
    if (error instanceof APIError && error.code === 'PROPERTY_NOT_FOUND') {
      return {
        status: 'BLOCKED',
        reasonCode: 'COVERAGE_COMPARISON_OWNER_ONLY',
        blocks: [{
          type: 'BOUNDARY',
          id: 'coverage-comparison-owner-only',
          title: 'Coverage comparison is owner-only for now',
          body: 'Coverage comparison currently only works for the property’s primary homeowner account, not shared household access. Ask a household owner to check this for you.',
          severity: 'CAUTION',
          suggestions: [],
        }],
        suggestions: ['Which items have missing coverage?'],
      };
    }
    throw error;
  }

  if (result.state === 'BASELINE_REQUIRED') {
    return {
      status: 'NOT_APPLICABLE',
      reasonCode: 'COVERAGE_COMPARISON_BASELINE_REQUIRED',
      blocks: [{
        type: 'SUMMARY',
        id: 'coverage-comparison-baseline-required',
        title: 'No verified policy on file yet',
        body: 'Coverage comparison needs a verified current insurance policy term before it can compare anything against it. Add and verify your policy first.',
        tone: 'DEFAULT',
        actions: [{ id: 'open-coverage-comparison', label: 'Open coverage comparison', href, style: 'PRIMARY' }],
      }],
      suggestions: ['Which items have missing coverage?'],
    };
  }

  const comparison = result.comparison;
  const currentOption = comparison.options.find((option) => option.optionType === 'CURRENT_POLICY') ?? null;
  const alternativeOptions = comparison.options.filter((option) => option.optionType !== 'CURRENT_POLICY');
  const latestDecision = comparison.decisions[0] ?? null;

  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY',
    id: 'coverage-comparison-summary',
    title: latestDecision
      ? `Decision recorded: ${COVERAGE_COMPARISON_DECISION_LABELS[latestDecision.decision] ?? latestDecision.decision}`
      : alternativeOptions.length
        ? `${alternativeOptions.length} option${alternativeOptions.length === 1 ? '' : 's'} compared against your current policy`
        : 'Only your current policy is on file',
    body: latestDecision
      ? `Decided ${humanDate(latestDecision.decidedAt)}${latestDecision.rationale ? `: “${latestDecision.rationale}”` : '.'}`
      : alternativeOptions.length
        ? `Overall status: ${COVERAGE_COMPARISON_EQUIVALENCE_LABELS[comparison.equivalenceStatus] ?? comparison.equivalenceStatus}.`
        : 'Add a quote or another verified policy term to compare against your current coverage, or open the workspace to record a keep/shop decision.',
    tone: latestDecision ? 'POSITIVE' : alternativeOptions.length ? 'DEFAULT' : 'DEFAULT',
    actions: [{ id: 'open-coverage-comparison', label: 'Open coverage comparison', href, style: 'SECONDARY' }],
  }];

  const allOptions = currentOption ? [currentOption, ...alternativeOptions] : alternativeOptions;
  const strip = coverageComparisonStrip(allOptions);
  if (strip) blocks.push(strip);
  else if (allOptions.length) {
    blocks.push({
      type: 'GROUPED_LIST', filters: [],
      id: 'coverage-comparison-options',
      title: 'Options',
      description: 'Your current verified policy alongside any alternative quotes or policy terms compared against it.',
      sections: [{
        id: 'coverage-comparison-options-all',
        title: 'Options',
        count: allOptions.length,
        items: allOptions.slice(0, 20).map((option) => ({
          id: option.id,
          title: option.label,
          description: option.carrierName ?? null,
          meta: [
            COVERAGE_COMPARISON_EQUIVALENCE_LABELS[option.equivalenceStatus] ?? option.equivalenceStatus,
            coverageComparisonPremiumMeta(option),
          ].filter((value): value is string => Boolean(value)),
          status: option.equivalenceStatus,
          href,
        })),
      }],
      actions: [],
    });
  }

  return {
    status: 'ANSWERED',
    reasonCode: latestDecision
      ? 'COVERAGE_COMPARISON_DECIDED'
      : alternativeOptions.length ? 'COVERAGE_COMPARISON_HAS_OPTIONS' : 'COVERAGE_COMPARISON_BASELINE_ONLY',
    contextVersion: createHash('sha256').update(JSON.stringify({
      id: comparison.id, status: comparison.status, equivalenceStatus: comparison.equivalenceStatus,
      optionIds: comparison.options.map((option) => option.id), decisionId: latestDecision?.id ?? null,
    })).digest('hex'),
    blocks,
    suggestions: alternativeOptions.length
      ? ['Open coverage comparison']
      : ['Open coverage comparison', 'Which items have missing coverage?'],
  };
}

registerCapabilityHandler('coverage.review', async (envelope) => coverageResult(envelope.userId, envelope.propertyId!, envelope.message));

registerCapabilityHandler('coverage.comparison-status', async (envelope) => coverageComparisonStatusResult(envelope.userId, envelope.propertyId!));
