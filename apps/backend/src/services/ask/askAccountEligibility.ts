export type AskAccountRole = 'HOMEOWNER' | 'PROVIDER' | 'ADMIN';

export const ASK_ACCOUNT_ROLE_NOT_ELIGIBLE = 'ASK_ACCOUNT_ROLE_NOT_ELIGIBLE';
export const ASK_ACCOUNT_ROLE_NOT_ELIGIBLE_MESSAGE = 'Ask Cozy is available from a homeowner account.';

export function isAskAccountRoleEligible(role: string | null | undefined): role is 'HOMEOWNER' {
  return role === 'HOMEOWNER';
}

export function assertAskAccountRoleEligible(role: string | null | undefined): asserts role is 'HOMEOWNER' {
  if (isAskAccountRoleEligible(role)) return;
  const error = new Error(ASK_ACCOUNT_ROLE_NOT_ELIGIBLE_MESSAGE);
  (error as Error & { code?: string }).code = ASK_ACCOUNT_ROLE_NOT_ELIGIBLE;
  throw error;
}
