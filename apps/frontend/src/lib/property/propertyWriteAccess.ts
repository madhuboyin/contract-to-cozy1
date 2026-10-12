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

/**
 * Whether the signed-in user holds the OWNER boundary on a property: the owner of record (no `householdRole`) or a member with the OWNER role. Used for
 * controls the server floors at OWNER (public share links, data-use consent). An unknown property or list is left to the server, as above.
 */
export function resolvePropertyOwnerAccess(
  properties: ReadonlyArray<Pick<Property, 'id' | 'householdRole'>> | null | undefined,
  propertyId: string | null | undefined,
): boolean {
  const property = propertyId ? properties?.find((candidate) => candidate.id === propertyId) : undefined;
  if (!property?.householdRole) return true;
  return property.householdRole === 'OWNER';
}
