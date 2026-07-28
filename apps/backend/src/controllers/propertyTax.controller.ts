// apps/backend/src/controllers/propertyTax.controller.ts
import { Response, NextFunction } from 'express';
import { CustomRequest } from '../types';
import { PropertyTaxService } from '../services/propertyTax.service';
import { analyticsEmitter, AnalyticsEvent, AnalyticsModule, AnalyticsFeature } from '../services/analytics';
import { getCurrentFinancialContextEnvelope } from '../services/financialContext/context';
import { z } from 'zod';
import { propertyTaxRecordService } from '../services/propertyTax/propertyTaxRecord.service';
import { propertyTaxCoverageService } from '../services/propertyTax/propertyTaxCoverage.service';
import { propertyTaxRuleService } from '../services/propertyTax/propertyTaxRule.service';
import { propertyTaxRuleControlService } from '../services/propertyTax/propertyTaxRuleControl.service';
import { propertyTaxDocumentIntakeService } from '../services/propertyTax/propertyTaxDocumentIntake.service';
import { propertyTaxHomeownerActionService } from '../services/propertyTax/propertyTaxHomeownerAction.service';
import { propertyTaxAppealReadinessService } from '../services/propertyTax/propertyTaxAppealReadiness.service';
import { propertyTaxAppealCaseService } from '../services/propertyTax/propertyTaxAppealCase.service';

const service = new PropertyTaxService();

function parseNumber(v: any): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  return n;
}

export async function getPropertyTaxEstimate(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const propertyId = req.params.propertyId;

    const assessedValue = parseNumber(req.query.assessedValue); // USD
    const taxRate = parseNumber(req.query.taxRate); // decimal
    const estimate = await service.estimate(propertyId, {
      assessedValue,
      taxRate,
    });
    const propertyContext = await getCurrentFinancialContextEnvelope(propertyId, req.user!.userId, 'PROPERTY_TAX_VALUE');
    const overrideFields = Object.entries({ assessedValue, taxRate })
      .filter(([, value]) => value !== undefined)
      .map(([key]) => key);

    analyticsEmitter.track({
      eventType: AnalyticsEvent.TOOL_USED,
      userId: req.user?.userId,
      propertyId,
      moduleKey: AnalyticsModule.TAX,
      featureKey: AnalyticsFeature.PROPERTY_TAX,
      metadataJson: { annualTax: estimate.current?.annualTax, confidence: estimate.current?.confidence },
    });

    res.json({
      success: true,
      data: {
        estimate: {
          ...estimate,
          propertyContext,
          calculationContext: {
            mode: overrideFields.length > 0 ? 'SCENARIO' : 'CANONICAL',
            overrideFields,
          },
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

const homeownerRecordSchema = z.object({
  taxYear: z.number().int().min(1900).max(new Date().getFullYear() + 2),
  parcelId: z.string().trim().max(120).optional(),
  stage: z.enum(['UNKNOWN', 'PRELIMINARY', 'TENTATIVE', 'CURRENT_ROLL', 'FINAL', 'CORRECTED']).optional(),
  valuationDate: z.iso.datetime({ offset: true }).optional(),
  classification: z.string().trim().max(160).optional(),
  landValue: z.number().finite().min(0).max(1_000_000_000).optional(),
  improvementValue: z.number().finite().min(0).max(1_000_000_000).optional(),
  totalAssessedValue: z.number().finite().min(0).max(1_000_000_000).optional(),
  taxableValue: z.number().finite().min(0).max(1_000_000_000).optional(),
  assessmentRatio: z.number().finite().min(0).max(1).optional(),
  billAmount: z.number().finite().min(0).max(1_000_000_000).optional(),
  effectiveTaxRate: z.number().finite().min(0).max(1).optional(),
  billNumber: z.string().trim().max(160).optional(),
  issueDate: z.iso.datetime({ offset: true }).optional(),
  dueDates: z.array(z.iso.datetime({ offset: true })).max(12).optional(),
}).strict();

export async function getPropertyTaxCenter(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const record = await propertyTaxRecordService.getCenter(
      req.params.propertyId,
      req.user!.userId,
    );
    res.json({ success: true, data: { record } });
  } catch (error) {
    next(error);
  }
}

export async function getPropertyTaxCoverage(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const coverage = await propertyTaxCoverageService.getForProperty(
      req.params.propertyId,
      req.user!.userId,
    );
    res.json({ success: true, data: { coverage } });
  } catch (error) {
    next(error);
  }
}

export async function getPropertyTaxRules(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const revisedNoticeDate = typeof req.query.revisedNoticeDate === 'string'
      ? req.query.revisedNoticeDate
      : undefined;
    if (
      revisedNoticeDate
      && !/^\d{4}-\d{2}-\d{2}$/.test(revisedNoticeDate)
    ) {
      res.status(400).json({
        success: false,
        message: 'revisedNoticeDate must use YYYY-MM-DD',
      });
      return;
    }
    const rules = await propertyTaxRuleService.getForProperty(
      req.params.propertyId,
      req.user!.userId,
      {
        revisedNoticeDate,
        revisedNoticeQualifies:
          req.query.revisedNoticeQualifies === 'true',
      },
    );
    res.json({ success: true, data: { rules } });
  } catch (error) {
    next(error);
  }
}

const ruleControlSchema = z.object({
  reason: z.string().trim().min(8).max(500),
}).strict();

async function controlRule(
  req: CustomRequest,
  res: Response,
  next: NextFunction,
  action: 'activate' | 'disable' | 'rollback',
) {
  try {
    const parsed = ruleControlSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: 'A specific operator reason is required',
      });
      return;
    }
    const serviceAction = action === 'activate'
      ? propertyTaxRuleControlService.activate.bind(propertyTaxRuleControlService)
      : action === 'disable'
        ? propertyTaxRuleControlService.emergencyDisable.bind(propertyTaxRuleControlService)
        : propertyTaxRuleControlService.rollback.bind(propertyTaxRuleControlService);
    const profile = await serviceAction(
      req.params.profileId,
      req.user!.userId,
      parsed.data.reason,
    );
    res.json({ success: true, data: { profile } });
  } catch (error) {
    next(error);
  }
}

export async function activatePropertyTaxRule(req: CustomRequest, res: Response, next: NextFunction) {
  await controlRule(req, res, next, 'activate');
}

export async function disablePropertyTaxRule(req: CustomRequest, res: Response, next: NextFunction) {
  await controlRule(req, res, next, 'disable');
}

export async function rollbackPropertyTaxRule(req: CustomRequest, res: Response, next: NextFunction) {
  await controlRule(req, res, next, 'rollback');
}

const taxDocumentKindSchema = z.enum([
  'ASSESSMENT_NOTICE',
  'TAX_BILL',
  'EXEMPTION_NOTICE',
  'CORRECTION_NOTICE',
  'OTHER',
]);

export async function uploadPropertyTaxDocument(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const kind = taxDocumentKindSchema.safeParse(req.body.kind);
    if (!kind.success || !req.file) {
      res.status(400).json({
        success: false,
        message: 'A supported tax document kind and file are required',
      });
      return;
    }
    if (req.body.privacyConsent !== 'true') {
      res.status(400).json({
        success: false,
        message: 'Privacy consent is required before Vault storage',
      });
      return;
    }
    const intake = await propertyTaxDocumentIntakeService.createVaultIntake({
      propertyId: req.params.propertyId,
      userId: req.user!.userId,
      kind: kind.data,
      privacyConsent: true,
      file: req.file,
    });
    res.status(201).json({ success: true, data: { intake } });
  } catch (error) {
    next(error);
  }
}

export async function listPropertyTaxDocuments(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const intakes = await propertyTaxDocumentIntakeService.list(
      req.params.propertyId,
      req.user!.userId,
    );
    res.json({ success: true, data: { intakes } });
  } catch (error) {
    next(error);
  }
}

const stagedTaxFieldSchema = z.object({
  fieldKey: z.enum([
    'parcelId',
    'taxYear',
    'stage',
    'valuationDate',
    'classification',
    'landValue',
    'improvementValue',
    'totalAssessedValue',
    'taxableValue',
    'assessmentRatio',
    'exemptions',
    'billNumber',
    'issueDate',
    'billAmount',
    'effectiveTaxRate',
    'dueDates',
  ]),
  value: z.unknown().refine((value) => value !== undefined, 'value is required'),
  confidence: z.number().min(0).max(1).optional(),
  pageNumber: z.number().int().positive().optional(),
  boundingBox: z.unknown().optional(),
  sourceText: z.string().max(1_000).optional(),
}).strict();

const stageTaxFieldsSchema = z.object({
  fields: z.array(stagedTaxFieldSchema).min(1).max(20),
}).strict();

export async function stagePropertyTaxDocumentFields(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const parsed = stageTaxFieldsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: 'Invalid structured tax fields',
        errors: parsed.error.issues,
      });
      return;
    }
    const intake = await propertyTaxDocumentIntakeService.stageManualFields(
      req.params.intakeId,
      req.params.propertyId,
      req.user!.userId,
      parsed.data.fields,
    );
    res.json({ success: true, data: { intake } });
  } catch (error) {
    next(error);
  }
}

const confirmTaxFieldsSchema = z.object({
  decisions: z.array(z.object({
    fieldKey: stagedTaxFieldSchema.shape.fieldKey,
    status: z.enum(['CONFIRMED', 'CORRECTED', 'REJECTED']),
    correctedValue: z.unknown().optional(),
  }).strict()).min(1).max(20),
}).strict();

export async function confirmPropertyTaxDocument(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const parsed = confirmTaxFieldsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: 'Invalid field confirmation decisions',
        errors: parsed.error.issues,
      });
      return;
    }
    const intake = await propertyTaxDocumentIntakeService.confirm(
      req.params.intakeId,
      req.params.propertyId,
      req.user!.userId,
      parsed.data.decisions,
    );
    const record = await propertyTaxRecordService.getCenter(
      req.params.propertyId,
      req.user!.userId,
    );
    res.json({ success: true, data: { intake, record } });
  } catch (error) {
    next(error);
  }
}

export async function listPropertyTaxActions(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const actions = await propertyTaxHomeownerActionService.listAndRefresh(
      req.params.propertyId,
      req.user!.userId,
    );
    res.json({ success: true, data: actions });
  } catch (error) {
    next(error);
  }
}

const propertyTaxActionDecisionSchema = z.object({
  status: z.enum([
    'ELIGIBILITY_REVIEW',
    'READY_FOR_EXTERNAL_ACTION',
    'COMPLETED',
    'NOT_APPLICABLE',
    'DISMISSED',
  ]),
  note: z.string().trim().min(3).max(1_000),
  externalReference: z.string().trim().max(500).optional(),
}).strict();

export async function decidePropertyTaxAction(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const parsed = propertyTaxActionDecisionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: 'Invalid property tax action decision',
        errors: parsed.error.issues,
      });
      return;
    }
    const action = await propertyTaxHomeownerActionService.decide({
      propertyId: req.params.propertyId,
      actionId: req.params.actionId,
      userId: req.user!.userId,
      ...parsed.data,
    });
    res.json({ success: true, data: { action } });
  } catch (error) {
    next(error);
  }
}

const appealGroundSchema = z.enum([
  'ASSESSED_VALUE',
  'TAX_CLASS',
  'EXEMPTION',
]);

export async function getPropertyTaxAppealReadiness(
  req: CustomRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const ground = appealGroundSchema.safeParse(
      req.query.ground ?? 'ASSESSED_VALUE',
    );
    if (!ground.success) {
      res.status(400).json({
        success: false,
        message: 'Unsupported appeal ground',
      });
      return;
    }
    const revisedNoticeDate = typeof req.query.revisedNoticeDate === 'string'
      ? req.query.revisedNoticeDate
      : undefined;
    if (
      revisedNoticeDate
      && !/^\d{4}-\d{2}-\d{2}$/.test(revisedNoticeDate)
    ) {
      res.status(400).json({
        success: false,
        message: 'revisedNoticeDate must use YYYY-MM-DD',
      });
      return;
    }
    const readiness = await propertyTaxAppealReadinessService.evaluate(
      req.params.propertyId,
      req.user!.userId,
      ground.data,
      new Date(),
      {
        revisedNoticeDate,
        revisedNoticeQualifies:
          req.query.revisedNoticeQualifies === 'true',
      },
    );
    res.json({ success: true, data: { readiness } });
  } catch (error) {
    next(error);
  }
}

const evidenceKeySchema = z.string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-zA-Z0-9:_-]+$/);

const propertyTaxAppealEvidenceSchema = z.object({
  evidenceKey: evidenceKeySchema,
  ground: appealGroundSchema,
  type: z.enum([
    'FACTUAL_ERROR',
    'CONDITION',
    'EXEMPTION_DECISION',
    'SUPPORTING_DOCUMENT',
  ]),
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(2_000).optional(),
  facts: z.record(z.string(), z.unknown()),
  sourceUrl: z.url().max(2_000).optional(),
  supportingDocumentId: z.string().uuid().optional(),
}).strict();

export async function upsertPropertyTaxAppealEvidence(
  req: CustomRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const parsed = propertyTaxAppealEvidenceSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: 'Invalid property tax appeal evidence',
        errors: parsed.error.issues,
      });
      return;
    }
    const evidence = await propertyTaxAppealReadinessService.upsertEvidence({
      propertyId: req.params.propertyId,
      userId: req.user!.userId,
      ...parsed.data,
    });
    res.json({ success: true, data: { evidence } });
  } catch (error) {
    next(error);
  }
}

const comparableAdjustmentSchema = z.object({
  time: z.number().finite().min(-1_000_000_000).max(1_000_000_000).optional(),
  condition: z.number().finite().min(-1_000_000_000).max(1_000_000_000).optional(),
  size: z.number().finite().min(-1_000_000_000).max(1_000_000_000).optional(),
  other: z.number().finite().min(-1_000_000_000).max(1_000_000_000).optional(),
  rationale: z.string().trim().max(1_000).optional(),
}).strict();

const propertyTaxAppealComparableSchema = z.object({
  comparableKey: evidenceKeySchema,
  address: z.string().trim().min(5).max(300),
  saleDate: z.iso.date(),
  salePrice: z.number().finite().positive().max(1_000_000_000),
  propertyClass: z.string().trim().min(1).max(120),
  livingAreaSqFt: z.number().finite().positive().max(1_000_000).optional(),
  lotSizeSqFt: z.number().finite().positive().max(10_000_000).optional(),
  condition: z.string().trim().max(300).optional(),
  sourceUrl: z.url().max(2_000).optional(),
  sourceDocumentId: z.string().uuid().optional(),
  adjustments: comparableAdjustmentSchema.optional(),
}).strict();

export async function upsertPropertyTaxAppealComparable(
  req: CustomRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const parsed = propertyTaxAppealComparableSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: 'Invalid property tax comparable',
        errors: parsed.error.issues,
      });
      return;
    }
    const comparable = await propertyTaxAppealReadinessService.upsertComparable({
      propertyId: req.params.propertyId,
      userId: req.user!.userId,
      ...parsed.data,
    });
    res.json({ success: true, data: { comparable } });
  } catch (error) {
    next(error);
  }
}

export async function listPropertyTaxAppealCases(
  req: CustomRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const cases = await propertyTaxAppealCaseService.list(
      req.params.propertyId,
      req.user!.userId,
    );
    res.json({ success: true, data: { cases } });
  } catch (error) {
    next(error);
  }
}

const createAppealCaseSchema = z.object({
  ground: appealGroundSchema,
  revisedNoticeDate: z.iso.date().optional(),
  revisedNoticeQualifies: z.boolean().optional(),
}).strict();

export async function createPropertyTaxAppealCase(
  req: CustomRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const parsed = createAppealCaseSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: 'Invalid property tax appeal case request',
        errors: parsed.error.issues,
      });
      return;
    }
    const appealCase = await propertyTaxAppealCaseService.createOrResume({
      propertyId: req.params.propertyId,
      userId: req.user!.userId,
      ...parsed.data,
    });
    res.status(201).json({ success: true, data: { case: appealCase } });
  } catch (error) {
    next(error);
  }
}

const appealPacketSchema = z.object({
  narrative: z.string().trim().min(50).max(20_000),
  completedChecklist: z.array(z.string().trim().min(1).max(120)).max(20),
  placeholderValues: z.record(
    z.string().trim().min(1).max(120),
    z.string().trim().max(2_000),
  ),
  homeownerReviewed: z.boolean(),
}).strict();

export async function updatePropertyTaxAppealPacket(
  req: CustomRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const parsed = appealPacketSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: 'Invalid appeal packet update',
        errors: parsed.error.issues,
      });
      return;
    }
    const appealCase = await propertyTaxAppealCaseService.updatePacket({
      propertyId: req.params.propertyId,
      caseId: req.params.caseId,
      userId: req.user!.userId,
      ...parsed.data,
    });
    res.json({ success: true, data: { case: appealCase } });
  } catch (error) {
    next(error);
  }
}

const externalFilingSchema = z.object({
  filedAt: z.iso.datetime({ offset: true }),
  externalReference: z.string().trim().min(3).max(500),
  confirmationDocumentId: z.string().uuid().optional(),
}).strict();

export async function confirmPropertyTaxAppealFiling(
  req: CustomRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const parsed = externalFilingSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: 'Invalid external filing confirmation',
        errors: parsed.error.issues,
      });
      return;
    }
    const appealCase = await propertyTaxAppealCaseService.confirmExternalFiling({
      propertyId: req.params.propertyId,
      caseId: req.params.caseId,
      userId: req.user!.userId,
      ...parsed.data,
      filedAt: new Date(parsed.data.filedAt),
    });
    res.json({ success: true, data: { case: appealCase } });
  } catch (error) {
    next(error);
  }
}

const appealTrackingEventSchema = z.object({
  type: z.enum(['RESPONSE_RECEIVED', 'HEARING_SCHEDULED']),
  occurredAt: z.iso.datetime({ offset: true }),
  summary: z.string().trim().min(3).max(2_000),
  hearingLocation: z.string().trim().max(500).optional(),
}).strict();

export async function trackPropertyTaxAppealEvent(
  req: CustomRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const parsed = appealTrackingEventSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: 'Invalid appeal tracking event',
        errors: parsed.error.issues,
      });
      return;
    }
    const appealCase = await propertyTaxAppealCaseService.recordTrackingEvent({
      propertyId: req.params.propertyId,
      caseId: req.params.caseId,
      userId: req.user!.userId,
      ...parsed.data,
      occurredAt: new Date(parsed.data.occurredAt),
    });
    res.json({ success: true, data: { case: appealCase } });
  } catch (error) {
    next(error);
  }
}

const appealReminderSchema = z.object({
  reminderKey: evidenceKeySchema,
  title: z.string().trim().min(3).max(200),
  dueAt: z.iso.datetime({ offset: true }),
}).strict();

export async function upsertPropertyTaxAppealReminder(
  req: CustomRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const parsed = appealReminderSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: 'Invalid appeal reminder',
        errors: parsed.error.issues,
      });
      return;
    }
    const reminder = await propertyTaxAppealCaseService.upsertReminder({
      propertyId: req.params.propertyId,
      caseId: req.params.caseId,
      userId: req.user!.userId,
      ...parsed.data,
      dueAt: new Date(parsed.data.dueAt),
    });
    res.json({ success: true, data: { reminder } });
  } catch (error) {
    next(error);
  }
}

const appealReminderDecisionSchema = z.object({
  status: z.enum(['COMPLETED', 'DISMISSED']),
}).strict();

export async function decidePropertyTaxAppealReminder(
  req: CustomRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const parsed = appealReminderDecisionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: 'Invalid appeal reminder decision',
      });
      return;
    }
    const reminder = await propertyTaxAppealCaseService.decideReminder({
      propertyId: req.params.propertyId,
      caseId: req.params.caseId,
      reminderId: req.params.reminderId,
      userId: req.user!.userId,
      status: parsed.data.status,
    });
    res.json({ success: true, data: { reminder } });
  } catch (error) {
    next(error);
  }
}

const appealDeterminationSchema = z.object({
  determination: z.enum([
    'REDUCED',
    'UPHELD',
    'CLASS_CHANGED',
    'EXEMPTION_ADJUSTED',
    'PARTIAL',
    'WITHDRAWN',
    'OTHER',
  ]),
  determinationAt: z.iso.datetime({ offset: true }),
  reference: z.string().trim().min(3).max(500),
  summary: z.string().trim().min(3).max(2_000),
  finalAssessedValue: z.number().finite().min(0).max(1_000_000_000).optional(),
  refundAmount: z.number().finite().min(0).max(1_000_000_000).optional(),
  creditAmount: z.number().finite().min(0).max(1_000_000_000).optional(),
  closeCase: z.boolean(),
}).strict();

export async function determinePropertyTaxAppealCase(
  req: CustomRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const parsed = appealDeterminationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: 'Invalid appeal determination',
        errors: parsed.error.issues,
      });
      return;
    }
    const appealCase = await propertyTaxAppealCaseService.recordDetermination({
      propertyId: req.params.propertyId,
      caseId: req.params.caseId,
      userId: req.user!.userId,
      ...parsed.data,
      determinationAt: new Date(parsed.data.determinationAt),
    });
    res.json({ success: true, data: { case: appealCase } });
  } catch (error) {
    next(error);
  }
}

export async function recordHomeownerPropertyTaxValues(
  req: CustomRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const parsed = homeownerRecordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: 'Invalid property tax record',
        errors: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
      return;
    }

    const record = await propertyTaxRecordService.recordHomeownerValues(
      req.params.propertyId,
      req.user!.userId,
      parsed.data,
    );

    res.status(201).json({ success: true, data: { record } });
  } catch (error) {
    next(error);
  }
}
