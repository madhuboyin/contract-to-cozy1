// apps/backend/src/feedback/feedback.routes.ts
import { Router } from 'express';
import { FeedbackController } from './feedback.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.post('/feedback', authenticate, FeedbackController.submit);

export default router;
