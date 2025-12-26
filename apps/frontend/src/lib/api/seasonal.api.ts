// apps/frontend/src/lib/api/seasonal.api.ts
import { api as apiClient } from './client';
import { Season, ClimateRegion, NotificationTiming } from '@/types/seasonal.types';

export const seasonalAPI = {
  // Climate zone endpoints
  getClimateInfo: async (propertyId: string) => {
    const response = await apiClient.get(`/properties/${propertyId}/climate`);
    return response.data;
  },

  updateClimateSettings: async (
    propertyId: string,
    data: {
      climateRegion?: ClimateRegion;
      notificationTiming?: NotificationTiming;
      notificationEnabled?: boolean;
      autoGenerateChecklists?: boolean;
      excludedTaskKeys?: string[];
    }
  ) => {
    const response = await apiClient.put(`/properties/${propertyId}/climate`, data);
    return response.data;
  },

  // Seasonal checklists endpoints
  getPropertyChecklists: async (
    propertyId: string,
    filters?: {
      year?: number;
      season?: Season;
      status?: string;
    }
  ) => {
    const response = await apiClient.get(`/properties/${propertyId}/seasonal-checklists`, {
      params: filters,
    });
    return response.data;
  },

  getChecklistDetails: async (checklistId: string) => {
    const response = await apiClient.get(`/seasonal-checklists/${checklistId}`);
    return response.data;
  },

  generateChecklist: async (data: { propertyId: string; season: Season; year: number }) => {
    const response = await apiClient.post('/seasonal-checklists/generate', data);
    return response.data;
  },

  dismissChecklist: async (checklistId: string) => {
    const response = await apiClient.post(`/seasonal-checklists/${checklistId}/dismiss`);
    return response.data;
  },

  addAllCriticalTasks: async (checklistId: string) => {
    const response = await apiClient.post(`/seasonal-checklists/${checklistId}/add-all-critical`);
    return response.data;
  },

  // Task item endpoints
  addTaskToChecklist: async (
    itemId: string,
    options?: {
      nextDueDate?: string;
      isRecurring?: boolean;
      frequency?: string;
      notes?: string;
    }
  ) => {
    const response = await apiClient.post(`/seasonal-checklist-items/${itemId}/add-to-tasks`, options);
    return response.data;
  },

  dismissTask: async (itemId: string) => {
    const response = await apiClient.post(`/seasonal-checklist-items/${itemId}/dismiss`);
    return response.data;
  },

  snoozeTask: async (itemId: string, days: number = 7) => {
    const response = await apiClient.post(`/seasonal-checklist-items/${itemId}/snooze`, { days });
    return response.data;
  },
};