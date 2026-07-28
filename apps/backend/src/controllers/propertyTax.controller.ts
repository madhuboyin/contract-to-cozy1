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
