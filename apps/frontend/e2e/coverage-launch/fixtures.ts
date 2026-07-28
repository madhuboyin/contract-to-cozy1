import { expect, type BrowserContext, type Page, type Request, type Route } from '@playwright/test';

export const propertyId = '11111111-1111-4111-8111-111111111111';

function assertAuthenticated(request: Request) {
  expect(request.headers().cookie).toContain('ctc.at=coverage-acceptance-token');
}

export async function installAuthenticatedContext(context: BrowserContext) {
  await context.addCookies([{
    name: 'ctc.at',
    value: 'coverage-acceptance-token',
    domain: 'localhost',
    path: '/',
    httpOnly: true,
    sameSite: 'Strict',
  }]);
}

export async function installMarketContextApi(
  page: Page,
  state: 'READY' | 'SOURCE_UNAVAILABLE' | 'STALE' = 'READY',
) {
  await page.route(`**/api/properties/${propertyId}/insurance-market-context`, async (route) => {
    assertAuthenticated(route.request());
    await fulfillJson(route, {
      success: true,
      data: state === 'READY' ? readyContext() : unavailableContext(state),
    });
  });
}

export async function installCoverageJourneyApi(page: Page) {
  let decisionRecorded = false;
  let handoffStatus = 'SUBMITTED';

  await page.route(`**/api/properties/${propertyId}/coverage-analysis`, async (route) => {
    assertAuthenticated(route.request());
    await fulfillJson(route, {
      success: true,
      data: {
        exists: true,
        analysis: coverageAnalysisFixture(),
      },
    });
  });
  await page.route(`**/api/properties/${propertyId}/inventory/items`, async (route) => {
    assertAuthenticated(route.request());
    await fulfillJson(route, {
      success: true,
      data: { items: [] },
    });
  });
  await page.route('**/api/home-management/insurance-policies?**', async (route) => {
    assertAuthenticated(route.request());
    await fulfillJson(route, {
      success: true,
      data: {
        policies: [{
          id: 'policy-acceptance',
          homeownerProfileId: 'profile-acceptance',
          propertyId,
          carrierName: 'Example Mutual',
          policyNumber: 'ending 4242',
          coverageType: 'HOMEOWNERS',
          premiumAmount: 2400,
          personalPropertyLimitCents: 15000000,
          deductibleCents: 250000,
          isVerified: true,
          lastVerifiedAt: '2026-07-01T00:00:00.000Z',
          startDate: '2026-01-01T00:00:00.000Z',
          expiryDate: '2027-01-01T00:00:00.000Z',
          documents: [],
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-07-01T00:00:00.000Z',
          applicability: {
            status: 'APPLICABLE',
            lifecycle: 'ACTIVE',
            reasonCodes: ['COVERAGE_ACTIVE'],
            evaluatedAt: '2026-07-27T00:00:00.000Z',
            validUntil: '2027-01-01T00:00:00.000Z',
          },
        }],
      },
    });
  });
  await page.route('**/api/home-management/insurance-policies/policy-acceptance/record', async (route) => {
    assertAuthenticated(route.request());
    await fulfillJson(route, {
      success: true,
      data: {
        id: 'policy-acceptance',
        homeownerProfileId: 'profile-acceptance',
        propertyId,
        carrierName: 'Example Mutual',
        policyNumber: 'ending 4242',
        coverageType: 'HOMEOWNERS',
        premiumAmount: 2400,
        personalPropertyLimitCents: 15000000,
        deductibleCents: 250000,
        isVerified: true,
        lastVerifiedAt: '2026-07-01T00:00:00.000Z',
        startDate: '2026-01-01T00:00:00.000Z',
        expiryDate: '2027-01-01T00:00:00.000Z',
        documents: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:00.000Z',
        terms: [{
          id: 'term-acceptance',
          insurancePolicyId: 'policy-acceptance',
          propertyId,
          termStart: '2026-01-01T00:00:00.000Z',
          termEnd: '2027-01-01T00:00:00.000Z',
          annualPremium: 2400,
          status: 'REVIEWED',
          verificationStatus: 'VERIFIED',
          verifiedAt: '2026-07-01T00:00:00.000Z',
          sourceDocumentId: 'document-policy',
          sourceDocument: { id: 'document-policy', name: '2026 declarations.pdf' },
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-07-01T00:00:00.000Z',
          facts: [{
            id: 'fact-premium',
            policyTermId: 'term-acceptance',
            factKey: 'ANNUAL_PREMIUM',
            valueType: 'AMOUNT',
            amountValue: 2400,
            textValue: null,
            booleanValue: null,
            jsonValue: null,
            currency: 'USD',
            sourceDocumentId: 'document-policy',
            sourcePage: 2,
            sourceExcerptHash: 'fixture',
            extractionMethod: 'USER_CONFIRMED',
            confidence: 0.99,
            confirmationStatus: 'CONFIRMED',
            confirmedByUserId: 'user-acceptance',
            confirmedAt: '2026-07-01T00:00:00.000Z',
            effectiveFrom: '2026-01-01T00:00:00.000Z',
            effectiveTo: '2027-01-01T00:00:00.000Z',
            sourceDocument: { id: 'document-policy', name: '2026 declarations.pdf' },
          }],
        }],
        readiness: {
          state: 'CONFIRMED',
          pendingFactCount: 0,
          confirmedFactCount: 1,
          unknownFactKeys: ['VALUATION_BASIS'],
        },
      },
    });
  });
  await page.route(`**/api/properties/${propertyId}/coverage-review**`, async (route) => {
    assertAuthenticated(route.request());
    await fulfillJson(route, {
      success: true,
      data: {
        review: {
          id: 'review-acceptance',
          propertyId,
          policyTermId: 'term-acceptance',
          status: 'READY',
          scopeStatus: 'PARTIAL',
          overallState: 'QUESTIONS',
          reviewVersion: 1,
          generatedAt: '2026-07-27T00:00:00.000Z',
          expiresAt: null,
          policyTerm: {
            id: 'term-acceptance',
            termStart: '2026-01-01T00:00:00.000Z',
            termEnd: '2027-01-01T00:00:00.000Z',
            verificationStatus: 'VERIFIED',
            insurancePolicy: {
              id: 'policy-acceptance',
              carrierName: 'Example Mutual',
              policyNumber: 'ending 4242',
            },
            sourceDocument: { id: 'document-policy', name: '2026 declarations.pdf' },
          },
          questions: [{
            id: 'question-acceptance',
            questionKey: 'VALUATION_BASIS_UNKNOWN',
            questionType: 'GENERAL',
            category: 'LIMITS',
            priority: 'HIGH',
            isPrimary: true,
            status: 'OPEN',
            plainLanguageQuestion: 'Which valuation basis applies to the dwelling limit?',
            whyItMatters: 'The available record does not establish how a covered loss would be valued.',
            evidenceJson: [],
            missingEvidenceJson: [{ factKey: 'VALUATION_BASIS', reason: 'NOT_CONFIRMED' }],
            professionalBoundary: 'Confirm against the controlling policy or a licensed professional.',
          }],
        },
      },
    });
  });
  await page.route(`**/api/properties/${propertyId}/coverage-comparison**`, async (route) => {
    assertAuthenticated(route.request());
    const decision = decisionRecorded ? [{
      id: 'decision-acceptance',
      decision: 'KEEP',
      selectedOptionId: null,
      rationale: 'Reviewed the confirmed tradeoffs.',
      decidedAt: '2026-07-27T12:00:00.000Z',
      homeEventId: 'event-acceptance',
    }] : [];
    await fulfillJson(route, {
      success: true,
      data: {
        state: 'READY',
        comparison: comparisonFixture(decision),
      },
    });
  });
  await page.route(`**/api/properties/${propertyId}/coverage-comparisons/comparison-acceptance/decision`, async (route) => {
    assertAuthenticated(route.request());
    decisionRecorded = true;
    await fulfillJson(route, {
      success: true,
      data: {
        decision: {
          id: 'decision-acceptance',
          decision: 'KEEP',
          selectedOptionId: null,
          rationale: null,
          decidedAt: '2026-07-27T12:00:00.000Z',
          homeEventId: 'event-acceptance',
        },
        homeEvent: { id: 'event-acceptance' },
      },
    });
  });
  await page.route('**/api/documents?**', async (route) => {
    assertAuthenticated(route.request());
    await fulfillJson(route, {
      success: true,
      data: {
        documents: [{ id: 'document-evidence', name: 'Leak sensor receipt.pdf' }],
      },
    });
  });
  await page.route(`**/api/properties/${propertyId}/risk-premium-optimizer`, async (route) => {
    assertAuthenticated(route.request());
    await fulfillJson(route, {
      success: true,
      data: { exists: true, analysis: riskPlanFixture() },
    });
  });
  await page.route(`**/api/properties/${propertyId}/insurance-handoff/readiness`, async (route) => {
    assertAuthenticated(route.request());
    await fulfillJson(route, {
      success: true,
      data: handoffReadinessFixture(),
    });
  });
  await page.route(`**/api/properties/${propertyId}/insurance-handoff/requests`, async (route) => {
    assertAuthenticated(route.request());
    handoffStatus = 'SUBMITTED';
    await fulfillJson(route, {
      success: true,
      data: { request: handoffRequestFixture(handoffStatus) },
    });
  });
  await page.route(`**/api/properties/${propertyId}/insurance-handoff/requests/handoff-acceptance/withdraw`, async (route) => {
    assertAuthenticated(route.request());
    handoffStatus = 'WITHDRAWN';
    await fulfillJson(route, {
      success: true,
      data: { request: handoffRequestFixture(handoffStatus) },
    });
  });
}

function coverageAnalysisFixture() {
  return {
    id: 'coverage-analysis-acceptance',
    propertyId,
    homeownerProfileId: 'profile-acceptance',
    status: 'READY',
    computedAt: '2026-07-27T00:00:00.000Z',
    overallVerdict: 'WORTH_IT',
    insuranceVerdict: 'SITUATIONAL',
    warrantyVerdict: 'WORTH_IT',
    insuranceReviewState: 'QUESTIONS_PRESENT',
    confidence: 'MEDIUM',
    impactLevel: 'MEDIUM',
    summary: 'Unsafe legacy summary must not be rendered.',
    strategicAdvice: null,
    addOnRecommendations: [],
    nextSteps: [],
    insurance: {
      inputsUsed: {
        annualPremiumUsd: 2400,
        deductibleUsd: 2500,
        cashBufferUsd: 5000,
      },
      flags: [{
        code: 'POLICY_RECORD_QUESTION',
        label: 'Confirm the controlling deductible and exclusions.',
        severity: 'MEDIUM',
      }],
      recommendedAddOns: [],
    },
    warranty: {
      inputsUsed: {
        warrantyAnnualCostUsd: 700,
        warrantyServiceFeeUsd: 100,
      },
      expectedAnnualRepairRiskUsd: 900,
      expectedNetImpactUsd: 200,
      breakEvenMonths: 10,
    },
    decisionTrace: [{
      label: 'Modeled repair exposure',
      detail: 'Fixture scenario input.',
      impact: 'NEUTRAL',
    }],
    scenarios: [],
  };
}

function comparisonFixture(decisions: unknown[]) {
  const fact = (factKey: string, amountValue: number) => ({
    factKey,
    valueType: 'AMOUNT',
    amountValue,
    currency: 'USD',
    confirmationStatus: 'CONFIRMED',
    sourceDocumentId: 'document-policy',
    sourcePage: 2,
  });
  return {
    id: 'comparison-acceptance',
    propertyId,
    baselinePolicyTermId: 'term-acceptance',
    status: decisions.length > 0 ? 'DECIDED' : 'DRAFT',
    equivalenceStatus: 'NON_EQUIVALENT',
    baselinePolicyTerm: {
      id: 'term-acceptance',
      termStart: '2026-01-01T00:00:00.000Z',
      termEnd: '2027-01-01T00:00:00.000Z',
      insurancePolicy: {
        id: 'policy-acceptance',
        carrierName: 'Example Mutual',
        policyNumber: 'ending 4242',
      },
      sourceDocument: { id: 'document-policy', name: '2026 declarations.pdf' },
    },
    options: [
      {
        id: 'baseline-option',
        comparisonId: 'comparison-acceptance',
        optionType: 'CURRENT_POLICY',
        label: 'Current verified policy',
        policyTermId: 'term-acceptance',
        sourceDocumentId: 'document-policy',
        carrierName: 'Example Mutual',
        annualPremium: 2400,
        currency: 'USD',
        normalizedFactsJson: [fact('DWELLING_LIMIT', 500000)],
        equivalenceStatus: 'BASELINE',
        materialUnknownsJson: [],
        tradeoffsJson: [],
        sourceDocument: { id: 'document-policy', name: '2026 declarations.pdf' },
      },
      {
        id: 'quote-option',
        comparisonId: 'comparison-acceptance',
        optionType: 'QUOTE_DOCUMENT',
        label: 'Lower-limit quote',
        policyTermId: null,
        sourceDocumentId: 'document-quote',
        carrierName: 'Example Carrier',
        annualPremium: 2100,
        currency: 'USD',
        normalizedFactsJson: [fact('DWELLING_LIMIT', 425000)],
        equivalenceStatus: 'NON_EQUIVALENT',
        materialUnknownsJson: [],
        tradeoffsJson: [{
          factKey: 'DWELLING_LIMIT',
          baseline: fact('DWELLING_LIMIT', 500000),
          option: fact('DWELLING_LIMIT', 425000),
        }],
        sourceDocument: { id: 'document-quote', name: 'Example quote.pdf' },
      },
    ],
    decisions,
  };
}

function riskPlanFixture() {
  return {
    id: 'risk-plan-acceptance',
    propertyId,
    homeownerProfileId: 'profile-acceptance',
    status: 'READY',
    confidence: 'MEDIUM',
    inputs: {
      annualPremium: 2400,
      deductibleAmount: 2500,
      cashBuffer: 5000,
      riskTolerance: 'MEDIUM',
      policyId: 'policy-acceptance',
    },
    premiumDrivers: [{
      code: 'WATER',
      title: 'Water-loss exposure',
      detail: 'The Home Record does not show a monitored leak sensor.',
      severity: 'HIGH',
      relatedPerils: ['WATER'],
    }],
    recommendations: [{
      code: 'LEAK_SENSOR',
      title: 'Consider a leak sensor',
      detail: 'A sensor may reduce time to discovery.',
      type: 'MITIGATE',
      priority: 'HIGH',
      targetPeril: 'WATER',
      estimatedCost: 125,
      whyThisMatters: 'Earlier detection may reduce loss severity.',
    }],
    planItems: [{
      id: 'plan-item-acceptance',
      actionType: 'INSTALL_LEAK_SENSOR',
      status: 'PLANNED',
      priority: 'HIGH',
      targetPeril: 'WATER',
      title: 'Document leak-sensor installation',
      why: 'Preserve evidence for maintenance and carrier review.',
      estimatedCost: 125,
      carrierBenefitStatus: 'UNKNOWN',
      carrierReviewQuestion: 'Ask whether this documented sensor affects eligibility.',
      professionalHelpLevel: 'DIY_ALLOWED',
      handoff: {
        kind: 'DIY',
        label: 'Review installation steps',
        href: '/dashboard/diy',
        safetyNote: 'Follow manufacturer instructions.',
      },
      evidenceDocumentId: 'document-evidence',
      linkedHomeEventId: null,
      completedAt: null,
    }],
    computedAt: '2026-07-27T00:00:00.000Z',
    observedPremiumComparison: {
      hasCompletedMitigations: false,
      completedCount: 0,
      observedDirection: 'UNKNOWN',
      note: 'No observed premium comparison is available.',
    },
  };
}

function handoffReadinessFixture() {
  return {
    available: true,
    jurisdictionCode: 'TN',
    purpose: 'Request licensed help comparing confirmed protection facts.',
    sharedFields: ['name', 'contact preference', 'confirmed comparison facts'],
    excludedFields: ['full policy document', 'unconfirmed facts'],
    recipient: handoffRecipientFixture(),
  };
}

function handoffRecipientFixture() {
  return {
    id: 'recipient-acceptance',
    name: 'Reviewed Licensed Agency',
    configVersion: 'fixture-v1',
    licensingDisclosure: 'Licensed for the fixture jurisdiction.',
    commercialDisclosure: 'This recipient may offer insurance products.',
    compensationDisclosure: 'ContractToCozy may receive compensation if a policy is placed.',
    marketScopeDisclosure: 'This request does not represent the full insurance market.',
    rankingDisclosure: 'Commercial factors do not affect protection comparison ranking.',
    fulfillmentSlaHours: 48,
    disclosureVersion: 'insurance-handoff-v1:fixture-v1',
  };
}

function handoffRequestFixture(status: string) {
  return {
    id: 'handoff-acceptance',
    status,
    purpose: 'Request licensed help comparing confirmed protection facts.',
    submittedAt: '2026-07-27T12:00:00.000Z',
    withdrawnAt: status === 'WITHDRAWN' ? '2026-07-27T12:05:00.000Z' : null,
    fulfilledAt: null,
    recipient: handoffRecipientFixture(),
  };
}

function readyContext() {
  return {
    contractVersion: 'insurance-market-context-v1',
    classification: 'OBSERVED_MARKET_CONTEXT_NOT_A_QUOTE',
    jurisdictionCode: 'TN',
    state: 'READY',
    message: 'Observed market context, not a personal quote.',
    current: {
      value: 2400,
      currency: 'USD',
      geography: { type: 'STATE', code: 'TN' },
      period: {
        start: '2026-04-01T00:00:00.000Z',
        end: '2026-06-30T23:59:59.000Z',
      },
      coverageBasis: {
        label: 'Owner-occupied HO-3 detached homes',
        policyForms: ['HO-3'],
        dwellingTypes: ['SINGLE_FAMILY'],
        limitations: [
          'Period aggregate; individual underwriting factors are excluded.',
          'Coverage limits, deductibles, endorsements, and claims history may differ.',
        ],
      },
      sampleSize: 1200,
      notes: null,
      retrievedAt: '2026-07-15T00:00:00.000Z',
      releaseVersion: '2026-Q2',
      source: {
        key: 'acceptance-reviewed-source',
        name: 'Reviewed market source',
        ownerName: 'Acceptance source owner',
        url: 'https://example.com/methodology',
      },
      methodologySummary: 'Observed written premium for the stated period and basis.',
    },
    previous: {
      value: 2000,
      currency: 'USD',
      geography: { type: 'STATE', code: 'TN' },
      period: {
        start: '2025-04-01T00:00:00.000Z',
        end: '2025-06-30T23:59:59.000Z',
      },
      coverageBasis: {
        label: 'Owner-occupied HO-3 detached homes',
        policyForms: ['HO-3'],
        dwellingTypes: ['SINGLE_FAMILY'],
        limitations: ['Period aggregate; individual underwriting factors are excluded.'],
      },
      sampleSize: 1100,
      notes: null,
      retrievedAt: '2025-07-15T00:00:00.000Z',
      releaseVersion: '2025-Q2',
      source: {
        key: 'acceptance-reviewed-source',
        name: 'Reviewed market source',
        ownerName: 'Acceptance source owner',
        url: 'https://example.com/methodology',
      },
      methodologySummary: 'Observed written premium for the stated period and basis.',
    },
    change: { absolute: 400, percent: 20 },
  };
}

function unavailableContext(state: 'SOURCE_UNAVAILABLE' | 'STALE') {
  const base = {
    contractVersion: 'insurance-market-context-v1',
    classification: 'OBSERVED_MARKET_CONTEXT_NOT_A_QUOTE',
    jurisdictionCode: 'TN',
    state,
    message: state === 'STALE'
      ? 'The latest matching market observation is stale and is not shown as current.'
      : 'The market source is temporarily unavailable. Saved policy facts are unaffected.',
  };
  return state === 'STALE'
    ? {
        ...base,
        lastRetrievedAt: '2025-07-15T00:00:00.000Z',
        expiredAt: '2026-01-15T00:00:00.000Z',
        source: {
          key: 'acceptance-reviewed-source',
          name: 'Reviewed market source',
          ownerName: 'Acceptance source owner',
          url: 'https://example.com/methodology',
        },
      }
    : base;
}

async function fulfillJson(route: Route, body: unknown) {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}
