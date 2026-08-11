import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { geminiRateLimiter } from '../middleware/rateLimiter.middleware';
import { getAskSessionExecutions, postAskCapture, postAskExecution } from '../controllers/ask.controller';

const router = Router();

router.use(authenticate);
router.use(geminiRateLimiter);
router.post('/ask/executions', postAskExecution);
router.post('/ask/executions/:executionId/captures', postAskCapture);
router.get('/ask/sessions/:sessionId', getAskSessionExecutions);

export default router;
