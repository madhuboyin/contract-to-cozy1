/**
 * Approved redacted projection for externally shared reports.
 *
 * Share-token consumers are unauthenticated, so this projection is built by
 * explicit allowlist: every field below is deliberately chosen, and anything
 * not listed here (exact address, zip code, coordinates, policy numbers,
 * serial/model numbers, purchase and replacement costs, premiums, coverage
 * amounts, document links, internal record IDs) never reaches a shared report.
 */

export interface RedactedReportSnapshot {
  meta: {
    generatedAt: string;
    templateVersion: number;
    contextVersion: string | null;
    redacted: true;
  };
  property: {
    city: string | null;
    state: string | null;
    dwellingType: string | null;
    yearBuilt: number | null;
    livingAreaSqft: number | null;
  };
  inventory: {
    rooms: Array<{ name: string }>;
    items: Array<{
      name: string;
      category: string | null;
      condition: string | null;
      brand: string | null;
      roomName: string | null;
    }>;
  };
  maintenance: {
    tasks: Array<{
      title: string;
      status: string | null;
      priority: string | null;
      frequency: string | null;
      lastCompletedDate: string | null;
    }>;
  };
  coverage: {
    insurancePolicies: Array<{
      providerName: string | null;
      startDate: string | null;
      expiryDate: string | null;
    }>;
    warranties: Array<{
      providerName: string | null;
      startDate: string | null;
      expiryDate: string | null;
    }>;
  };
}

type FullSnapshot = Record<string, any>;

function isoOrNull(value: unknown): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function buildRedactedReportSnapshot(snapshot: FullSnapshot): RedactedReportSnapshot {
  return {
    meta: {
      generatedAt: new Date().toISOString(),
      templateVersion: Number(snapshot?.meta?.templateVersion ?? 1),
      contextVersion: snapshot?.meta?.contextVersion ?? null,
      redacted: true,
    },
    property: {
      city: snapshot?.property?.city ?? null,
      state: snapshot?.property?.state ?? null,
      dwellingType: snapshot?.property?.dwellingType ?? null,
      yearBuilt: snapshot?.property?.yearBuilt ?? null,
      livingAreaSqft: snapshot?.property?.livingAreaSqft ?? null,
    },
    inventory: {
      rooms: (snapshot?.inventory?.rooms ?? []).map((room: any) => ({
        name: String(room?.name ?? ''),
      })),
      items: (snapshot?.inventory?.items ?? []).map((item: any) => ({
        name: String(item?.name ?? ''),
        category: item?.category ?? null,
        condition: item?.condition ?? null,
        brand: item?.brand ?? null,
        roomName: item?.room?.name ?? null,
      })),
    },
    maintenance: {
      tasks: (snapshot?.maintenance?.tasks ?? []).map((task: any) => ({
        title: String(task?.title ?? ''),
        status: task?.status ?? null,
        priority: task?.priority ?? null,
        frequency: task?.frequency ?? null,
        lastCompletedDate: isoOrNull(task?.lastCompletedDate),
      })),
    },
    coverage: {
      insurancePolicies: (snapshot?.coverage?.insurancePolicies ?? []).map((policy: any) => ({
        providerName: policy?.providerName ?? null,
        startDate: isoOrNull(policy?.startDate),
        expiryDate: isoOrNull(policy?.expiryDate),
      })),
      warranties: (snapshot?.coverage?.warranties ?? []).map((warranty: any) => ({
        providerName: warranty?.providerName ?? null,
        startDate: isoOrNull(warranty?.startDate),
        expiryDate: isoOrNull(warranty?.expiryDate),
      })),
    },
  };
}

/** Values that must never appear anywhere in a redacted projection. */
export const REDACTED_FORBIDDEN_FIELD_NAMES = [
  'address',
  'addressLine1',
  'zipCode',
  'latitude',
  'longitude',
  'policyNumber',
  'serialNumber',
  'modelNumber',
  'purchaseCostCents',
  'replacementCostCents',
  'premium',
  'coverageAmount',
  'estimatedCost',
  'actualCost',
  'fileUrl',
  'documents',
  'nickname',
  'propertyId',
] as const;
