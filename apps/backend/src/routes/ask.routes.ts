import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth.middleware';
import { requireAskEligibleAccount } from '../middleware/askAccountEligibility.middleware';
import { getAskTargetSelectionHandler, deleteAskSession, patchAskSession, getAskConciergeHome, getAskExecutionById, getAskMonitor, getAskPendingExecutions, getAskWorkPageHandler, postAskSearchHandler, getAskNotificationsHandler, postAskNotificationOpenHandler, patchAskNotificationDismissHandler, patchAskNotificationReadHandler, getAskNotificationSettingsHandler, putAskNotificationCategoryHandler, putAskNotificationQuietHoursHandler, putAskNotificationConsentHandler, getAskSavedPageHandler, getAskSavedResolveHandler, patchAskSavedArchiveHandler, getAskWorkResolveHandler, getAskRecordIndexHandler, getAskRecordExportReviewHandler, getAskRecordSectionPage, getAskRecordDetailHandler, getAskRecentSessions, getAskSessionExecutions, patchAskMonitor, postAskCancellation, postAskCapture, postAskCaptureEvent, postAskClarification, postAskConfirmation, postAskConfirmationEdit, postAskContinuation, postAskCorrection, postAskExecution, postAskExecutionProperty, postAskExecutionRefresh, postAskExecutionRetry, postAskFeedback, postDismissSuggestedAction, postAskSessionSearch, postHomeActionUsefulnessFeedback } from '../controllers/ask.controller';
import { propertyAuthMiddleware, requireHouseholdRole } from '../middleware/propertyAuth.middleware';
import { uploadRateLimiter } from '../middleware/rateLimiter.middleware';
import { validateDocumentUpload } from '../utils/documentValidator.util';
import { scanIntakeUpload } from '../services/contentScan.service';
import { ASK_INTAKE_ACCEPTED_TYPES, ASK_INTAKE_MAX_BYTES } from '../services/ask/askIntake.contract';
import { getAskIntakeConfigHandler, getAskIntakeHandler, patchAskIntakeLabel, postAskIntakeAnalyze, postAskIntakeCandidateReview, postAskIntakeDiscard, postAskIntakeFile, postAskIntakeLabelConfirm, postAskIntakeLabelDismiss, postAskIntakePromote } from '../controllers/askIntake.controller';

const router = Router();

// Phase 7 file intake: memory storage like Home Records; the content checks run in validateDocumentUpload before anything is stored.
const intakeUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: ASK_INTAKE_MAX_BYTES },
  fileFilter: (_req, file, callback) => ((ASK_INTAKE_ACCEPTED_TYPES as readonly string[]).includes(file.mimetype) ? callback(null, true) : callback(new Error('Only PDF, JPEG, PNG, and WEBP files are supported.'))),
});
const intakeContributor = [propertyAuthMiddleware, requireHouseholdRole('CONTRIBUTOR')];

router.use('/ask', authenticate, requireAskEligibleAccount);
router.get('/ask/concierge-home', getAskConciergeHome);
router.get('/ask/target-selectors/:selectorId', getAskTargetSelectionHandler);
router.post('/ask/executions', postAskExecution);
router.post('/ask/executions/:executionId/retry', postAskExecutionRetry);
router.post('/ask/executions/:executionId/captures', postAskCapture);
router.post('/ask/executions/:executionId/captures/events', postAskCaptureEvent);
router.post('/ask/executions/:executionId/clarifications', postAskClarification);
router.post('/ask/executions/:executionId/property', postAskExecutionProperty);
router.post('/ask/executions/:executionId/confirm', postAskConfirmation);
router.post('/ask/executions/:executionId/confirm/edit', postAskConfirmationEdit);
router.post('/ask/executions/:executionId/cancel', postAskCancellation);
router.post('/ask/executions/:executionId/refresh', postAskExecutionRefresh);
router.post('/ask/executions/:executionId/feedback', postAskFeedback);
router.post('/ask/executions/:executionId/suggested-actions/:actionId/dismiss', postDismissSuggestedAction);
router.post('/ask/executions/:executionId/priority-list/:homeActionId/feedback', postHomeActionUsefulnessFeedback);
router.post('/ask/executions/:executionId/continue', postAskContinuation);
router.post('/ask/executions/:executionId/corrections', postAskCorrection);
router.get('/ask/executions/:executionId', getAskExecutionById);
router.get('/ask/pending', getAskPendingExecutions);
router.get('/ask/intake/config', getAskIntakeConfigHandler);
router.post('/ask/properties/:propertyId/intake/files', ...intakeContributor, uploadRateLimiter, intakeUpload.single('file'), validateDocumentUpload, scanIntakeUpload, postAskIntakeFile);
router.get('/ask/properties/:propertyId/intake/:recordId', ...intakeContributor, getAskIntakeHandler);
router.post('/ask/properties/:propertyId/intake/:recordId/analyze', ...intakeContributor, postAskIntakeAnalyze);
router.post('/ask/properties/:propertyId/intake/:recordId/candidates/:candidateId/review', ...intakeContributor, postAskIntakeCandidateReview);
router.post('/ask/properties/:propertyId/intake/:recordId/promote', ...intakeContributor, postAskIntakePromote);
router.patch('/ask/properties/:propertyId/intake/:recordId/label', ...intakeContributor, patchAskIntakeLabel);
router.post('/ask/properties/:propertyId/intake/:recordId/label/confirm', ...intakeContributor, postAskIntakeLabelConfirm);
router.post('/ask/properties/:propertyId/intake/:recordId/label/dismiss', ...intakeContributor, postAskIntakeLabelDismiss);
router.post('/ask/properties/:propertyId/intake/:recordId/discard', ...intakeContributor, postAskIntakeDiscard);
router.get('/ask/work', getAskWorkPageHandler);
router.post('/ask/search', postAskSearchHandler);
router.get('/ask/notifications', getAskNotificationsHandler);
router.post('/ask/notifications/:id/open', postAskNotificationOpenHandler);
router.patch('/ask/notifications/:id/dismiss', patchAskNotificationDismissHandler);
router.patch('/ask/notifications/:id/read', patchAskNotificationReadHandler);
router.get('/ask/notification-settings', getAskNotificationSettingsHandler);
router.put('/ask/notification-settings/categories/:category', putAskNotificationCategoryHandler);
router.put('/ask/notification-settings/quiet-hours', putAskNotificationQuietHoursHandler);
router.put('/ask/notification-settings/consents/:category', putAskNotificationConsentHandler);
router.get('/ask/saved', getAskSavedPageHandler);
router.get('/ask/saved/resolve', getAskSavedResolveHandler);
router.patch('/ask/saved/archive', patchAskSavedArchiveHandler);
router.get('/ask/work/resolve', getAskWorkResolveHandler);
router.get('/ask/record-index', getAskRecordIndexHandler);
router.get('/ask/record-export-review', getAskRecordExportReviewHandler);
router.get('/ask/record-sections/:sectionId', getAskRecordSectionPage);
router.get('/ask/record-sections/:sectionId/records/:recordId', getAskRecordDetailHandler);
router.patch('/ask/monitors/:monitorId', patchAskMonitor);
router.get('/ask/monitors/:monitorId', getAskMonitor);
router.get('/ask/sessions/recent', getAskRecentSessions);
router.post('/ask/sessions/search', postAskSessionSearch);
router.get('/ask/sessions/:sessionId', getAskSessionExecutions);
router.patch('/ask/sessions/:sessionId', patchAskSession);
router.delete('/ask/sessions/:sessionId', deleteAskSession);

export default router;
