import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { propertyTaxRecordService } from './propertyTaxRecord.service';
import { propertyTaxRuleService } from './propertyTaxRule.service';

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export class PropertyTaxHomeownerActionService {
  constructor(
    private readonly db = prisma,
    private readonly rules = propertyTaxRuleService,
    private readonly records = propertyTaxRecordService,
  ) {}

  async listAndRefresh(propertyId: string, userId: string) {
    const [ruleResult, center] = await Promise.all([
      this.rules.getForProperty(propertyId, userId),
      this.records.getCenter(propertyId, userId),
    ]);
    if (ruleResult.coverage !== 'REVIEWED' || !ruleResult.profile) {
      return {
        coverage: ruleResult.coverage,
        reason: ruleResult.reason,
        conflicts: center.conflicts,
        actions: [],
      };
    }
    const profile = ruleResult.profile;
    const officialLinks = object(profile.officialLinks);
    const latestIntake = await this.db.propertyTaxDocumentIntake.findFirst({
      where: { propertyId, status: 'CONFIRMED' },
      orderBy: { confirmedAt: 'desc' },
      select: { id: true },
    });
    const definitions = [
      {
        type: 'EXEMPTION_REVIEW' as const,
        title: 'Review verified exemption programs',
        explanation:
          'Review official eligibility without assuming that this property or household qualifies.',
        officialUrl: String(
          officialLinks.exemptions
          ?? officialLinks.assessment
          ?? '',
        ),
        checklist: [
          'Choose an exemption program from the official authority',
          'Verify current ownership, occupancy, income, age, disability, service, or other eligibility rules',
          'Gather the documents required by the official application',
          'Confirm the current deadline and form before submitting externally',
          'Record the external submission or a decision not to apply',
        ],
      },
      {
        type: 'FACTUAL_CORRECTION' as const,
        title: 'Review parcel and assessment facts',
        explanation: center.conflicts.length > 0
          ? `${center.conflicts.length} confirmed field conflict(s) need review before any filing decision.`
          : 'Compare the confirmed notice with official parcel, classification, value, and exemption facts.',
        officialUrl: String(
          officialLinks.challenge
          ?? officialLinks.assessment
          ?? '',
        ),
        checklist: [
          'Compare parcel identity, classification, assessed value, taxable value, and exemptions',
          'Identify each factual disagreement and its supporting document',
          'Choose the official correction or Request for Review route',
          'Confirm that the correction route does not replace a required Tax Commission filing',
          'Record the external correction request or a decision not to proceed',
        ],
      },
      {
        type: 'INFORMAL_REVIEW' as const,
        title: 'Prepare an official informal review',
        explanation:
          'Use the reviewed Department of Finance route before escalating to a formal appeal when appropriate.',
        officialUrl: String(
          officialLinks.challenge
          ?? officialLinks.forms
          ?? '',
        ),
        checklist: [
          'Review the confirmed Notice of Property Value',
          'Select the reviewed Request for Review or update route',
          'Attach only evidence that supports the stated factual or market-value issue',
          'Verify the current form, submission method, and deadline on the official site',
          'Record the external submission outcome',
        ],
      },
    ];

    for (const definition of definitions) {
      if (!definition.officialUrl) continue;
      const actionKey = [
        profile.slug,
        profile.version,
        definition.type,
      ].join(':');
      await this.db.propertyTaxHomeownerAction.upsert({
        where: {
          propertyId_actionKey: { propertyId, actionKey },
        },
        create: {
          propertyId,
          ruleProfileId: profile.id,
          intakeId: latestIntake?.id,
          actionKey,
          type: definition.type,
          title: definition.title,
          explanation: definition.explanation,
          checklistJson: json(definition.checklist),
          officialUrl: definition.officialUrl,
        },
        update: {
          intakeId: latestIntake?.id,
          title: definition.title,
          explanation: definition.explanation,
          checklistJson: json(definition.checklist),
          officialUrl: definition.officialUrl,
        },
      });
    }

    const actions = await this.db.propertyTaxHomeownerAction.findMany({
      where: { propertyId, ruleProfileId: profile.id },
      orderBy: [{ status: 'asc' }, { type: 'asc' }],
    });
    return {
      coverage: 'REVIEWED' as const,
      reason: null,
      conflicts: center.conflicts,
      actions: actions.map((action) => ({
        ...action,
        checklist: Array.isArray(action.checklistJson)
          ? action.checklistJson
          : [],
        createdAt: action.createdAt.toISOString(),
        updatedAt: action.updatedAt.toISOString(),
        decidedAt: action.decidedAt?.toISOString() ?? null,
        completedAt: action.completedAt?.toISOString() ?? null,
      })),
    };
  }

  async decide(input: {
    propertyId: string;
    actionId: string;
    userId: string;
    status:
      | 'ELIGIBILITY_REVIEW'
      | 'READY_FOR_EXTERNAL_ACTION'
      | 'COMPLETED'
      | 'NOT_APPLICABLE'
      | 'DISMISSED';
    note: string;
    externalReference?: string;
  }) {
    const action = await this.db.propertyTaxHomeownerAction.findFirst({
      where: {
        id: input.actionId,
        propertyId: input.propertyId,
        property: { homeownerProfile: { userId: input.userId } },
      },
    });
    if (!action) throw new Error('Property tax action not found');
    if (!input.note.trim()) throw new Error('A decision note is required');
    if (input.status === 'COMPLETED' && !input.externalReference?.trim()) {
      throw new Error('Completed external actions require a confirmation reference');
    }
    const now = new Date();
    return this.db.propertyTaxHomeownerAction.update({
      where: { id: action.id },
      data: {
        status: input.status,
        decisionJson: {
          note: input.note.trim(),
          externalReference: input.externalReference?.trim() || null,
        },
        decidedAt: now,
        decidedByUserId: input.userId,
        completedAt: input.status === 'COMPLETED' ? now : null,
      },
    });
  }
}

export const propertyTaxHomeownerActionService =
  new PropertyTaxHomeownerActionService();
