// apps/backend/src/controllers/checklist.controller.ts

/**
 * Checklist Controller
 * 
 * @deprecated These endpoints are being phased out.
 * 
 * New Endpoints:
 * - HOME_BUYER: /api/home-buyer-tasks/*
 * - EXISTING_OWNER: /api/maintenance-tasks/*
 * 
 * See: homeBuyerTask.controller.ts, propertyMaintenanceTask.controller.ts
 */

import { Response, NextFunction } from 'express';
import { ChecklistService } from '../services/checklist.service';
import { AuthRequest } from '../types/auth.types';
import { ChecklistItemStatus } from '@prisma/client';

/**
 * Gets the user's checklist.
 * @deprecated Use GET /api/home-buyer-tasks/checklist or GET /api/maintenance-tasks/property/:propertyId
 */
const handleGetChecklist = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }
    const userId = req.user.userId;

    const checklist = await ChecklistService.getOrCreateChecklist(userId);
    
    // Add deprecation headers
    res.setHeader('X-API-Deprecated', 'true');
    res.setHeader('X-API-Deprecation-Info', 'Use /api/home-buyer-tasks or /api/maintenance-tasks');
    res.setHeader('X-API-Sunset-Date', '2025-12-31');
    
    return res.status(200).json(checklist);
  } catch (error) {
    next(error);
  }
};

/**
 * Updates the status of a single checklist item.
 * @deprecated Use PATCH /api/home-buyer-tasks/tasks/:taskId/status or PATCH /api/maintenance-tasks/:taskId/status
 */
const handleUpdateChecklistItem = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }
    const userId = req.user.userId;

    const { itemId } = req.params;
    const { status } = req.body;

    if (!status || !Object.values(ChecklistItemStatus).includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or missing status.',
      });
    }

    const updatedItem = await ChecklistService.updateChecklistItemStatus(
      userId,
      itemId,
      status
    );

    // Add deprecation headers
    res.setHeader('X-API-Deprecated', 'true');
    res.setHeader('X-API-Deprecation-Info', 'Use /api/home-buyer-tasks or /api/maintenance-tasks');

    return res.status(200).json({
      success: true,
      data: updatedItem,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('access') || error.message.includes('not found'))
    ) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
};

/**
 * Updates configuration of a single checklist item.
 * @deprecated Use PATCH /api/home-buyer-tasks/tasks/:taskId or PATCH /api/maintenance-tasks/:taskId
 */
const handlePatchChecklistItem = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }
    const userId = req.user.userId;

    const { itemId } = req.params;
    const updateData = req.body;

    const updatedItem = await ChecklistService.updateChecklistItemConfig(
      userId,
      itemId,
      updateData
    );

    // Add deprecation headers
    res.setHeader('X-API-Deprecated', 'true');
    res.setHeader('X-API-Deprecation-Info', 'Use /api/home-buyer-tasks or /api/maintenance-tasks');

    return res.status(200).json({
      success: true,
      data: updatedItem,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('access') || error.message.includes('not found'))
    ) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
};

/**
 * Deletes a single checklist item.
 * @deprecated Use DELETE /api/home-buyer-tasks/tasks/:taskId or DELETE /api/maintenance-tasks/:taskId
 */
const handleDeleteChecklistItem = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }
    const userId = req.user.userId;

    const { itemId } = req.params;

    await ChecklistService.deleteChecklistItem(userId, itemId);

    // Add deprecation headers
    res.setHeader('X-API-Deprecated', 'true');
    res.setHeader('X-API-Deprecation-Info', 'Use /api/home-buyer-tasks or /api/maintenance-tasks');

    return res.status(204).send();
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('access') || error.message.includes('not found'))
    ) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
};

/**
 * Creates new maintenance checklist items from templates.
 * @deprecated Use POST /api/maintenance-tasks/from-templates
 */
const handleCreateMaintenanceItems = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }
    const userId = req.user.userId;
    const { templateIds, propertyId } = req.body;

    if (!Array.isArray(templateIds) || templateIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid input: templateIds must be a non-empty array.',
      });
    }

    const result = await ChecklistService.addMaintenanceItemsToChecklist(
      userId,
      templateIds,
      propertyId
    );

    // Add deprecation headers
    res.setHeader('X-API-Deprecated', 'true');
    res.setHeader('X-API-Deprecation-Info', 'Use POST /api/maintenance-tasks/from-templates');

    return res.status(201).json({
      success: true,
      message: `Added ${result.count} items.`,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Creates a single checklist item directly (used by orchestration/action center).
 * @deprecated Backend will route automatically to segment-specific services
 */
const handleCreateChecklistItem = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    const userId = req.user.userId;

    const {
      title,
      description,
      serviceCategory,
      propertyId,
      isRecurring,
      frequency,
      nextDueDate,
      actionKey,
    } = req.body ?? {};
    
    if (!title || !propertyId || !actionKey) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: title, propertyId, and actionKey are required.',
      });
    }
    
    if (typeof title !== 'string' || typeof propertyId !== 'string' || typeof actionKey !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Invalid input: title, propertyId, and actionKey must be strings.',
      });
    }
    
    if (!nextDueDate || typeof nextDueDate !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Missing required field: nextDueDate must be an ISO date string.',
      });
    }
    
    const result = await ChecklistService.createDirectChecklistItem(userId, {
      title,
      description: description ?? null,
      serviceCategory: serviceCategory ?? null,
      propertyId,
      isRecurring: Boolean(isRecurring),
      frequency: frequency ?? null,
      nextDueDate,
      actionKey,
    });
    
    console.log('✅ Checklist item created/found:', {
      itemId: result.item.id,
      actionKey: result.item.actionKey,
      propertyId: result.item.propertyId,
      deduped: result.deduped,
    });
    
    const deduped = (result as any)?.deduped === true;
    const item = (result as any)?.item ?? result;

    // Add deprecation headers
    res.setHeader('X-API-Deprecated', 'true');
    res.setHeader('X-API-Deprecation-Info', 'Backend now routes to segment-specific services automatically');

    return res.status(deduped ? 200 : 201).json({
      success: true,
      data: deduped ? { item, deduped: true } : { item, deduped: false },
    });
  } catch (error) {
    next(error);
  }
};

export const checklistController = {
  handleGetChecklist,
  handleUpdateChecklistItem,
  handlePatchChecklistItem,
  handleCreateMaintenanceItems,
  handleDeleteChecklistItem,
  handleCreateChecklistItem,
};