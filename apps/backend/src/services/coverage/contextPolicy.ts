import type { ClaimSourceType } from '../../types/claims.types';

export type CoverageLifecycle = 'ACTIVE' | 'FUTURE' | 'EXPIRED' | 'INVALID';

export type CoverageApplicability = {
  status: 'APPLICABLE' | 'NOT_APPLICABLE' | 'UNKNOWN';
  lifecycle: CoverageLifecycle;
  reasonCodes: string[];
  evaluatedAt: string;
  validUntil: string | null;
};

export type CoverageRecord = {
  id: string;
  propertyId?: string | null;
  startDate: Date | string;
  expiryDate: Date | string;
};

function validDate(value: Date | string): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function evaluateCoverageRecord(
  record: CoverageRecord,
  propertyId: string,
  at = new Date(),
): CoverageApplicability {
  const start = validDate(record.startDate);
  const expiry = validDate(record.expiryDate);
  const evaluatedAt = at.toISOString();

  if (!start || !expiry || expiry <= start) {
    return {
      status: 'UNKNOWN',
      lifecycle: 'INVALID',
      reasonCodes: ['COVERAGE_DATES_INVALID'],
      evaluatedAt,
      validUntil: null,
    };
  }
  if (record.propertyId !== propertyId) {
    return {
      status: 'NOT_APPLICABLE',
      lifecycle: 'INVALID',
      reasonCodes: ['COVERAGE_PROPERTY_MISMATCH'],
      evaluatedAt,
      validUntil: null,
    };
  }
  if (at < start) {
    return {
      status: 'NOT_APPLICABLE',
      lifecycle: 'FUTURE',
      reasonCodes: ['COVERAGE_NOT_STARTED'],
      evaluatedAt,
      validUntil: start.toISOString(),
    };
  }
  if (at >= expiry) {
    return {
      status: 'NOT_APPLICABLE',
      lifecycle: 'EXPIRED',
      reasonCodes: ['COVERAGE_EXPIRED'],
      evaluatedAt,
      validUntil: expiry.toISOString(),
    };
  }
  return {
    status: 'APPLICABLE',
    lifecycle: 'ACTIVE',
    reasonCodes: ['COVERAGE_ACTIVE'],
    evaluatedAt,
    validUntil: expiry.toISOString(),
  };
}

export function isCoverageActive(record: CoverageRecord, propertyId: string, at = new Date()) {
  return evaluateCoverageRecord(record, propertyId, at).status === 'APPLICABLE';
}

export type ClaimCoverageInput = {
  sourceType?: ClaimSourceType | null;
  insurancePolicyId?: string | null;
  warrantyId?: string | null;
  incidentAt?: Date | string | null;
};

export function requiredCoverageKind(sourceType?: ClaimSourceType | null): 'INSURANCE' | 'WARRANTY' | null {
  if (sourceType === 'INSURANCE') return 'INSURANCE';
  if (sourceType === 'HOME_WARRANTY' || sourceType === 'MANUFACTURER_WARRANTY') return 'WARRANTY';
  return null;
}

export function claimCoverageDate(input: ClaimCoverageInput, now = new Date()): Date {
  if (!input.incidentAt) return now;
  return validDate(input.incidentAt) ?? now;
}
