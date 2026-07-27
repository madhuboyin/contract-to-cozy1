'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  getCoverageReview,
  type CoverageReviewDTO,
  type CoverageReviewQuestionDTO,
} from '@/lib/api/coverageAnalysisApi';

function evidenceSummary(question: CoverageReviewQuestionDTO) {
  const fact = question.evidenceJson.find((entry) => entry.factId);
  if (fact) {
    return `Confirmed ${fact.factKey?.toLowerCase().replaceAll('_', ' ') ?? 'policy fact'}${
      fact.sourcePage ? ` · source page ${fact.sourcePage}` : ''
    }`;
  }
  const term = question.evidenceJson.find((entry) => entry.policyTermId);
  if (term?.termEnd) {
    return `Verified policy term · ended ${new Date(term.termEnd).toLocaleDateString()}`;
  }
  return 'General review question — no policy determination was made';
}

export default function CoverageReviewQuestionsPanel({ propertyId }: { propertyId: string }) {
  const searchParams = useSearchParams();
  const [review, setReview] = useState<CoverageReviewDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const triggerEntityId =
        searchParams.get('itemId') ??
        searchParams.get('inventoryItemId') ??
        searchParams.get('sourceEntityId');
      const nextReview = await getCoverageReview(propertyId, {
        triggerEntityType: triggerEntityId ? 'INVENTORY_ITEM' : null,
        triggerEntityId,
      });
      setReview(nextReview);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Coverage review is unavailable.');
    } finally {
      setLoading(false);
    }
  }, [propertyId, searchParams]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <section className="rounded-xl border border-border bg-card p-4" aria-busy="true">
        <p className="text-sm text-muted-foreground">Reviewing confirmed policy facts…</p>
      </section>
    );
  }

  if (error || !review) {
    return (
      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Coverage review unavailable</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {error ?? 'The review could not be loaded.'}
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-3 rounded-md border border-border px-3 py-2 text-sm font-medium"
        >
          Try again
        </button>
      </section>
    );
  }

  const questions = review.questions.slice(0, 3);
  const currentStageHref = `/dashboard/properties/${propertyId}/tools/coverage-intelligence`;

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Evidence-qualified review
            </p>
            <h2 className="mt-1 text-base font-semibold">
              {review.overallState === 'HEALTHY_SCOPED'
                ? 'No question within the reviewed fields'
                : review.scopeStatus === 'UNSUPPORTED'
                  ? 'More policy evidence is needed'
                  : `${questions.length} question${questions.length === 1 ? '' : 's'} to review`}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {review.scopeStatus === 'SUPPORTED'
                ? 'Scope: the confirmed deductible, policy form, dwelling limit, and liability limit.'
                : review.scopeStatus === 'PARTIAL'
                  ? 'Scope: only the confirmed fields shown below; other policy language was not determined.'
                  : 'The available record does not support a determination within this limited reviewed field set.'}
            </p>
          </div>
          <span className="rounded-full border border-border px-2.5 py-1 text-xs font-medium">
            {review.scopeStatus.toLowerCase()}
          </span>
        </div>
        {review.policyTerm && (
          <p className="mt-3 text-xs text-muted-foreground">
            {review.policyTerm.insurancePolicy.carrierName} · policy{' '}
            {review.policyTerm.insurancePolicy.policyNumber}
            {review.policyTerm.sourceDocument?.name
              ? ` · ${review.policyTerm.sourceDocument.name}`
              : ' · no source document linked'}
          </p>
        )}
      </div>

      {review.overallState === 'HEALTHY_SCOPED' ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
          <h3 className="text-sm font-semibold text-emerald-950">Scoped healthy state</h3>
          <p className="mt-1 text-sm text-emerald-900/80">
            No question was raised for the limited confirmed fields. This does not mean the policy
            has no gaps or that a claim would be covered.
          </p>
        </div>
      ) : (
        <ol className="space-y-3">
          {questions.map((question, index) => (
            <li key={question.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap gap-2">
                    <span className="text-xs font-medium text-muted-foreground">
                      {question.questionType === 'GENERAL'
                        ? 'General question'
                        : 'Confirmed-fact question'}
                    </span>
                    <span className="text-xs text-muted-foreground">· {question.priority}</span>
                  </div>
                  <h3 className="mt-1 text-sm font-semibold">{question.plainLanguageQuestion}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{question.whyItMatters}</p>
                  <div className="mt-3 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
                    <p>{evidenceSummary(question)}</p>
                    {question.missingEvidenceJson.length > 0 && (
                      <p className="mt-1">
                        Missing:{' '}
                        {question.missingEvidenceJson
                          .map((entry) => entry.factKey.toLowerCase().replaceAll('_', ' '))
                          .join(', ')}
                      </p>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {question.professionalBoundary}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}

      <div className="flex flex-wrap gap-2">
        <Link
          href={currentStageHref}
          className="inline-flex min-h-10 items-center rounded-md border border-border px-3 text-sm font-medium"
        >
          Review policy facts
        </Link>
        <button
          type="button"
          onClick={() => void load()}
          className="min-h-10 rounded-md border border-border px-3 text-sm font-medium"
        >
          Refresh review
        </button>
      </div>
    </section>
  );
}
