import { z } from 'zod';
import {
  NEGOTIATION_SHIELD_DOCUMENT_TYPES,
  NEGOTIATION_SHIELD_INPUT_TYPES,
  NEGOTIATION_SHIELD_SCENARIO_TYPES,
  NEGOTIATION_SHIELD_SOURCE_TYPES,
} from '../services/negotiationShield.types';

const uuidSchema = z.string().uuid();
const jsonObjectSchema = z.record(z.string(), z.unknown());

const propertyIdParams = z.object({
  propertyId: uuidSchema,
});

const propertyCaseParams = z.object({
  propertyId: uuidSchema,
  caseId: uuidSchema,
});

export const negotiationShieldPropertyParamsSchema = z.object({
  params: propertyIdParams,
});

export const negotiationShieldCaseParamsSchema = z.object({
  params: propertyCaseParams,
});

export const createNegotiationShieldCaseBodySchema = z.object({
  scenarioType: z.enum(NEGOTIATION_SHIELD_SCENARIO_TYPES),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(4000).optional().nullable(),
  sourceType: z.enum(NEGOTIATION_SHIELD_SOURCE_TYPES),
  initialInput: z.object({
    inputType: z.enum(NEGOTIATION_SHIELD_INPUT_TYPES),
    rawText: z.string().trim().max(20000).optional().nullable(),
    structuredData: jsonObjectSchema.optional(),
  })
    .optional()
    .superRefine((value, ctx) => {
      if (!value) return;
      const hasRawText = typeof value.rawText === 'string' && value.rawText.trim().length > 0;
      const hasStructuredData = value.structuredData !== undefined;

      if (!hasRawText && !hasStructuredData) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'initialInput must include rawText or structuredData.',
          path: ['initialInput'],
        });
      }
    }),
});

export const saveNegotiationShieldInputBodySchema = z.object({
  inputId: uuidSchema.optional(),
  inputType: z.enum(NEGOTIATION_SHIELD_INPUT_TYPES),
  rawText: z.string().trim().max(20000).optional().nullable(),
  structuredData: jsonObjectSchema.optional(),
}).superRefine((value, ctx) => {
  const hasRawText = typeof value.rawText === 'string' && value.rawText.trim().length > 0;
  const hasStructuredData = value.structuredData !== undefined;

  if (!hasRawText && !hasStructuredData) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'rawText or structuredData is required.',
      path: ['rawText'],
    });
  }
});

export const attachNegotiationShieldDocumentBodySchema = z.object({
  documentType: z.enum(NEGOTIATION_SHIELD_DOCUMENT_TYPES),
  documentId: uuidSchema.optional(),
  fileName: z.string().trim().min(1).max(255).optional(),
  mimeType: z.string().trim().max(255).optional().nullable(),
  fileUrl: z.string().trim().max(4000).optional().nullable(),
  storageKey: z.string().trim().max(2000).optional().nullable(),
  fileSizeBytes: z.number().int().min(0).optional().nullable(),
}).superRefine((value, ctx) => {
  if (value.documentId) return;

  if (!value.fileName) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'fileName is required when documentId is not provided.',
      path: ['fileName'],
    });
  }

  if (!value.fileUrl && !value.storageKey) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'fileUrl or storageKey is required when documentId is not provided.',
      path: ['fileUrl'],
    });
  }
});
