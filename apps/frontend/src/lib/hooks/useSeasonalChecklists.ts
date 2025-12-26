// apps/frontend/src/hooks/useSeasonalChecklists.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { seasonalAPI } from '@/lib/api/seasonal.api';
import { Season } from '@/types/seasonal.types';

export function useSeasonalChecklists(
  propertyId: string,
  filters?: {
    year?: number;
    season?: Season;
    status?: string;
  }
) {
  return useQuery({
    queryKey: ['seasonal-checklists', propertyId, filters],
    queryFn: () => seasonalAPI.getPropertyChecklists(propertyId, filters),
    enabled: !!propertyId,
  });
}

export function useSeasonalChecklistDetails(checklistId: string) {
  return useQuery({
    queryKey: ['seasonal-checklist', checklistId],
    queryFn: () => seasonalAPI.getChecklistDetails(checklistId),
    enabled: !!checklistId,
  });
}

export function useClimateInfo(propertyId: string) {
  return useQuery({
    queryKey: ['climate-info', propertyId],
    queryFn: () => seasonalAPI.getClimateInfo(propertyId),
    enabled: !!propertyId,
  });
}

export function useAddTaskToChecklist() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ itemId, options }: { itemId: string; options?: any }) =>
      seasonalAPI.addTaskToChecklist(itemId, options),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seasonal-checklist'] });
      queryClient.invalidateQueries({ queryKey: ['seasonal-checklists'] });
      queryClient.invalidateQueries({ queryKey: ['checklist'] });
    },
  });
}

export function useDismissTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (itemId: string) => seasonalAPI.dismissTask(itemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seasonal-checklist'] });
      queryClient.invalidateQueries({ queryKey: ['seasonal-checklists'] });
    },
  });
}

export function useSnoozeTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ itemId, days }: { itemId: string; days?: number }) =>
      seasonalAPI.snoozeTask(itemId, days),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seasonal-checklist'] });
    },
  });
}

export function useDismissChecklist() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (checklistId: string) => seasonalAPI.dismissChecklist(checklistId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seasonal-checklists'] });
    },
  });
}

export function useAddAllCriticalTasks() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (checklistId: string) => seasonalAPI.addAllCriticalTasks(checklistId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seasonal-checklist'] });
      queryClient.invalidateQueries({ queryKey: ['seasonal-checklists'] });
      queryClient.invalidateQueries({ queryKey: ['checklist'] });
    },
  });
}

export function useUpdateClimateSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ propertyId, data }: { propertyId: string; data: any }) =>
      seasonalAPI.updateClimateSettings(propertyId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['climate-info', variables.propertyId] });
      queryClient.invalidateQueries({ queryKey: ['seasonal-checklists', variables.propertyId] });
    },
  });
}