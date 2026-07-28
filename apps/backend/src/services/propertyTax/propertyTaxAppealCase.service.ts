import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { propertyTaxAppealReadinessService } from './propertyTaxAppealReadiness.service';

type AppealGround = 'ASSESSED_VALUE' | 'TAX_CLASS' | 'EXEMPTION';
type CaseEventType =
  | 'CREATED'
  | 'PACKET_UPDATED'
  | 'FILED'
  | 'RESPONSE_RECEIVED'
  | 'HEARING_SCHEDULED'
  | 'DETERMINATION_RECORDED'
  | 'CLOSED'
  | 'WITHDRAWN';

const PACKET_CHECKLIST = [
  {
    code: 'VERIFY_CANONICAL_FACTS',
    label: 'Verify the parcel, assessment, valuation date, class, and tax year',
    required: true,
  },
  {
    code: 'VERIFY_GROUND_EVIDENCE',
    label: 'Review every cited item supporting the selected ground',
    required: true,
  },
  {
    code: 'VERIFY_CURRENT_FORM',
    label: 'Open the official site and verify the current form and instructions',
    required: true,
  },
  {
    code: 'COMPLETE_OFFICIAL_FORM',
    label: 'Complete the official form outside Contract to Cozy',
    required: true,
  },
  {
    code: 'REVIEW_NARRATIVE',
    label: 'Review and edit the evidence-grounded narrative',
    required: true,
  },
] as const;

const PACKET_PLACEHOLDERS = [
  'APPLICANT_NAME',
  'APPLICANT_CONTACT',
  'REQUESTED_RESULT',
  'SIGNATURE_DATE',
] as const;

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function numberValue(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object' && value && 'toNumber' in value) {
    const converted = (value as { toNumber(): number }).toNumber();
    return Number.isFinite(converted) ? converted : null;
  }
  const converted = Number(value);
  return Number.isFinite(converted) ? converted : null;
}

function iso(value: Date | null | undefined): string | null {
  return value?.toISOString() ?? null;
}

function groundedNarrative(readiness: {
  ground?: { label?: string };
  selectedGround: string;
  canonical?: {
    taxYear?: number | null;
    totalAssessedValue?: number | null;
    classification?: unknown;
    valuationDate?: string | null;
  };
  evidence: Array<{ title: string }>;
  comparables: Array<{
    qualification: string;
    address: string;
    adjustedSalePrice: number;
  }>;
}) {
  const ground = readiness.ground?.label ?? readiness.selectedGround;
  const evidence = readiness.evidence.map((item) => item.title);
  const comparables = readiness.comparables
    .filter((item) => item.qualification === 'QUALIFIED')
    .map((item) => `${item.address} (${item.adjustedSalePrice})`);
  return [
    `I request review of this property assessment on the reviewed ground of ${ground}.`,
    readiness.canonical?.taxYear
      ? `The request concerns tax year ${readiness.canonical.taxYear}.`
      : null,
    readiness.canonical?.totalAssessedValue !== null
      && readiness.canonical?.totalAssessedValue !== undefined
      ? `The canonical assessed value is ${readiness.canonical.totalAssessedValue}.`
      : null,
    readiness.canonical?.classification
      ? `The canonical classification is ${String(readiness.canonical.classification)}.`
      : null,
    readiness.canonical?.valuationDate
      ? `The reviewed valuation date is ${readiness.canonical.valuationDate}.`
      : null,
    evidence.length > 0
      ? `Supporting evidence: ${evidence.join('; ')}.`
      : null,
    comparables.length > 0
      ? `Qualified comparable records: ${comparables.join('; ')}.`
      : null,
    'The homeowner must edit this narrative for accuracy and transfer the final information to the current official form.',
  ].filter(Boolean).join(' ');
}

export class PropertyTaxAppealCaseService {
  constructor(
    private readonly db = prisma,
    private readonly readiness = propertyTaxAppealReadinessService,
  ) {}

  private include() {
    return {
      packet: true,
      events: { orderBy: { occurredAt: 'desc' as const } },
      reminders: { orderBy: { dueAt: 'asc' as const } },
      ruleProfile: {
        select: {
          id: true,
          title: true,
          version: true,
          reviewedAt: true,
          expiresAt: true,
        },
      },
      filingConfirmationDocument: {
        select: {
          id: true,
          name: true,
          verificationStatus: true,
        },
      },
    };
  }

  private serialize(record: any) {
    return {
      ...record,
      originalAssessedValue: numberValue(record.originalAssessedValue),
      finalAssessedValue: numberValue(record.finalAssessedValue),
      refundAmount: numberValue(record.refundAmount),
      creditAmount: numberValue(record.creditAmount),
      filedAt: iso(record.filedAt),
      responseReceivedAt: iso(record.responseReceivedAt),
      hearingAt: iso(record.hearingAt),
      determinationAt: iso(record.determinationAt),
      closedAt: iso(record.closedAt),
      createdAt: iso(record.createdAt),
      updatedAt: iso(record.updatedAt),
      packet: record.packet
        ? {
            ...record.packet,
            generatedAt: iso(record.packet.generatedAt),
            homeownerReviewedAt: iso(record.packet.homeownerReviewedAt),
            createdAt: iso(record.packet.createdAt),
            updatedAt: iso(record.packet.updatedAt),
          }
        : null,
      events: (record.events ?? []).map((event: any) => ({
        ...event,
        occurredAt: iso(event.occurredAt),
        createdAt: iso(event.createdAt),
      })),
      reminders: (record.reminders ?? []).map((reminder: any) => ({
        ...reminder,
        dueAt: iso(reminder.dueAt),
        completedAt: iso(reminder.completedAt),
        createdAt: iso(reminder.createdAt),
        updatedAt: iso(reminder.updatedAt),
      })),
    };
  }

  private async ownedCase(caseId: string, propertyId: string, userId: string) {
    const record = await this.db.propertyTaxAppealCase.findFirst({
      where: {
        id: caseId,
        propertyId,
        property: { homeownerProfile: { userId } },
      },
      include: this.include(),
    });
    if (!record) throw new Error('Property tax appeal case not found');
    return record;
  }

  private async timelineEvent(
    tx: Prisma.TransactionClient,
    input: {
      caseId: string;
      propertyId: string;
      userId: string;
      type: CaseEventType;
      occurredAt: Date;
      summary: string;
      details?: Record<string, unknown>;
      importance?: 'NORMAL' | 'HIGH' | 'HIGHLIGHT';
    },
  ) {
    const idempotencyKey = [
      'property-tax-appeal',
      input.caseId,
      input.type,
      input.occurredAt.toISOString(),
    ].join(':');
    const homeEvent = await tx.homeEvent.upsert({
      where: {
        propertyId_idempotencyKey: {
          propertyId: input.propertyId,
          idempotencyKey,
        },
      },
      create: {
        propertyId: input.propertyId,
        createdById: input.userId,
        type: 'MILESTONE',
        subtype: `PROPERTY_TAX_APPEAL_${input.type}`,
        importance: input.importance ?? 'NORMAL',
        visibility: 'HOUSEHOLD',
        occurredAt: input.occurredAt,
        title: input.summary,
        summary: input.summary,
        sourceBadge: 'USER_REPORTED',
        groupKey: `property-tax-appeal:${input.caseId}`,
        idempotencyKey,
        meta: {
          caseId: input.caseId,
          caseEventType: input.type,
          ...(input.details ?? {}),
        },
      },
      update: {
        occurredAt: input.occurredAt,
        title: input.summary,
        summary: input.summary,
        importance: input.importance ?? 'NORMAL',
        meta: {
          caseId: input.caseId,
          caseEventType: input.type,
          ...(input.details ?? {}),
        },
      },
      select: { id: true },
    });
    return tx.propertyTaxAppealCaseEvent.create({
      data: {
        caseId: input.caseId,
        type: input.type,
        occurredAt: input.occurredAt,
        summary: input.summary,
        detailsJson: input.details ? json(input.details) : undefined,
        homeEventId: homeEvent.id,
        createdByUserId: input.userId,
      },
    });
  }

  async list(propertyId: string, userId: string) {
    const owned = await this.db.property.findFirst({
      where: { id: propertyId, homeownerProfile: { userId } },
      select: { id: true },
    });
    if (!owned) throw new Error('Property not found');
    const records = await this.db.propertyTaxAppealCase.findMany({
      where: { propertyId },
      orderBy: { updatedAt: 'desc' },
      include: this.include(),
    });
    return records.map((record) => this.serialize(record));
  }

  async createOrResume(input: {
    propertyId: string;
    userId: string;
    ground: AppealGround;
    revisedNoticeDate?: string;
    revisedNoticeQualifies?: boolean;
  }) {
    const now = new Date();
    const readiness = await this.readiness.evaluate(
      input.propertyId,
      input.userId,
      input.ground,
      now,
      {
        revisedNoticeDate: input.revisedNoticeDate,
        revisedNoticeQualifies: input.revisedNoticeQualifies,
      },
    );
    if (readiness.status !== 'READY' || !readiness.ruleProfile || !readiness.ground) {
      throw new Error(
        `Appeal case cannot start until readiness is READY: ${readiness.reason ?? readiness.gaps.join(' ')}`,
      );
    }
    const taxYear = readiness.canonical?.taxYear ?? null;
    const caseKey = [
      readiness.ruleProfile.id,
      input.ground,
      taxYear ?? 'unknown-year',
    ].join(':');
    const existing = await this.db.propertyTaxAppealCase.findUnique({
      where: {
        propertyId_caseKey: {
          propertyId: input.propertyId,
          caseKey,
        },
      },
      include: this.include(),
    });
    if (existing) return this.serialize(existing);

    const narrative = groundedNarrative(readiness);
    const result = await this.db.$transaction(async (tx) => {
      const appealCase = await tx.propertyTaxAppealCase.create({
        data: {
          propertyId: input.propertyId,
          ruleProfileId: readiness.ruleProfile!.id,
          caseKey,
          ground: input.ground,
          taxYear,
          title: `${readiness.ground!.label} appeal preparation`,
          readinessSnapshotJson: json(readiness),
          officialFormUrl: readiness.ground!.officialFormUrl,
          formCode: readiness.ground!.formCode,
          originalAssessedValue:
            readiness.canonical?.totalAssessedValue ?? undefined,
          createdByUserId: input.userId,
        },
      });
      await tx.propertyTaxAppealPacket.create({
        data: {
          caseId: appealCase.id,
          status: 'INCOMPLETE',
          checklistJson: json(PACKET_CHECKLIST),
          completedChecklistJson: [],
          narrative,
          narrativeMode: 'MANUAL',
          narrativeEvidenceJson: json({
            evidenceIds: readiness.evidence.map((item) => item.id),
            comparableIds: readiness.comparables
              .filter((item) => item.qualification === 'QUALIFIED')
              .map((item) => item.id),
            readinessEvaluatedAt: readiness.evaluatedAt,
          }),
          unresolvedPlaceholdersJson: json(PACKET_PLACEHOLDERS),
          placeholderValuesJson: {},
        },
      });
      await this.timelineEvent(tx, {
        caseId: appealCase.id,
        propertyId: input.propertyId,
        userId: input.userId,
        type: 'CREATED',
        occurredAt: now,
        summary: `Property tax appeal preparation started: ${readiness.ground!.label}`,
        details: {
          ground: input.ground,
          ruleProfileId: readiness.ruleProfile!.id,
          formCode: readiness.ground!.formCode,
        },
      });
      return appealCase;
    });
    return this.ownedCase(result.id, input.propertyId, input.userId)
      .then((record) => this.serialize(record));
  }

  async updatePacket(input: {
    caseId: string;
    propertyId: string;
    userId: string;
    narrative: string;
    completedChecklist: string[];
    placeholderValues: Record<string, string>;
    homeownerReviewed: boolean;
  }) {
    const current = await this.ownedCase(
      input.caseId,
      input.propertyId,
      input.userId,
    );
    if (!current.packet) throw new Error('Appeal packet not found');
    if (['FILED', 'DETERMINED', 'CLOSED', 'WITHDRAWN'].includes(current.status)) {
      throw new Error('A filed or closed appeal packet cannot be edited');
    }
    const allowedChecklist = new Set(PACKET_CHECKLIST.map((item) => item.code));
    if (input.completedChecklist.some((code) => !allowedChecklist.has(code as any))) {
      throw new Error('Packet checklist contains an unsupported item');
    }
    const placeholderValues = Object.fromEntries(
      Object.entries(input.placeholderValues)
        .filter(([key, value]) =>
          PACKET_PLACEHOLDERS.includes(key as any) && value.trim().length > 0
        )
        .map(([key, value]) => [key, value.trim()]),
    );
    const unresolved = PACKET_PLACEHOLDERS.filter(
      (key) => !placeholderValues[key],
    );
    const allRequiredComplete = PACKET_CHECKLIST
      .filter((item) => item.required)
      .every((item) => input.completedChecklist.includes(item.code));
    const packetReady = unresolved.length === 0
      && allRequiredComplete
      && input.homeownerReviewed
      && input.narrative.trim().length >= 50;
    const now = new Date();
    await this.db.$transaction(async (tx) => {
      await tx.propertyTaxAppealPacket.update({
        where: { caseId: input.caseId },
        data: {
          status: packetReady ? 'READY' : 'INCOMPLETE',
          narrative: input.narrative.trim(),
          narrativeMode: 'MANUAL',
          narrativeProvider: null,
          narrativeModel: null,
          completedChecklistJson: json(input.completedChecklist),
          unresolvedPlaceholdersJson: json(unresolved),
          placeholderValuesJson: json(placeholderValues),
          homeownerReviewedAt: input.homeownerReviewed ? now : null,
          homeownerReviewedByUserId: input.homeownerReviewed
            ? input.userId
            : null,
        },
      });
      await tx.propertyTaxAppealCase.update({
        where: { id: input.caseId },
        data: { status: packetReady ? 'PACKET_READY' : 'PREPARING' },
      });
      if (packetReady) {
        await this.timelineEvent(tx, {
          caseId: input.caseId,
          propertyId: input.propertyId,
          userId: input.userId,
          type: 'PACKET_UPDATED',
          occurredAt: now,
          summary: 'Property tax appeal packet marked ready for external filing',
          details: {
            packetReady,
            unresolvedPlaceholders: unresolved,
          },
          importance: 'HIGH',
        });
      } else {
        await tx.propertyTaxAppealCaseEvent.create({
          data: {
            caseId: input.caseId,
            type: 'PACKET_UPDATED',
            occurredAt: now,
            summary: 'Property tax appeal packet progress saved',
            detailsJson: {
              packetReady: false,
              unresolvedPlaceholders: unresolved,
            },
            createdByUserId: input.userId,
          },
        });
      }
    });
    return this.ownedCase(input.caseId, input.propertyId, input.userId)
      .then((record) => this.serialize(record));
  }

  async confirmExternalFiling(input: {
    caseId: string;
    propertyId: string;
    userId: string;
    filedAt: Date;
    externalReference: string;
    confirmationDocumentId?: string;
  }) {
    const current = await this.ownedCase(
      input.caseId,
      input.propertyId,
      input.userId,
    );
    if (current.status !== 'PACKET_READY' || current.packet?.status !== 'READY') {
      throw new Error('Packet must be ready before external filing can be confirmed');
    }
    if (input.filedAt.getTime() > Date.now() + 5 * 60_000) {
      throw new Error('filedAt cannot be in the future');
    }
    if (input.confirmationDocumentId) {
      const document = await this.db.document.findFirst({
        where: {
          id: input.confirmationDocumentId,
          propertyId: input.propertyId,
        },
        select: { id: true },
      });
      if (!document) throw new Error('Filing confirmation document not found');
    }
    await this.db.$transaction(async (tx) => {
      await tx.propertyTaxAppealCase.update({
        where: { id: input.caseId },
        data: {
          status: 'AWAITING_RESPONSE',
          externalFilingReference: input.externalReference.trim(),
          filingConfirmationDocumentId: input.confirmationDocumentId,
          filedAt: input.filedAt,
          filedByUserId: input.userId,
        },
      });
      await tx.propertyTaxAppealPacket.update({
        where: { caseId: input.caseId },
        data: { status: 'FILED' },
      });
      await this.timelineEvent(tx, {
        caseId: input.caseId,
        propertyId: input.propertyId,
        userId: input.userId,
        type: 'FILED',
        occurredAt: input.filedAt,
        summary: 'Property tax appeal filed externally',
        details: {
          externalReference: input.externalReference.trim(),
          confirmationDocumentId: input.confirmationDocumentId ?? null,
        },
        importance: 'HIGHLIGHT',
      });
    });
    return this.ownedCase(input.caseId, input.propertyId, input.userId)
      .then((record) => this.serialize(record));
  }

  async recordTrackingEvent(input: {
    caseId: string;
    propertyId: string;
    userId: string;
    type: 'RESPONSE_RECEIVED' | 'HEARING_SCHEDULED';
    occurredAt: Date;
    summary: string;
    hearingLocation?: string;
  }) {
    const current = await this.ownedCase(
      input.caseId,
      input.propertyId,
      input.userId,
    );
    if (!current.filedAt) throw new Error('Confirm external filing before tracking responses');
    await this.db.$transaction(async (tx) => {
      await tx.propertyTaxAppealCase.update({
        where: { id: input.caseId },
        data: input.type === 'RESPONSE_RECEIVED'
          ? {
              status: 'RESPONSE_RECEIVED',
              responseReceivedAt: input.occurredAt,
              responseSummary: input.summary.trim(),
            }
          : {
              status: 'HEARING_SCHEDULED',
              hearingAt: input.occurredAt,
              hearingLocation: input.hearingLocation?.trim() || null,
            },
      });
      await this.timelineEvent(tx, {
        caseId: input.caseId,
        propertyId: input.propertyId,
        userId: input.userId,
        type: input.type,
        occurredAt: input.occurredAt,
        summary: input.summary.trim(),
        details: input.hearingLocation
          ? { hearingLocation: input.hearingLocation.trim() }
          : undefined,
        importance: input.type === 'HEARING_SCHEDULED' ? 'HIGH' : 'NORMAL',
      });
    });
    return this.ownedCase(input.caseId, input.propertyId, input.userId)
      .then((record) => this.serialize(record));
  }

  async upsertReminder(input: {
    caseId: string;
    propertyId: string;
    userId: string;
    reminderKey: string;
    title: string;
    dueAt: Date;
  }) {
    await this.ownedCase(input.caseId, input.propertyId, input.userId);
    const reminder = await this.db.propertyTaxAppealReminder.upsert({
      where: {
        caseId_reminderKey: {
          caseId: input.caseId,
          reminderKey: input.reminderKey,
        },
      },
      create: {
        caseId: input.caseId,
        reminderKey: input.reminderKey,
        title: input.title.trim(),
        dueAt: input.dueAt,
        createdByUserId: input.userId,
      },
      update: {
        title: input.title.trim(),
        dueAt: input.dueAt,
        status: 'PENDING',
        completedAt: null,
        completedByUserId: null,
      },
    });
    return {
      ...reminder,
      dueAt: reminder.dueAt.toISOString(),
      completedAt: iso(reminder.completedAt),
    };
  }

  async decideReminder(input: {
    caseId: string;
    propertyId: string;
    userId: string;
    reminderId: string;
    status: 'COMPLETED' | 'DISMISSED';
  }) {
    await this.ownedCase(input.caseId, input.propertyId, input.userId);
    const reminder = await this.db.propertyTaxAppealReminder.findFirst({
      where: { id: input.reminderId, caseId: input.caseId },
    });
    if (!reminder) throw new Error('Appeal reminder not found');
    const updated = await this.db.propertyTaxAppealReminder.update({
      where: { id: reminder.id },
      data: {
        status: input.status,
        completedAt: new Date(),
        completedByUserId: input.userId,
      },
    });
    return {
      ...updated,
      dueAt: updated.dueAt.toISOString(),
      completedAt: iso(updated.completedAt),
    };
  }

  async recordDetermination(input: {
    caseId: string;
    propertyId: string;
    userId: string;
    determination:
      | 'REDUCED'
      | 'UPHELD'
      | 'CLASS_CHANGED'
      | 'EXEMPTION_ADJUSTED'
      | 'PARTIAL'
      | 'WITHDRAWN'
      | 'OTHER';
    determinationAt: Date;
    reference: string;
    summary: string;
    finalAssessedValue?: number;
    refundAmount?: number;
    creditAmount?: number;
    closeCase: boolean;
  }) {
    const current = await this.ownedCase(
      input.caseId,
      input.propertyId,
      input.userId,
    );
    if (!current.filedAt && input.determination !== 'WITHDRAWN') {
      throw new Error('A determination requires confirmed external filing');
    }
    const nextStatus = input.closeCase
      ? 'CLOSED'
      : input.determination === 'WITHDRAWN'
        ? 'WITHDRAWN'
        : 'DETERMINED';
    await this.db.$transaction(async (tx) => {
      await tx.propertyTaxAppealCase.update({
        where: { id: input.caseId },
        data: {
          status: nextStatus,
          determination: input.determination,
          determinationAt: input.determinationAt,
          determinationReference: input.reference.trim(),
          determinationSummary: input.summary.trim(),
          finalAssessedValue: input.finalAssessedValue,
          refundAmount: input.refundAmount,
          creditAmount: input.creditAmount,
          closedAt: input.closeCase ? input.determinationAt : null,
          closedByUserId: input.closeCase ? input.userId : null,
        },
      });
      await this.timelineEvent(tx, {
        caseId: input.caseId,
        propertyId: input.propertyId,
        userId: input.userId,
        type: 'DETERMINATION_RECORDED',
        occurredAt: input.determinationAt,
        summary: `Property tax appeal determination recorded: ${input.determination}`,
        details: {
          determination: input.determination,
          reference: input.reference.trim(),
          finalAssessedValue: input.finalAssessedValue ?? null,
          refundAmount: input.refundAmount ?? null,
          creditAmount: input.creditAmount ?? null,
        },
        importance: 'HIGHLIGHT',
      });
      if (input.closeCase) {
        await this.timelineEvent(tx, {
          caseId: input.caseId,
          propertyId: input.propertyId,
          userId: input.userId,
          type: 'CLOSED',
          occurredAt: input.determinationAt,
          summary: 'Property tax appeal case closed',
          details: { determination: input.determination },
          importance: 'HIGHLIGHT',
        });
      }
    });
    return this.ownedCase(input.caseId, input.propertyId, input.userId)
      .then((record) => this.serialize(record));
  }
}

export const propertyTaxAppealCaseService =
  new PropertyTaxAppealCaseService();
