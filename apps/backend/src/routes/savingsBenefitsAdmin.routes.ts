// apps/backend/src/routes/savingsBenefitsAdmin.routes.ts
//
// Admin CRUD + editorial lifecycle for the Savings and Benefits reviewed
// program registry (HIDDEN_SAVINGS_AND_BENEFITS_CAPABILITY_AUDIT_AND_IMPLEMENTATION_PLAN.md
// Slice 2). One file covers both CRUD and governance transitions, since the
// resource surface (two entity types) is smaller than Knowledge Hub's.

import { Router } from 'express';
import { z } from 'zod';
import { UserRole } from '../types/auth.types';
import { authenticate, requireMfa, requireRole } from '../middleware/auth.middleware';
import { requireCapability } from '../middleware/adminCapability.middleware';
import { validateBody } from '../middleware/validate.middleware';
import {
  createProgram,
  createSource,
  getEditorialQueuesHandler,
  getProgram,
  getSource,
  listProgramVersionHistory,
  listPrograms,
  listSources,
  makeTransitionHandler,
  updateProgram,
  updateSource,
} from '../controllers/savingsBenefitsAdmin.controller';

const router = Router();

router.use('/admin/savings-benefits', authenticate, requireMfa, requireRole(UserRole.ADMIN));

const SourceBodySchema = z.object({
  name: z.string().min(1).max(200),
  sourceKind: z.enum([
    'OFFICIAL_GOVERNMENT',
    'OFFICIAL_UTILITY',
    'OFFICIAL_NONPROFIT',
    'CARRIER_MANUFACTURER',
    'LICENSED_MARKET_PARTNER',
    'PUBLIC_BENCHMARK',
  ]),
  officialUrl: z.string().url(),
  reviewSlaDays: z.number().int().positive().optional(),
  status: z.enum(['ACTIVE', 'PAUSED', 'RETIRED']).optional(),
});

const RuleBodySchema = z.object({
  attribute: z.string().min(1),
  operator: z.enum([
    'EQUALS',
    'NOT_EQUALS',
    'IN',
    'NOT_IN',
    'GREATER_THAN',
    'GREATER_THAN_OR_EQUAL',
    'LESS_THAN',
    'LESS_THAN_OR_EQUAL',
    'EXISTS',
    'NOT_EXISTS',
    'CONTAINS',
    'BOOLEAN_IS',
  ]),
  value: z.string(),
  sortOrder: z.number().int().optional(),
  kind: z.enum(['MANDATORY', 'OPTIONAL', 'DISQUALIFYING']).optional(),
  groupKey: z.string().nullable().optional(),
});

const ProgramBodySchema = z.object({
  sourceId: z.string().min(1),
  name: z.string().min(1).max(200),
  category: z.enum([
    'TAX_EXEMPTION',
    'REBATE',
    'UTILITY_INCENTIVE',
    'INSURANCE_DISCOUNT',
    'ENERGY_CREDIT',
    'LOCAL_GRANT',
    'HISTORIC_BENEFIT',
    'STORM_RESILIENCE',
  ]),
  description: z.string().nullable().optional(),
  regionType: z.enum([
    'COUNTRY',
    'STATE',
    'COUNTY',
    'CITY',
    'ZIP',
    'UTILITY',
    'HAZARD_ZONE',
    'HISTORIC_DISTRICT',
  ]),
  regionValue: z.string().min(1),
  benefitType: z.enum(['TAX_SAVINGS', 'TAX_CREDIT', 'REBATE', 'DISCOUNT', 'GRANT', 'CREDIT', 'OTHER']),
  benefitEstimateMin: z.number().nonnegative().nullable().optional(),
  benefitEstimateMax: z.number().nonnegative().nullable().optional(),
  currency: z.string().length(3).optional(),
  sourceUrl: z.string().url().nullable().optional(),
  sourceLabel: z.string().nullable().optional(),
  eligibilityNotes: z.string().nullable().optional(),
  expiresAt: z.coerce.date().nullable().optional(),
  exclusionGroupKey: z.string().nullable().optional(),
  rules: z.array(RuleBodySchema).default([]),
});

const AuthorActionBodySchema = z.object({
  action: z.enum(['SUBMIT_FOR_REVIEW', 'REVIVE_TO_DRAFT']),
  reason: z.string().min(1, 'reason is required').max(2000),
});

const ReviewDecisionBodySchema = z.object({
  action: z.enum(['APPROVE', 'RETURN_TO_DRAFT']),
  reason: z.string().min(1, 'reason is required').max(2000),
});

const PublishActionBodySchema = z.object({
  action: z.enum(['PUBLISH', 'UNPUBLISH', 'ARCHIVE']),
  reason: z.string().min(1, 'reason is required').max(2000),
});

// ─── Sources ────────────────────────────────────────────────────────────────

router.get('/admin/savings-benefits/sources', requireCapability('SAVINGS_BENEFITS_AUTHOR'), listSources);
router.get('/admin/savings-benefits/sources/:sourceId', requireCapability('SAVINGS_BENEFITS_AUTHOR'), getSource);
router.post(
  '/admin/savings-benefits/sources',
  requireCapability('SAVINGS_BENEFITS_AUTHOR'),
  validateBody(SourceBodySchema),
  createSource
);
router.put(
  '/admin/savings-benefits/sources/:sourceId',
  requireCapability('SAVINGS_BENEFITS_AUTHOR'),
  validateBody(SourceBodySchema),
  updateSource
);

// ─── Programs (CRUD — always saved as/preserving DRAFT-or-current status) ──

router.get('/admin/savings-benefits/programs', requireCapability('SAVINGS_BENEFITS_AUTHOR'), listPrograms);
router.get('/admin/savings-benefits/programs/:programId', requireCapability('SAVINGS_BENEFITS_AUTHOR'), getProgram);
router.post(
  '/admin/savings-benefits/programs',
  requireCapability('SAVINGS_BENEFITS_AUTHOR'),
  validateBody(ProgramBodySchema),
  createProgram
);
router.put(
  '/admin/savings-benefits/programs/:programId',
  requireCapability('SAVINGS_BENEFITS_AUTHOR'),
  validateBody(ProgramBodySchema),
  updateProgram
);
router.get(
  '/admin/savings-benefits/programs/:programId/versions',
  requireCapability('SAVINGS_BENEFITS_AUTHOR'),
  listProgramVersionHistory
);

// ─── Editorial lifecycle (capability-separated) ────────────────────────────

router.get(
  '/admin/savings-benefits/queues',
  requireCapability('SAVINGS_BENEFITS_AUTHOR'),
  getEditorialQueuesHandler
);
router.post(
  '/admin/savings-benefits/programs/:programId/author-action',
  requireCapability('SAVINGS_BENEFITS_AUTHOR'),
  validateBody(AuthorActionBodySchema),
  makeTransitionHandler(['SUBMIT_FOR_REVIEW', 'REVIVE_TO_DRAFT'])
);
router.post(
  '/admin/savings-benefits/programs/:programId/review-decision',
  requireCapability('SAVINGS_BENEFITS_REVIEW'),
  validateBody(ReviewDecisionBodySchema),
  makeTransitionHandler(['APPROVE', 'RETURN_TO_DRAFT'])
);
router.post(
  '/admin/savings-benefits/programs/:programId/publish-action',
  requireCapability('SAVINGS_BENEFITS_PUBLISH'),
  validateBody(PublishActionBodySchema),
  makeTransitionHandler(['PUBLISH', 'UNPUBLISH', 'ARCHIVE'])
);

export default router;
