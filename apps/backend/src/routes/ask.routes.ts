import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { geminiRateLimiter } from '../middleware/rateLimiter.middleware';
import { getAskMonitor, getAskSessionExecutions, patchAskMonitor, postAskCancellation, postAskCapture, postAskConfirmation, postAskExecution } from '../controllers/ask.controller';

const router = Router();

router.use(authenticate);
router.use(geminiRateLimiter);
router.post('/ask/executions', postAskExecution);
router.post('/ask/executions/:executionId/captures', postAskCapture);
router.post('/ask/executions/:executionId/confirm', postAskConfirmation);
router.post('/ask/executions/:executionId/cancel', postAskCancellation);
router.patch('/ask/monitors/:monitorId', patchAskMonitor);
router.get('/ask/monitors/:monitorId', getAskMonitor);
router.get('/ask/sessions/:sessionId', getAskSessionExecutions);

export default router;
