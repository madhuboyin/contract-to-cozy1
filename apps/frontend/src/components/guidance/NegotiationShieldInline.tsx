'use client';

// FRD-FR-09: NegotiationShield inline — upon entry of a quote, generate negotiation
// scripts and leverage points to help the user lower the price or verify labor hours.
// Rendered by renderStepCta when step.toolKey === 'negotiation-shield'.

import React from 'react';
import Link from 'next/link';
import { CheckCircle, ShieldCheck, TrendingDown, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  createNegotiationShieldCase,
  saveNegotiationShieldInput,
  analyzeNegotiationShieldCase,
  NegotiationShieldCaseDetail,
  NegotiationShieldLeveragePoint,
  NegotiationShieldFinding,
  NegotiationShieldRecommendedAction,
} from '@/app/(dashboard)/dashboard/properties/[id]/tools/negotiation-shield/negotiationShieldApi';
import { recordGuidanceToolStatus } from '@/lib/api/guidanceApi';
import { formatCurrency } from '@/lib/utils/format';
import { useQueryClient } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type NegotiationShieldInlineProps = {
  propertyId: string;
  journeyId: string;
  stepId: string;
  stepKey: string;
  inventoryItemId?: string | null;
  assetName?: string;
  issueType?: string | null;
  onComplete: () => void;
};

type Phase = 'entry' | 'analyzing' | 'results' | 'done';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function asArray<T>(val: T[] | Record<string, unknown> | null | undefined): T[] {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  return [];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NegotiationShieldInline({
  propertyId,
  journeyId,
  stepId: _stepId,
  stepKey,
  inventoryItemId,
  assetName = 'this service',
  issueType,
  onComplete,
}: NegotiationShieldInlineProps) {
  const queryClient = useQueryClient();
  const [phase, setPhase] = React.useState<Phase>('entry');
  const [quoteAmount, setQuoteAmount] = React.useState('');
  const [quoteDescription, setQuoteDescription] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [caseDetail, setCaseDetail] = React.useState<NegotiationShieldCaseDetail | null>(null);
  const [completing, setCompleting] = React.useState(false);

  const isValidQuote = Boolean(quoteAmount.trim()) && Number(quoteAmount) > 0;

  // ---- Step 1: Enter quote → create case → save input → analyze ----
  async function handleAnalyze() {
    if (!isValidQuote) return;
    setError(null);
    setPhase('analyzing');

    try {
      // Create the NS case
      const titleParts: string[] = [];
      if (assetName && assetName !== 'this service') titleParts.push(assetName);
      if (issueType) titleParts.push(issueType);
      const caseTitle = titleParts.length
        ? `${titleParts.join(' — ')} quote review`
        : 'Contractor quote review';

      const created = await createNegotiationShieldCase(propertyId, {
        scenarioType: 'CONTRACTOR_QUOTE_REVIEW',
        title: caseTitle,
        description: quoteDescription.trim() || null,
        sourceType: 'MANUAL',
      });

      // Save the quote amount as structured input
      const withInput = await saveNegotiationShieldInput(propertyId, created.case.id, {
        inputType: 'CONTRACTOR_QUOTE',
        rawText: quoteDescription.trim() || null,
        structuredData: {
          quoteAmount: Number(quoteAmount),
          assetName,
          issueType: issueType ?? null,
          inventoryItemId: inventoryItemId ?? null,
        },
      });

      // Run analysis with guidance context
      const analyzed = await analyzeNegotiationShieldCase(
        propertyId,
        withInput.case.id,
        {
          guidanceJourneyId: journeyId,
          guidanceStepKey: stepKey,
          inventoryItemId: inventoryItemId ?? null,
        }
      );

      setCaseDetail(analyzed);
      setPhase('results');
    } catch (err) {
      console.error('[NegotiationShieldInline] analysis failed', err);
      setError('Analysis failed. Please try again.');
      setPhase('entry');
    }
  }

  // ---- Step 2: Complete the guidance step ----
  async function handleComplete() {
    if (!caseDetail) return;
    setCompleting(true);
    try {
      await recordGuidanceToolStatus(propertyId, {
        journeyId,
        stepKey,
        sourceToolKey: 'negotiation-shield',
        status: 'COMPLETED',
        producedData: {
          caseId: caseDetail.case.id,
          quoteAmount: Number(quoteAmount),
          analysisConfidence: caseDetail.latestAnalysis?.confidence ?? null,
        },
      });
      queryClient.invalidateQueries({ queryKey: ['guidance', 'property', propertyId] });
      queryClient.invalidateQueries({ queryKey: ['guidance', 'journey', propertyId] });
      setPhase('done');
      onComplete();
    } catch (err) {
      console.error('[NegotiationShieldInline] complete failed', err);
    } finally {
      setCompleting(false);
    }
  }

  // Done
  if (phase === 'done') {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
        <CheckCircle className="h-4 w-4 shrink-0" />
        Negotiation strategy recorded. Moving to next step.
      </div>
    );
  }

  // Analyzing
  if (phase === 'analyzing') {
    return (
      <div className="rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-white p-3 text-sm text-[hsl(var(--mobile-text-secondary))]">
        Analyzing your quote with NegotiationShield…
      </div>
    );
  }

  // Results
  if (phase === 'results' && caseDetail) {
    const analysis = caseDetail.latestAnalysis;
    const findings = asArray<NegotiationShieldFinding>(analysis?.findings);
    const leverage = asArray<NegotiationShieldLeveragePoint>(analysis?.negotiationLeverage);
    const actions = asArray<NegotiationShieldRecommendedAction>(analysis?.recommendedActions);
    const pricing = analysis?.pricingAssessment as Record<string, unknown> | null;
    const pricingStatus = (pricing?.status as string | null) ?? null;
    const pricingRationale = Array.isArray(pricing?.rationale)
      ? (pricing!.rationale as string[])
      : [];

    return (
      <div className="space-y-3">
        {/* Summary banner */}
        {analysis?.summary && (
          <div className="flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
            <p className="text-sm text-sky-800">{analysis.summary}</p>
          </div>
        )}

        {/* Pricing assessment */}
        {pricingStatus && (
          <div className="rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] px-3 py-2.5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-[hsl(var(--mobile-text-primary))]">
                Price assessment
              </p>
              <span className="rounded-full border border-[hsl(var(--mobile-border-subtle))] bg-white px-2 py-0.5 text-xs font-medium">
                {pricingStatus}
              </span>
            </div>
            {(pricing?.quoteAmount as number | null) != null && (
              <p className="mt-1 text-sm font-semibold text-[hsl(var(--mobile-text-primary))]">
                Quote: {formatCurrency(pricing!.quoteAmount as number)}
              </p>
            )}
            {pricingRationale.length > 0 && (
              <ul className="mt-1 space-y-0.5">
                {pricingRationale.slice(0, 2).map((r, i) => (
                  <li key={i} className="text-xs text-[hsl(var(--mobile-text-secondary))]">• {r}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Leverage points */}
        {leverage.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-[hsl(var(--mobile-text-primary))]">
              Your leverage points
            </p>
            {leverage.slice(0, 3).map((lp) => (
              <div
                key={lp.key}
                className="flex items-start gap-2 rounded-lg border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 py-2"
              >
                <TrendingDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-600" />
                <div>
                  <p className="text-xs font-medium text-[hsl(var(--mobile-text-primary))]">
                    {lp.title}
                    {lp.strength && (
                      <span className="ml-1.5 rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-700">
                        {lp.strength}
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-[hsl(var(--mobile-text-secondary))]">
                    {lp.detail}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Key findings */}
        {findings.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-semibold text-[hsl(var(--mobile-text-primary))]">
              Key findings
            </p>
            {findings.slice(0, 3).map((f) => (
              <div key={f.key} className="flex items-start gap-2 text-xs">
                {f.status === 'CAUTION' ? (
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                ) : f.status === 'POSITIVE' ? (
                  <CheckCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                ) : (
                  <span className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                )}
                <span className="text-[hsl(var(--mobile-text-secondary))]">
                  <span className="font-medium text-[hsl(var(--mobile-text-primary))]">{f.title}: </span>
                  {f.detail}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Top recommended action */}
        {actions[0] && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
            <p className="text-xs font-semibold text-amber-800">Recommended action</p>
            <p className="mt-0.5 text-xs text-amber-700">{actions[0].title}: {actions[0].detail}</p>
          </div>
        )}

        {/* CTAs */}
        <div className="flex flex-col gap-2">
          <Button
            className="min-h-[44px] w-full"
            disabled={completing}
            onClick={handleComplete}
          >
            {completing ? 'Saving…' : 'Apply strategy & continue'}
          </Button>
          <Link
            href={`/dashboard/properties/${propertyId}/tools/negotiation-shield?guidanceJourneyId=${journeyId}&guidanceStepKey=${stepKey}&caseId=${caseDetail.case.id}`}
            className="inline-flex min-h-[40px] w-full items-center justify-center rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 text-sm font-medium text-[hsl(var(--mobile-text-primary))] hover:bg-[hsl(var(--mobile-bg-muted))]"
          >
            Open full NegotiationShield
          </Link>
        </div>
      </div>
    );
  }

  // ---- Entry: quote form ----
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] px-3 py-2.5">
        <p className="text-sm font-medium text-[hsl(var(--mobile-text-primary))]">
          Enter a quote to get negotiation leverage
        </p>
        <p className="mt-0.5 text-xs text-[hsl(var(--mobile-text-secondary))]">
          Enter the contractor&apos;s quoted price for {assetName}. We&apos;ll generate scripts and leverage points to help you negotiate.
        </p>
      </div>

      <div className="space-y-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-[hsl(var(--mobile-text-primary))]">
            Quote amount ($) *
          </label>
          <input
            type="number"
            placeholder="e.g. 850"
            min={0}
            value={quoteAmount}
            onChange={(e) => setQuoteAmount(e.target.value)}
            className="w-full rounded-lg border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 py-2 text-sm placeholder:text-[hsl(var(--mobile-text-muted))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--mobile-brand-strong))]/30"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-[hsl(var(--mobile-text-primary))]">
            What does the quote include? (optional)
          </label>
          <textarea
            rows={2}
            placeholder="e.g. Replace compressor, includes labor and parts, 1-year warranty"
            value={quoteDescription}
            onChange={(e) => setQuoteDescription(e.target.value)}
            className="w-full resize-none rounded-lg border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 py-2 text-sm placeholder:text-[hsl(var(--mobile-text-muted))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--mobile-brand-strong))]/30"
          />
        </div>
      </div>

      {error && <p className="text-xs text-rose-700">{error}</p>}

      <div className="flex flex-col gap-2">
        <Button
          className="min-h-[44px] w-full"
          disabled={!isValidQuote}
          onClick={handleAnalyze}
        >
          Get negotiation strategy
        </Button>
        <Link
          href={`/dashboard/properties/${propertyId}/tools/negotiation-shield?guidanceJourneyId=${journeyId}&guidanceStepKey=${stepKey}`}
          className="inline-flex min-h-[40px] w-full items-center justify-center rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 text-sm font-medium text-[hsl(var(--mobile-text-primary))] hover:bg-[hsl(var(--mobile-bg-muted))]"
        >
          Open full NegotiationShield
        </Link>
      </div>
    </div>
  );
}
