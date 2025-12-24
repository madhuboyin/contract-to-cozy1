// apps/backend/src/routes/checklist.routes.ts
import { Router } from 'express';
import { checklistController } from '../controllers/checklist.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

/**
 * @swagger
 * /api/checklist:
 *   get:
 *     summary: Get the user's checklist
 *     tags: [Checklist]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User's checklist items
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
router.get('/', authenticate, checklistController.handleGetChecklist);

/**
 * @swagger
 * /api/checklist/items/{itemId}:
 *   put:
 *     summary: Update a checklist item's status
 *     tags: [Checklist]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Checklist item ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               completed:
 *                 type: boolean
 *               completedAt:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       200:
 *         description: Checklist item updated
 *       404:
 *         description: Item not found
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.put(
  '/items/:itemId',
  authenticate,
  checklistController.handleUpdateChecklistItem
);

/**
 * @swagger
 * /api/checklist/items/{itemId}:
 *   patch:
 *     summary: Update a checklist item's configuration (title, description, etc.)
 *     tags: [Checklist]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Checklist item ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               dueDate:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       200:
 *         description: Checklist item configuration updated
 *       404:
 *         description: Item not found
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.patch(
  '/items/:itemId',
  authenticate,
  checklistController.handlePatchChecklistItem
);

/**
 * @swagger
 * /api/checklist/items/{itemId}:
 *   delete:
 *     summary: Delete a checklist item (used for recurring maintenance tasks)
 *     tags: [Checklist]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Checklist item ID
 *     responses:
 *       204:
 *         description: Checklist item deleted
 *       404:
 *         description: Item not found
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.delete(
  '/items/:itemId',
  authenticate,
  checklistController.handleDeleteChecklistItem
);
// Add this route to apps/backend/src/routes/checklist.routes.ts
// Insert AFTER the DELETE route and BEFORE the POST /maintenance-items route

/**
 * @swagger
 * /api/checklist/items:
 *   post:
 *     summary: Create a new checklist item directly (used by orchestration/action center)
 *     tags: [Checklist]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - propertyId
 *               - orchestrationActionId
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               serviceCategory:
 *                 type: string
 *               propertyId:
 *                 type: string
 *                 format: uuid
 *               isRecurring:
 *                 type: boolean
 *               frequency:
 *                 type: string
 *               nextDueDate:
 *                 type: string
 *                 format: date-time
 *               orchestrationActionId:
 *                 type: string
 *                 description: Stable ID for Action Center deduplication
 *     responses:
 *       201:
 *         description: Checklist item created
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.post(
  '/items',
  authenticate,
  checklistController.handleCreateChecklistItem
);
/**
 * @swagger
 * /api/checklist/maintenance-items:
 *   post:
 *     summary: Add new recurring maintenance items to user's checklist
 *     tags: [Checklist]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - templateIds
 *             properties:
 *               templateIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *               propertyId:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       201:
 *         description: Maintenance items added
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.post(
  '/maintenance-items',
  authenticate,
  checklistController.handleCreateMaintenanceItems
);

export default router;