export type CapabilityGoldenFixture = {
  id: string;
  description: string;
  contextualCapabilityIds: readonly string[];
  needsContextCapabilityIds: readonly string[];
};

export const CAPABILITY_GOLDEN_FIXTURES: readonly CapabilityGoldenFixture[] = [
  {
    id: 'older-home',
    description: 'An established home with tracked systems, financial pressure, and active maintenance signals.',
    contextualCapabilityIds: [
      'break-even',
      'capital-timeline',
      'ownership-costs',
      'savings-benefits',
      'home-digital-twin',
      'home-event-radar',
      'home-briefing',
      'home-habit-coach',
      'home-risk-replay',
      'claims',
      'neighborhood-change-radar',
      'service-price-radar',
      'status-board',
    ],
    needsContextCapabilityIds: [],
  },
  {
    id: 'sparse-new-home',
    description: 'A new home with sparse verified facts and no tracked systems.',
    contextualCapabilityIds: ['buyer-closing', 'savings-benefits'],
    needsContextCapabilityIds: [],
  },
  {
    id: 'property-preparing-for-sale',
    description: 'A homeowner has sale intent and an active moving timeline.',
    contextualCapabilityIds: ['sell-hold-rent', 'seller-prep'],
    needsContextCapabilityIds: [],
  },
  {
    id: 'completed-renovation',
    description: 'A renovation has completed and its finishes and project record need closure.',
    contextualCapabilityIds: ['capital-timeline', 'material-specs', 'project-tracker'],
    needsContextCapabilityIds: [],
  },
  {
    id: 'minor-inspection-findings',
    description: 'A reviewed inspection contains low-risk findings and a possible service decision.',
    contextualCapabilityIds: ['diy', 'inspection-hub', 'service-price-radar'],
    needsContextCapabilityIds: [],
  },
  {
    id: 'hoa-governed-renovation',
    description: 'A renovation is governed by an HOA and may require permits.',
    contextualCapabilityIds: [
      'hoa-compliance',
      'home-renovation-risk-advisor',
      'permits',
      'project-tracker',
    ],
    needsContextCapabilityIds: [],
  },
  {
    id: 'important-documents-and-trusted-contacts',
    description: 'Critical documents exist and trusted-party transfer preparation is incomplete.',
    contextualCapabilityIds: ['home-digital-will'],
    needsContextCapabilityIds: [],
  },
  {
    id: 'plant-suitable-room',
    description: 'A selected room has known light and maintenance context.',
    contextualCapabilityIds: ['plant-advisor'],
    needsContextCapabilityIds: [],
  },
  {
    id: 'insufficient-material-context',
    description: 'A homeowner opens material records without a project, room, or repair context.',
    contextualCapabilityIds: ['material-specs'],
    needsContextCapabilityIds: ['material-specs'],
  },
];

export type CapabilityGoldenRankingExpectation = {
  fixtureId: string;
  ineligibleCapabilityId: string;
  duplicateCapabilityId: string;
  expectedTopCapabilityIds: readonly string[];
  expectedReasonCodes: Readonly<Record<string, string>>;
  expectedSourceIdentities: Readonly<Record<string, {
    kind: 'JOURNEY' | 'PROJECT';
    id: string;
  }>>;
  expectedReadinessExplanations: Readonly<Record<string, readonly string[]>>;
};

function journeyId(fixtureId: string, capabilityId: string): string {
  return `journey-${fixtureId}-${capabilityId}`;
}

function expectation(input: Omit<
  CapabilityGoldenRankingExpectation,
  'expectedSourceIdentities' | 'expectedReadinessExplanations'
> & {
  projectSourceCapabilityIds?: readonly string[];
  readinessExplanations?: Readonly<Record<string, readonly string[]>>;
}): CapabilityGoldenRankingExpectation {
  return {
    fixtureId: input.fixtureId,
    ineligibleCapabilityId: input.ineligibleCapabilityId,
    duplicateCapabilityId: input.duplicateCapabilityId,
    expectedTopCapabilityIds: input.expectedTopCapabilityIds,
    expectedReasonCodes: input.expectedReasonCodes,
    expectedSourceIdentities: Object.fromEntries(
      input.expectedTopCapabilityIds.map((capabilityId) => {
        const projectSource = input.projectSourceCapabilityIds?.includes(
          capabilityId,
        );
        return [capabilityId, {
          kind: projectSource ? 'PROJECT' : 'JOURNEY',
          id: projectSource
            ? `project-${input.fixtureId}-${capabilityId}`
            : journeyId(input.fixtureId, capabilityId),
        }];
      }),
    ),
    expectedReadinessExplanations: Object.fromEntries(
      input.expectedTopCapabilityIds.map((capabilityId) => [
        capabilityId,
        input.readinessExplanations?.[capabilityId] ?? [],
      ]),
    ),
  };
}

/**
 * Executable CAP-408 expectations. The contextualCapabilityIds on the matching
 * fixture are the exact eligible set; needsContextCapabilityIds are the exact
 * safe-partial set. Every scenario also adds one unavailable candidate and one
 * duplicate source-action CTA to prove those paths do not affect the top set.
 */
export const CAPABILITY_GOLDEN_RANKING_EXPECTATIONS:
readonly CapabilityGoldenRankingExpectation[] = [
  expectation({
    fixtureId: 'older-home',
    ineligibleCapabilityId: 'seller-prep',
    duplicateCapabilityId: 'break-even',
    expectedTopCapabilityIds: ['ownership-costs', 'break-even', 'capital-timeline'],
    expectedReasonCodes: {
      'break-even': 'MATERIAL_DECISION_ACTIVE',
      'capital-timeline': 'TRACKED_SYSTEMS_AVAILABLE',
      'ownership-costs': 'OWNERSHIP_COST_MATERIAL_CHANGE',
    },
  }),
  expectation({
    fixtureId: 'sparse-new-home',
    ineligibleCapabilityId: 'seller-prep',
    duplicateCapabilityId: 'savings-benefits',
    expectedTopCapabilityIds: ['buyer-closing', 'savings-benefits'],
    expectedReasonCodes: {
      'buyer-closing': 'BUYER_JOURNEY_ACTIVE',
      'savings-benefits': 'PROPERTY_BENEFIT_EXPLORATION',
    },
  }),
  expectation({
    fixtureId: 'property-preparing-for-sale',
    ineligibleCapabilityId: 'home-digital-will',
    duplicateCapabilityId: 'sell-hold-rent',
    expectedTopCapabilityIds: ['sell-hold-rent', 'seller-prep'],
    expectedReasonCodes: {
      'sell-hold-rent': 'OWNERSHIP_OUTLOOK_SHIFT',
      'seller-prep': 'SELLER_JOURNEY_ACTIVE',
    },
  }),
  expectation({
    fixtureId: 'completed-renovation',
    ineligibleCapabilityId: 'hoa-compliance',
    duplicateCapabilityId: 'capital-timeline',
    expectedTopCapabilityIds: [
      'material-specs',
      'capital-timeline',
      'project-tracker',
    ],
    expectedReasonCodes: {
      'material-specs': 'MATERIAL_RECORD_NEEDED',
      'capital-timeline': 'TRACKED_SYSTEMS_AVAILABLE',
      'project-tracker': 'PROJECT_EXECUTION_STARTED',
    },
    projectSourceCapabilityIds: ['material-specs'],
  }),
  expectation({
    fixtureId: 'minor-inspection-findings',
    ineligibleCapabilityId: 'home-digital-will',
    duplicateCapabilityId: 'diy',
    expectedTopCapabilityIds: [
      'diy',
      'inspection-hub',
      'service-price-radar',
    ],
    expectedReasonCodes: {
      diy: 'LOW_RISK_DIY_ELIGIBLE',
      'inspection-hub': 'INSPECTION_DOCUMENT_AVAILABLE',
      'service-price-radar': 'SERVICE_DECISION_ACTIVE',
    },
  }),
  expectation({
    fixtureId: 'hoa-governed-renovation',
    ineligibleCapabilityId: 'diy',
    duplicateCapabilityId: 'hoa-compliance',
    expectedTopCapabilityIds: [
      'hoa-compliance',
      'home-renovation-risk-advisor',
      'permits',
    ],
    expectedReasonCodes: {
      'hoa-compliance': 'HOA_PROJECT_APPROVAL_REQUIRED',
      'home-renovation-risk-advisor': 'ACTIVE_PROJECT_MOMENT',
      permits: 'PERMIT_RELEVANT_PROJECT',
    },
  }),
  expectation({
    fixtureId: 'important-documents-and-trusted-contacts',
    ineligibleCapabilityId: 'seller-prep',
    duplicateCapabilityId: 'home-digital-will',
    expectedTopCapabilityIds: ['home-digital-will'],
    expectedReasonCodes: {
      'home-digital-will': 'TRUSTED_TRANSFER_PREPARATION',
    },
  }),
  expectation({
    fixtureId: 'plant-suitable-room',
    ineligibleCapabilityId: 'material-specs',
    duplicateCapabilityId: 'plant-advisor',
    expectedTopCapabilityIds: ['plant-advisor'],
    expectedReasonCodes: {
      'plant-advisor': 'PLANT_SUITABLE_ROOM_CONTEXT',
    },
  }),
  expectation({
    fixtureId: 'insufficient-material-context',
    ineligibleCapabilityId: 'plant-advisor',
    duplicateCapabilityId: 'material-specs',
    expectedTopCapabilityIds: ['material-specs'],
    expectedReasonCodes: {
      'material-specs': 'MATERIAL_RECORD_NEEDED',
    },
    readinessExplanations: {
      'material-specs': [
        'Choose a project, room, or repair context before recording materials.',
      ],
    },
  }),
];
