// apps/backend/src/routes/home-management.routes.ts

import { Router } from 'express';
import * as HomeManagementController from '../controllers/home-management.controller';
import { authenticate, restrictToHomeowner } from '../middleware/auth.middleware'; 
import { upload } from '../controllers/home-management.controller'; 

const router = Router();

// Apply authentication and the new role restriction middleware to all routes in this router.
// This ensures only authenticated HOMEOWNERs with a profile can access these endpoints.
router.use(authenticate, restrictToHomeowner);

// --- DOCUMENT ROUTES (FIXED) ---
router.route('/documents')
    .get(HomeManagementController.getDocuments); // ADDED: Registers the GET route
    
router.route('/documents/upload')
    .post(upload.single('file'), HomeManagementController.postDocumentUpload); 


// --- EXPENSES ROUTES ---
router.route('/expenses')
  .post(HomeManagementController.postExpense)
  .get(HomeManagementController.getExpenses);

router.route('/expenses/:expenseId')
  .patch(HomeManagementController.patchExpense)
  .delete(HomeManagementController.deleteExpense);


// --- WARRANTIES ROUTES ---
router.route('/warranties')
  .post(HomeManagementController.postWarranty)
  .get(HomeManagementController.getWarranties);

router.route('/warranties/:warrantyId')
  .patch(HomeManagementController.patchWarranty)
  .delete(HomeManagementController.deleteWarranty);

// --- HOME ASSET ROUTES (NEW: For linking to warranties) ---
router.route('/home-assets')
  .get(HomeManagementController.getLinkedAssets);

// --- INSURANCE POLICIES ROUTES ---
router.route('/insurance-policies')
  .post(HomeManagementController.postInsurancePolicy)
  .get(HomeManagementController.getInsurancePolicies);

router.route('/insurance-policies/:policyId')
  .patch(HomeManagementController.patchInsurancePolicy)
  .delete(HomeManagementController.deleteInsurancePolicy);

export default router;