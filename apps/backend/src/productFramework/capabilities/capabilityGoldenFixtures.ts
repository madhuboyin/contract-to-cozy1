export type CapabilityGoldenFixture = {
  id: string;
  description: string;
  contextualCapabilityIds: readonly string[];
  needsContextCapabilityIds: readonly string[];
};

/**
 * Classification/readiness fixtures only. Ranking expectations are added in
 * WS4 after the evaluator and diversity policy exist.
 */
export const CAPABILITY_GOLDEN_FIXTURES: readonly CapabilityGoldenFixture[] = [
  {
    id: 'older-home',
    description: 'An established home with tracked systems, financial pressure, and active maintenance signals.',
    contextualCapabilityIds: [
      'break-even',
      'capital-timeline',
      'cost-growth',
      'coverage-options',
      'hidden-asset-finder',
      'home-digital-twin',
      'home-event-radar',
      'home-habit-coach',
      'home-risk-replay',
      'insurance-trend',
      'neighborhood-change-radar',
      'service-price-radar',
      'status-board',
    ],
    needsContextCapabilityIds: [],
  },
  {
    id: 'sparse-new-home',
    description: 'A new home with sparse verified facts and no tracked systems.',
    contextualCapabilityIds: ['home-digital-twin', 'hidden-asset-finder'],
    needsContextCapabilityIds: ['home-digital-twin', 'hidden-asset-finder'],
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
