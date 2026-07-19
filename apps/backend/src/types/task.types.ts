// apps/backend/src/types/task.types.ts

import {
    HomeBuyerTaskStatus,
    MaintenanceTaskStatus,
    MaintenanceTaskSource,
    MaintenanceTaskPriority,
    RiskLevel,
    ServiceCategory,
    RecurrenceFrequency,
    BuyerPlanPhase,
    BuyerPlanPriority,
    BuyerTaskSourceType,
  } from '@prisma/client';
  
  /**
   * Create Home Buyer Task Request
   */
  export interface CreateHomeBuyerTaskRequest {
    title: string;
    description?: string;
    serviceCategory?: ServiceCategory;
    actionKey?: string;
    phase?: BuyerPlanPhase;
    priority?: BuyerPlanPriority;
    dueAt?: string | null;
    assignedToUserId?: string | null;
    sourceType?: BuyerTaskSourceType;
    sourceEntityType?: string | null;
    sourceEntityId?: string | null;
    guidanceJourneyId?: string | null;
    homeActionKey?: string | null;
  }
  
  /**
   * Update Home Buyer Task Request
   */
  export interface UpdateHomeBuyerTaskRequest {
    title?: string;
    description?: string;
    status?: HomeBuyerTaskStatus;
    serviceCategory?: ServiceCategory | null;
    frequency?: RecurrenceFrequency | null;
    estimatedCostCents?: number | null;
    phase?: BuyerPlanPhase;
    priority?: BuyerPlanPriority;
    dueAt?: string | null;
    assignedToUserId?: string | null;
  }
  
  /**
   * Create User Maintenance Task Request
   */
  export interface CreateMaintenanceTaskRequest {
    title: string;
    description?: string;
    priority?: MaintenanceTaskPriority;
    serviceCategory?: ServiceCategory;
    estimatedCost?: number;
    isRecurring?: boolean;
    frequency?: RecurrenceFrequency;
    nextDueDate?: string;
    templateId?: string;
  }
  
  /**
   * Create Action Center Task Request
   */
  export interface CreateActionCenterTaskRequest {
    title: string;
    description?: string;
    assetType: string;
    priority: MaintenanceTaskPriority;
    riskLevel?: RiskLevel;
    serviceCategory?: ServiceCategory;
    estimatedCost?: number;
    nextDueDate: string;
  }
  
  /**
   * Update Maintenance Task Request
   */
  export interface UpdateMaintenanceTaskRequest {
    title?: string;
    description?: string;
    priority?: MaintenanceTaskPriority;
    status?: MaintenanceTaskStatus;
    estimatedCost?: number;
    actualCost?: number;
    isRecurring?: boolean;
    frequency?: RecurrenceFrequency | null;
    nextDueDate?: string | null;
    serviceCategory?: ServiceCategory | null;
  }
  
  /**
   * Task Filter Options
   */
  export interface TaskFilterOptions {
    status?: MaintenanceTaskStatus[];
    priority?: MaintenanceTaskPriority[];
    source?: MaintenanceTaskSource[];
    includeCompleted?: boolean;
  }
  
  /**
   * Link Task to Booking Request
   */
  export interface LinkTaskToBookingRequest {
    bookingId: string;
  }
  
  /**
   * Create from Templates Request
   */
  export interface CreateFromTemplatesRequest {
    templateIds: string[];
  }
  
  /**
   * Update Task Status Request (union type for both task types)
   */
  export interface UpdateTaskStatusRequest {
    status: HomeBuyerTaskStatus | MaintenanceTaskStatus;
    actualCost?: number;
  }

  /**
   * Update Home Buyer Task Status Request
   */
  export interface UpdateHomeBuyerTaskStatusRequest {
    status: HomeBuyerTaskStatus;
  }

  /**
   * Update Maintenance Task Status Request
   */
  export interface UpdateMaintenanceTaskStatusRequest {
    status: MaintenanceTaskStatus;
    actualCost?: number;
    outcomeHealth?: 'CONFIRMED_HEALTHY' | 'NEEDS_ATTENTION' | 'FAILED';
  }
