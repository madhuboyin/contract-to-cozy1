// apps/backend/src/services/orchestrationIntegration.service.ts
/**
 * PHASE 2 INTEGRATION: Orchestration → New Task Services
 * 
 * This service provides helper functions to route Action Center tasks
 * to the correct service based on user segment.
 * 
 * Integration Points:
 * - Action Center "Add to Checklist" → Routes by segment
 * - Deduplication via actionKey
 * - Backward compatibility with ChecklistService
 */

import { HomeBuyerTaskService } from './HomeBuyerTask.service';
import { PropertyMaintenanceTaskService } from './PropertyMaintenanceTask.service';
import { ChecklistService } from './checklist.service';
import { prisma } from '../lib/prisma';

/**
 * Routes Action Center task creation to the appropriate service
 * based on user segment (HOME_BUYER vs EXISTING_OWNER).
 * 
 * This is the MAIN integration point between Orchestration and Phase 2 services.
 */
export async function createTaskFromActionCenter(data: {
  userId: string;
  propertyId: string;
  title: string;
  description?: string;
  assetType?: string;
  priority?: string;
  riskLevel?: string;
  serviceCategory?: string;
  estimatedCost?: number;
  nextDueDate: string;
  actionKey: string;
}): Promise<{
  success: boolean;
  taskId: string;
  source: 'HOME_BUYER' | 'EXISTING_OWNER' | 'LEGACY';
  deduped: boolean;
}> {
  // 1. Get property with homeowner profile to determine segment
  const property = await prisma.property.findUnique({
    where: { id: data.propertyId },
    include: {
      homeownerProfile: true,
    },
  });

  if (!property) {
    throw new Error('Property not found');
  }

  const segment = property.homeownerProfile.segment;

  // 2. Route based on segment
  if (segment === 'HOME_BUYER') {
    // HOME_BUYER: Action Center tasks aren't typically used
    // Most HOME_BUYER tasks are the 8 default tasks
    // But if Action Center generates something, we can create a custom task
    console.log('⚠️  HOME_BUYER Action Center task - Creating custom task');
    
    const task = await HomeBuyerTaskService.createTask(data.userId, {
      title: data.title,
      description: data.description,
      serviceCategory: data.serviceCategory as any,
    });

    return {
      success: true,
      taskId: task.id,
      source: 'HOME_BUYER',
      deduped: false,
    };
  }

  if (segment === 'EXISTING_OWNER') {
    // EXISTING_OWNER: Use PropertyMaintenanceTaskService (idempotent)
    console.log('✅ EXISTING_OWNER Action Center task - Creating maintenance task');

    // Convert priority string to MaintenanceTaskPriority
    const priorityMap: Record<string, any> = {
      'URGENT': 'URGENT',
      'HIGH': 'HIGH',
      'MEDIUM': 'MEDIUM',
      'LOW': 'LOW',
      'CRITICAL': 'URGENT', // Map old values
      'RECOMMENDED': 'MEDIUM',
      'OPTIONAL': 'LOW',
    };

    const mappedPriority = data.priority 
      ? priorityMap[data.priority.toUpperCase()] || 'MEDIUM'
      : 'MEDIUM';

    const result = await PropertyMaintenanceTaskService.createFromActionCenter(
      data.userId,
      data.propertyId,
      {
        title: data.title,
        description: data.description,
        assetType: data.assetType || 'UNKNOWN',
        priority: mappedPriority,
        riskLevel: data.riskLevel as any,
        serviceCategory: data.serviceCategory as any,
        estimatedCost: data.estimatedCost,
        nextDueDate: data.nextDueDate,
      }
    );

    return {
      success: true,
      taskId: result.task.id,
      source: 'EXISTING_OWNER',
      deduped: result.deduped,
    };
  }

  // 3. Fallback to legacy ChecklistService (deprecated)
  console.log('⚠️  Using LEGACY ChecklistService - should migrate to new services');
  
  const result = await ChecklistService.createDirectChecklistItem(data.userId, {
    title: data.title,
    description: data.description,
    serviceCategory: data.serviceCategory,
    propertyId: data.propertyId,
    isRecurring: false,
    frequency: null,
    nextDueDate: data.nextDueDate,
    actionKey: data.actionKey,
  });

  return {
    success: true,
    taskId: result.item.id,
    source: 'LEGACY',
    deduped: result.deduped,
  };
}

/**
 * Retrieves actions from both old and new systems for display in Action Center.
 * 
 * This allows gradual migration while maintaining backward compatibility.
 */
export async function getActionsForProperty(
  userId: string,
  propertyId: string
): Promise<{
  homeBuyerTasks: any[];
  maintenanceTasks: any[];
  legacyChecklistItems: any[];
}> {
  // Get property and segment
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    include: {
      homeownerProfile: true,
    },
  });

  if (!property) {
    throw new Error('Property not found');
  }

  const segment = property.homeownerProfile.segment;

  let homeBuyerTasks: any[] = [];
  let maintenanceTasks: any[] = [];
  let legacyChecklistItems: any[] = [];

  if (segment === 'HOME_BUYER') {
    // Get HomeBuyerTasks
    try {
      homeBuyerTasks = await HomeBuyerTaskService.getTasks(userId);
    } catch (error) {
      console.error('Error fetching HomeBuyerTasks:', error);
    }
  }

  if (segment === 'EXISTING_OWNER') {
    // Get PropertyMaintenanceTasks
    try {
      maintenanceTasks = await PropertyMaintenanceTaskService.getTasksForProperty(
        userId,
        propertyId,
        { includeCompleted: false }
      );
    } catch (error) {
      console.error('Error fetching PropertyMaintenanceTasks:', error);
    }
  }

  // Get legacy checklist items (for backward compatibility)
  try {
    const checklist = await ChecklistService.getOrCreateChecklist(userId);
    legacyChecklistItems = checklist?.items || [];
  } catch (error) {
    console.error('Error fetching legacy checklist items:', error);
  }

  return {
    homeBuyerTasks,
    maintenanceTasks,
    legacyChecklistItems,
  };
}

/**
 * Converts tasks from new services to OrchestratedAction format
 * for backward compatibility with existing UI.
 */
export function convertToOrchestratedAction(task: any, source: 'HOME_BUYER' | 'MAINTENANCE'): any {
  if (source === 'HOME_BUYER') {
    return {
      id: `hb:${task.id}`,
      actionKey: `HOME_BUYER:${task.id}`,
      source: 'CHECKLIST',
      propertyId: task.checklist?.homeownerProfile?.properties?.[0]?.id || 'unknown',
      title: task.title,
      description: task.description,
      status: task.status,
      serviceCategory: task.serviceCategory,
      priority: 50, // Default priority
      cta: {
        show: task.status === 'PENDING' || task.status === 'IN_PROGRESS',
        label: task.status === 'PENDING' ? 'Start task' : 'Continue',
        reason: 'ACTION_REQUIRED',
      },
      suppression: {
        suppressed: false,
        reasons: [],
      },
      confidence: {
        score: 70,
        level: 'MEDIUM',
        explanation: ['Default home buyer task'],
      },
    };
  }

  // source === 'MAINTENANCE'
  const priorityScoreMap: Record<string, number> = {
    URGENT: 95,
    HIGH: 80,
    MEDIUM: 60,
    LOW: 40,
  };
  const priorityKey = task.priority && typeof task.priority === 'string' 
    ? task.priority.toUpperCase() 
    : String(task.priority || '');
  const priorityScore = priorityScoreMap[priorityKey] || 50;

  return {
    id: `mt:${task.id}`,
    actionKey: task.actionKey || `MAINTENANCE:${task.id}`,
    source: task.source,
    propertyId: task.propertyId,
    title: task.title,
    description: task.description,
    status: task.status,
    serviceCategory: task.serviceCategory,
    assetType: task.assetType,
    priority: priorityScore,
    riskLevel: task.riskLevel,
    estimatedCost: task.estimatedCost,
    nextDueDate: task.nextDueDate,
    cta: {
      show: task.status === 'PENDING' || task.status === 'IN_PROGRESS',
      label: task.status === 'PENDING' ? 'Schedule service' : 'Continue',
      reason: 'ACTION_REQUIRED',
    },
    suppression: {
      suppressed: false,
      reasons: [],
    },
    confidence: {
      score: task.riskLevel === 'CRITICAL' || task.riskLevel === 'HIGH' ? 90 : 70,
      level: task.riskLevel === 'CRITICAL' || task.riskLevel === 'HIGH' ? 'HIGH' : 'MEDIUM',
      explanation: [
        task.source === 'ACTION_CENTER' ? 'Generated from risk assessment' :
        task.source === 'SEASONAL' ? 'Seasonal maintenance task' :
        'User-created maintenance task'
      ],
    },
  };
}