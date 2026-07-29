import type { QuoteProposalSummary } from '../service-price-radar/servicePriceRadarApi';

export type EvidenceDimension = {
  key: 'source' | 'scope' | 'confirmation' | 'freshness';
  label: string;
  value: string;
  detail: string;
  tone: 'good' | 'info' | 'elevated';
};

function dateAgeDays(value: string | null, now: Date) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, Math.floor((now.getTime() - timestamp) / 86_400_000));
}

export function buildProposalEvidence(
  proposal: QuoteProposalSummary,
  now = new Date(),
): EvidenceDimension[] {
  const extraction = proposal.extractions?.[0];
  const ageDays = dateAgeDays(proposal.quoteDate ?? proposal.createdAt, now);
  const expired = proposal.expirationDate
    ? new Date(proposal.expirationDate).getTime() < now.getTime()
    : false;
  const freshness = expired
    ? {
        value: 'Expired',
        detail: 'Ask the provider for a current proposal before deciding.',
        tone: 'elevated' as const,
      }
    : ageDays === null
      ? {
          value: 'Unknown',
          detail: 'No quote date is recorded.',
          tone: 'elevated' as const,
        }
      : ageDays > 90
        ? {
            value: 'Stale',
            detail: `${ageDays} days old. Reconfirm price, availability, and terms.`,
            tone: 'elevated' as const,
          }
        : ageDays > 30
          ? {
              value: 'Aging',
              detail: `${ageDays} days old. Check whether the provider still honors it.`,
              tone: 'info' as const,
            }
          : {
              value: 'Current',
              detail: `${ageDays} days old.`,
              tone: 'good' as const,
            };

  return [
    {
      key: 'source',
      label: 'Source',
      value: extraction ? 'Document-backed' : proposal.sourceType === 'SYSTEM_LINKED' ? 'Radar-linked' : 'Homeowner-entered',
      detail: extraction
        ? `${extraction.document.name} · ${extraction.provider || 'document extraction'} · schema ${extraction.schemaVersion}`
        : proposal.sourceType === 'SYSTEM_LINKED'
          ? 'Amount imported from a saved Service Price Radar check.'
          : 'Facts were entered manually and are not independently verified.',
      tone: extraction ? 'good' : 'info',
    },
    {
      key: 'scope',
      label: 'Scope completeness',
      value: proposal.readinessStage === 'COMPARISON_READY'
        ? 'Comparison ready'
        : proposal.readinessStage === 'REVIEW_READY'
          ? 'Review ready'
          : 'Incomplete',
      detail: proposal.missingFactsJson?.length
        ? `${proposal.missingFactsJson.length} material fact${proposal.missingFactsJson.length === 1 ? '' : 's'} still missing.`
        : `${proposal.lineItems?.length ?? 0} line item(s) and ${proposal.terms?.length ?? 0} term(s) recorded.`,
      tone: proposal.readinessStage === 'COMPARISON_READY' ? 'good' : 'elevated',
    },
    {
      key: 'confirmation',
      label: 'Homeowner review',
      value: proposal.homeownerConfirmedAt ? 'Confirmed' : 'Needs confirmation',
      detail: proposal.homeownerConfirmedAt
        ? `Confirmed ${new Date(proposal.homeownerConfirmedAt).toLocaleDateString()}.`
        : 'Review extracted or entered facts before comparing.',
      tone: proposal.homeownerConfirmedAt ? 'good' : 'elevated',
    },
    {
      key: 'freshness',
      label: 'Freshness',
      ...freshness,
    },
  ];
}

export function buildKnownFacts(proposal: QuoteProposalSummary) {
  return [
    proposal.vendorName ? `Provider: ${proposal.vendorName}` : null,
    Number(proposal.quoteAmount) > 0 ? `Total: ${proposal.currency} ${Number(proposal.quoteAmount).toLocaleString()}` : null,
    proposal.serviceCategory ? `Category: ${proposal.serviceCategory.replace(/_/g, ' ').toLowerCase()}` : null,
    proposal.scopeKind !== 'UNKNOWN' ? `Work type: ${proposal.scopeKind.toLowerCase()}` : null,
    proposal.serviceLocation ? `Location: ${proposal.serviceLocation}` : null,
    proposal.scopeSummary ? `Scope: ${proposal.scopeSummary}` : null,
    proposal.lineItems?.length ? `${proposal.lineItems.length} itemized scope line(s)` : null,
    proposal.terms?.length ? `${proposal.terms.length} inclusion, exclusion, or term record(s)` : null,
  ].filter((value): value is string => Boolean(value));
}

export function isProposalStale(proposal: QuoteProposalSummary, now = new Date()) {
  return buildProposalEvidence(proposal, now)
    .find((dimension) => dimension.key === 'freshness')
    ?.tone === 'elevated';
}
