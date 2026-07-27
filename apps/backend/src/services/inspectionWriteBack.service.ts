import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { APIError } from '../middleware/error.middleware';

type FindingWithRelations = Prisma.InspectionFindingGetPayload<Record<string, never>>;

// Maps InspectionHomeSystem → HomeTwinComponentType where there's a clear match
const SYSTEM_TO_TWIN_TYPE: Record<string, string> = {
  ROOF: 'ROOF',
  EXTERIOR: 'EXTERIOR',
  FOUNDATION: 'FOUNDATION',
  ELECTRICAL: 'ELECTRICAL',
  PLUMBING: 'PLUMBING',
  HVAC: 'HVAC',
  ATTIC_INSULATION: 'INSULATION',
  APPLIANCES: 'APPLIANCE',
};

// Work types that typically require permits, keyed by home system
const PERMIT_WORK_TYPES_BY_SYSTEM: Record<string, string[]> = {
  ELECTRICAL: ['ELECTRICAL_PANEL', 'ELECTRICAL_WIRING'],
  PLUMBING: ['PLUMBING_NEW', 'PLUMBING_REPAIR', 'SEWER_WATER_LINE'],
  HVAC: ['HVAC_NEW', 'HVAC_REPLACEMENT'],
  ROOF: ['ROOF_REPLACEMENT'],
  FOUNDATION: ['STRUCTURAL_REPAIR'],
  STRUCTURAL: ['STRUCTURAL_REPAIR'],
  EXTERIOR: ['DECK_PATIO'],
};

const PERMIT_TRIGGER_KEYWORDS = [
  'replaced', 'installed', 'upgraded', 'addition', 'added', 'new panel',
  'panel upgrade', 'new hvac', 'new roof', 'deck', 'addition',
];

function looksPermittable(finding: FindingWithRelations): boolean {
  if (!PERMIT_WORK_TYPES_BY_SYSTEM[finding.homeSystem]) return false;
  const text = (finding.inspectorDescription + ' ' + (finding.subsystem ?? '')).toLowerCase();
  return PERMIT_TRIGGER_KEYWORDS.some((kw) => text.includes(kw));
}

// Condition score floors by severity (0–100 scale)
const SCORE_FLOOR: Record<string, number> = {
  SAFETY: 10,
  MAJOR: 35,
  MINOR: 55,
};

async function updateDigitalTwin(
  finding: FindingWithRelations,
  reportId: string,
  userId: string,
  writeBacks: Prisma.InspectionWriteBackCreateManyInput[],
): Promise<void> {
  const twinType = SYSTEM_TO_TWIN_TYPE[finding.homeSystem];
  if (!twinType) return;

  const floor = SCORE_FLOOR[finding.severity];
  if (floor === undefined) return; // MONITOR / INFORMATIONAL — no score change

  const twin = await prisma.homeDigitalTwin.findUnique({
    where: { propertyId: finding.propertyId },
    select: { id: true },
  });
  if (!twin) return;

  const component = await prisma.homeTwinComponent.findFirst({
    where: { digitalTwinId: twin.id, componentType: twinType as any, lifecycleState: 'ACTIVE' },
    select: { id: true, conditionScore: true },
  });
  if (!component) return;

  const currentScore = component.conditionScore ?? 100;
  if (currentScore <= floor) return; // already at or below floor, no update needed

  await prisma.homeTwinComponent.update({
    where: { id: component.id },
    data: {
      conditionScore: floor,
      status: finding.severity === 'SAFETY' ? 'NEEDS_REVIEW' : undefined,
    },
  });

  writeBacks.push({
    reportId,
    findingId: finding.id,
    targetSystem: 'DIGITAL_TWIN',
    targetRecordId: component.id,
    action: 'UPDATED',
    payload: { previousScore: currentScore, newScore: floor, componentType: twinType },
    appliedByUserId: userId,
  });
}

async function createPermitFlag(
  finding: FindingWithRelations,
  reportId: string,
  userId: string,
  writeBacks: Prisma.InspectionWriteBackCreateManyInput[],
): Promise<void> {
  if (!looksPermittable(finding)) return;

  const workTypes = PERMIT_WORK_TYPES_BY_SYSTEM[finding.homeSystem] ?? ['OTHER'];
  const workType = workTypes[0] as any;

  // Check if a matching permit exists for this property
  const existingPermit = await prisma.propertyPermitRecord.findFirst({
    where: {
      propertyId: finding.propertyId,
      workTypes: { has: workType },
    },
    select: { id: true },
  });

  if (existingPermit) {
    writeBacks.push({
      reportId,
      findingId: finding.id,
      targetSystem: 'PERMIT_TRACKER',
      targetRecordId: existingPermit.id,
      action: 'LINKED',
      payload: { message: 'Matching permitted record found', permitId: existingPermit.id },
      appliedByUserId: userId,
    });
    return;
  }

  // No matching permit — create an unpermitted flag
  const dedupeKey = `inspection:${finding.id}:${workType}`;
  const existingFlag = await prisma.permitUnpermittedFlag.findUnique({ where: { dedupeKey } });
  if (existingFlag) return;

  const flag = await prisma.permitUnpermittedFlag.create({
    data: {
      propertyId: finding.propertyId,
      workType,
      triggerType: 'INSPECTION_REPORT_FINDING',
      flagReason: `Inspection finding suggests ${workType.toLowerCase().replace(/_/g, ' ')} occurred without a matching permit on record. Finding: "${finding.inspectorDescription.slice(0, 200)}"`,
      status: 'FLAGGED',
      disclosureRisk: finding.severity === 'MAJOR' ? 'HIGH' : 'MEDIUM',
      dedupeKey,
    },
    select: { id: true },
  });

  // Link finding to the created flag
  await prisma.inspectionFinding.update({
    where: { id: finding.id },
    data: { permitFlagId: flag.id },
  });

  writeBacks.push({
    reportId,
    findingId: finding.id,
    targetSystem: 'PERMIT_TRACKER',
    targetRecordId: flag.id,
    action: 'CREATED',
    payload: { workType, dedupeKey },
    appliedByUserId: userId,
  });
}

const COVERAGE_TRIGGER_SYSTEMS = new Set(['FOUNDATION', 'ROOF', 'ELECTRICAL', 'PLUMBING']);
const COVERAGE_TRIGGER_SEVERITIES = new Set(['SAFETY', 'MAJOR']);

async function flagCoverageGap(
  finding: FindingWithRelations,
  reportId: string,
  userId: string,
  writeBacks: Prisma.InspectionWriteBackCreateManyInput[],
): Promise<void> {
  if (
    !COVERAGE_TRIGGER_SYSTEMS.has(finding.homeSystem) ||
    !COVERAGE_TRIGGER_SEVERITIES.has(finding.severity)
  ) return;

  writeBacks.push({
    reportId,
    findingId: finding.id,
    targetSystem: 'COVERAGE_INTELLIGENCE',
    targetRecordId: null,
    action: 'FLAGGED',
    payload: {
      system: finding.homeSystem,
      severity: finding.severity,
      note: `Inspection found a ${finding.severity.toLowerCase()} ${finding.homeSystem.toLowerCase()} issue — verify your policy covers this and check for any pre-existing condition exclusions.`,
    },
    appliedByUserId: userId,
  });
}

export async function applyWriteBacks(
  reportId: string,
  propertyId: string,
  userId: string,
): Promise<{ writeBackCount: number }> {
  const report = await prisma.inspectionReport.findUnique({
    where: { id: reportId },
    include: {
      findings: {
        where: { status: { in: ['OPEN', 'ACCEPTED_AS_IS'] } },
      },
    },
  });

  if (!report) throw new APIError('Report not found', 404, 'NOT_FOUND');
  if (report.propertyId !== propertyId) throw new APIError('Report not found', 404, 'NOT_FOUND');
  if (report.status === 'CONFIRMED') throw new APIError('Report already confirmed', 409, 'ALREADY_CONFIRMED');

  const writeBacks: Prisma.InspectionWriteBackCreateManyInput[] = [];

  for (const finding of report.findings) {
    if (['SAFETY', 'MAJOR', 'MINOR'].includes(finding.severity)) {
      await updateDigitalTwin(finding as any, reportId, userId, writeBacks);
    }
    await createPermitFlag(finding as any, reportId, userId, writeBacks);
    await flagCoverageGap(finding as any, reportId, userId, writeBacks);
  }

  if (writeBacks.length > 0) {
    await prisma.inspectionWriteBack.createMany({ data: writeBacks });
  }

  await prisma.inspectionReport.update({
    where: { id: reportId },
    data: { status: 'CONFIRMED', confirmedAt: new Date() },
  });

  // Reserve score write-back log entry (actual recalculation is a separate job)
  if (report.findings.some((f) => ['SAFETY', 'MAJOR'].includes(f.severity))) {
    await prisma.inspectionWriteBack.create({
      data: {
        reportId,
        findingId: null,
        targetSystem: 'RESERVE_SCORE',
        targetRecordId: propertyId,
        action: 'FLAGGED',
        payload: { message: 'Reserve Health Score recalculation triggered by confirmed inspection report' },
        appliedByUserId: userId,
      },
    });
  }

  logger.info({ reportId, writeBackCount: writeBacks.length }, '[INSPECTION] Write-backs applied');
  return { writeBackCount: writeBacks.length };
}

export async function getWriteBackPreview(
  reportId: string,
  propertyId: string,
): Promise<{
  digitalTwinUpdates: number;
  permitFlagsToCreate: number;
  coverageGapsToFlag: number;
  findingCount: number;
}> {
  const report = await prisma.inspectionReport.findUnique({
    where: { id: reportId },
    include: {
      findings: {
        where: { status: { in: ['OPEN', 'ACCEPTED_AS_IS'] } },
        select: { severity: true, homeSystem: true, inspectorDescription: true, subsystem: true },
      },
    },
  });

  if (!report || report.propertyId !== propertyId) {
    throw new APIError('Report not found', 404, 'NOT_FOUND');
  }

  let digitalTwinUpdates = 0;
  let permitFlagsToCreate = 0;
  let coverageGapsToFlag = 0;

  for (const f of report.findings) {
    if (SYSTEM_TO_TWIN_TYPE[f.homeSystem] && SCORE_FLOOR[f.severity] !== undefined) {
      digitalTwinUpdates++;
    }
    if (looksPermittable(f as any)) permitFlagsToCreate++;
    if (COVERAGE_TRIGGER_SYSTEMS.has(f.homeSystem) && COVERAGE_TRIGGER_SEVERITIES.has(f.severity)) {
      coverageGapsToFlag++;
    }
  }

  return {
    digitalTwinUpdates,
    permitFlagsToCreate,
    coverageGapsToFlag,
    findingCount: report.findings.length,
  };
}
