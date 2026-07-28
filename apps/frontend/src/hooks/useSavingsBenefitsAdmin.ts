// apps/frontend/src/hooks/useSavingsBenefitsAdmin.ts
//
// React Query hooks for the Admin Savings and Benefits reviewed-source
// registry workspace, mirroring hooks/useAdminContentGovernance.ts.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AdminProgramInput,
  AdminSourceInput,
  createProgram,
  createSource,
  fetchEditorialQueues,
  fetchPrograms,
  fetchSources,
  LifecycleAction,
  transitionProgram,
  updateProgram,
  updateSource,
} from '@/lib/api/savingsBenefitsAdmin';

const SOURCES_KEY = ['admin-savings-benefits-sources'];
const PROGRAMS_KEY = ['admin-savings-benefits-programs'];
const QUEUES_KEY = ['admin-savings-benefits-queues'];

export function useSavingsBenefitsSources() {
  return useQuery({ queryKey: SOURCES_KEY, queryFn: fetchSources, staleTime: 15_000 });
}

export function useSavingsBenefitsPrograms() {
  return useQuery({ queryKey: PROGRAMS_KEY, queryFn: fetchPrograms, staleTime: 15_000 });
}

export function useSavingsBenefitsQueues() {
  return useQuery({ queryKey: QUEUES_KEY, queryFn: fetchEditorialQueues, staleTime: 15_000 });
}

export function useCreateSavingsBenefitsSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AdminSourceInput) => createSource(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: SOURCES_KEY }),
  });
}

export function useUpdateSavingsBenefitsSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sourceId, input }: { sourceId: string; input: AdminSourceInput }) =>
      updateSource(sourceId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: SOURCES_KEY }),
  });
}

export function useCreateSavingsBenefitsProgram() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AdminProgramInput) => createProgram(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: PROGRAMS_KEY }),
  });
}

export function useUpdateSavingsBenefitsProgram() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ programId, input }: { programId: string; input: AdminProgramInput }) =>
      updateProgram(programId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: PROGRAMS_KEY }),
  });
}

export function useTransitionSavingsBenefitsProgram() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ programId, action, reason }: { programId: string; action: LifecycleAction; reason: string }) =>
      transitionProgram(programId, action, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PROGRAMS_KEY });
      qc.invalidateQueries({ queryKey: QUEUES_KEY });
    },
  });
}
