// apps/backend/src/controllers/homeBuyerTask.controller.ts
import { Response, NextFunction } from 'express';
import { HomeBuyerTaskService } from '../services/HomeBuyerTask.service';
import { AuthRequest } from '../types/auth.types';
import {
  CreateHomeBuyerTaskRequest,
  UpdateHomeBuyerTaskRequest,
  UpdateHomeBuyerTaskStatusRequest,
  LinkTaskToBookingRequest,
} from '../types/task.types';
import { analyticsEmitter, AnalyticsEvent, AnalyticsModule, AnalyticsFeature } from '../services/analytics';
import { BuyerAcquisitionService } from '../services/buyerAcquisition.service';
import { BuyerPurchaseLoanEstimateService } from '../services/buyerPurchaseLoanEstimate.service';
import { BuyerPurchaseLenderReadinessService } from '../services/buyerPurchaseLenderReadiness.service';
import { BuyerTitleEscrowService } from '../services/buyerTitleEscrow.service';
import {
  BuyerDocumentVerificationInputSchema,
  BuyerFindingDispositionInputSchema,
  BuyerInspectionPlanInputSchema,
  BuyerLifecycleUpdateSchema,
  BuyerPurchaseFinancingInputSchema,
  BuyerPurchaseLoanEstimateCreateSchema,
  BuyerPurchaseLoanEstimateRevisionCreateSchema,
  BuyerPurchaseLoanEstimateUpdateSchema,
  BuyerPurchaseLoanSelectionSchema,
  BuyerPurchaseLenderReadinessUpdateSchema,
  BuyerLenderConditionCreateSchema,
  BuyerLenderConditionUpdateSchema,
  BuyerTitleEscrowWorkspaceUpdateSchema,
  BuyerTitleEscrowIssueCreateSchema,
  BuyerTitleEscrowIssueUpdateSchema,
} from '../productFramework/buyerAcquisition.contract';

/**
 * GET /api/home-buyer-tasks/properties/:propertyId/checklist
 * Gets the property's acquisition and 90-day ownership plan
 */
const handleGetChecklist = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    const { propertyId } = req.params;
    const checklist = await HomeBuyerTaskService.getChecklist(req.user.userId, propertyId);

    analyticsEmitter.track({
      eventType: AnalyticsEvent.TOOL_USED,
      userId: req.user.userId,
      propertyId,
      moduleKey: AnalyticsModule.HOME_BUYER,
      featureKey: AnalyticsFeature.HOME_BUYER_TASK,
      metadataJson: { actionType: 'buyer_plan_opened', planStatus: checklist.status },
    });

    return res.status(200).json({
      success: true,
      data: checklist,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('only available for')) {
      return res.status(403).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
};

/**
 * GET /api/home-buyer-tasks/properties/:propertyId/closing-home
 * Resolves the dashboard presentation mode and returns a bounded buyer payload.
 */
const handleGetClosingHome = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    const data = await HomeBuyerTaskService.getClosingHomePresentation(
      req.user.userId,
      req.params.propertyId,
    );
    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

/** GET /api/home-buyer-tasks/properties/:propertyId/overview */
const handleGetOverview = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required.' });
    const data = await HomeBuyerTaskService.getPlanOverview(req.user.userId, req.params.propertyId);
    analyticsEmitter.track({
      eventType: AnalyticsEvent.TOOL_USED,
      userId: req.user.userId,
      propertyId: req.params.propertyId,
      moduleKey: AnalyticsModule.HOME_BUYER,
      featureKey: AnalyticsFeature.HOME_BUYER_TASK,
      metadataJson: { actionType: 'buyer_plan_overview_opened', planStatus: data.plan.status },
    });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

/** GET /api/home-buyer-tasks/properties/:propertyId/checklist-composition */
const handlePreviewChecklistComposition = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required.' });
    const data = await HomeBuyerTaskService.previewChecklistComposition(req.user.userId, req.params.propertyId);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

/** POST /api/home-buyer-tasks/properties/:propertyId/checklist-composition/apply */
const handleApplyChecklistComposition = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required.' });
    const data = await HomeBuyerTaskService.applyChecklistComposition(req.user.userId, req.params.propertyId);
    analyticsEmitter.track({
      eventType: AnalyticsEvent.ACTION_COMPLETED,
      userId: req.user.userId,
      propertyId: req.params.propertyId,
      moduleKey: AnalyticsModule.HOME_BUYER,
      featureKey: AnalyticsFeature.HOME_BUYER_TASK,
      metadataJson: {
        actionType: 'buyer_checklist_composition_applied',
        templateVersion: data.templateVersion,
        added: data.delta.added,
        removed: data.delta.removed,
      },
    });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/home-buyer-tasks/tasks
 * Gets all tasks for the property plan
 */
const handleGetTasks = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    const tasks = await HomeBuyerTaskService.getTasks(req.user.userId, req.params.propertyId);

    return res.status(200).json({
      success: true,
      data: tasks,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/home-buyer-tasks/tasks/:taskId
 * Gets a single task by ID
 */
const handleGetTask = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    const { taskId } = req.params;
    const task = await HomeBuyerTaskService.getTask(req.user.userId, req.params.propertyId, taskId);

    return res.status(200).json({
      success: true,
      data: task,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
};

/**
 * POST /api/home-buyer-tasks/tasks
 * Creates a custom task
 */
const handleCreateTask = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    const data: CreateHomeBuyerTaskRequest = req.body;

    if (!data.title) {
      return res.status(400).json({
        success: false,
        message: 'title is required.',
      });
    }

    const task = await HomeBuyerTaskService.createTask(req.user.userId, req.params.propertyId, data);

    analyticsEmitter.track({
      eventType: AnalyticsEvent.ACTION_COMPLETED,
      userId: req.user.userId,
      propertyId: req.params.propertyId,
      moduleKey: AnalyticsModule.HOME_BUYER,
      featureKey: AnalyticsFeature.HOME_BUYER_TASK,
      metadataJson: { actionType: 'create_task' },
    });

    return res.status(201).json({
      success: true,
      data: task,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not available')) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
};

/**
 * PATCH /api/home-buyer-tasks/tasks/:taskId
 * Updates task details
 */
const handleUpdateTask = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    const { taskId } = req.params;
    const data: UpdateHomeBuyerTaskRequest = req.body;

    const task = await HomeBuyerTaskService.updateTask(
      req.user.userId,
      req.params.propertyId,
      taskId,
      data
    );

    return res.status(200).json({
      success: true,
      data: task,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }
    if (error instanceof Error && error.message.includes('not available')) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
};

/**
 * PATCH /api/home-buyer-tasks/tasks/:taskId/status
 * Updates task status
 */
const handleUpdateTaskStatus = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    const { taskId } = req.params;
    const { status }: UpdateHomeBuyerTaskStatusRequest = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'status is required.',
      });
    }

    const task = await HomeBuyerTaskService.updateTaskStatus(
      req.user.userId,
      req.params.propertyId,
      taskId,
      status
    );

    analyticsEmitter.track({
      eventType: AnalyticsEvent.ACTION_COMPLETED,
      userId: req.user.userId,
      propertyId: req.params.propertyId,
      moduleKey: AnalyticsModule.HOME_BUYER,
      featureKey: AnalyticsFeature.HOME_BUYER_TASK,
      metadataJson: { actionType: 'update_task_status', status },
    });

    return res.status(200).json({
      success: true,
      data: task,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
};

/**
 * DELETE /api/home-buyer-tasks/tasks/:taskId
 * Deletes a task
 */
const handleDeleteTask = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    const { taskId } = req.params;
    await HomeBuyerTaskService.deleteTask(req.user.userId, req.params.propertyId, taskId);

    return res.status(204).send();
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
};

/**
 * POST /api/home-buyer-tasks/tasks/:taskId/link-booking
 * Links a task to a booking
 */
const handleLinkToBooking = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    const { taskId } = req.params;
    const { bookingId }: LinkTaskToBookingRequest = req.body;

    if (!bookingId) {
      return res.status(400).json({
        success: false,
        message: 'bookingId is required.',
      });
    }

    const task = await HomeBuyerTaskService.linkToBooking(
      req.user.userId,
      req.params.propertyId,
      taskId,
      bookingId
    );

    analyticsEmitter.track({
      eventType: AnalyticsEvent.ACTION_COMPLETED,
      userId: req.user.userId,
      propertyId: req.params.propertyId,
      moduleKey: AnalyticsModule.HOME_BUYER,
      featureKey: AnalyticsFeature.HOME_BUYER_TASK,
      metadataJson: { actionType: 'link_to_booking' },
    });

    return res.status(200).json({
      success: true,
      data: task,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
};

/**
 * GET /api/home-buyer-tasks/stats
 * Gets task statistics
 */
const handleGetStats = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    const stats = await HomeBuyerTaskService.getTaskStats(req.user.userId, req.params.propertyId);

    return res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error) {
    next(error);
  }
};

/** GET /api/home-buyer-tasks/properties/:propertyId/import-readiness */
const handleGetImportReadiness = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required.' });
    const readiness = await HomeBuyerTaskService.getImportReadiness(req.user.userId, req.params.propertyId);
    return res.status(200).json({ success: true, data: readiness });
  } catch (error) {
    next(error);
  }
};

const handleUpdateLifecycle = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required.' });
    const input = BuyerLifecycleUpdateSchema.parse(req.body);
    const plan = await BuyerAcquisitionService.updateLifecycle(req.user.userId, req.params.propertyId, input);
    analyticsEmitter.track({
      eventType: AnalyticsEvent.ACTION_COMPLETED,
      userId: req.user.userId,
      propertyId: req.params.propertyId,
      moduleKey: AnalyticsModule.HOME_BUYER,
      featureKey: AnalyticsFeature.HOME_BUYER_TASK,
      metadataJson: { actionType: 'buyer_lifecycle_updated' },
    });
    return res.json({ success: true, data: plan });
  } catch (error) { next(error); }
};

const handleGetEvidenceReview = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required.' });
    const review = await BuyerAcquisitionService.getEvidenceReview(req.user.userId, req.params.propertyId);
    return res.json({ success: true, data: review });
  } catch (error) { next(error); }
};

const handleGetInspectionPlan = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required.' });
    const plan = await BuyerAcquisitionService.getInspectionPlan(req.user.userId, req.params.propertyId);
    return res.json({ success: true, data: plan });
  } catch (error) { next(error); }
};

const handleGetPurchaseFinancingPlan = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required.' });
    const plan = await BuyerAcquisitionService.getPurchaseFinancingPlan(req.user.userId, req.params.propertyId);
    return res.json({ success: true, data: plan });
  } catch (error) { next(error); }
};

const handleUpdatePurchaseFinancingPlan = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required.' });
    const input = BuyerPurchaseFinancingInputSchema.parse(req.body);
    const plan = await BuyerAcquisitionService.updatePurchaseFinancingPlan(
      req.user.userId,
      req.params.propertyId,
      input,
    );
    analyticsEmitter.track({
      eventType: AnalyticsEvent.DECISION_GUIDED,
      userId: req.user.userId,
      propertyId: req.params.propertyId,
      moduleKey: AnalyticsModule.HOME_BUYER,
      featureKey: AnalyticsFeature.HOME_BUYER_TASK,
      metadataJson: { actionType: 'buyer_purchase_path_confirmed', purchasePath: input.purchasePath },
    });
    return res.json({ success: true, data: plan });
  } catch (error) { next(error); }
};

const handleListPurchaseLoanEstimates = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required.' });
    const workspace = await BuyerPurchaseLoanEstimateService.list(req.user.userId, req.params.propertyId);
    return res.json({ success: true, data: workspace });
  } catch (error) { next(error); }
};

const handleCreatePurchaseLoanOffer = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required.' });
    const input = BuyerPurchaseLoanEstimateCreateSchema.parse(req.body);
    const workspace = await BuyerPurchaseLoanEstimateService.createOffer(req.user.userId, req.params.propertyId, input);
    return res.status(201).json({ success: true, data: workspace });
  } catch (error) { next(error); }
};

const handleAddPurchaseLoanEstimateRevision = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required.' });
    const input = BuyerPurchaseLoanEstimateRevisionCreateSchema.parse(req.body);
    const workspace = await BuyerPurchaseLoanEstimateService.addRevision(
      req.user.userId, req.params.propertyId, req.params.offerId, input,
    );
    return res.status(201).json({ success: true, data: workspace });
  } catch (error) { next(error); }
};

const handleUpdatePurchaseLoanEstimateDraft = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required.' });
    const input = BuyerPurchaseLoanEstimateUpdateSchema.parse(req.body);
    const workspace = await BuyerPurchaseLoanEstimateService.updateDraft(
      req.user.userId, req.params.propertyId, req.params.revisionId, input,
    );
    return res.json({ success: true, data: workspace });
  } catch (error) { next(error); }
};

const handleConfirmPurchaseLoanEstimate = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required.' });
    const workspace = await BuyerPurchaseLoanEstimateService.confirm(
      req.user.userId, req.params.propertyId, req.params.revisionId,
    );
    analyticsEmitter.track({
      eventType: AnalyticsEvent.DECISION_GUIDED,
      userId: req.user.userId,
      propertyId: req.params.propertyId,
      moduleKey: AnalyticsModule.HOME_BUYER,
      featureKey: AnalyticsFeature.HOME_BUYER_TASK,
      metadataJson: { actionType: 'buyer_purchase_loan_estimate_confirmed', revisionId: req.params.revisionId },
    });
    return res.json({ success: true, data: workspace });
  } catch (error) { next(error); }
};

const handleExtractPurchaseLoanEstimate = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required.' });
    const files = Array.isArray(req.files) ? req.files as Express.Multer.File[] : [];
    const proposal = await BuyerPurchaseLoanEstimateService.extractPrefill(
      req.user.userId,
      req.params.propertyId,
      files,
    );
    return res.json({ success: true, data: proposal });
  } catch (error) { next(error); }
};

const handleSelectPurchaseLoanOffer = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required.' });
    const input = BuyerPurchaseLoanSelectionSchema.parse(req.body);
    const workspace = await BuyerPurchaseLoanEstimateService.selectOffer(
      req.user.userId,
      req.params.propertyId,
      input,
    );
    analyticsEmitter.track({
      eventType: AnalyticsEvent.DECISION_GUIDED,
      userId: req.user.userId,
      propertyId: req.params.propertyId,
      moduleKey: AnalyticsModule.HOME_BUYER,
      featureKey: AnalyticsFeature.HOME_BUYER_TASK,
      metadataJson: {
        actionType: 'buyer_purchase_lender_selection_recorded',
        revisionId: input.revisionId,
        intentToProceed: input.intentToProceed,
      },
    });
    return res.json({ success: true, data: workspace });
  } catch (error) { next(error); }
};

const handleGetPurchaseLenderReadiness = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required.' });
    const data = await BuyerPurchaseLenderReadinessService.get(req.user.userId, req.params.propertyId);
    return res.json({ success: true, data });
  } catch (error) { next(error); }
};

const handleUpdatePurchaseLenderReadiness = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required.' });
    const input = BuyerPurchaseLenderReadinessUpdateSchema.parse(req.body);
    const data = await BuyerPurchaseLenderReadinessService.updateReadiness(req.user.userId, req.params.propertyId, input);
    return res.json({ success: true, data });
  } catch (error) { next(error); }
};

const handleCreateBuyerLenderCondition = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required.' });
    const input = BuyerLenderConditionCreateSchema.parse(req.body);
    const data = await BuyerPurchaseLenderReadinessService.createCondition(req.user.userId, req.params.propertyId, input);
    return res.status(201).json({ success: true, data });
  } catch (error) { next(error); }
};

const handleUpdateBuyerLenderCondition = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required.' });
    const input = BuyerLenderConditionUpdateSchema.parse(req.body);
    const data = await BuyerPurchaseLenderReadinessService.updateCondition(
      req.user.userId, req.params.propertyId, req.params.conditionId, input,
    );
    return res.json({ success: true, data });
  } catch (error) { next(error); }
};

const handleGetBuyerTitleEscrow = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required.' });
    const data = await BuyerTitleEscrowService.get(req.user.userId, req.params.propertyId);
    return res.json({ success: true, data });
  } catch (error) { next(error); }
};

const handleUpdateBuyerTitleEscrow = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required.' });
    const input = BuyerTitleEscrowWorkspaceUpdateSchema.parse(req.body);
    const data = await BuyerTitleEscrowService.update(req.user.userId, req.params.propertyId, input);
    return res.json({ success: true, data });
  } catch (error) { next(error); }
};

const handleCreateBuyerTitleEscrowIssue = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required.' });
    const input = BuyerTitleEscrowIssueCreateSchema.parse(req.body);
    const data = await BuyerTitleEscrowService.createIssue(req.user.userId, req.params.propertyId, input);
    return res.status(201).json({ success: true, data });
  } catch (error) { next(error); }
};

const handleUpdateBuyerTitleEscrowIssue = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required.' });
    const input = BuyerTitleEscrowIssueUpdateSchema.parse(req.body);
    const data = await BuyerTitleEscrowService.updateIssue(
      req.user.userId, req.params.propertyId, req.params.issueId, input,
    );
    return res.json({ success: true, data });
  } catch (error) { next(error); }
};

const handleUpdateInspectionPlan = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required.' });
    const input = BuyerInspectionPlanInputSchema.parse(req.body);
    const plan = await BuyerAcquisitionService.updateInspectionPlan(req.user.userId, req.params.propertyId, input);
    analyticsEmitter.track({
      eventType: AnalyticsEvent.ACTION_COMPLETED,
      userId: req.user.userId,
      propertyId: req.params.propertyId,
      moduleKey: AnalyticsModule.HOME_BUYER,
      featureKey: AnalyticsFeature.HOME_BUYER_TASK,
      metadataJson: {
        actionType: 'buyer_inspection_plan_updated',
        scheduled: Boolean(plan.plan?.scheduledAt),
        reinspectionRequired: plan.plan?.reinspectionRequired ?? false,
      },
    });
    return res.json({ success: true, data: plan });
  } catch (error) { next(error); }
};

const handleVerifyDocument = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required.' });
    const input = BuyerDocumentVerificationInputSchema.parse(req.body);
    const document = await BuyerAcquisitionService.verifyDocument(
      req.user.userId, req.params.propertyId, req.params.documentId, input,
    );
    analyticsEmitter.track({
      eventType: AnalyticsEvent.ACTION_COMPLETED,
      userId: req.user.userId,
      propertyId: req.params.propertyId,
      moduleKey: AnalyticsModule.HOME_BUYER,
      featureKey: AnalyticsFeature.HOME_BUYER_TASK,
      metadataJson: { actionType: 'buyer_document_reviewed', documentId: req.params.documentId, status: input.status },
    });
    return res.json({ success: true, data: document });
  } catch (error) { next(error); }
};

const handleDispositionFinding = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required.' });
    const input = BuyerFindingDispositionInputSchema.parse(req.body);
    const result = await BuyerAcquisitionService.dispositionFinding(
      req.user.userId, req.params.propertyId, req.params.findingId, input,
    );
    analyticsEmitter.track({
      eventType: AnalyticsEvent.DECISION_GUIDED,
      userId: req.user.userId,
      propertyId: req.params.propertyId,
      moduleKey: AnalyticsModule.HOME_BUYER,
      featureKey: AnalyticsFeature.HOME_BUYER_TASK,
      metadataJson: {
        actionType: 'buyer_finding_dispositioned',
        findingId: req.params.findingId,
        disposition: input.disposition,
        taskId: result.taskId,
        guidanceJourneyId: result.guidanceJourneyId,
        repairJourneyId: result.repairJourneyId,
      },
    });
    return res.json({ success: true, data: result });
  } catch (error) { next(error); }
};

const handleHandoff = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required.' });
    const result = await BuyerAcquisitionService.ensureRecurringHandoff(req.user.userId, req.params.propertyId);
    if (result.handedOff) {
      analyticsEmitter.track({
        eventType: AnalyticsEvent.ACTION_COMPLETED,
        userId: req.user.userId,
        propertyId: req.params.propertyId,
        moduleKey: AnalyticsModule.HOME_BUYER,
        featureKey: AnalyticsFeature.HOME_BUYER_TASK,
        metadataJson: { actionType: 'buyer_plan_handed_off', ...result },
      });
    }
    return res.json({ success: true, data: result });
  } catch (error) { next(error); }
};

const handleGetAcceptanceStatus = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required.' });
    const status = await BuyerAcquisitionService.getAcceptanceStatus(req.user.userId, req.params.propertyId);
    return res.json({ success: true, data: status });
  } catch (error) { next(error); }
};

export const homeBuyerTaskController = {
  handleGetClosingHome,
  handleGetOverview,
  handlePreviewChecklistComposition,
  handleApplyChecklistComposition,
  handleGetChecklist,
  handleGetTasks,
  handleGetTask,
  handleCreateTask,
  handleUpdateTask,
  handleUpdateTaskStatus,
  handleDeleteTask,
  handleLinkToBooking,
  handleGetStats,
  handleGetImportReadiness,
  handleUpdateLifecycle,
  handleGetEvidenceReview,
  handleGetInspectionPlan,
  handleUpdateInspectionPlan,
  handleGetPurchaseFinancingPlan,
  handleUpdatePurchaseFinancingPlan,
  handleListPurchaseLoanEstimates,
  handleCreatePurchaseLoanOffer,
  handleAddPurchaseLoanEstimateRevision,
  handleUpdatePurchaseLoanEstimateDraft,
  handleConfirmPurchaseLoanEstimate,
  handleExtractPurchaseLoanEstimate,
  handleSelectPurchaseLoanOffer,
  handleGetPurchaseLenderReadiness,
  handleUpdatePurchaseLenderReadiness,
  handleCreateBuyerLenderCondition,
  handleUpdateBuyerLenderCondition,
  handleGetBuyerTitleEscrow,
  handleUpdateBuyerTitleEscrow,
  handleCreateBuyerTitleEscrowIssue,
  handleUpdateBuyerTitleEscrowIssue,
  handleVerifyDocument,
  handleDispositionFinding,
  handleHandoff,
  handleGetAcceptanceStatus,
};
