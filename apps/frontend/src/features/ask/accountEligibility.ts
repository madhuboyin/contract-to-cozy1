import type { UserRole } from '@/types';

export function isAskAccountRoleEligible(role: UserRole | null | undefined): role is 'HOMEOWNER' {
  return role === 'HOMEOWNER';
}

export function askIneligibleDestination(role: UserRole | null | undefined): string | null {
  if (role === 'PROVIDER') return '/providers/dashboard';
  if (role === 'ADMIN') return '/dashboard/admin';
  return null;
}
