import { Router } from 'express';
import { newHomeSetupController } from '../controllers/newHomeSetup.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();
router.use(authenticate);

router.get('/properties/:propertyId/overview', newHomeSetupController.getOverview);
router.get('/properties/:propertyId/pilot-assessment', newHomeSetupController.getAssessment);
router.put('/properties/:propertyId/pilot-assessment', newHomeSetupController.assessPilot);
router.get('/properties/:propertyId/plan', newHomeSetupController.getPlan);
router.patch('/properties/:propertyId/lifecycle', newHomeSetupController.updateLifecycle);
router.patch('/properties/:propertyId/tasks/:taskId', newHomeSetupController.updateTask);

export default router;
