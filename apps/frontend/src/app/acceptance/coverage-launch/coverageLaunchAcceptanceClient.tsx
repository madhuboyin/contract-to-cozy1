'use client';

import CoverageComparisonPanel from '@/components/coverage/CoverageComparisonPanel';
import CoverageReviewQuestionsPanel from '@/components/coverage/CoverageReviewQuestionsPanel';
import InsuranceHandoffPanel from '@/components/coverage/InsuranceHandoffPanel';
import InsuranceMarketContextPanel from '@/components/coverage/InsuranceMarketContextPanel';
import PolicyRecordReadinessPanel from '@/components/coverage/PolicyRecordReadinessPanel';
import RiskPremiumOptimizerPanel from '@/components/ai/RiskPremiumOptimizerPanel';
import CoverageIntelligencePanel from '@/components/ai/CoverageIntelligencePanel';

export const COVERAGE_LAUNCH_ACCEPTANCE_PROPERTY_ID =
  '11111111-1111-4111-8111-111111111111';

export function CoverageLaunchAcceptanceClient() {
  return (
    <main className="mx-auto min-h-screen max-w-4xl space-y-5 p-4 sm:p-8">
      <header>
        <p className="text-sm font-medium text-muted-foreground">Slice 10 browser acceptance</p>
        <h1 className="text-2xl font-semibold">Coverage &amp; Premium Review launch gate</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Canonical policy facts, evidence-qualified questions, protection comparison, durable
          decision, loss-prevention evidence, licensed-help controls, and market context.
        </p>
      </header>
      <section aria-labelledby="acceptance-policy-heading" className="space-y-3">
        <h2 id="acceptance-policy-heading" className="text-xl font-semibold">Current policy record</h2>
        <PolicyRecordReadinessPanel propertyId={COVERAGE_LAUNCH_ACCEPTANCE_PROPERTY_ID} />
        <CoverageIntelligencePanel propertyId={COVERAGE_LAUNCH_ACCEPTANCE_PROPERTY_ID} />
      </section>
      <section aria-labelledby="acceptance-review-heading" className="space-y-3">
        <h2 id="acceptance-review-heading" className="text-xl font-semibold">Review questions</h2>
        <CoverageReviewQuestionsPanel propertyId={COVERAGE_LAUNCH_ACCEPTANCE_PROPERTY_ID} />
      </section>
      <section aria-labelledby="acceptance-compare-heading" className="space-y-3">
        <h2 id="acceptance-compare-heading" className="text-xl font-semibold">Compare and decide</h2>
        <CoverageComparisonPanel propertyId={COVERAGE_LAUNCH_ACCEPTANCE_PROPERTY_ID} />
      </section>
      <section aria-labelledby="acceptance-risk-heading" className="space-y-3">
        <h2 id="acceptance-risk-heading" className="text-xl font-semibold">Loss-prevention plan</h2>
        <RiskPremiumOptimizerPanel propertyId={COVERAGE_LAUNCH_ACCEPTANCE_PROPERTY_ID} />
      </section>
      <section aria-labelledby="acceptance-handoff-heading" className="space-y-3">
        <h2 id="acceptance-handoff-heading" className="text-xl font-semibold">Licensed help</h2>
        <InsuranceHandoffPanel propertyId={COVERAGE_LAUNCH_ACCEPTANCE_PROPERTY_ID} />
      </section>
      <section aria-labelledby="acceptance-market-heading" className="space-y-3">
        <h2 id="acceptance-market-heading" className="text-xl font-semibold">Market context</h2>
        <InsuranceMarketContextPanel propertyId={COVERAGE_LAUNCH_ACCEPTANCE_PROPERTY_ID} />
      </section>
    </main>
  );
}
