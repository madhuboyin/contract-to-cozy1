import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { geminiRateLimiter } from '../middleware/rateLimiter.middleware';
import { deleteAskSession, getAskMonitor, getAskSessionExecutions, patchAskMonitor, postAskCancellation, postAskCapture, postAskCaptureEvent, postAskConfirmation, postAskExecution, postAskFeedback } from '../controllers/ask.controller';

const router = Router();

router.use(authenticate);
router.use(geminiRateLimiter);
router.post('/ask/executions', postAskExecution);
router.post('/ask/executions/:executionId/captures', postAskCapture);
router.post('/ask/executions/:executionId/captures/events', postAskCaptureEvent);
router.post('/ask/executions/:executionId/confirm', postAskConfirmation);
router.post('/ask/executions/:executionId/cancel', postAskCancellation);
router.post('/ask/executions/:executionId/feedback', postAskFeedback);
router.patch('/ask/monitors/:monitorId', patchAskMonitor);
router.get('/ask/monitors/:monitorId', getAskMonitor);
router.get('/ask/sessions/:sessionId', getAskSessionExecutions);
router.delete('/ask/sessions/:sessionId', deleteAskSession);

export default router;
