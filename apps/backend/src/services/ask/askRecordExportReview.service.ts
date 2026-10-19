import type { HouseholdRole } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import type { AskOperatingMode } from '../skills/context/propertyJourneyContext.contract';
import type { AskAccountRole } from './askAccountEligibility';
import { ensureAskServiceAccountEligibility, ensurePropertyAccess } from './askHandlerSupport';
import { loadOperatingMode } from './askRecordContext';
import { REPORT_PACK_ALWAYS_INCLUDED_IDENTITY } from '../planningContext/reportPackSections';
import {
  ASK_RECORD_SECTION_REGISTRY,
  evaluateRecordSectionApplicability,
  type AskRecordPackPath,
  type AskRecordSectionApplicability,
  type AskRecordSectionDefinition,
  type AskRecordSectionId,
} from './governance/askRecordSectionRegistry';

export const ASK_RECORD_EXPORT_REVIEW_CONTRACT_VERSION = 'ask-record-export-review-v1' as const;

/**
 * The existing home-report pack's own rules, which this review describes and does not change. `homeReportExport.routes` requires
 * CONTRIBUTOR to create an export, `homeReportExport.controller` sets the export record to expire in 30 days and defaults a share
 * link to 14 days, and the share copy is the `buildRedactedReportSnapshot` allowlist. A test pins each of these to its source.
 */
export const ASK_RECORD_EXPORT_CREATE_FLOOR = 'CONTRIBUTOR' as const;
export const ASK_RECORD_EXPORT_RECORD_EXPIRY_DAYS = 30;
export const ASK_RECORD_EXPORT_SHARE_DEFAULT_DAYS = 14;

const ROLE_RANK: Record<HouseholdRole, number> = { VIEWER: 0, CONTRIBUTOR: 1, OWNER: 2 };

export interface AskRecordExportReviewSection {
  id: AskRecordSectionId;
  label: string;
  state: 'INCLUDED' | 'EXCLUDED';
  applicability: AskRecordSectionApplicability;
  packPath: AskRecordPackPath | null;
  /** Why the section is not in the pack. Null when it is. */
  reason: string | null;
  /** How the pack's content differs from the Record section, when it does. */
  note: string | null;
  ownerFields: readonly string[];
  sharedFields: readonly string[];
  withheldFromShared: readonly string[];
}

export interface AskRecordExportReview {
  contractVersion: typeof ASK_RECORD_EXPORT_REVIEW_CONTRACT_VERSION;
  propertyId: string;
  /** When this review was composed. The pack carries its own generated-at once it is created. */
  generatedAt: string;
  property: { name: string | null; address: string; city: string; state: string } | null;
  accessRole: HouseholdRole;
  operatingMode: AskOperatingMode;
  create: { allowed: boolean; requiredRole: typeof ASK_RECORD_EXPORT_CREATE_FLOOR; reason: string | null };
  pack: {
    format: 'PDF';
    /** Sections can be chosen; the export honors the choice and discloses any requested section it cannot carry. */
    sectionsSelectable: true;
    /** Only the person who creates an export can download it. */
    downloadableBy: 'CREATOR';
    recordExpiresInDays: number;
  };
  sharing: {
    requiredRole: typeof ASK_RECORD_EXPORT_CREATE_FLOOR;
    defaultExpiryDays: number;
    /** A shared link serves the redacted copy only; the full PDF is never behind a link. */
    copy: 'REDACTED';
  };
  /** The home's address is on every pack's cover, whatever sections are chosen. */
  alwaysIncluded: { label: string; ownerFields: readonly string[]; sharedFields: readonly string[]; withheldFromShared: readonly string[] };
  sections: AskRecordExportReviewSection[];
  included: AskRecordSectionId[];
  excluded: AskRecordSectionId[];
}

export function composeAskRecordExportReview(input: {
  propertyId: string;
  accessRole: HouseholdRole;
  operatingMode: AskOperatingMode;
  property: AskRecordExportReview['property'];
  generatedAt?: string;
  registry?: readonly AskRecordSectionDefinition[];
}): AskRecordExportReview {
  const allowed = ROLE_RANK[input.accessRole] >= ROLE_RANK[ASK_RECORD_EXPORT_CREATE_FLOOR];
  const sections = (input.registry ?? ASK_RECORD_SECTION_REGISTRY).map((definition): AskRecordExportReviewSection => {
    const applicability = evaluateRecordSectionApplicability(definition, { householdRole: input.accessRole, operatingMode: input.operatingMode });
    const exported = definition.exportEligibility;
    const base = { id: definition.id, label: definition.label, applicability };
    return exported.state === 'IN_PACK'
      ? { ...base, state: 'INCLUDED', packPath: exported.packPath, reason: null, note: exported.note, ownerFields: exported.ownerFields, sharedFields: exported.sharedFields, withheldFromShared: exported.withheldFromShared }
      : { ...base, state: 'EXCLUDED', packPath: null, reason: exported.reason, note: null, ownerFields: [], sharedFields: [], withheldFromShared: [] };
  });
  return {
    contractVersion: ASK_RECORD_EXPORT_REVIEW_CONTRACT_VERSION,
    propertyId: input.propertyId,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    property: input.property,
    accessRole: input.accessRole,
    operatingMode: input.operatingMode,
    create: {
      allowed,
      requiredRole: ASK_RECORD_EXPORT_CREATE_FLOOR,
      reason: allowed ? null : `Creating an export needs the ${ASK_RECORD_EXPORT_CREATE_FLOOR} role for this home.`,
    },
    pack: { format: 'PDF', sectionsSelectable: true, downloadableBy: 'CREATOR', recordExpiresInDays: ASK_RECORD_EXPORT_RECORD_EXPIRY_DAYS },
    sharing: { requiredRole: ASK_RECORD_EXPORT_CREATE_FLOOR, defaultExpiryDays: ASK_RECORD_EXPORT_SHARE_DEFAULT_DAYS, copy: 'REDACTED' },
    alwaysIncluded: { label: 'Home address', ...REPORT_PACK_ALWAYS_INCLUDED_IDENTITY },
    sections,
    included: sections.filter((section) => section.state === 'INCLUDED').map((section) => section.id),
    excluded: sections.filter((section) => section.state === 'EXCLUDED').map((section) => section.id),
  };
}

/** Read-only: composes the review for the caller's current role and lifecycle. Creating the export stays the existing, explicit action. */
export async function getAskRecordExportReview(userId: string, propertyId: string, accountRole?: AskAccountRole): Promise<AskRecordExportReview> {
  await ensureAskServiceAccountEligibility(userId, accountRole);
  const access = await ensurePropertyAccess(userId, propertyId);
  const [operatingMode, property] = await Promise.all([
    loadOperatingMode(userId, propertyId),
    prisma.property.findUnique({ where: { id: propertyId }, select: { name: true, address: true, city: true, state: true } }).catch(() => null),
  ]);
  return composeAskRecordExportReview({ propertyId, accessRole: access.role, operatingMode, property });
}
