import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { askRateLimiter } from '../middleware/rateLimiter.middleware';
import { deleteAskSession, getAskExecutionById, getAskMonitor, getAskSessionExecutions, patchAskMonitor, postAskCancellation, postAskCapture, postAskCaptureEvent, postAskClarification, postAskConfirmation, postAskCorrection, postAskExecution, postAskFeedback } from '../controllers/ask.controller';

const router = Router();

router.use(authenticate);
router.use(askRateLimiter);
router.post('/ask/executions', postAskExecution);
router.post('/ask/executions/:executionId/captures', postAskCapture);
router.post('/ask/executions/:executionId/captures/events', postAskCaptureEvent);
router.post('/ask/executions/:executionId/clarifications', postAskClarification);
router.post('/ask/executions/:executionId/confirm', postAskConfirmation);
router.post('/ask/executions/:executionId/cancel', postAskCancellation);
router.post('/ask/executions/:executionId/feedback', postAskFeedback);
router.post('/ask/executions/:executionId/corrections', postAskCorrection);
router.get('/ask/executions/:executionId', getAskExecutionById);
router.patch('/ask/monitors/:monitorId', patchAskMonitor);
router.get('/ask/monitors/:monitorId', getAskMonitor);
router.get('/ask/sessions/:sessionId', getAskSessionExecutions);
router.delete('/ask/sessions/:sessionId', deleteAskSession);

export default router;
