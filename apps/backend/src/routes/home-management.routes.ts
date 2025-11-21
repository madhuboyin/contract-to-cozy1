// apps/backend/src/routes/home-management.routes.ts

import { Router } from 'express';
import * as HomeManagementController from '../controllers/home-management.controller';
// FIX 1: Changed 'authenticateToken' to 'authenticate'
// FIX 2: Added 'restrictToHomeowner'
import { authenticate, restrictToHomeowner } from '../middleware/auth.middleware'; 
// NOTE: Validation middleware is omitted here but required for production code 

const router = Router();

// Apply authentication and the new role restriction middleware to all routes in this router.
// This ensures only authenticated HOMEOWNERs with a profile can access these endpoints.
router.use(authenticate, restrictToHomeowner);

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


// --- INSURANCE POLICIES ROUTES ---
router.route('/insurance-policies')
  .post(HomeManagementController.postInsurancePolicy)
  .get(HomeManagementController.getInsurancePolicies);

router.route('/insurance-policies/:policyId')
  .patch(HomeManagementController.patchInsurancePolicy)
  .delete(HomeManagementController.deleteInsurancePolicy);

export default router;