import { prisma } from '../../lib/prisma';
import { resolvePropertyAccess } from '../propertyAccess.service';
import {
  OWNERSHIP_COST_CATEGORIES,
  OWNERSHIP_COST_DEFINITION_VERSION,
  type OwnershipCostApplicability,
  type OwnershipCostCategory,
  type OwnershipCostCoverageStatus,
  type OwnershipCostEvidenceStatus,
  type OwnershipCostFreshnessStatus,
  type OwnershipCostLens,
  type OwnershipCostSourceDomain,
  type OwnershipCostVerificationStatus,
} from './ownershipCost.contract';
import {
  OwnershipCostAccessDeniedError,
  ownershipCostObservationService,
} from './ownershipCostObservation.service';
import { OWNERSHIP_COST_LENS_CATEGORIES } from './ownershipCostSnapshot';

export const OWNERSHIP_COST_CURRENT_LENSES = [
  'OPERATING_EXPENSE',
  'CASH_OUTFLOW',
] as const;

export type OwnershipCostCurrentLens =
  typeof OWNERSHIP_COST_CURRENT_LENSES[number];

type PersistedLine = {
  category: OwnershipCostCategory;
  subcategory: string | null;
  amountCents: number | null;
  annualizedAmountCents: number | null;
  applicability: OwnershipCostApplicability;
  evidenceStatus: OwnershipCostEvidenceStatus | null;
  verificationStatus: OwnershipCostVerificationStatus;
  freshnessStatus: OwnershipCostFreshnessStatus;
  includedLenses: OwnershipCostLens[];
  sourceObservation: {
    sourceDomain: OwnershipCostSourceDomain;
    sourceEntityType: string | null;
    sourceEntityId: string | null;
    sourceDocumentId: string | null;
    periodStart: Date | null;
    periodEnd: Date | null;
    confidence: string | null;
    assumptionsJson: unknown;
    missingDependencies: string[];
  };
};

export type PersistedOwnershipCostSnapshot = {
  id: string;
  methodVersion: string;
  categoryDefinitionVersion: string;
  basePeriodStart: Date;
  basePeriodEnd: Date;
  coverageStatus: OwnershipCostCoverageStatus;
  computedAt: Date;
  property: {
    address: string;
    city: string;
    state: string;
    zipCode: string;
  };
  lines: PersistedLine[];
};

export type OwnershipCostReadModelCategory = {
  category: OwnershipCostCategory;
  label: string;
  amountCents: number | null;
  monthlyAmountCents: number | null;
  applicability: OwnershipCostApplicability;
  amountKind: 'CONFIRMED' | 'ESTIMATED' | 'MISSING' | 'NOT_APPLICABLE';
  includedInSelectedLens: boolean;
  evidenceStatus: OwnershipCostEvidenceStatus | null;
  verificationStatus: OwnershipCostVerificationStatus | null;
  freshnessStatus: OwnershipCostFreshnessStatus;
  sourceDomain: OwnershipCostSourceDomain | null;
  sourceEntityType: string | null;
  sourceEntityId: string | null;
  sourceDocumentId: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | null;
  assumptions: string[];
  missingDependencies: string[];
  correction: {
    href: string;
    label: string;
  };
};

export type OwnershipCostReadModel = {
  propertyId: string;
  propertyLabel: string;
  definitionVersion: string;
  methodVersion: string;
  categoryDefinitionVersion: string;
  selectedLens: OwnershipCostCurrentLens;
  snapshot: {
    id: string;
    calculatedAt: string;
    basePeriodStart: string;
    basePeriodEnd: string;
    coverageStatus: OwnershipCostCoverageStatus;
    annualTotalCents: number;
    monthlyTotalCents: number;
    confirmedAnnualCents: number;
    estimatedAnnualCents: number;
    materialMissingCategory: OwnershipCostCategory | null;
    lastKnownGood: boolean;
  };
  coverage: {
    includedCategoryCount: number;
    confirmedCategoryCount: number;
    estimatedCategoryCount: number;
    missingCategoryCount: number;
    notApplicableCategoryCount: number;
  };
  categories: OwnershipCostReadModelCategory[];
  evidenceSummary: {
    confirmedAnnualCents: number;
    estimatedAnnualCents: number;
    staleCategoryCount: number;
    pendingConfirmationCount: number;
  };
  rankedAction: {
    kind: 'ADD_MISSING' | 'REFRESH_STALE' | 'CONFIRM_EVIDENCE' | 'NONE';
    title: string;
    detail: string;
    href: string | null;
    label: string | null;
    category: OwnershipCostCategory | null;
  };
  stale: {
    isStale: boolean;
    reason: string | null;
  };
  limitations: string[];
};

export type OwnershipCostReadModelDependencies = {
  authorize: (userId: string, propertyId: string) => Promise<boolean>;
  refresh: (propertyId: string, userId: string) => Promise<{ snapshotId: string }>;
  loadSnapshot: (
    propertyId: string,
    snapshotId?: string,
  ) => Promise<PersistedOwnershipCostSnapshot | null>;
};

const CATEGORY_LABELS: Record<OwnershipCostCategory, string> = {
  PROPERTY_TAX: 'Property tax',
  INSURANCE: 'Home insurance',
  HOA: 'HOA dues',
  UTILITIES: 'Utilities',
  MORTGAGE_PRINCIPAL: 'Mortgage principal',
  MORTGAGE_INTEREST: 'Mortgage interest',
  PMI: 'Private mortgage insurance',
  RECURRING_HOME_SERVICE: 'Recurring home services',
  ROUTINE_MAINTENANCE: 'Routine maintenance',
  KNOWN_REPAIR: 'Known repairs',
  CAPITAL_PROJECT: 'Capital projects',
  RESERVE_CONTRIBUTION: 'Reserve contribution',
};

const CATEGORY_PRIORITY: OwnershipCostCategory[] = [
  'PROPERTY_TAX',
  'INSURANCE',
  'MORTGAGE_INTEREST',
  'PMI',
  'HOA',
  'UTILITIES',
  'ROUTINE_MAINTENANCE',
  'RECURRING_HOME_SERVICE',
  'KNOWN_REPAIR',
  'CAPITAL_PROJECT',
  'MORTGAGE_PRINCIPAL',
  'RESERVE_CONTRIBUTION',
];

const EVIDENCE_PRIORITY: OwnershipCostEvidenceStatus[] = [
  'CONFIRMED',
  'OBSERVED',
  'HOMEOWNER_REPORTED',
  'EXTRACTED',
  'BENCHMARK',
  'ESTIMATED',
  'FORECAST',
];

function correctionFor(
  propertyId: string,
  category: OwnershipCostCategory,
): OwnershipCostReadModelCategory['correction'] {
  const propertyBase = `/dashboard/properties/${propertyId}`;
  const corrections: Record<
    OwnershipCostCategory,
    OwnershipCostReadModelCategory['correction']
  > = {
    PROPERTY_TAX: {
      href: `${propertyBase}/tools/property-tax`,
      label: 'Review property tax',
    },
    INSURANCE: {
      href: `${propertyBase}/tools/coverage-intelligence`,
      label: 'Review insurance',
    },
    HOA: { href: `${propertyBase}/tools/hoa`, label: 'Update HOA dues' },
    UTILITIES: {
      href: `/dashboard/expenses?propertyId=${encodeURIComponent(propertyId)}&category=UTILITIES`,
      label: 'Add utility expense',
    },
    MORTGAGE_PRINCIPAL: {
      href: `${propertyBase}/tools/financing`,
      label: 'Update financing',
    },
    MORTGAGE_INTEREST: {
      href: `${propertyBase}/tools/financing`,
      label: 'Update financing',
    },
    PMI: {
      href: `${propertyBase}/tools/financing`,
      label: 'Update financing',
    },
    RECURRING_HOME_SERVICE: {
      href: `${propertyBase}/maintenance`,
      label: 'Review recurring services',
    },
    ROUTINE_MAINTENANCE: {
      href: `${propertyBase}/maintenance`,
      label: 'Update maintenance',
    },
    KNOWN_REPAIR: {
      href: `${propertyBase}/projects`,
      label: 'Review repair projects',
    },
    CAPITAL_PROJECT: {
      href: `${propertyBase}/projects`,
      label: 'Review capital projects',
    },
    RESERVE_CONTRIBUTION: {
      href: `${propertyBase}/tools/reserve-fund`,
      label: 'Update reserve plan',
    },
  };
  return corrections[category];
}

function assumptions(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function evidenceStatus(lines: PersistedLine[]): OwnershipCostEvidenceStatus | null {
  return EVIDENCE_PRIORITY.find((status) =>
    lines.some((line) => line.evidenceStatus === status)) ?? null;
}

function amountKind(
  amount: number | null,
  applicability: OwnershipCostApplicability,
  status: OwnershipCostEvidenceStatus | null,
  verification: OwnershipCostVerificationStatus | null,
): OwnershipCostReadModelCategory['amountKind'] {
  if (applicability === 'NOT_APPLICABLE') return 'NOT_APPLICABLE';
  if (amount == null) return 'MISSING';
  if (
    ['CONFIRMED', 'OBSERVED', 'HOMEOWNER_REPORTED'].includes(status ?? '')
    && verification !== 'UNVERIFIED'
  ) {
    return 'CONFIRMED';
  }
  return 'ESTIMATED';
}

function strongestFreshness(lines: PersistedLine[]): OwnershipCostFreshnessStatus {
  if (lines.some((line) => line.freshnessStatus === 'STALE')) return 'STALE';
  if (lines.some((line) => line.freshnessStatus === 'AGING')) return 'AGING';
  if (lines.some((line) => line.freshnessStatus === 'CURRENT')) return 'CURRENT';
  return 'UNKNOWN';
}

function categoryModel(
  propertyId: string,
  category: OwnershipCostCategory,
  selectedLens: OwnershipCostCurrentLens,
  lines: PersistedLine[],
): OwnershipCostReadModelCategory {
  const categoryLines = lines.filter((line) => line.category === category);
  const applicableLines = categoryLines.filter(
    (line) => line.applicability === 'APPLICABLE',
  );
  const amounts = applicableLines
    .map((line) => line.annualizedAmountCents)
    .filter((amount): amount is number => amount != null);
  const amount = amounts.length > 0
    ? amounts.reduce((total, value) => total + value, 0)
    : null;
  const applicability: OwnershipCostApplicability =
    applicableLines.length > 0
      ? 'APPLICABLE'
      : categoryLines.some((line) => line.applicability === 'NOT_APPLICABLE')
        ? 'NOT_APPLICABLE'
        : 'UNKNOWN';
  const status = evidenceStatus(applicableLines);
  const verification = applicableLines.some(
    (line) => line.verificationStatus === 'UNVERIFIED',
  )
    ? 'UNVERIFIED'
    : applicableLines.some(
      (line) => line.verificationStatus === 'PENDING_CONFIRMATION',
    )
      ? 'PENDING_CONFIRMATION'
      : applicableLines.length > 0
        ? 'VERIFIED'
        : null;
  const primary = applicableLines[0]?.sourceObservation;

  return {
    category,
    label: CATEGORY_LABELS[category],
    amountCents: amount,
    monthlyAmountCents: amount == null ? null : Math.round(amount / 12),
    applicability,
    amountKind: amountKind(amount, applicability, status, verification),
    includedInSelectedLens:
      OWNERSHIP_COST_LENS_CATEGORIES[selectedLens].includes(category),
    evidenceStatus: status,
    verificationStatus: verification,
    freshnessStatus: strongestFreshness(applicableLines),
    sourceDomain: primary?.sourceDomain ?? null,
    sourceEntityType: primary?.sourceEntityType ?? null,
    sourceEntityId: primary?.sourceEntityId ?? null,
    sourceDocumentId: primary?.sourceDocumentId ?? null,
    periodStart: primary?.periodStart?.toISOString() ?? null,
    periodEnd: primary?.periodEnd?.toISOString() ?? null,
    confidence: ['HIGH', 'MEDIUM', 'LOW'].includes(primary?.confidence ?? '')
      ? primary!.confidence as 'HIGH' | 'MEDIUM' | 'LOW'
      : null,
    assumptions: applicableLines.flatMap((line) =>
      assumptions(line.sourceObservation.assumptionsJson)),
    missingDependencies: [...new Set(
      categoryLines.flatMap((line) =>
        line.sourceObservation.missingDependencies),
    )],
    correction: correctionFor(propertyId, category),
  };
}

function rankedAction(
  categories: OwnershipCostReadModelCategory[],
): OwnershipCostReadModel['rankedAction'] {
  const ranked = [...categories].sort(
    (left, right) =>
      CATEGORY_PRIORITY.indexOf(left.category)
      - CATEGORY_PRIORITY.indexOf(right.category),
  );
  const missing = ranked.find((category) =>
    category.includedInSelectedLens && category.amountKind === 'MISSING');
  if (missing) {
    return {
      kind: 'ADD_MISSING',
      title: `Add ${missing.label.toLowerCase()} to improve this total`,
      detail: 'Missing categories stay blank and are never counted as zero.',
      href: missing.correction.href,
      label: missing.correction.label,
      category: missing.category,
    };
  }
  const stale = ranked.find((category) =>
    category.includedInSelectedLens
    && ['STALE', 'AGING'].includes(category.freshnessStatus));
  if (stale) {
    return {
      kind: 'REFRESH_STALE',
      title: `Refresh ${stale.label.toLowerCase()}`,
      detail: 'This source may no longer represent the current annual cost.',
      href: stale.correction.href,
      label: stale.correction.label,
      category: stale.category,
    };
  }
  const pending = ranked.find((category) =>
    category.includedInSelectedLens
    && category.verificationStatus === 'PENDING_CONFIRMATION');
  if (pending) {
    return {
      kind: 'CONFIRM_EVIDENCE',
      title: `Confirm ${pending.label.toLowerCase()}`,
      detail: 'A confirmation will move this amount out of the estimated share.',
      href: pending.correction.href,
      label: pending.correction.label,
      category: pending.category,
    };
  }
  return {
    kind: 'NONE',
    title: 'No cost-data action is due',
    detail: 'We will revisit this result when a source changes or becomes stale.',
    href: null,
    label: null,
    category: null,
  };
}

export function buildOwnershipCostReadModel(
  propertyId: string,
  snapshot: PersistedOwnershipCostSnapshot,
  selectedLens: OwnershipCostCurrentLens,
  options: { lastKnownGood?: boolean; refreshError?: string | null } = {},
): OwnershipCostReadModel {
  const categories = OWNERSHIP_COST_CATEGORIES.map((category) =>
    categoryModel(propertyId, category, selectedLens, snapshot.lines));
  const included = categories.filter((category) =>
    category.includedInSelectedLens);
  const confirmed = included.filter((category) =>
    category.amountKind === 'CONFIRMED');
  const estimated = included.filter((category) =>
    category.amountKind === 'ESTIMATED');
  const missing = included.filter((category) =>
    category.amountKind === 'MISSING');
  const notApplicable = included.filter((category) =>
    category.amountKind === 'NOT_APPLICABLE');
  const confirmedAnnualCents = confirmed.reduce(
    (total, category) => total + (category.amountCents ?? 0),
    0,
  );
  const estimatedAnnualCents = estimated.reduce(
    (total, category) => total + (category.amountCents ?? 0),
    0,
  );
  const annualTotalCents = confirmedAnnualCents + estimatedAnnualCents;
  const materialMissingCategory = CATEGORY_PRIORITY.find((category) =>
    missing.some((line) => line.category === category)) ?? null;
  const staleCategoryCount = included.filter((category) =>
    ['STALE', 'AGING'].includes(category.freshnessStatus)).length;
  const lastKnownGood = options.lastKnownGood ?? false;

  return {
    propertyId,
    propertyLabel: [
      snapshot.property.address,
      snapshot.property.city,
      snapshot.property.state,
      snapshot.property.zipCode,
    ].filter(Boolean).join(', '),
    definitionVersion: OWNERSHIP_COST_DEFINITION_VERSION,
    methodVersion: snapshot.methodVersion,
    categoryDefinitionVersion: snapshot.categoryDefinitionVersion,
    selectedLens,
    snapshot: {
      id: snapshot.id,
      calculatedAt: snapshot.computedAt.toISOString(),
      basePeriodStart: snapshot.basePeriodStart.toISOString(),
      basePeriodEnd: snapshot.basePeriodEnd.toISOString(),
      coverageStatus: snapshot.coverageStatus,
      annualTotalCents,
      monthlyTotalCents: Math.round(annualTotalCents / 12),
      confirmedAnnualCents,
      estimatedAnnualCents,
      materialMissingCategory,
      lastKnownGood,
    },
    coverage: {
      includedCategoryCount: included.length,
      confirmedCategoryCount: confirmed.length,
      estimatedCategoryCount: estimated.length,
      missingCategoryCount: missing.length,
      notApplicableCategoryCount: notApplicable.length,
    },
    categories,
    evidenceSummary: {
      confirmedAnnualCents,
      estimatedAnnualCents,
      staleCategoryCount,
      pendingConfirmationCount: included.filter((category) =>
        category.verificationStatus === 'PENDING_CONFIRMATION').length,
    },
    rankedAction: rankedAction(categories),
    stale: {
      isStale: lastKnownGood || staleCategoryCount > 0,
      reason: lastKnownGood
        ? options.refreshError ?? 'One or more sources could not be refreshed.'
        : staleCategoryCount > 0
          ? 'One or more included categories use an aging or stale source.'
          : null,
    },
    limitations: [
      'Missing categories are not counted as zero.',
      'Estimated amounts remain separate from confirmed amounts.',
      selectedLens === 'OPERATING_EXPENSE'
        ? 'Mortgage principal, capital projects, and reserve contributions are excluded from the operating-expense lens.'
        : 'Cash outflow includes principal and planned capital or reserve amounts when source records support them.',
      'This current-cost view does not infer historical changes or future forecasts.',
    ],
  };
}

async function loadPersistedSnapshot(
  propertyId: string,
  snapshotId?: string,
): Promise<PersistedOwnershipCostSnapshot | null> {
  return prisma.ownershipCostSnapshot.findFirst({
    where: {
      propertyId,
      ...(snapshotId ? { id: snapshotId } : {}),
    },
    orderBy: [{ computedAt: 'desc' }, { id: 'desc' }],
    select: {
      id: true,
      methodVersion: true,
      categoryDefinitionVersion: true,
      basePeriodStart: true,
      basePeriodEnd: true,
      coverageStatus: true,
      computedAt: true,
      property: {
        select: {
          address: true,
          city: true,
          state: true,
          zipCode: true,
        },
      },
      lines: {
        orderBy: [{ category: 'asc' }, { id: 'asc' }],
        select: {
          category: true,
          subcategory: true,
          amountCents: true,
          annualizedAmountCents: true,
          applicability: true,
          evidenceStatus: true,
          verificationStatus: true,
          freshnessStatus: true,
          includedLenses: true,
          sourceObservation: {
            select: {
              sourceDomain: true,
              sourceEntityType: true,
              sourceEntityId: true,
              sourceDocumentId: true,
              periodStart: true,
              periodEnd: true,
              confidence: true,
              assumptionsJson: true,
              missingDependencies: true,
            },
          },
        },
      },
    },
  });
}

const defaultDependencies: OwnershipCostReadModelDependencies = {
  authorize: async (userId, propertyId) =>
    Boolean(await resolvePropertyAccess(userId, propertyId)),
  refresh: (propertyId, userId) =>
    ownershipCostObservationService.refresh(propertyId, userId),
  loadSnapshot: loadPersistedSnapshot,
};

export class OwnershipCostReadModelService {
  constructor(
    private readonly dependencies: OwnershipCostReadModelDependencies =
      defaultDependencies,
  ) {}

  async getCurrent(
    propertyId: string,
    userId: string,
    selectedLens: OwnershipCostCurrentLens,
    options: { refresh?: boolean } = {},
  ): Promise<OwnershipCostReadModel> {
    if (!await this.dependencies.authorize(userId, propertyId)) {
      throw new OwnershipCostAccessDeniedError();
    }

    let snapshotId: string | undefined;
    let refreshError: string | null = null;
    if (options.refresh !== false) {
      try {
        snapshotId = (await this.dependencies.refresh(propertyId, userId))
          .snapshotId;
      } catch (error) {
        refreshError = error instanceof Error
          ? error.message
          : 'Ownership-cost sources could not be refreshed.';
      }
    }

    const snapshot = await this.dependencies.loadSnapshot(
      propertyId,
      snapshotId,
    ) ?? (snapshotId
      ? await this.dependencies.loadSnapshot(propertyId)
      : null);
    if (!snapshot) {
      if (refreshError) throw new Error(refreshError);
      throw new Error('No ownership-cost snapshot is available yet.');
    }

    return buildOwnershipCostReadModel(propertyId, snapshot, selectedLens, {
      lastKnownGood: Boolean(refreshError),
      refreshError,
    });
  }
}

export const ownershipCostReadModelService =
  new OwnershipCostReadModelService();
