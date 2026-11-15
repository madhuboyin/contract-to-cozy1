/**
 * Phase 0 Bullets 8 & 9 (FR-EVAL-1, §5, §18 Phase 0, §19 Artifacts #17 & #18, §20):
 * - Seeded Property Scenario Archetypes
 * - Independent Semantic Scenario Families Across All 14 Domains
 * - Exact Current Failures Regression Catalogue (labelled CONTAINMENT_REGRESSION_NOT_COVERAGE_PROOF)
 */
import { ASK_SEMANTIC_DOMAINS, type SemanticDomainId } from './semanticOntologyBaseline';
import { evaluateScalarFieldCoalescence } from './scalarFieldCoalescenceManifest';
import { classifyTransitionalWarrantyLinks } from '../transitionalWarrantyRead';

export const ASK_SEEDED_SCENARIO_CATALOGUE_VERSION = 'phase0-seeded-scenarios-1.1.0' as const;

export type SeededDataStateVariant = 'POPULATED' | 'EMPTY_OR_MISSING' | 'UNKNOWN' | 'CONFLICTED';

export interface SeededPropertyFixtureDataset {
  readonly property: {
    readonly id: string;
    readonly name: string;
    readonly yearBuilt: number | null;
    readonly roofType: string | null;
    readonly roofReplacementYear: number | null;
    readonly hvacInstallYear: number | null;
    readonly waterHeaterInstallYear: number | null;
    readonly zipCode: string | null;
    readonly normalizedZipCode: string | null;
    readonly geocodedZipCode: string | null;
    readonly lotSize: number | null;
    readonly hasIrrigation: boolean | null;
    readonly hasDrainageIssues: boolean | null;
  };
  readonly exteriorProfile: {
    readonly lotSizeSqFt: number | null;
    readonly hasIrrigation: boolean | null;
    readonly hasDrainageIssues: boolean | null;
  } | null;
  readonly inventoryItems: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly category: string | null;
    readonly assetType: string | null;
    readonly brand: string | null;
    readonly manufacturer: string | null;
    readonly manufacturerNorm: string | null;
    readonly model: string | null;
    readonly modelNumber: string | null;
    readonly modelNumberNorm: string | null;
    readonly serialNo: string | null;
    readonly serialNumber: string | null;
    readonly installedOn: string | null;
    readonly warrantyId: string | null;
    readonly coverageEvidenceStatus: 'NONE' | 'NOT_SURE' | 'UNKNOWN' | 'VERIFIED';
    readonly purchaseCostCents: number | null;
    readonly replacementCostCents: number | null;
  }>;
  readonly warranties: ReadonlyArray<{
    readonly id: string;
    readonly inventoryItemId: string | null;
    readonly providerName: string;
    readonly policyNumber: string | null;
    readonly category: string;
    readonly expiryDate: string | null;
    readonly cost: number | null;
  }>;
  readonly insurancePolicies: ReadonlyArray<{
    readonly id: string;
    readonly carrierName: string;
    readonly policyNumber: string;
    readonly coverageType: string | null;
    readonly premiumAmount: number | null;
    readonly deductibleAmount: number | null;
    readonly deductibleCents: number | null;
    readonly personalPropertyLimitCents: number | null;
    readonly expiryDate: string | null;
    readonly isVerified: boolean;
  }>;
  readonly maintenanceTasks: ReadonlyArray<{
    readonly id: string;
    readonly title: string;
    readonly status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'OVERDUE';
    readonly priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
    readonly category: string | null;
    readonly assetType: string | null;
    readonly serviceCategory: string | null;
    readonly nextDueDate: string | null;
    readonly inventoryItemId: string | null;
  }>;
  readonly claims: ReadonlyArray<{
    readonly id: string;
    readonly title: string;
    readonly status: 'DRAFT' | 'OPEN' | 'SUBMITTED' | 'CLOSED';
    readonly type: string;
    readonly claimNumber: string | null;
    readonly deductibleAmount: number | null;
    readonly estimatedLossAmount: number | null;
    readonly settlementAmount: number | null;
    readonly requiredDocumentsMissing: boolean;
  }>;
  readonly claimDocuments: ReadonlyArray<{
    readonly id: string;
    readonly claimId: string;
    readonly documentId: string;
    readonly propertyRecordId: string;
    readonly title: string;
  }>;
  readonly propertyRecords: ReadonlyArray<{
    readonly id: string;
    readonly title: string;
    readonly recordType: string;
    readonly visibility: 'VIEWER' | 'CONTRIBUTOR' | 'OWNER';
    readonly verificationStatus: 'VERIFIED' | 'UNVERIFIED' | 'UNKNOWN';
    readonly currentVersionId: string | null;
  }>;
  readonly taxBills: ReadonlyArray<{
    readonly id: string;
    readonly taxYear: number;
    readonly billAmount: number;
    readonly status: string;
  }>;
  readonly reserveFund: {
    readonly id: string;
    readonly currentBalanceCents: number;
    readonly recommendedMonthlyContributionCents: number;
    readonly currentShortfallCents: number;
  } | null;
  readonly projectsAndQuotes: ReadonlyArray<{
    readonly id: string;
    readonly title: string;
    readonly vendorName: string;
    readonly quoteAmountCents: number;
    readonly permitStatus: string;
  }>;
  readonly risksRecallsInspections: ReadonlyArray<{
    readonly id: string;
    readonly kind: 'RECALL' | 'INSPECTION_FINDING' | 'RADAR_HAZARD';
    readonly title: string;
    readonly severity: string;
    readonly status: string;
  }>;
  readonly homeEvents: ReadonlyArray<{
    readonly id: string;
    readonly title: string;
    readonly eventType: string;
    readonly occurredAt: string;
  }>;
  readonly buyerChecklist: {
    readonly id: string;
    readonly status: string;
    readonly stage: string;
    readonly targetCloseDate: string;
    readonly tasks: ReadonlyArray<{
      readonly id: string;
      readonly title: string;
      readonly status: string;
      readonly priority: string;
      readonly dueAt: string | null;
    }>;
    readonly milestones: ReadonlyArray<{
      readonly id: string;
      readonly milestoneKey: string;
      readonly status: string;
      readonly dueAt: string | null;
    }>;
  } | null;
  readonly sellerPrep: {
    readonly saleCaseId: string;
    readonly status: string;
    readonly targetCloseDate: string;
    readonly stagingReadiness: string;
    readonly readinessItems: ReadonlyArray<{
      readonly id: string;
      readonly title: string;
      readonly status: string;
      readonly estimatedCostMinCents: number | null;
      readonly estimatedCostMaxCents: number | null;
    }>;
  } | null;
  readonly accountHouseholdPreferences: ReadonlyArray<{
    readonly id: string;
    readonly kind: 'SAVED_RESULT' | 'NOTIFICATION' | 'GUIDANCE_JOURNEY' | 'HOUSEHOLD_MEMBER';
    readonly title: string;
    readonly roleFloor: 'VIEWER' | 'CONTRIBUTOR' | 'OWNER';
  }>;
}

export interface SeededPropertyArchetype {
  readonly archetypeId: string;
  readonly title: string;
  readonly description: string;
  readonly supportedDataStates: readonly SeededDataStateVariant[];
  readonly supportedRoles: readonly ('VIEWER' | 'CONTRIBUTOR' | 'OWNER')[];
  readonly domainsCovered: readonly SemanticDomainId[];
  readonly fixtureData: SeededPropertyFixtureDataset;
}

export const ASK_SEEDED_PROPERTY_ARCHETYPES: readonly SeededPropertyArchetype[] = Object.freeze([
  {
    archetypeId: 'property.seeded.complete_single_family',
    title: 'Populated single-family home across all 14 domains',
    description: 'Contains verified inventory items, active/expired warranties, homeowner insurance policy, open/overdue maintenance tasks, open water-damage claim with documents, tax bills across 3 years, reserve fund, active project with contractor quotes, recall match, inspection findings, home events, and household roles.',
    supportedDataStates: ['POPULATED'],
    supportedRoles: ['VIEWER', 'CONTRIBUTOR', 'OWNER'],
    domainsCovered: ASK_SEMANTIC_DOMAINS.filter((d) => d.domainId !== 'domain.safety_boundary').map((d) => d.domainId),
    fixtureData: {
      property: {
        id: 'prop-complete-1',
        name: '742 Evergreen Terrace',
        yearBuilt: 2012,
        roofType: 'ARCHITECTURAL_SHINGLE',
        roofReplacementYear: 2021,
        hvacInstallYear: 2020,
        waterHeaterInstallYear: 2022,
        zipCode: '78701',
        normalizedZipCode: '78701',
        geocodedZipCode: '78701',
        lotSize: 8500,
        hasIrrigation: true,
        hasDrainageIssues: false,
      },
      exteriorProfile: {
        lotSizeSqFt: 8500,
        hasIrrigation: true,
        hasDrainageIssues: false,
      },
      inventoryItems: [
        {
          id: 'item-hvac-1',
          name: 'Carrier Infinity Heat Pump',
          category: 'HVAC',
          assetType: 'HVAC',
          brand: 'Carrier',
          manufacturer: 'Carrier',
          manufacturerNorm: 'carrier',
          model: '24VNA9',
          modelNumber: '24VNA9',
          modelNumberNorm: '24vna9',
          serialNo: 'SN-CAR-2020',
          serialNumber: 'SN-CAR-2020',
          installedOn: '2020-05-15',
          warrantyId: 'war-hvac-1',
          coverageEvidenceStatus: 'VERIFIED',
          purchaseCostCents: 820000,
          replacementCostCents: 950000,
        },
        {
          id: 'item-dishwasher-1',
          name: 'Bosch 800 Series Dishwasher',
          category: 'APPLIANCE',
          assetType: 'APPLIANCE',
          brand: 'Bosch',
          manufacturer: 'Bosch',
          manufacturerNorm: 'bosch',
          model: 'SHPM88Z75N',
          modelNumber: 'SHPM88Z75N',
          modelNumberNorm: 'shpm88z75n',
          serialNo: 'SN-BSH-2022',
          serialNumber: 'SN-BSH-2022',
          installedOn: '2022-08-10',
          warrantyId: null,
          coverageEvidenceStatus: 'NONE',
          purchaseCostCents: 129900,
          replacementCostCents: 139900,
        },
      ],
      warranties: [
        {
          id: 'war-hvac-1',
          inventoryItemId: 'item-hvac-1',
          providerName: 'Carrier Comfort Warranty',
          policyNumber: 'CW-99201',
          category: 'HVAC',
          expiryDate: '2030-05-15',
          cost: 0,
        },
      ],
      insurancePolicies: [
        {
          id: 'ins-ho3-1',
          carrierName: 'Chubb Masterpiece',
          policyNumber: 'HO3-78701-01',
          coverageType: 'HO3',
          premiumAmount: 2400,
          deductibleAmount: 1500,
          deductibleCents: 150000,
          personalPropertyLimitCents: 25000000,
          expiryDate: '2027-01-01',
          isVerified: true,
        },
      ],
      maintenanceTasks: [
        {
          id: 'task-filter-1',
          title: 'Replace HVAC MERV-13 filter',
          status: 'OVERDUE',
          priority: 'HIGH',
          category: 'HVAC',
          assetType: 'HVAC',
          serviceCategory: 'HVAC',
          nextDueDate: '2026-04-01',
          inventoryItemId: 'item-hvac-1',
        },
      ],
      claims: [
        {
          id: 'claim-water-1',
          title: 'Upstairs guest bath supply line leak',
          status: 'OPEN',
          type: 'WATER_DAMAGE',
          claimNumber: 'CLM-2026-104',
          deductibleAmount: 1500,
          estimatedLossAmount: 6800,
          settlementAmount: null,
          requiredDocumentsMissing: false,
        },
      ],
      claimDocuments: [
        {
          id: 'cdoc-1',
          claimId: 'claim-water-1',
          documentId: 'doc-plumber-1',
          propertyRecordId: 'rec-plumber-invoice-1',
          title: 'Plumber emergency mitigation invoice',
        },
      ],
      propertyRecords: [
        {
          id: 'rec-plumber-invoice-1',
          title: 'Plumber emergency mitigation invoice',
          recordType: 'INVOICE',
          visibility: 'VIEWER',
          verificationStatus: 'VERIFIED',
          currentVersionId: 'ver-plumber-1',
        },
      ],
      taxBills: [
        {
          id: 'tax-2025',
          taxYear: 2025,
          billAmount: 7850,
          status: 'PAID',
        },
      ],
      reserveFund: {
        id: 'res-fund-1',
        currentBalanceCents: 1450000,
        recommendedMonthlyContributionCents: 45000,
        currentShortfallCents: 200000,
      },
      projectsAndQuotes: [
        {
          id: 'proj-deck-1',
          title: 'Composite deck resurfacing',
          vendorName: 'Austin Deck Pros',
          quoteAmountCents: 1850000,
          permitStatus: 'APPROVED',
        },
      ],
      risksRecallsInspections: [
        {
          id: 'risk-recall-1',
          kind: 'RECALL',
          title: 'Dishwasher power cord safety recall check',
          severity: 'HIGH',
          status: 'OPEN',
        },
      ],
      homeEvents: [
        {
          id: 'evt-roof-2021',
          title: 'Full architectural shingle roof replacement',
          eventType: 'CAPITAL_IMPROVEMENT',
          occurredAt: '2021-06-15',
        },
      ],
      buyerChecklist: {
        id: 'buyer-chk-complete-1',
        status: 'ACTIVE',
        stage: 'CLOSING',
        targetCloseDate: '2026-06-01',
        tasks: [
          {
            id: 'btask-complete-1',
            title: 'Schedule final walkthrough',
            status: 'PENDING',
            priority: 'HIGH',
            dueAt: '2026-05-28',
          },
        ],
        milestones: [
          {
            id: 'bmile-complete-1',
            milestoneKey: 'APPRAISAL_COMPLETE',
            status: 'COMPLETED',
            dueAt: '2026-05-15',
          },
        ],
      },
      sellerPrep: {
        saleCaseId: 'sale-case-complete-1',
        status: 'PREP',
        targetCloseDate: '2026-09-15',
        stagingReadiness: 'READY',
        readinessItems: [
          {
            id: 'sitem-complete-1',
            title: 'Touch up exterior trim paint',
            status: 'OPEN',
            estimatedCostMinCents: 80000,
            estimatedCostMaxCents: 150000,
          },
        ],
      },
      accountHouseholdPreferences: [
        {
          id: 'saved-refi-1',
          kind: 'SAVED_RESULT',
          title: 'Saved 30-year refinance comparison',
          roleFloor: 'VIEWER',
        },
      ],
    },
  },
  {
    archetypeId: 'property.seeded.missing_and_unknown_states',
    title: 'Home with unrecorded fields and UNKNOWN relationship states',
    description: 'Contains appliances with null serialNumber/modelNumber, items with coverageEvidenceStatus=UNKNOWN_NEEDS_REVIEW, claims missing required documents, and uninitialized reserve fund.',
    supportedDataStates: ['EMPTY_OR_MISSING', 'UNKNOWN'],
    supportedRoles: ['VIEWER', 'CONTRIBUTOR', 'OWNER'],
    domainsCovered: [
      'domain.property_profile',
      'domain.inventory',
      'domain.maintenance',
      'domain.warranties_coverage',
      'domain.insurance_policies',
      'domain.claims',
      'domain.documents_records',
      'domain.ownership_costs_finance',
      'domain.projects_quotes_vendors',
      'domain.risks_recalls_inspections',
      'domain.timeline_home_events',
      'domain.account_household_preferences',
    ],
    fixtureData: {
      property: {
        id: 'prop-missing-1',
        name: '19 Oak Hollow Lane',
        yearBuilt: 1998,
        roofType: null,
        roofReplacementYear: null,
        hvacInstallYear: null,
        waterHeaterInstallYear: null,
        zipCode: '98101',
        normalizedZipCode: null,
        geocodedZipCode: null,
        lotSize: null,
        hasIrrigation: null,
        hasDrainageIssues: null,
      },
      exteriorProfile: null,
      inventoryItems: [
        {
          id: 'item-washer-unknown-1',
          name: 'Laundry Room Washer',
          category: 'APPLIANCE',
          assetType: 'APPLIANCE',
          brand: null,
          manufacturer: null,
          manufacturerNorm: null,
          model: null,
          modelNumber: null,
          modelNumberNorm: null,
          serialNo: null,
          serialNumber: null,
          installedOn: null,
          warrantyId: null,
          coverageEvidenceStatus: 'NOT_SURE',
          purchaseCostCents: null,
          replacementCostCents: null,
        },
      ],
      warranties: [],
      insurancePolicies: [],
      maintenanceTasks: [],
      claims: [
        {
          id: 'claim-missing-docs-1',
          title: 'Windstorm fence damage claim',
          status: 'OPEN',
          type: 'WIND_HAIL',
          claimNumber: null,
          deductibleAmount: null,
          estimatedLossAmount: 3200,
          settlementAmount: null,
          requiredDocumentsMissing: true,
        },
      ],
      claimDocuments: [],
      propertyRecords: [
        {
          id: 'rec-unverified-scan-1',
          title: 'Unverified closing packet scan',
          recordType: 'DISCLOSURE',
          visibility: 'CONTRIBUTOR',
          verificationStatus: 'UNKNOWN',
          currentVersionId: null,
        },
      ],
      taxBills: [],
      reserveFund: null,
      projectsAndQuotes: [],
      risksRecallsInspections: [],
      homeEvents: [],
      buyerChecklist: null,
      sellerPrep: null,
      accountHouseholdPreferences: [],
    },
  },
  {
    archetypeId: 'property.seeded.conflicted_and_dual_parent_auth',
    title: 'Home with conflicting legacy links, conflicting duplicate scalars, and restricted child documents',
    description: 'Contains InventoryItem rows where warrantyId disagrees with Warranty.inventoryItemId, model disagrees with modelNumber, InsurancePolicy.deductibleAmount disagrees with deductibleCents, and a ClaimDocument referencing an OWNER-only PropertyRecord.',
    supportedDataStates: ['CONFLICTED', 'POPULATED'],
    supportedRoles: ['VIEWER', 'CONTRIBUTOR', 'OWNER'],
    domainsCovered: [
      'domain.inventory',
      'domain.warranties_coverage',
      'domain.insurance_policies',
      'domain.claims',
      'domain.documents_records',
    ],
    fixtureData: {
      property: {
        id: 'prop-conflicted-1',
        name: '405 Conflict Ridge Rd',
        yearBuilt: 2015,
        roofType: 'METAL',
        roofReplacementYear: 2016,
        hvacInstallYear: 2015,
        waterHeaterInstallYear: 2019,
        zipCode: '30309',
        normalizedZipCode: '30309',
        geocodedZipCode: '30308',
        lotSize: 10200,
        hasIrrigation: true,
        hasDrainageIssues: false,
      },
      exteriorProfile: {
        lotSizeSqFt: 10200,
        hasIrrigation: false,
        hasDrainageIssues: false,
      },
      inventoryItems: [
        {
          id: 'item-fridge-conflict-1',
          name: 'Samsung Bespoke Refrigerator',
          category: 'APPLIANCE',
          assetType: 'APPLIANCE',
          brand: 'Samsung',
          manufacturer: 'Samsung Electronics',
          manufacturerNorm: 'samsung electronics',
          model: 'RF28-LEGACY',
          modelNumber: 'RF28R7351SR',
          modelNumberNorm: 'rf28r7351sr',
          serialNo: 'SER-OLD-01',
          serialNumber: 'SER-NEW-99',
          installedOn: '2021-03-01',
          warrantyId: 'war-legacy-plan-1',
          coverageEvidenceStatus: 'VERIFIED',
          purchaseCostCents: 289900,
          replacementCostCents: 310000,
        },
      ],
      warranties: [
        {
          id: 'war-legacy-plan-1',
          inventoryItemId: null,
          providerName: 'First American Home Warranty',
          policyNumber: 'FA-1001',
          category: 'APPLIANCE',
          expiryDate: '2027-03-01',
          cost: 650,
        },
        {
          id: 'war-item-direct-2',
          inventoryItemId: 'item-fridge-conflict-1',
          providerName: 'Samsung Care+ Extended',
          policyNumber: 'SC-2002',
          category: 'APPLIANCE',
          expiryDate: '2028-03-01',
          cost: 299,
        },
      ],
      insurancePolicies: [
        {
          id: 'ins-conflict-1',
          carrierName: 'State Farm',
          policyNumber: 'SF-30309-88',
          coverageType: 'HO3',
          premiumAmount: 1950,
          deductibleAmount: 2500,
          deductibleCents: 100000,
          personalPropertyLimitCents: 18000000,
          expiryDate: '2026-12-31',
          isVerified: true,
        },
      ],
      maintenanceTasks: [],
      claims: [
        {
          id: 'claim-dual-parent-1',
          title: 'Kitchen refrigerator line leak claim',
          status: 'SUBMITTED',
          type: 'WATER_DAMAGE',
          claimNumber: 'SF-CLM-882',
          deductibleAmount: 2500,
          estimatedLossAmount: 4900,
          settlementAmount: null,
          requiredDocumentsMissing: false,
        },
      ],
      claimDocuments: [
        {
          id: 'cdoc-restricted-1',
          claimId: 'claim-dual-parent-1',
          documentId: 'doc-owner-private-1',
          propertyRecordId: 'rec-owner-only-settlement-1',
          title: 'Owner-only private tax & settlement worksheet',
        },
      ],
      propertyRecords: [
        {
          id: 'rec-owner-only-settlement-1',
          title: 'Owner-only private tax & settlement worksheet',
          recordType: 'FINANCIAL',
          visibility: 'OWNER',
          verificationStatus: 'VERIFIED',
          currentVersionId: 'ver-owner-1',
        },
      ],
      taxBills: [],
      reserveFund: null,
      projectsAndQuotes: [],
      risksRecallsInspections: [],
      homeEvents: [],
      buyerChecklist: null,
      sellerPrep: null,
      accountHouseholdPreferences: [],
    },
  },
  {
    archetypeId: 'property.seeded.buyer_and_seller_lifecycle',
    title: 'Home with active buyer acquisition checklist and seller preparation case',
    description: 'Contains HomeBuyerChecklist with open tasks and contingency milestones alongside PropertySaleCase with sale readiness items and cosmetic prep profile.',
    supportedDataStates: ['POPULATED', 'EMPTY_OR_MISSING'],
    supportedRoles: ['VIEWER', 'CONTRIBUTOR', 'OWNER'],
    domainsCovered: ['domain.buyer_journey', 'domain.seller_preparation', 'domain.projects_quotes_vendors'],
    fixtureData: {
      property: {
        id: 'prop-lifecycle-1',
        name: '88 Transition Way',
        yearBuilt: 2008,
        roofType: 'ARCHITECTURAL_SHINGLE',
        roofReplacementYear: 2019,
        hvacInstallYear: 2018,
        waterHeaterInstallYear: 2021,
        zipCode: '80202',
        normalizedZipCode: '80202',
        geocodedZipCode: '80202',
        lotSize: 6400,
        hasIrrigation: false,
        hasDrainageIssues: false,
      },
      exteriorProfile: null,
      inventoryItems: [],
      warranties: [],
      insurancePolicies: [],
      maintenanceTasks: [],
      claims: [],
      claimDocuments: [],
      propertyRecords: [],
      taxBills: [],
      reserveFund: null,
      projectsAndQuotes: [
        {
          id: 'proj-presale-paint-1',
          title: 'Interior neutral repaint before listing',
          vendorName: 'Mile High Painters',
          quoteAmountCents: 420000,
          permitStatus: 'NOT_REQUIRED',
        },
      ],
      risksRecallsInspections: [],
      homeEvents: [],
      buyerChecklist: {
        id: 'buyer-chk-lifecycle-1',
        status: 'ACTIVE',
        stage: 'UNDER_CONTRACT',
        targetCloseDate: '2026-06-15',
        tasks: [
          {
            id: 'btask-lifecycle-1',
            title: 'Upload earnest money wire receipt',
            status: 'PENDING',
            priority: 'URGENT',
            dueAt: '2026-05-20',
          },
          {
            id: 'btask-lifecycle-2',
            title: 'Confirm sewer scope inspection',
            status: 'COMPLETED',
            priority: 'HIGH',
            dueAt: '2026-05-18',
          },
        ],
        milestones: [
          {
            id: 'bmile-lifecycle-1',
            milestoneKey: 'INSPECTION_OBJECTION_DEADLINE',
            status: 'PENDING',
            dueAt: '2026-05-25',
          },
        ],
      },
      sellerPrep: {
        saleCaseId: 'sale-case-lifecycle-1',
        status: 'PREP',
        targetCloseDate: '2026-09-01',
        stagingReadiness: 'IN_PROGRESS',
        readinessItems: [
          {
            id: 'sitem-lifecycle-1',
            title: 'Refinish front entry hardwood threshold',
            status: 'OPEN',
            estimatedCostMinCents: 65000,
            estimatedCostMaxCents: 110000,
          },
          {
            id: 'sitem-lifecycle-2',
            title: 'Stage primary bedroom and patio',
            status: 'PURSUING',
            estimatedCostMinCents: null,
            estimatedCostMaxCents: null,
          },
        ],
      },
      accountHouseholdPreferences: [],
    },
  },
] as const);

export interface IndependentSemanticScenarioFamily {
  readonly familyId: string;
  readonly domainId: SemanticDomainId;
  readonly requestClass: 'DATA_QUERY' | 'ANALYSIS_OR_DECISION' | 'WORKFLOW_OR_COMMAND';
  readonly targetKind: 'QUERY' | 'CAPABILITY' | 'COMMAND';
  readonly semanticJobOrRelationId: string;
  readonly canonicalPrompt: string;
  readonly paraphrases: readonly string[];
  readonly adjacentNegatives: readonly string[];
  readonly seededArchetypeIds: readonly string[];
  readonly requiredDataStateVariants: readonly SeededDataStateVariant[];
  readonly expectedPlanSummary: {
    readonly subjectEntityId: string;
    readonly projection: 'DETAIL' | 'LIST' | 'COUNT' | 'EXISTS' | 'AGGREGATE' | 'COMPARE' | 'CAPABILITY_RESULT' | 'COMMAND_PREVIEW';
    readonly polarity: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
    readonly requiredSlots: readonly string[];
  };
}

export const ASK_CROSS_DOMAIN_SEMANTIC_FAMILIES: readonly IndependentSemanticScenarioFamily[] = Object.freeze([
  {
    familyId: 'family.property_profile.roof_and_structure_facts',
    domainId: 'domain.property_profile',
    requestClass: 'DATA_QUERY',
    targetKind: 'QUERY',
    semanticJobOrRelationId: 'field.home.roofReplacementYear',
    canonicalPrompt: 'When was my roof replaced and what is the roof type?',
    paraphrases: ['what year was the roof installed on my house?', 'tell me my home roof type and replacement year'],
    adjacentNegatives: ['should I repair or replace my roof?', 'which roof warranty is expiring?'],
    seededArchetypeIds: ['property.seeded.complete_single_family', 'property.seeded.missing_and_unknown_states'],
    requiredDataStateVariants: ['POPULATED', 'EMPTY_OR_MISSING'],
    expectedPlanSummary: { subjectEntityId: 'entity.property', projection: 'DETAIL', polarity: 'POSITIVE', requiredSlots: [] },
  },
  {
    familyId: 'family.inventory.warranty_relation_negative',
    domainId: 'domain.inventory',
    requestClass: 'DATA_QUERY',
    targetKind: 'QUERY',
    semanticJobOrRelationId: 'relation.inventory_item.warranty',
    canonicalPrompt: 'list items without warranty',
    paraphrases: [
      "list down all items which don't have warranty",
      'provide details of all items without warranty',
      'how many appliances are not having warranty',
      'which of my appliances have no warranty',
    ],
    adjacentNegatives: ['which items are having warranty', 'what are my warranty coverage gaps?', 'what is my insurance deductible?'],
    seededArchetypeIds: [
      'property.seeded.complete_single_family',
      'property.seeded.missing_and_unknown_states',
      'property.seeded.conflicted_and_dual_parent_auth',
    ],
    requiredDataStateVariants: ['POPULATED', 'EMPTY_OR_MISSING', 'UNKNOWN', 'CONFLICTED'],
    expectedPlanSummary: { subjectEntityId: 'entity.inventory_item', projection: 'LIST', polarity: 'NEGATIVE', requiredSlots: [] },
  },
  {
    familyId: 'family.inventory.warranty_relation_positive',
    domainId: 'domain.warranties_coverage',
    requestClass: 'DATA_QUERY',
    targetKind: 'QUERY',
    semanticJobOrRelationId: 'relation.inventory_item.warranty',
    canonicalPrompt: 'which items are having warranty',
    paraphrases: ['which appliances have warranties', 'do any appliances have a warranty?'],
    adjacentNegatives: ['list items without warranty', 'when does my home insurance policy expire?'],
    seededArchetypeIds: [
      'property.seeded.complete_single_family',
      'property.seeded.missing_and_unknown_states',
      'property.seeded.conflicted_and_dual_parent_auth',
    ],
    requiredDataStateVariants: ['POPULATED', 'EMPTY_OR_MISSING', 'UNKNOWN', 'CONFLICTED'],
    expectedPlanSummary: { subjectEntityId: 'entity.inventory_item', projection: 'LIST', polarity: 'POSITIVE', requiredSlots: [] },
  },
  {
    familyId: 'family.maintenance.upcoming_and_category_tasks',
    domainId: 'domain.maintenance',
    requestClass: 'DATA_QUERY',
    targetKind: 'QUERY',
    semanticJobOrRelationId: 'query.maintenance_task.status_and_window',
    canonicalPrompt: 'what maintenance is due next month?',
    paraphrases: ['show plumbing and electrical tasks', 'which appliances have overdue maintenance?'],
    adjacentNegatives: ['mark the gutter task complete', 'what buyer deadlines are due before closing?'],
    seededArchetypeIds: ['property.seeded.complete_single_family', 'property.seeded.missing_and_unknown_states'],
    requiredDataStateVariants: ['POPULATED', 'EMPTY_OR_MISSING'],
    expectedPlanSummary: { subjectEntityId: 'entity.maintenance_task', projection: 'LIST', polarity: 'POSITIVE', requiredSlots: [] },
  },
  {
    familyId: 'family.insurance_policies.deductible_and_expiry',
    domainId: 'domain.insurance_policies',
    requestClass: 'DATA_QUERY',
    targetKind: 'QUERY',
    semanticJobOrRelationId: 'field.policy.deductible',
    canonicalPrompt: 'what is my insurance deductible and when does my policy expire?',
    paraphrases: ['who is my insurance carrier and what is the deductible?', 'when does my homeowners insurance renew?'],
    adjacentNegatives: ['which appliances have no warranty?', 'what claims are still open?'],
    seededArchetypeIds: [
      'property.seeded.complete_single_family',
      'property.seeded.missing_and_unknown_states',
      'property.seeded.conflicted_and_dual_parent_auth',
    ],
    requiredDataStateVariants: ['POPULATED', 'EMPTY_OR_MISSING', 'CONFLICTED'],
    expectedPlanSummary: { subjectEntityId: 'entity.insurance_policy', projection: 'DETAIL', polarity: 'POSITIVE', requiredSlots: [] },
  },
  {
    familyId: 'family.claims.open_claims_and_documents',
    domainId: 'domain.claims',
    requestClass: 'DATA_QUERY',
    targetKind: 'QUERY',
    semanticJobOrRelationId: 'relation.claim.claim_document',
    canonicalPrompt: 'show the documents for my water-damage claim',
    paraphrases: ['what claims are open and what documents are missing?', 'when is the next follow-up on my water damage claim?'],
    adjacentNegatives: ['show all home records', 'when does my warranty expire?'],
    seededArchetypeIds: [
      'property.seeded.complete_single_family',
      'property.seeded.missing_and_unknown_states',
      'property.seeded.conflicted_and_dual_parent_auth',
    ],
    requiredDataStateVariants: ['POPULATED', 'EMPTY_OR_MISSING', 'UNKNOWN'],
    expectedPlanSummary: { subjectEntityId: 'entity.claim', projection: 'LIST', polarity: 'POSITIVE', requiredSlots: ['claimId'] },
  },
  {
    familyId: 'family.documents_records.record_verification_and_versions',
    domainId: 'domain.documents_records',
    requestClass: 'DATA_QUERY',
    targetKind: 'QUERY',
    semanticJobOrRelationId: 'relation.property_record.record_version',
    canonicalPrompt: 'what is the verification status and latest version of my roof invoice record?',
    paraphrases: ['which appliances don’t have a manual or receipt?', 'show the scan status of my deed record'],
    adjacentNegatives: ['show the documents for my water-damage claim', 'export my home report'],
    seededArchetypeIds: [
      'property.seeded.complete_single_family',
      'property.seeded.missing_and_unknown_states',
      'property.seeded.conflicted_and_dual_parent_auth',
    ],
    requiredDataStateVariants: ['POPULATED', 'EMPTY_OR_MISSING'],
    expectedPlanSummary: { subjectEntityId: 'entity.property_record', projection: 'DETAIL', polarity: 'POSITIVE', requiredSlots: ['recordId'] },
  },
  {
    familyId: 'family.ownership_costs_finance.tax_bill_comparison',
    domainId: 'domain.ownership_costs_finance',
    requestClass: 'DATA_QUERY',
    targetKind: 'QUERY',
    semanticJobOrRelationId: 'query.property_tax_bill.compare_periods',
    canonicalPrompt: "compare this year's tax bill with last year's",
    paraphrases: ['how has my property tax bill changed over the years?', 'what was my property tax assessment last year vs this year?'],
    adjacentNegatives: ['start a property tax appeal', 'how long until owning beats renting?'],
    seededArchetypeIds: ['property.seeded.complete_single_family', 'property.seeded.missing_and_unknown_states'],
    requiredDataStateVariants: ['POPULATED', 'EMPTY_OR_MISSING'],
    expectedPlanSummary: { subjectEntityId: 'entity.property_tax_bill', projection: 'COMPARE', polarity: 'POSITIVE', requiredSlots: [] },
  },
  {
    familyId: 'family.ownership_costs_finance.own_rent_and_refinance_breakeven',
    domainId: 'domain.ownership_costs_finance',
    requestClass: 'ANALYSIS_OR_DECISION',
    targetKind: 'CAPABILITY',
    semanticJobOrRelationId: 'job.own_rent_break_even',
    canonicalPrompt: 'how long until owning beats renting?',
    paraphrases: ['would refinancing break even within three years?', 'what is my reserve fund shortfall?'],
    adjacentNegatives: ["compare this year's tax bill with last year's", 'what did I pay for my dishwasher?'],
    seededArchetypeIds: ['property.seeded.complete_single_family', 'property.seeded.missing_and_unknown_states'],
    requiredDataStateVariants: ['POPULATED', 'EMPTY_OR_MISSING'],
    expectedPlanSummary: { subjectEntityId: 'entity.property', projection: 'CAPABILITY_RESULT', polarity: 'POSITIVE', requiredSlots: ['horizonYears'] },
  },
  {
    familyId: 'family.projects_quotes_vendors.quote_comparison_and_permits',
    domainId: 'domain.projects_quotes_vendors',
    requestClass: 'ANALYSIS_OR_DECISION',
    targetKind: 'CAPABILITY',
    semanticJobOrRelationId: 'job.quote_comparison_review',
    canonicalPrompt: 'compare these two kitchen contractor quotes',
    paraphrases: ['which active projects still need a permit?', 'is this HVAC repair quote fair for my area?'],
    adjacentNegatives: ['should I repair the furnace or replace it?', 'what maintenance is due next month?'],
    seededArchetypeIds: [
      'property.seeded.complete_single_family',
      'property.seeded.missing_and_unknown_states',
      'property.seeded.buyer_and_seller_lifecycle',
    ],
    requiredDataStateVariants: ['POPULATED', 'UNKNOWN'],
    expectedPlanSummary: { subjectEntityId: 'entity.property', projection: 'CAPABILITY_RESULT', polarity: 'POSITIVE', requiredSlots: ['quoteWorkspaceId'] },
  },
  {
    familyId: 'family.risks_recalls_inspections.recalls_and_inspection_findings',
    domainId: 'domain.risks_recalls_inspections',
    requestClass: 'ANALYSIS_OR_DECISION',
    targetKind: 'CAPABILITY',
    semanticJobOrRelationId: 'job.recall_review',
    canonicalPrompt: 'do I have recalls and which items are affected?',
    paraphrases: ['what environmental risks affect this home this week?', 'which inspection findings still need action?'],
    adjacentNegatives: ['list items without warranty', 'what are my buyer contingency deadlines?'],
    seededArchetypeIds: ['property.seeded.complete_single_family', 'property.seeded.missing_and_unknown_states'],
    requiredDataStateVariants: ['POPULATED', 'EMPTY_OR_MISSING'],
    expectedPlanSummary: { subjectEntityId: 'entity.inventory_item', projection: 'CAPABILITY_RESULT', polarity: 'POSITIVE', requiredSlots: [] },
  },
  {
    familyId: 'family.inventory.replacement_guidance_decision',
    domainId: 'domain.inventory',
    requestClass: 'ANALYSIS_OR_DECISION',
    targetKind: 'CAPABILITY',
    semanticJobOrRelationId: 'job.replacement_guidance',
    canonicalPrompt: 'should I repair the furnace or replace it?',
    paraphrases: ['my furnace is dying—what should I do?', 'is it worth repairing my water heater or replacing it?'],
    adjacentNegatives: ['when was my furnace installed?', 'I smell gas near the furnace'],
    seededArchetypeIds: ['property.seeded.complete_single_family', 'property.seeded.missing_and_unknown_states'],
    requiredDataStateVariants: ['POPULATED', 'EMPTY_OR_MISSING'],
    expectedPlanSummary: { subjectEntityId: 'entity.inventory_item', projection: 'CAPABILITY_RESULT', polarity: 'POSITIVE', requiredSlots: ['inventoryItemId'] },
  },
  {
    familyId: 'family.timeline_home_events.recent_events_and_provenance',
    domainId: 'domain.timeline_home_events',
    requestClass: 'DATA_QUERY',
    targetKind: 'QUERY',
    semanticJobOrRelationId: 'query.home_event.timeline',
    canonicalPrompt: 'what home events were recorded this year?',
    paraphrases: ['show recent changes to my home timeline', 'when was the roof replacement event logged?'],
    adjacentNegatives: ['when does my warranty expire?', 'what maintenance is due next month?'],
    seededArchetypeIds: ['property.seeded.complete_single_family', 'property.seeded.missing_and_unknown_states'],
    requiredDataStateVariants: ['POPULATED', 'EMPTY_OR_MISSING'],
    expectedPlanSummary: { subjectEntityId: 'entity.property', projection: 'LIST', polarity: 'POSITIVE', requiredSlots: [] },
  },
  {
    familyId: 'family.buyer_journey.contingency_deadlines_and_tasks',
    domainId: 'domain.buyer_journey',
    requestClass: 'DATA_QUERY',
    targetKind: 'QUERY',
    semanticJobOrRelationId: 'relation.buyer_checklist.buyer_task',
    canonicalPrompt: 'what are my contingency deadlines?',
    paraphrases: ['what buyer deadlines are due before closing?', 'what stage is my home buying checklist in?'],
    adjacentNegatives: ['what do I still need to finish before listing the house?', 'what maintenance is due next month?'],
    seededArchetypeIds: ['property.seeded.buyer_and_seller_lifecycle'],
    requiredDataStateVariants: ['POPULATED', 'EMPTY_OR_MISSING'],
    expectedPlanSummary: { subjectEntityId: 'entity.buyer_task', projection: 'LIST', polarity: 'POSITIVE', requiredSlots: [] },
  },
  {
    familyId: 'family.seller_preparation.readiness_and_prep_profile',
    domainId: 'domain.seller_preparation',
    requestClass: 'DATA_QUERY',
    targetKind: 'QUERY',
    semanticJobOrRelationId: 'relation.sale_case.readiness_item',
    canonicalPrompt: 'what do I still need to finish before listing the house?',
    paraphrases: ['what is my staging readiness and target list date?', 'which sale readiness items are still open?'],
    adjacentNegatives: ['what buyer deadlines are due before closing?', 'how long until owning beats renting?'],
    seededArchetypeIds: ['property.seeded.buyer_and_seller_lifecycle'],
    requiredDataStateVariants: ['POPULATED', 'EMPTY_OR_MISSING'],
    expectedPlanSummary: { subjectEntityId: 'entity.sale_readiness_item', projection: 'LIST', polarity: 'POSITIVE', requiredSlots: [] },
  },
  {
    familyId: 'family.account_household_preferences.saved_results_and_work',
    domainId: 'domain.account_household_preferences',
    requestClass: 'DATA_QUERY',
    targetKind: 'CAPABILITY',
    semanticJobOrRelationId: 'job.saved_results',
    canonicalPrompt: 'show my saved items',
    paraphrases: ['show my saved results and bookmarks', 'what open work items do I have in Ask Cozy?'],
    adjacentNegatives: ['list items without warranty', 'show all appliances in my inventory'],
    seededArchetypeIds: ['property.seeded.complete_single_family', 'property.seeded.missing_and_unknown_states'],
    requiredDataStateVariants: ['POPULATED', 'EMPTY_OR_MISSING'],
    expectedPlanSummary: { subjectEntityId: 'entity.property', projection: 'CAPABILITY_RESULT', polarity: 'POSITIVE', requiredSlots: [] },
  },
] as const);

export interface Phase0ContainmentRegressionCase {
  readonly regressionId: string;
  readonly frdSectionRef: string;
  readonly evidenceClassification: 'CONTAINMENT_REGRESSION_NOT_COVERAGE_PROOF';
  readonly prompt: string;
  readonly failureClassSummary: string;
  readonly expectedContainmentBehavior: string;
}

export const ASK_PHASE0_CONTAINMENT_REGRESSION_CASES: readonly Phase0ContainmentRegressionCase[] = Object.freeze([
  {
    regressionId: 'containment.warranty.negative_paraphrase_list_down',
    frdSectionRef: '§2 Failure #1 / §17.2 #6',
    evidenceClassification: 'CONTAINMENT_REGRESSION_NOT_COVERAGE_PROOF',
    prompt: "list down all items which don't have warranty",
    failureClassSummary: 'Natural negative relation phrasing previously fell through Shape 9 regex and triggered remote fallback claims.',
    expectedContainmentBehavior: 'Resolves deterministically to QUERY entity.inventory_item LIST relation.inventory_item.warranty NEGATIVE with grammarComplete=true.',
  },
  {
    regressionId: 'containment.warranty.negative_projection_detail',
    frdSectionRef: '§2 Failure #1 / §20',
    evidenceClassification: 'CONTAINMENT_REGRESSION_NOT_COVERAGE_PROOF',
    prompt: 'provide details of all items without warranty',
    failureClassSummary: 'Detail projection over negative warranty relation was not preserved consistently.',
    expectedContainmentBehavior: 'Resolves deterministically to QUERY entity.inventory_item DETAIL relation.inventory_item.warranty NEGATIVE with grammarComplete=true.',
  },
  {
    regressionId: 'containment.warranty.negative_projection_count',
    frdSectionRef: '§2 Failure #1 / §20',
    evidenceClassification: 'CONTAINMENT_REGRESSION_NOT_COVERAGE_PROOF',
    prompt: 'how many appliances are not having warranty',
    failureClassSummary: 'Progressive aspect negation ("not having") missed narrow regex list.',
    expectedContainmentBehavior: 'Resolves deterministically to QUERY entity.inventory_item COUNT relation.inventory_item.warranty NEGATIVE with grammarComplete=true.',
  },
  {
    regressionId: 'containment.warranty.positive_relation_symmetry',
    frdSectionRef: '§2 Failure #1 / §17.2 #6',
    evidenceClassification: 'CONTAINMENT_REGRESSION_NOT_COVERAGE_PROOF',
    prompt: 'which items are having warranty',
    failureClassSummary: 'Positive relation symmetry was missing when only negative absence was handled.',
    expectedContainmentBehavior: 'Resolves deterministically to QUERY entity.inventory_item LIST relation.inventory_item.warranty POSITIVE with grammarComplete=true.',
  },
  {
    regressionId: 'containment.warranty.possessive_homeowner_phrasing',
    frdSectionRef: '§2 Failure #1 / FR-PLAN-7',
    evidenceClassification: 'CONTAINMENT_REGRESSION_NOT_COVERAGE_PROOF',
    prompt: 'which of my appliances do not have a warranty',
    failureClassSummary: 'Possessive/conversational determiners ("my") must not be treated as unconsumed meaning spans.',
    expectedContainmentBehavior: 'Resolves deterministically to QUERY entity.inventory_item LIST relation.inventory_item.warranty NEGATIVE with unresolvedSpans=[] and grammarComplete=true.',
  },
  {
    regressionId: 'containment.warranty.conflicting_legacy_links_never_guessed',
    frdSectionRef: '§2 Failure #2 / §17.2 #1 / FR-QUERY-7',
    evidenceClassification: 'CONTAINMENT_REGRESSION_NOT_COVERAGE_PROOF',
    prompt: 'how many appliances have no warranty?',
    failureClassSummary: 'Competing InventoryItem.warrantyId and Warranty.inventoryItemId links could produce contradictory answers across list/count/detail.',
    expectedContainmentBehavior: 'readTransitionalWarrantyLinks classifies contradicting links as CONFLICTED and excludes them from both confirmed-covered and confirmed-uncovered counts.',
  },
  {
    regressionId: 'containment.remote_fallback.fail_closed_on_provider_error',
    frdSectionRef: '§2 Failure #2 / §17.2 #2 / §18 Phase 1',
    evidenceClassification: 'CONTAINMENT_REGRESSION_NOT_COVERAGE_PROOF',
    prompt: 'Provide details of all items without warranty',
    failureClassSummary: 'When remote claim selection failed or timed out, selectAndRenderAskRemoteFallbackClaims previously returned the top 6 unrelated property facts (roof, event, cost comparisons).',
    expectedContainmentBehavior: 'selectAndRenderAskRemoteFallbackClaims returns [] (empty claim list) when the provider call throws or fails validation.',
  },
  {
    regressionId: 'containment.cross_domain.unsupported_multi_entity_not_coerced',
    frdSectionRef: '§2 Failure #3 / §17.2 #5',
    evidenceClassification: 'CONTAINMENT_REGRESSION_NOT_COVERAGE_PROOF',
    prompt: 'what claims are still open and what documents are missing?',
    failureClassSummary: 'Multi-entity cross-domain prompt must not be silently coerced into a single-entity inventory warranty query.',
    expectedContainmentBehavior: 'Warranty deterministic parser returns outcome=NONE_FITS with facets=[] rather than claiming an unrelated domain.',
  },
] as const);

export interface SeededArchetypeFixtureEvaluation {
  readonly archetypeId: string;
  readonly passed: boolean;
  readonly observedStates: readonly SeededDataStateVariant[];
  readonly warrantyReadStates: readonly string[];
  readonly scalarCoalescenceStates: Readonly<Record<string, string>>;
  readonly dualParentRestrictedClaimDocIdsForViewer: readonly string[];
  readonly issues: readonly string[];
}

const ROLE_RANK: Readonly<Record<'VIEWER' | 'CONTRIBUTOR' | 'OWNER', number>> = Object.freeze({
  VIEWER: 1,
  CONTRIBUTOR: 2,
  OWNER: 3,
});

export function evaluateSeededArchetypeFixtures(archetypeId: string): SeededArchetypeFixtureEvaluation {
  const archetype = ASK_SEEDED_PROPERTY_ARCHETYPES.find((a) => a.archetypeId === archetypeId);
  if (!archetype) {
    return {
      archetypeId,
      passed: false,
      observedStates: [],
      warrantyReadStates: [],
      scalarCoalescenceStates: {},
      dualParentRestrictedClaimDocIdsForViewer: [],
      issues: [`Unknown archetypeId '${archetypeId}'.`],
    };
  }

  const issues: string[] = [];
  const data = archetype.fixtureData;
  const observedStates = new Set<SeededDataStateVariant>();

  // 1. Evaluate transitional warranty links across fixture inventoryItems and warranties
  const warrantyReadStates: string[] = [];
  for (const item of data.inventoryItems) {
    const linkedIds = data.warranties
      .filter((w) => w.inventoryItemId === item.id)
      .map((w) => w.id);
    const read = classifyTransitionalWarrantyLinks({
      inventoryItemId: item.id,
      label: item.name,
      propertyPlanWarrantyId: item.warrantyId,
      itemWarrantyIds: linkedIds,
      coverageEvidenceStatus: item.coverageEvidenceStatus,
    });
    warrantyReadStates.push(read.state);
    if (read.state === 'CONFLICTED_LINKS') observedStates.add('CONFLICTED');
    else if (read.state === 'UNKNOWN') observedStates.add('UNKNOWN');
    else if (read.state === 'NO_LINK_RECORDED' || read.state === 'EXPLICIT_NO_COVERAGE') {
      if (data.warranties.length === 0) observedStates.add('EMPTY_OR_MISSING');
    } else {
      observedStates.add('POPULATED');
    }
  }

  // 2. Evaluate scalar field coalescence across fixture records
  const scalarCoalescenceStates: Record<string, string> = {};
  const zipEval = evaluateScalarFieldCoalescence('scalar_group.property.postal_code', {
    'Property.zipCode': data.property.zipCode,
    'Property.normalizedZipCode': data.property.normalizedZipCode,
    'Property.geocodedZipCode': data.property.geocodedZipCode,
  });
  scalarCoalescenceStates['scalar_group.property.postal_code'] = zipEval.state;
  if (zipEval.state === 'CONFLICTED') observedStates.add('CONFLICTED');
  if (zipEval.state === 'POPULATED') observedStates.add('POPULATED');

  if (data.exteriorProfile) {
    const irrigEval = evaluateScalarFieldCoalescence('scalar_group.property.has_irrigation', {
      'PropertyExteriorProfile.hasIrrigation': data.exteriorProfile.hasIrrigation,
      'Property.hasIrrigation': data.property.hasIrrigation,
    });
    scalarCoalescenceStates['scalar_group.property.has_irrigation'] = irrigEval.state;
    if (irrigEval.state === 'CONFLICTED') observedStates.add('CONFLICTED');
  }

  for (const item of data.inventoryItems) {
    const modelEval = evaluateScalarFieldCoalescence('scalar_group.inventory_item.model_identity', {
      'InventoryItem.modelNumber': item.modelNumber,
      'InventoryItem.model': item.model,
    });
    scalarCoalescenceStates[`${item.id}:model_identity`] = modelEval.state;
    if (modelEval.state === 'CONFLICTED') observedStates.add('CONFLICTED');
    if (modelEval.state === 'MISSING') observedStates.add('EMPTY_OR_MISSING');

    const serialEval = evaluateScalarFieldCoalescence('scalar_group.inventory_item.serial_identity', {
      'InventoryItem.serialNumber': item.serialNumber,
      'InventoryItem.serialNo': item.serialNo,
    });
    scalarCoalescenceStates[`${item.id}:serial_identity`] = serialEval.state;
    if (serialEval.state === 'CONFLICTED') observedStates.add('CONFLICTED');
    if (serialEval.state === 'MISSING') observedStates.add('EMPTY_OR_MISSING');
  }

  for (const policy of data.insurancePolicies) {
    const dedEval = evaluateScalarFieldCoalescence('scalar_group.insurance_policy.deductible', {
      'InsurancePolicy.deductibleAmount': policy.deductibleAmount,
      'InsurancePolicy.deductibleCents': policy.deductibleCents,
    });
    scalarCoalescenceStates[`${policy.id}:deductible`] = dedEval.state;
    if (dedEval.state === 'CONFLICTED') observedStates.add('CONFLICTED');
    if (dedEval.state === 'POPULATED') observedStates.add('POPULATED');
  }

  // 3. Check missing/unknown states on property, records, reserveFund, buyer/seller lifecycle
  if (data.property.roofReplacementYear === null || data.reserveFund === null || data.taxBills.length === 0) {
    observedStates.add('EMPTY_OR_MISSING');
  }
  if (data.propertyRecords.some((r) => r.verificationStatus === 'UNKNOWN')) {
    observedStates.add('UNKNOWN');
  }
  if (data.buyerChecklist || data.sellerPrep) {
    observedStates.add('POPULATED');
  }

  // 4. Evaluate dual-parent intersection for ClaimDocument x PropertyRecord
  const recordsById = new Map(data.propertyRecords.map((r) => [r.id, r]));
  const dualParentRestrictedClaimDocIdsForViewer: string[] = [];
  for (const cdoc of data.claimDocuments) {
    const parentRecord = recordsById.get(cdoc.propertyRecordId);
    if (!parentRecord) {
      issues.push(`${archetypeId}: ClaimDocument '${cdoc.id}' references missing PropertyRecord '${cdoc.propertyRecordId}'.`);
      continue;
    }
    if (ROLE_RANK.VIEWER < ROLE_RANK[parentRecord.visibility]) {
      dualParentRestrictedClaimDocIdsForViewer.push(cdoc.id);
    }
  }

  if (
    archetypeId === 'property.seeded.conflicted_and_dual_parent_auth' &&
    dualParentRestrictedClaimDocIdsForViewer.length === 0
  ) {
    issues.push(
      `${archetypeId}: expected at least one dual-parent restricted ClaimDocument hidden from VIEWER role.`,
    );
  }

  for (const expectedState of archetype.supportedDataStates) {
    if (!observedStates.has(expectedState)) {
      issues.push(
        `${archetypeId}: declared supportedDataState '${expectedState}' was not produced by concrete fixtureData evaluation (observed: ${[...observedStates].join(', ')}).`,
      );
    }
  }

  return {
    archetypeId,
    passed: issues.length === 0,
    observedStates: Object.freeze([...observedStates]),
    warrantyReadStates: Object.freeze(warrantyReadStates),
    scalarCoalescenceStates: Object.freeze(scalarCoalescenceStates),
    dualParentRestrictedClaimDocIdsForViewer: Object.freeze(dualParentRestrictedClaimDocIdsForViewer),
    issues: Object.freeze(issues),
  };
}

export interface SeededFamilyFixtureExecutionResult {
  readonly familyId: string;
  readonly passed: boolean;
  readonly evaluatedArchetypeIds: readonly string[];
  readonly observedDataStates: readonly SeededDataStateVariant[];
  readonly issues: readonly string[];
}

export function executeSeededFamilyAgainstFixtures(familyId: string): SeededFamilyFixtureExecutionResult {
  const family = ASK_CROSS_DOMAIN_SEMANTIC_FAMILIES.find((f) => f.familyId === familyId);
  if (!family) {
    return {
      familyId,
      passed: false,
      evaluatedArchetypeIds: [],
      observedDataStates: [],
      issues: [`Unknown familyId '${familyId}'.`],
    };
  }

  const issues: string[] = [];
  const observedStates = new Set<SeededDataStateVariant>();
  for (const archetypeId of family.seededArchetypeIds) {
    const archetype = ASK_SEEDED_PROPERTY_ARCHETYPES.find((a) => a.archetypeId === archetypeId);
    if (!archetype) {
      issues.push(`${familyId}: references unknown seededArchetypeId '${archetypeId}'.`);
      continue;
    }
    if (!archetype.domainsCovered.includes(family.domainId)) {
      issues.push(
        `${familyId}: archetype '${archetypeId}' does not cover family domain '${family.domainId}'.`,
      );
    }
    const evalResult = evaluateSeededArchetypeFixtures(archetypeId);
    if (!evalResult.passed) {
      issues.push(...evalResult.issues.map((i) => `${familyId} -> ${i}`));
    }
    for (const st of evalResult.observedStates) {
      observedStates.add(st);
    }
  }

  for (const reqState of family.requiredDataStateVariants) {
    if (!observedStates.has(reqState)) {
      issues.push(
        `${familyId}: requiredDataStateVariant '${reqState}' is not instantiated across its seededArchetypeIds (${family.seededArchetypeIds.join(', ')}).`,
      );
    }
  }

  return {
    familyId,
    passed: issues.length === 0,
    evaluatedArchetypeIds: family.seededArchetypeIds,
    observedDataStates: Object.freeze([...observedStates]),
    issues: Object.freeze(issues),
  };
}

export function validateSeededScenarioCatalogue(): string[] {
  const issues: string[] = [];
  const nonBoundaryDomains = ASK_SEMANTIC_DOMAINS
    .filter((d) => d.domainId !== 'domain.safety_boundary')
    .map((d) => d.domainId);

  const coveredDomains = new Set(ASK_CROSS_DOMAIN_SEMANTIC_FAMILIES.map((f) => f.domainId));
  for (const domainId of nonBoundaryDomains) {
    if (!coveredDomains.has(domainId)) {
      issues.push(`Domain ${domainId} has no independent semantic scenario family in ASK_CROSS_DOMAIN_SEMANTIC_FAMILIES`);
    }
  }

  for (const archetype of ASK_SEEDED_PROPERTY_ARCHETYPES) {
    const evalResult = evaluateSeededArchetypeFixtures(archetype.archetypeId);
    if (!evalResult.passed) {
      issues.push(...evalResult.issues);
    }
  }

  const seenFamilyIds = new Set<string>();
  for (const family of ASK_CROSS_DOMAIN_SEMANTIC_FAMILIES) {
    if (seenFamilyIds.has(family.familyId)) {
      issues.push(`${family.familyId}: duplicate familyId`);
    }
    seenFamilyIds.add(family.familyId);
    if (family.paraphrases.length < 2) {
      issues.push(`${family.familyId}: must declare at least 2 paraphrases`);
    }
    if (family.adjacentNegatives.length < 2) {
      issues.push(`${family.familyId}: must declare at least 2 adjacentNegatives`);
    }
    const execResult = executeSeededFamilyAgainstFixtures(family.familyId);
    if (!execResult.passed) {
      issues.push(...execResult.issues);
    }
  }

  for (const regression of ASK_PHASE0_CONTAINMENT_REGRESSION_CASES) {
    if (regression.evidenceClassification !== 'CONTAINMENT_REGRESSION_NOT_COVERAGE_PROOF') {
      issues.push(`${regression.regressionId}: must be labelled CONTAINMENT_REGRESSION_NOT_COVERAGE_PROOF`);
    }
  }

  return issues;
}
