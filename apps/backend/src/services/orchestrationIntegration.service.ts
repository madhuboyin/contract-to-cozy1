// apps/backend/src/services/orchestrationIntegration.service.ts
/**
 * PHASE 2 INTEGRATION: Orchestration → New Task Services
 * 
 * This service provides helper functions to route Action Center tasks
 * to the correct service based on the property's operating mode.
 * 
 * Integration Points:
 * - Action Center "Add to Checklist" → Routes by operating mode
 * - Deduplication via actionKey
 * - Backward compatibility with ChecklistService
 */

import { HomeBuyerTaskService } from './HomeBuyerTask.service';
import { PropertyMaintenanceTaskService } from './PropertyMaintenanceTask.service';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { resolveHomeownerOperatingMode } from './entryContextPolicy';

/**
 * Routes Action Center task creation to the appropriate service
 * based on the property's current operating mode.
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
  source: 'BUYER_PLAN' | 'RECURRING_CARE';
  deduped: boolean;
}> {
  // 1. Get property-scoped entry context.
  const property = await prisma.property.findUnique({
    where: { id: data.propertyId },
    include: {
      onboarding: true,
    },
  });

  if (!property) {
    throw new Error('Property not found');
  }

  const operatingMode = resolveHomeownerOperatingMode({
    entryPath: property.onboarding?.entryPath,
    ownershipState: property.onboarding?.ownershipState,
  });

  // 2. Route based on the current property operating mode.
  if (operatingMode === 'PURCHASE' || operatingMode === 'EXPLORATION') {
    // Purchase and exploration modes use the buyer-plan task workflow.
    logger.info('Creating buyer-plan task from Action Center');
    
    const task = await HomeBuyerTaskService.createTask(data.userId, data.propertyId, {
      title: data.title,
      description: data.description,
      serviceCategory: data.serviceCategory as any,
      actionKey: data.actionKey,
      sourceType: 'HOME_ACTION',
      sourceEntityType: 'ORCHESTRATED_ACTION',
      sourceEntityId: data.actionKey,
      homeActionKey: data.actionKey,
    });

    return {
      success: true,
      taskId: task.id,
      source: 'BUYER_PLAN',
      deduped: false,
    };
  }

  if (operatingMode === 'OWNERSHIP') {
    // Ownership mode uses the recurring-care task workflow (idempotent).
    logger.info('Creating recurring-care task from Action Center');

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
      source: 'RECURRING_CARE',
      deduped: result.deduped,
    };
  }

  // The operating-mode resolver currently returns only the modes handled above.
  throw new Error(`Unhandled homeowner operating mode: ${operatingMode}`);
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
}> {
  // Get property entry context.
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    include: {
      onboarding: true,
    },
  });

  if (!property) {
    throw new Error('Property not found');
  }

  const operatingMode = resolveHomeownerOperatingMode({
    entryPath: property.onboarding?.entryPath,
    ownershipState: property.onboarding?.ownershipState,
  });

  let homeBuyerTasks: any[] = [];
  let maintenanceTasks: any[] = [];

  if (operatingMode === 'PURCHASE' || operatingMode === 'EXPLORATION') {
    try {
      homeBuyerTasks = (await HomeBuyerTaskService.getTasks(userId, propertyId))
        .map((task) => ({ ...task, propertyId }));
    } catch (error) {
      logger.error({ err: error }, 'Error fetching HomeBuyerTasks');
    }
  }

  if (operatingMode === 'OWNERSHIP') {
    try {
      maintenanceTasks = await PropertyMaintenanceTaskService.getTasksForProperty(
        userId,
        propertyId,
        { includeCompleted: false }
      );
    } catch (error) {
      logger.error({ err: error }, 'Error fetching PropertyMaintenanceTasks');
    }
  }

  return {
    homeBuyerTasks,
    maintenanceTasks,
  };
}

/**
 * Converts tasks from new services to OrchestratedAction format
 * for backward compatibility with existing UI.
 */
export function convertToOrchestratedAction(task: any, source: 'BUYER_PLAN' | 'RECURRING_CARE'): any {
  if (source === 'BUYER_PLAN') {
    return {
      id: `hb:${task.id}`,
      actionKey: `BUYER_PLAN:${task.id}`,
      source: 'CHECKLIST',
      propertyId: task.checklist?.propertyId || task.propertyId || 'unknown',
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
        explanation: ['Buyer-plan task'],
      },
    };
  }

  // source === 'RECURRING_CARE'
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
