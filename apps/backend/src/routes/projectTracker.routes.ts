import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import { validateBody } from '../middleware/validate.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';

import {
  listProjects,
  createProject,
  getProject,
  updateProject,
  cancelProject,
  getMilestoneTemplates,
  listMilestones,
  createMilestone,
  updateMilestone,
  completeMilestone,
  deleteMilestone,
  listPayments,
  createPayment,
  updatePayment,
  markPaymentPaid,
  deletePayment,
  listChangeOrders,
  createChangeOrder,
  updateChangeOrder,
  approveChangeOrder,
  rejectChangeOrder,
  voidChangeOrder,
  listLogEntries,
  createLogEntry,
  deleteLogEntry,
  listIssues,
  createIssue,
  updateIssue,
  resolveIssue,
  getCompletionChecklist,
  confirmCompletion,
  completeMinorWork,
  getProviderExecutionReadiness,
} from '../controllers/projectTracker.controller';

import {
  CreateProjectSchema,
  UpdateProjectSchema,
  CreateMilestoneSchema,
  UpdateMilestoneSchema,
  CompleteMilestoneSchema,
  CreatePaymentSchema,
  UpdatePaymentSchema,
  MarkPaymentPaidSchema,
  CreateChangeOrderSchema,
  UpdateChangeOrderSchema,
  CreateLogEntrySchema,
  CreateIssueSchema,
  UpdateIssueSchema,
  ResolveIssueSchema,
  ConfirmCompletionSchema,
  CompleteMinorWorkSchema,
} from '../validators/projectTracker.validators';

const router = Router();

router.use(apiRateLimiter);
router.use(authenticate);

// ── Milestone templates (no property context needed) ──────────────────────────
router.get('/projects/milestone-templates', getMilestoneTemplates);

// ── Projects ──────────────────────────────────────────────────────────────────
router.get('/properties/:propertyId/projects', propertyAuthMiddleware, listProjects);
router.post(
  '/properties/:propertyId/projects',
  propertyAuthMiddleware,
  validateBody(CreateProjectSchema),
  createProject,
);
router.post(
  '/properties/:propertyId/projects/minor-completion',
  propertyAuthMiddleware,
  validateBody(CompleteMinorWorkSchema),
  completeMinorWork,
);
router.get(
  '/properties/:propertyId/projects/provider-readiness/:providerId',
  propertyAuthMiddleware,
  getProviderExecutionReadiness,
);
router.get('/properties/:propertyId/projects/:projectId', propertyAuthMiddleware, getProject);
router.patch(
  '/properties/:propertyId/projects/:projectId',
  propertyAuthMiddleware,
  validateBody(UpdateProjectSchema),
  updateProject,
);
router.delete('/properties/:propertyId/projects/:projectId', propertyAuthMiddleware, cancelProject);

// ── Milestones ────────────────────────────────────────────────────────────────
router.get(
  '/properties/:propertyId/projects/:projectId/milestones',
  propertyAuthMiddleware,
  listMilestones,
);
router.post(
  '/properties/:propertyId/projects/:projectId/milestones',
  propertyAuthMiddleware,
  validateBody(CreateMilestoneSchema),
  createMilestone,
);
router.patch(
  '/properties/:propertyId/projects/:projectId/milestones/:milestoneId',
  propertyAuthMiddleware,
  validateBody(UpdateMilestoneSchema),
  updateMilestone,
);
router.post(
  '/properties/:propertyId/projects/:projectId/milestones/:milestoneId/complete',
  propertyAuthMiddleware,
  validateBody(CompleteMilestoneSchema),
  completeMilestone,
);
router.delete(
  '/properties/:propertyId/projects/:projectId/milestones/:milestoneId',
  propertyAuthMiddleware,
  deleteMilestone,
);

// ── Payments ──────────────────────────────────────────────────────────────────
router.get(
  '/properties/:propertyId/projects/:projectId/payments',
  propertyAuthMiddleware,
  listPayments,
);
router.post(
  '/properties/:propertyId/projects/:projectId/payments',
  propertyAuthMiddleware,
  validateBody(CreatePaymentSchema),
  createPayment,
);
router.patch(
  '/properties/:propertyId/projects/:projectId/payments/:paymentId',
  propertyAuthMiddleware,
  validateBody(UpdatePaymentSchema),
  updatePayment,
);
router.post(
  '/properties/:propertyId/projects/:projectId/payments/:paymentId/mark-paid',
  propertyAuthMiddleware,
  validateBody(MarkPaymentPaidSchema),
  markPaymentPaid,
);
router.delete(
  '/properties/:propertyId/projects/:projectId/payments/:paymentId',
  propertyAuthMiddleware,
  deletePayment,
);

// ── Change Orders ─────────────────────────────────────────────────────────────
router.get(
  '/properties/:propertyId/projects/:projectId/change-orders',
  propertyAuthMiddleware,
  listChangeOrders,
);
router.post(
  '/properties/:propertyId/projects/:projectId/change-orders',
  propertyAuthMiddleware,
  validateBody(CreateChangeOrderSchema),
  createChangeOrder,
);
router.patch(
  '/properties/:propertyId/projects/:projectId/change-orders/:changeOrderId',
  propertyAuthMiddleware,
  validateBody(UpdateChangeOrderSchema),
  updateChangeOrder,
);
router.post(
  '/properties/:propertyId/projects/:projectId/change-orders/:changeOrderId/approve',
  propertyAuthMiddleware,
  approveChangeOrder,
);
router.post(
  '/properties/:propertyId/projects/:projectId/change-orders/:changeOrderId/reject',
  propertyAuthMiddleware,
  rejectChangeOrder,
);
router.post(
  '/properties/:propertyId/projects/:projectId/change-orders/:changeOrderId/void',
  propertyAuthMiddleware,
  voidChangeOrder,
);

// ── Progress Log ──────────────────────────────────────────────────────────────
router.get(
  '/properties/:propertyId/projects/:projectId/log',
  propertyAuthMiddleware,
  listLogEntries,
);
router.post(
  '/properties/:propertyId/projects/:projectId/log',
  propertyAuthMiddleware,
  validateBody(CreateLogEntrySchema),
  createLogEntry,
);
router.delete(
  '/properties/:propertyId/projects/:projectId/log/:logId',
  propertyAuthMiddleware,
  deleteLogEntry,
);

// ── Issues ────────────────────────────────────────────────────────────────────
router.get(
  '/properties/:propertyId/projects/:projectId/issues',
  propertyAuthMiddleware,
  listIssues,
);
router.post(
  '/properties/:propertyId/projects/:projectId/issues',
  propertyAuthMiddleware,
  validateBody(CreateIssueSchema),
  createIssue,
);
router.patch(
  '/properties/:propertyId/projects/:projectId/issues/:issueId',
  propertyAuthMiddleware,
  validateBody(UpdateIssueSchema),
  updateIssue,
);
router.post(
  '/properties/:propertyId/projects/:projectId/issues/:issueId/resolve',
  propertyAuthMiddleware,
  validateBody(ResolveIssueSchema),
  resolveIssue,
);

// ── Completion ────────────────────────────────────────────────────────────────
router.get(
  '/properties/:propertyId/projects/:projectId/completion/checklist',
  propertyAuthMiddleware,
  getCompletionChecklist,
);
router.post(
  '/properties/:propertyId/projects/:projectId/completion/confirm',
  propertyAuthMiddleware,
  validateBody(ConfirmCompletionSchema),
  confirmCompletion,
);

export default router;
