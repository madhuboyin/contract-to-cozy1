// apps/backend/src/routes/homeBuyerTask.routes.ts
import { Router } from 'express';
import multer from 'multer';
import { homeBuyerTaskController } from '../controllers/homeBuyerTask.controller';
import { authenticate } from '../middleware/auth.middleware';
import { ocrRateLimiter, uploadRateLimiter } from '../middleware/rateLimiter.middleware';
import { validateDocumentArrayUpload } from '../utils/documentValidator.util';

const router = Router();
const purchaseLoanEstimateUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    const accepted = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (accepted.includes(file.mimetype)) callback(null, true);
    else callback(new Error('Only PDF, JPEG, PNG, or WEBP Loan Estimates are accepted.'));
  },
});

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/home-buyer-tasks/properties/:propertyId/closing-home
 * Read-only dashboard presentation dispatcher and Buyer Closing Home overview.
 */
router.get('/properties/:propertyId/closing-home', homeBuyerTaskController.handleGetClosingHome);
router.get('/properties/:propertyId/overview', homeBuyerTaskController.handleGetOverview);
router.get('/properties/:propertyId/checklist-composition', homeBuyerTaskController.handlePreviewChecklistComposition);
router.post('/properties/:propertyId/checklist-composition/apply', homeBuyerTaskController.handleApplyChecklistComposition);

/**
 * GET /api/home-buyer-tasks/properties/:propertyId/checklist
 * Get or create a property-scoped 90-day ownership plan
 */
router.get('/properties/:propertyId/checklist', homeBuyerTaskController.handleGetChecklist);

/**
 * GET /api/home-buyer-tasks/tasks
 * Get all tasks for the property plan
 */
router.get('/properties/:propertyId/tasks', homeBuyerTaskController.handleGetTasks);

/**
 * GET /api/home-buyer-tasks/stats
 * Get task statistics
 */
router.get('/properties/:propertyId/stats', homeBuyerTaskController.handleGetStats);
router.get('/properties/:propertyId/import-readiness', homeBuyerTaskController.handleGetImportReadiness);
router.get('/properties/:propertyId/evidence-review', homeBuyerTaskController.handleGetEvidenceReview);
router.get('/properties/:propertyId/inspection-plan', homeBuyerTaskController.handleGetInspectionPlan);
router.put('/properties/:propertyId/inspection-plan', homeBuyerTaskController.handleUpdateInspectionPlan);
router.get('/properties/:propertyId/purchase-financing', homeBuyerTaskController.handleGetPurchaseFinancingPlan);
router.put('/properties/:propertyId/purchase-financing', homeBuyerTaskController.handleUpdatePurchaseFinancingPlan);
router.get('/properties/:propertyId/purchase-financing/loan-estimates', homeBuyerTaskController.handleListPurchaseLoanEstimates);
router.post('/properties/:propertyId/purchase-financing/loan-estimates', homeBuyerTaskController.handleCreatePurchaseLoanOffer);
router.post('/properties/:propertyId/purchase-financing/loan-estimates/offers/:offerId/revisions', homeBuyerTaskController.handleAddPurchaseLoanEstimateRevision);
router.patch('/properties/:propertyId/purchase-financing/loan-estimates/revisions/:revisionId', homeBuyerTaskController.handleUpdatePurchaseLoanEstimateDraft);
router.post('/properties/:propertyId/purchase-financing/loan-estimates/revisions/:revisionId/confirm', homeBuyerTaskController.handleConfirmPurchaseLoanEstimate);
router.post(
  '/properties/:propertyId/purchase-financing/loan-estimates/extract',
  uploadRateLimiter,
  ocrRateLimiter,
  purchaseLoanEstimateUpload.array('files', 3),
  validateDocumentArrayUpload,
  homeBuyerTaskController.handleExtractPurchaseLoanEstimate,
);
router.post('/properties/:propertyId/purchase-financing/loan-estimates/select', homeBuyerTaskController.handleSelectPurchaseLoanOffer);
router.get('/properties/:propertyId/purchase-financing/readiness', homeBuyerTaskController.handleGetPurchaseLenderReadiness);
router.put('/properties/:propertyId/purchase-financing/readiness', homeBuyerTaskController.handleUpdatePurchaseLenderReadiness);
router.post('/properties/:propertyId/purchase-financing/readiness/conditions', homeBuyerTaskController.handleCreateBuyerLenderCondition);
router.patch('/properties/:propertyId/purchase-financing/readiness/conditions/:conditionId', homeBuyerTaskController.handleUpdateBuyerLenderCondition);
router.get('/properties/:propertyId/title-escrow', homeBuyerTaskController.handleGetBuyerTitleEscrow);
router.put('/properties/:propertyId/title-escrow', homeBuyerTaskController.handleUpdateBuyerTitleEscrow);
router.post('/properties/:propertyId/title-escrow/issues', homeBuyerTaskController.handleCreateBuyerTitleEscrowIssue);
router.patch('/properties/:propertyId/title-escrow/issues/:issueId', homeBuyerTaskController.handleUpdateBuyerTitleEscrowIssue);
router.get('/properties/:propertyId/buyer-insurance', homeBuyerTaskController.handleGetBuyerInsurance);
router.put('/properties/:propertyId/buyer-insurance', homeBuyerTaskController.handleUpdateBuyerInsurance);
router.post('/properties/:propertyId/buyer-insurance/quotes', homeBuyerTaskController.handleCreateBuyerInsuranceQuote);
router.patch('/properties/:propertyId/buyer-insurance/quotes/:quoteId', homeBuyerTaskController.handleUpdateBuyerInsuranceQuote);
router.post('/properties/:propertyId/buyer-insurance/quotes/:quoteId/select', homeBuyerTaskController.handleSelectBuyerInsuranceQuote);
router.post('/properties/:propertyId/buyer-insurance/bind', homeBuyerTaskController.handleBindBuyerInsurance);
router.post('/properties/:propertyId/buyer-insurance/requirements', homeBuyerTaskController.handleCreateBuyerInsuranceRequirement);
router.patch('/properties/:propertyId/buyer-insurance/requirements/:requirementId', homeBuyerTaskController.handleUpdateBuyerInsuranceRequirement);
router.get('/properties/:propertyId/final-walkthrough', homeBuyerTaskController.handleGetBuyerWalkthrough);
router.put('/properties/:propertyId/final-walkthrough', homeBuyerTaskController.handleUpdateBuyerWalkthrough);
router.post('/properties/:propertyId/final-walkthrough/observations', homeBuyerTaskController.handleCreateBuyerWalkthroughObservation);
router.patch('/properties/:propertyId/final-walkthrough/observations/:observationId', homeBuyerTaskController.handleUpdateBuyerWalkthroughObservation);
router.post('/properties/:propertyId/final-walkthrough/issues', homeBuyerTaskController.handleCreateBuyerWalkthroughIssue);
router.patch('/properties/:propertyId/final-walkthrough/issues/:issueId', homeBuyerTaskController.handleUpdateBuyerWalkthroughIssue);
router.post('/properties/:propertyId/final-walkthrough/complete', homeBuyerTaskController.handleCompleteBuyerWalkthrough);
router.get('/properties/:propertyId/closing-disclosure', homeBuyerTaskController.handleGetBuyerClosingDisclosure);
router.post('/properties/:propertyId/closing-disclosure/revisions', homeBuyerTaskController.handleCreateBuyerClosingDisclosureRevision);
router.patch('/properties/:propertyId/closing-disclosure/revisions/:revisionId', homeBuyerTaskController.handleUpdateBuyerClosingDisclosureDraft);
router.post('/properties/:propertyId/closing-disclosure/revisions/:revisionId/confirm', homeBuyerTaskController.handleConfirmBuyerClosingDisclosure);
router.put('/properties/:propertyId/closing-disclosure/funds-readiness', homeBuyerTaskController.handleUpdateBuyerClosingFundsReadiness);
router.get('/properties/:propertyId/closing-day', homeBuyerTaskController.handleGetBuyerClosingDay);
router.put('/properties/:propertyId/closing-day', homeBuyerTaskController.handleUpdateBuyerClosingDay);
router.post('/properties/:propertyId/closing-day/confirm-professional-close', homeBuyerTaskController.handleConfirmBuyerProfessionalClose);
router.get('/properties/:propertyId/acceptance-status', homeBuyerTaskController.handleGetAcceptanceStatus);
router.patch('/properties/:propertyId/lifecycle', homeBuyerTaskController.handleUpdateLifecycle);
router.patch('/properties/:propertyId/documents/:documentId/verification', homeBuyerTaskController.handleVerifyDocument);
router.post('/properties/:propertyId/findings/:findingId/disposition', homeBuyerTaskController.handleDispositionFinding);
router.post('/properties/:propertyId/handoff', homeBuyerTaskController.handleHandoff);

/**
 * GET /api/home-buyer-tasks/tasks/:taskId
 * Get a single task
 */
router.get('/properties/:propertyId/tasks/:taskId', homeBuyerTaskController.handleGetTask);

/**
 * POST /api/home-buyer-tasks/tasks
 * Create a custom property-plan task
 */
router.post('/properties/:propertyId/tasks', homeBuyerTaskController.handleCreateTask);

/**
 * PATCH /api/home-buyer-tasks/tasks/:taskId
 * Update task details
 */
router.patch('/properties/:propertyId/tasks/:taskId', homeBuyerTaskController.handleUpdateTask);

/**
 * PATCH /api/home-buyer-tasks/tasks/:taskId/status
 * Update task status
 */
router.patch('/properties/:propertyId/tasks/:taskId/status', homeBuyerTaskController.handleUpdateTaskStatus);

/**
 * DELETE /api/home-buyer-tasks/tasks/:taskId
 * Delete a task
 */
router.delete('/properties/:propertyId/tasks/:taskId', homeBuyerTaskController.handleDeleteTask);

/**
 * POST /api/home-buyer-tasks/tasks/:taskId/link-booking
 * Link task to a booking
 */
router.post('/properties/:propertyId/tasks/:taskId/link-booking', homeBuyerTaskController.handleLinkToBooking);

export default router;
