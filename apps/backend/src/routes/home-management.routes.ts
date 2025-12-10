// apps/backend/src/routes/home-management.routes.ts

import { Router } from 'express';
import * as HomeManagementController from '../controllers/home-management.controller';
import { authenticate, restrictToHomeowner } from '../middleware/auth.middleware'; 
import { upload } from '../controllers/home-management.controller'; 

const router = Router();

// Apply authentication and the new role restriction middleware to all routes in this router.
// This ensures only authenticated HOMEOWNERs with a profile can access these endpoints.
router.use(authenticate, restrictToHomeowner);

/**
 * @swagger
 * /api/home-management/documents:
 *   get:
 *     summary: Get all documents for homeowner
 *     tags: [Home Management]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of documents
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     documents:
 *                       type: array
 *                       items:
 *                         type: object
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         description: Homeowner only
 */
router.route('/documents')
    .get(HomeManagementController.getDocuments);
    
/**
 * @swagger
 * /api/home-management/documents/upload:
 *   post:
 *     summary: Upload a document
 *     tags: [Home Management]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *               - type
 *               - name
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               type:
 *                 type: string
 *                 enum: [DEED, INSPECTION, WARRANTY, INSURANCE, RECEIPT, OTHER]
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               propertyId:
 *                 type: string
 *                 format: uuid
 *               warrantyId:
 *                 type: string
 *                 format: uuid
 *               policyId:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       201:
 *         description: Document uploaded successfully
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         description: Homeowner only
 */
router.route('/documents/upload')
    .post(upload.single('file'), HomeManagementController.postDocumentUpload); 


/**
 * @swagger
 * /api/home-management/expenses:
 *   post:
 *     summary: Create a new expense
 *     tags: [Home Management]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - amount
 *               - category
 *               - date
 *             properties:
 *               amount:
 *                 type: number
 *               category:
 *                 type: string
 *               date:
 *                 type: string
 *                 format: date
 *               description:
 *                 type: string
 *               propertyId:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       201:
 *         description: Expense created
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *   get:
 *     summary: Get all expenses for homeowner
 *     tags: [Home Management]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of expenses
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.route('/expenses')
  .post(HomeManagementController.postExpense)
  .get(HomeManagementController.getExpenses);

/**
 * @swagger
 * /api/home-management/expenses/{expenseId}:
 *   patch:
 *     summary: Update an expense
 *     tags: [Home Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: expenseId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               amount:
 *                 type: number
 *               category:
 *                 type: string
 *               date:
 *                 type: string
 *                 format: date
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Expense updated
 *       404:
 *         description: Expense not found
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *   delete:
 *     summary: Delete an expense
 *     tags: [Home Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: expenseId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       204:
 *         description: Expense deleted
 *       404:
 *         description: Expense not found
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.route('/expenses/:expenseId')
  .patch(HomeManagementController.patchExpense)
  .delete(HomeManagementController.deleteExpense);


/**
 * @swagger
 * /api/home-management/warranties:
 *   post:
 *     summary: Create a new warranty
 *     tags: [Home Management]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - startDate
 *             properties:
 *               name:
 *                 type: string
 *               startDate:
 *                 type: string
 *                 format: date
 *               endDate:
 *                 type: string
 *                 format: date
 *               provider:
 *                 type: string
 *               coverage:
 *                 type: string
 *               assetId:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       201:
 *         description: Warranty created
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *   get:
 *     summary: Get all warranties for homeowner
 *     tags: [Home Management]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of warranties
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.route('/warranties')
  .post(HomeManagementController.postWarranty)
  .get(HomeManagementController.getWarranties);

/**
 * @swagger
 * /api/home-management/warranties/{warrantyId}:
 *   patch:
 *     summary: Update a warranty
 *     tags: [Home Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: warrantyId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               startDate:
 *                 type: string
 *                 format: date
 *               endDate:
 *                 type: string
 *                 format: date
 *               provider:
 *                 type: string
 *               coverage:
 *                 type: string
 *     responses:
 *       200:
 *         description: Warranty updated
 *       404:
 *         description: Warranty not found
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *   delete:
 *     summary: Delete a warranty
 *     tags: [Home Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: warrantyId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       204:
 *         description: Warranty deleted
 *       404:
 *         description: Warranty not found
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.route('/warranties/:warrantyId')
  .patch(HomeManagementController.patchWarranty)
  .delete(HomeManagementController.deleteWarranty);

/**
 * @swagger
 * /api/home-management/home-assets:
 *   get:
 *     summary: Get linked home assets (for warranty linking)
 *     tags: [Home Management]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of home assets
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.route('/home-assets')
  .get(HomeManagementController.getLinkedAssets);

/**
 * @swagger
 * /api/home-management/insurance-policies:
 *   post:
 *     summary: Create a new insurance policy
 *     tags: [Home Management]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - provider
 *               - policyNumber
 *               - type
 *               - startDate
 *             properties:
 *               provider:
 *                 type: string
 *               policyNumber:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [HOME, AUTO, LIFE, HEALTH, OTHER]
 *               startDate:
 *                 type: string
 *                 format: date
 *               endDate:
 *                 type: string
 *                 format: date
 *               premium:
 *                 type: number
 *               coverage:
 *                 type: string
 *     responses:
 *       201:
 *         description: Insurance policy created
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *   get:
 *     summary: Get all insurance policies for homeowner
 *     tags: [Home Management]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of insurance policies
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.route('/insurance-policies')
  .post(HomeManagementController.postInsurancePolicy)
  .get(HomeManagementController.getInsurancePolicies);

/**
 * @swagger
 * /api/home-management/insurance-policies/{policyId}:
 *   patch:
 *     summary: Update an insurance policy
 *     tags: [Home Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: policyId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               provider:
 *                 type: string
 *               policyNumber:
 *                 type: string
 *               type:
 *                 type: string
 *               startDate:
 *                 type: string
 *                 format: date
 *               endDate:
 *                 type: string
 *                 format: date
 *               premium:
 *                 type: number
 *               coverage:
 *                 type: string
 *     responses:
 *       200:
 *         description: Insurance policy updated
 *       404:
 *         description: Policy not found
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *   delete:
 *     summary: Delete an insurance policy
 *     tags: [Home Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: policyId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       204:
 *         description: Insurance policy deleted
 *       404:
 *         description: Policy not found
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.route('/insurance-policies/:policyId')
  .patch(HomeManagementController.patchInsurancePolicy)
  .delete(HomeManagementController.deleteInsurancePolicy);

export default router;