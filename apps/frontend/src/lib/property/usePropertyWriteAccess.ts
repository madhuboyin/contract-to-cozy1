'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { resolvePropertyOwnerAccess, resolvePropertyWriteAccess } from './propertyWriteAccess';

/**
 * Write access for one property, from the (cached) properties list the dashboard already loads. While the list is loading nothing can be changed
 * yet, so write controls stay hidden rather than flashing for a viewer; if the list cannot be loaded the server's role floor decides.
 */
export function usePropertyWriteAccess(propertyId: string | null | undefined): { canWrite: boolean; isViewer: boolean; canManage: boolean; isLoading: boolean } {
  const { data, isLoading } = useQuery({ queryKey: ['userProperties'], queryFn: () => api.getProperties(), staleTime: 60_000 });
  if (isLoading) return { canWrite: false, isViewer: false, canManage: false, isLoading: true };
  const properties = data?.success ? data.data.properties : undefined;
  // canManage = the OWNER boundary (share links, data-use consent); canWrite = CONTRIBUTOR and above.
  return { ...resolvePropertyWriteAccess(properties, propertyId), canManage: resolvePropertyOwnerAccess(properties, propertyId), isLoading: false };
}
