import type { Property } from '@/types';

export type PropertyWriteAccess = {
  /** False only when this household member is a VIEWER; every other role, and an unknown property, leaves the decision to the server. */
  canWrite: boolean;
  isViewer: boolean;
};

/**
 * Whether the signed-in user may change things on a property. `householdRole` is set only when the caller is a household member (the owner's own
 * properties carry none), and the server's role floor stays the authority: this only lets pages stop offering controls a viewer cannot use.
 */
export function resolvePropertyWriteAccess(
  properties: ReadonlyArray<Pick<Property, 'id' | 'householdRole'>> | null | undefined,
  propertyId: string | null | undefined,
): PropertyWriteAccess {
  const property = propertyId ? properties?.find((candidate) => candidate.id === propertyId) : undefined;
  const isViewer = property?.householdRole === 'VIEWER';
  return { canWrite: !isViewer, isViewer };
}
