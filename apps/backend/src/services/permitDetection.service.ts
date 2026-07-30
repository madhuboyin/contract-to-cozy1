import { InventoryItemCategory } from '@prisma/client';

type PermitDisclosureRisk = 'LOW' | 'MEDIUM' | 'HIGH';
type PermitWorkType =
  | 'HVAC_NEW' | 'HVAC_REPLACEMENT' | 'ELECTRICAL_PANEL' | 'ELECTRICAL_WIRING'
  | 'PLUMBING_NEW' | 'PLUMBING_REPAIR' | 'ROOF_REPLACEMENT' | 'ROOF_REPAIR'
  | 'ROOM_ADDITION' | 'GARAGE_CONVERSION' | 'ADU' | 'BASEMENT_FINISH' | 'DECK_PATIO'
  | 'FENCE' | 'SWIMMING_POOL' | 'SOLAR' | 'WINDOWS_DOORS' | 'FIREPLACE'
  | 'SEWER_WATER_LINE' | 'STRUCTURAL_REPAIR' | 'INTERIOR_REMODEL' | 'EXTERIOR_REMODEL'
  | 'DEMOLITION' | 'GRADING_DRAINAGE' | 'OTHER';
type PermitUnpermittedFlagTrigger =
  | 'ASSET_CROSS_REFERENCE' | 'INVENTORY_CROSS_REFERENCE'
  | 'INSPECTION_REPORT_FINDING' | 'MANUAL';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { checkPermitWorkerContext } from './projectCompliance/permitWorkerContext.service';
import { NOT_FOUND_IN_AVAILABLE_RECORDS_MESSAGE } from './projectCompliance/retroactiveCompliancePolicy';

const WINDOW_YEARS = 2;

const ASSET_TYPE_TO_WORK_TYPE: Record<string, PermitWorkType> = {
  HVAC_FURNACE: 'HVAC_REPLACEMENT',
  HVAC: 'HVAC_REPLACEMENT',
  FURNACE: 'HVAC_REPLACEMENT',
  HEAT_PUMP: 'HVAC_REPLACEMENT',
  HVAC_NEW: 'HVAC_NEW',
  AIR_CONDITIONER: 'HVAC_REPLACEMENT',
  WATER_HEATER: 'PLUMBING_REPAIR',
  ELECTRICAL_PANEL: 'ELECTRICAL_PANEL',
  ROOF: 'ROOF_REPLACEMENT',
  SOLAR: 'SOLAR',
  ADDITION: 'ROOM_ADDITION',
};

const INVENTORY_CATEGORY_TO_WORK_TYPE: Partial<Record<InventoryItemCategory, PermitWorkType>> = {
  HVAC: 'HVAC_REPLACEMENT',
  ELECTRICAL: 'ELECTRICAL_PANEL',
  PLUMBING: 'PLUMBING_NEW',
};

const DISCLOSURE_RISK: Record<PermitWorkType, PermitDisclosureRisk> = {
  ELECTRICAL_PANEL: 'HIGH',
  STRUCTURAL_REPAIR: 'HIGH',
  ADU: 'HIGH',
  ROOM_ADDITION: 'HIGH',
  HVAC_NEW: 'MEDIUM',
  HVAC_REPLACEMENT: 'MEDIUM',
  PLUMBING_NEW: 'MEDIUM',
  BASEMENT_FINISH: 'MEDIUM',
  GARAGE_CONVERSION: 'MEDIUM',
  ROOF_REPAIR: 'LOW',
  DECK_PATIO: 'LOW',
  FENCE: 'LOW',
  WINDOWS_DOORS: 'LOW',
  ELECTRICAL_WIRING: 'MEDIUM',
  PLUMBING_REPAIR: 'LOW',
  ROOF_REPLACEMENT: 'MEDIUM',
  SWIMMING_POOL: 'LOW',
  SOLAR: 'LOW',
  FIREPLACE: 'LOW',
  SEWER_WATER_LINE: 'MEDIUM',
  INTERIOR_REMODEL: 'LOW',
  EXTERIOR_REMODEL: 'LOW',
  DEMOLITION: 'MEDIUM',
  GRADING_DRAINAGE: 'LOW',
  OTHER: 'LOW',
};

interface WorkCandidate {
  workType: PermitWorkType;
  installYear: number;
  triggerType: PermitUnpermittedFlagTrigger;
  flagReason: string;
  inventoryItemId?: string;
}

export class PermitDetectionService {
  async detectUnpermittedWork(propertyId: string): Promise<number> {
    const contextCheck = await checkPermitWorkerContext(propertyId);
    if (!contextCheck.allowed) {
      logger.info(
        { propertyId, reasonCodes: contextCheck.reasonCodes },
        '[PermitDetectionService] skipped after property context recheck',
      );
      return 0;
    }

    const [inventoryItems, permits] = await Promise.all([
      prisma.inventoryItem.findMany({
        where: {
          propertyId,
          installedOn: { not: null },
        },
        select: { id: true, category: true, assetType: true, installedOn: true, name: true },
      }),
      prisma.propertyPermitRecord.findMany({
        where: { propertyId, isActive: true },
        select: {
          id: true,
          workTypes: true,
          issueDate: true,
          source: true,
          isVerified: true,
          documentIds: true,
        },
      }),
    ]);

    // Build coverage map: workType → Set of covered years
    const coverage = new Map<PermitWorkType, Set<number>>();
    for (const permit of permits) {
      if (!permit.issueDate) continue;
      const year = new Date(permit.issueDate).getFullYear();
      for (const wt of permit.workTypes as PermitWorkType[]) {
        if (!coverage.has(wt)) coverage.set(wt, new Set());
        coverage.get(wt)!.add(year);
      }
    }

    const candidates: WorkCandidate[] = [];

    // Canonical InventoryItem cross-reference
    for (const item of inventoryItems) {
      if (!item.installedOn) continue;
      const installYear = new Date(item.installedOn).getFullYear();
      const workType = (item.assetType ? ASSET_TYPE_TO_WORK_TYPE[item.assetType.toUpperCase()] : undefined)
        ?? INVENTORY_CATEGORY_TO_WORK_TYPE[item.category as InventoryItemCategory];
      if (!workType) continue;

      candidates.push({
        workType,
        installYear,
        triggerType: 'INVENTORY_CROSS_REFERENCE',
        // W3 (permits): worded as fact ("no matching permit found") with no
        // acknowledgment that permit requirements are set locally — some
        // municipalities don't require one for this kind of work at all.
        // This is an inference from indirect evidence (inventory + permit
        // records), not an authoritative jurisdiction determination.
        flagReason: `${item.name} (${item.category}) was recorded as installed around ${installYear}. ${NOT_FOUND_IN_AVAILABLE_RECORDS_MESSAGE}`,
        inventoryItemId: item.id,
      });
    }

    // Filter candidates that have no permit coverage
    const flagsToCreate = candidates.filter((c) => {
      const covered = coverage.get(c.workType);
      if (!covered) return true;
      for (let y = c.installYear - WINDOW_YEARS; y <= c.installYear + WINDOW_YEARS; y++) {
        if (covered.has(y)) return false;
      }
      return true;
    });

    // Reconcile previously-unmatched findings when a later open-data fetch or
    // uploaded permit document produces a plausible date/work-type match.
    for (const candidate of candidates) {
      const matchingPermit = permits.find((permit) => {
        if (!permit.issueDate || !permit.workTypes.includes(candidate.workType as any)) return false;
        return Math.abs(new Date(permit.issueDate).getFullYear() - candidate.installYear) <= WINDOW_YEARS;
      });
      if (!matchingPermit) continue;
      const dedupeKey = `${propertyId}:${candidate.workType}:inventory:${candidate.inventoryItemId}`;
      const existingFlag = await prisma.permitUnpermittedFlag.findUnique({ where: { dedupeKey } });
      if (
        !existingFlag
        || !['UNKNOWN', 'FLAGGED', 'INVESTIGATING'].includes(existingFlag.status)
        || existingFlag.resolvedByPermitId === matchingPermit.id
      ) {
        continue;
      }
      const authorityMatch = matchingPermit.source === 'OPEN_DATA_API' || matchingPermit.isVerified;
      const nextStatus = authorityMatch ? 'CONFIRMED_PERMITTED' : 'INVESTIGATING';
      const evidenceDocumentIds = Array.from(new Set([
        ...existingFlag.evidenceDocumentIds,
        ...matchingPermit.documentIds,
      ]));
      await prisma.$transaction(async (tx) => {
        await tx.permitUnpermittedFlag.update({
          where: { id: existingFlag.id },
          data: {
            status: nextStatus,
            resolvedByPermitId: authorityMatch ? matchingPermit.id : undefined,
            recordSearchOutcome: 'MATCH_FOUND',
            recordsSearchedAt: new Date(),
            recordsCoverageDescription: `Matched permit work type ${candidate.workType} within ±${WINDOW_YEARS} years of the recorded installation.`,
            evidenceDocumentIds,
            evidenceConfidence: authorityMatch ? 'AUTHORITY_CONFIRMED' : 'HIGH',
            researchChannel: authorityMatch ? 'OPEN_DATA' : 'DOCUMENT_REVIEW',
            researchSourceReference: `Permit record ${matchingPermit.id}`,
            authorityOutcome: authorityMatch ? 'CONFIRMED_PERMITTED' : undefined,
            authorityObservedAt: authorityMatch ? new Date() : undefined,
            dispositionAt: authorityMatch ? new Date() : undefined,
            resolutionNotes: authorityMatch
              ? 'Matched to an authority-sourced or verified permit record.'
              : 'A document-based permit match was found and still needs authority verification.',
          },
        });
        await tx.permitHistoricalFindingEvent.create({
          data: {
            flagId: existingFlag.id,
            propertyId,
            eventType: authorityMatch ? 'DISPOSITION_RECORDED' : 'SEARCH_RECORDED',
            fromStatus: existingFlag.status,
            toStatus: nextStatus,
            evidenceDocumentIds,
            payload: {
              permitRecordId: matchingPermit.id,
              matchMethod: matchingPermit.source === 'DOCUMENT_UPLOAD'
                ? 'DOCUMENT_WORK_TYPE_AND_DATE'
                : 'OPEN_DATA_WORK_TYPE_AND_DATE',
              authorityMatch,
            },
          },
        });
      });
    }

    // Create flags, skip duplicates
    let created = 0;
    for (const candidate of flagsToCreate) {
      const triggerSource = `inventory:${candidate.inventoryItemId}`;
      const dedupeKey = `${propertyId}:${candidate.workType}:${triggerSource}`;

      try {
        const existing = await prisma.permitUnpermittedFlag.findUnique({
          where: { dedupeKey },
          select: { id: true },
        });
        if (!existing) {
          await prisma.$transaction(async (tx) => {
            const flag = await tx.permitUnpermittedFlag.create({
              data: {
                propertyId,
                workType: candidate.workType,
                triggerType: candidate.triggerType,
                flagReason: candidate.flagReason,
                status: 'UNKNOWN',
                disclosureRisk: DISCLOSURE_RISK[candidate.workType] ?? 'LOW',
                inventoryItemId: candidate.inventoryItemId,
                dedupeKey,
                workOrigin: 'UNKNOWN',
                workStage: 'COMPLETED',
                workCompletedAt: new Date(`${candidate.installYear}-01-01T00:00:00.000Z`),
                recordSearchOutcome: 'NOT_FOUND_IN_AVAILABLE_RECORDS',
                recordsSearchedAt: new Date(),
                recordsCoverageDescription: `Available property permit records, work type ${candidate.workType}, ±${WINDOW_YEARS} years.`,
                evidenceConfidence: 'MEDIUM',
                researchChannel: 'OPEN_DATA',
              },
            });
            await tx.permitHistoricalFindingEvent.create({
              data: {
                flagId: flag.id,
                propertyId,
                eventType: 'DETECTED',
                toStatus: 'UNKNOWN',
                payload: {
                  recordSearchOutcome: 'NOT_FOUND_IN_AVAILABLE_RECORDS',
                  recordsCoverageDescription: `Available property permit records, work type ${candidate.workType}, ±${WINDOW_YEARS} years.`,
                  nonDiagnostic: true,
                },
              },
            });
          });
          created++;
        }
      } catch (err) {
        logger.warn({ err, dedupeKey }, '[PermitDetectionService] flag upsert skipped');
      }
    }

    // Emit a high-risk HomeEvent, but only once for a given open-flag set.
    // `created` counts every upsert (including no-op updates against an
    // already-flagged item), so this ran on every re-detection where any
    // HIGH flag remained open — a homeowner who re-triggered a permit fetch
    // a few times got a fresh "potential unpermitted work" HomeEvent each
    // time for the exact same unresolved issue. The idempotency key is
    // derived from the actual set of currently-open HIGH flag ids, so a new
    // event only fires when that set genuinely changes (a new flag appears
    // or one gets resolved) — same fingerprint-on-the-actual-set pattern
    // used by reserveFundReconciliation.job.ts for the same class of bug.
    if (created > 0) {
      const highFlags = await prisma.permitUnpermittedFlag.findMany({
        where: { propertyId, disclosureRisk: 'HIGH', status: { in: ['UNKNOWN', 'FLAGGED', 'INVESTIGATING'] } },
        select: { id: true },
      });
      if (highFlags.length > 0) {
        const idempotencyKey = `permit-unpermitted:${highFlags.map((f) => f.id).sort().join(',')}`;
        const existingEvent = await prisma.homeEvent.findFirst({
          where: { propertyId, idempotencyKey },
          select: { id: true },
        });
        if (!existingEvent) {
          await prisma.homeEvent.create({
            data: {
              propertyId,
              title: 'Historical permit research recommended',
              summary: `${highFlags.length} high-priority item(s) had no match in currently available records. This is not a determination that work was unpermitted.`,
              type: 'NOTE',
              importance: 'HIGH',
              visibility: 'PRIVATE',
              occurredAt: new Date(),
              idempotencyKey,
            },
          }).catch((err) => logger.warn({ err }, '[PermitDetectionService] homeEvent create failed'));
        }
      }
    }

    return created;
  }

  async getFlagSummary(propertyId: string) {
    const counts = await prisma.permitUnpermittedFlag.groupBy({
      by: ['disclosureRisk'],
      where: { propertyId, status: { in: ['UNKNOWN', 'FLAGGED', 'INVESTIGATING'] } },
      _count: { id: true },
    });

    const summary = { total: 0, high: 0, medium: 0, low: 0 };
    for (const row of counts) {
      const n = row._count.id;
      summary.total += n;
      if (row.disclosureRisk === 'HIGH') summary.high += n;
      else if (row.disclosureRisk === 'MEDIUM') summary.medium += n;
      else summary.low += n;
    }
    return summary;
  }
}

export const permitDetectionService = new PermitDetectionService();
