// apps/frontend/src/app/(dashboard)/dashboard/types.ts
import { Booking, Property } from '@/types';

// --- TYPES (Centralized and Unified) ---

export type ChecklistItemStatus = 'PENDING' | 'COMPLETED' | 'NOT_NEEDED';

/**
 * The unified interface for checklist items, used when passing data from 
 * the router (page.tsx) to the segment dashboard components.
 */
export interface DashboardChecklistItem { 
  id: string;
  title: string;
  description: string | null;
  status: ChecklistItemStatus | string; 
  serviceCategory: string | null;
  isRecurring: boolean;
  nextDueDate: string | null;
  // FIX: Added missing properties for sorting and completeness
  createdAt: string; 
  updatedAt: string;
}

// Local type for API response (matches DashboardChecklistItem structurally)
export interface ChecklistItemAPIResponse extends DashboardChecklistItem {}

export interface ChecklistData {
  id: string;
  items: ChecklistItemAPIResponse[];
}

export interface DashboardData {
  bookings: Booking[];
  properties: Property[];
  checklist: ChecklistData | null;
  isLoading: boolean;
  error: string | null;
}