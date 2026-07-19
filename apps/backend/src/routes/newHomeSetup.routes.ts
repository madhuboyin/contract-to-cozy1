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
router.post('/properties/:propertyId/punch-list', newHomeSetupController.createPunchListItem);
router.post('/properties/:propertyId/punch-list/:itemId/responses', newHomeSetupController.addBuilderResponse);
router.post('/properties/:propertyId/warranty-rights', newHomeSetupController.createWarrantyRight);
router.post('/properties/:propertyId/warranty-rights/from-document', newHomeSetupController.promoteWarrantyDocument);
router.patch('/properties/:propertyId/warranty-rights/:rightId/verify', newHomeSetupController.verifyWarrantyRight);
router.put('/properties/:propertyId/registrations', newHomeSetupController.upsertRegistration);
router.post('/properties/:propertyId/evidence', newHomeSetupController.addEvidence);
router.post('/properties/:propertyId/inspection-bundles', newHomeSetupController.ensureInspectionBundles);
router.patch('/properties/:propertyId/inspection-bundles/:bundleId', newHomeSetupController.updateInspectionBundle);
router.post('/properties/:propertyId/handoff', newHomeSetupController.handoff);
router.get('/properties/:propertyId/acceptance-status', newHomeSetupController.getAcceptanceStatus);

export default router;
