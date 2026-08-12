import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { askRateLimiter } from '../middleware/rateLimiter.middleware';
import { deleteAskSession, getAskExecutionById, getAskMonitor, getAskPendingExecutions, getAskSessionExecutions, patchAskMonitor, postAskCancellation, postAskCapture, postAskCaptureEvent, postAskClarification, postAskConfirmation, postAskContinuation, postAskCorrection, postAskExecution, postAskExecutionProperty, postAskFeedback, postHomeActionUsefulnessFeedback } from '../controllers/ask.controller';

const router = Router();

router.use(authenticate);
router.use(askRateLimiter);
router.post('/ask/executions', postAskExecution);
router.post('/ask/executions/:executionId/captures', postAskCapture);
router.post('/ask/executions/:executionId/captures/events', postAskCaptureEvent);
router.post('/ask/executions/:executionId/clarifications', postAskClarification);
router.post('/ask/executions/:executionId/property', postAskExecutionProperty);
router.post('/ask/executions/:executionId/confirm', postAskConfirmation);
router.post('/ask/executions/:executionId/cancel', postAskCancellation);
router.post('/ask/executions/:executionId/feedback', postAskFeedback);
router.post('/ask/executions/:executionId/priority-list/:homeActionId/feedback', postHomeActionUsefulnessFeedback);
router.post('/ask/executions/:executionId/continue', postAskContinuation);
router.post('/ask/executions/:executionId/corrections', postAskCorrection);
router.get('/ask/executions/:executionId', getAskExecutionById);
router.get('/ask/pending', getAskPendingExecutions);
router.patch('/ask/monitors/:monitorId', patchAskMonitor);
router.get('/ask/monitors/:monitorId', getAskMonitor);
router.get('/ask/sessions/:sessionId', getAskSessionExecutions);
router.delete('/ask/sessions/:sessionId', deleteAskSession);

export default router;
