/**
 * The financing profile and the equity position are owner-only (owner ruling 2026-10-19): the server answers anyone below OWNER with a 403
 * (`PROPERTY_ROLE_REQUIRED`). A screen must say that, not show an empty "set up your mortgage" state that implies nothing is recorded.
 */
export const FINANCING_OWNER_ONLY_MESSAGE = 'Mortgage and equity details are visible to the home’s owner only. Saved scenarios and the payment comparison are still available.';

export function isFinancingOwnerOnlyError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const { status, payload } = error as { status?: unknown; payload?: { error?: { code?: unknown } } };
  return status === 403 || payload?.error?.code === 'PROPERTY_ROLE_REQUIRED';
}

/** Runs an owner-only read: a 403 is reported as `ownerOnly`; any other failure keeps the screen's existing "nothing available" behavior. */
export async function readOwnerOnly<T>(read: () => Promise<T>): Promise<{ value: T | null; ownerOnly: boolean }> {
  try {
    return { value: await read(), ownerOnly: false };
  } catch (error) {
    return { value: null, ownerOnly: isFinancingOwnerOnlyError(error) };
  }
}
