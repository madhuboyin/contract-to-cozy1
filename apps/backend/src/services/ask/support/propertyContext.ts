// Ask handler support: propertyContext. Moved out of askHandlerSupport.ts unchanged (FRD v1.110); that file re-exports these modules.
import { resolvePropertyAccess } from '../../propertyAccess.service';
import { prisma } from '../../../lib/prisma';
import { createHash } from 'node:crypto';
import { readAskOperationalControls } from '../../../config/askOperationalControls';
import { ASK_ACCOUNT_ROLE_ELIGIBILITY_DISABLED, ASK_ACCOUNT_ROLE_ELIGIBILITY_DISABLED_MESSAGE, assertAskAccountRoleEligible, type AskAccountRole } from '../askAccountEligibility';
import { enterAskExecutionContext } from '../askExecutionContext';

export async function ensurePropertyAccess(userId: string, propertyId: string) {
  const access = await resolvePropertyAccess(userId, propertyId);
  if (!access) {
    const error = new Error('Property not found or access denied.');
    (error as Error & { code?: string }).code = 'ASK_PROPERTY_NOT_FOUND';
    throw error;
  }
  return access;
}

export function safeTimezone(value: string | null | undefined): string {
  if (!value) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date());
    return value;
  } catch {
    return 'UTC';
  }
}

export function propertyLabel(property: { name: string | null; address: string; city: string; state: string }): string {
  return property.name?.trim() || `${property.address}, ${property.city}, ${property.state}`;
}

export async function propertySummary(propertyId: string | null | undefined) {
  if (!propertyId) return null;
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { id: true, name: true, address: true, city: true, state: true },
  });
  return property ? { id: property.id, label: propertyLabel(property) } : null;
}

export function askContextFingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 24);
}

export async function ensureAskServiceAccountEligibility(userId: string, knownRole?: AskAccountRole): Promise<void> {
  if (!readAskOperationalControls().accountRoleEligibilityEnabled) {
    const error = new Error(ASK_ACCOUNT_ROLE_ELIGIBILITY_DISABLED_MESSAGE);
    (error as Error & { code?: string }).code = ASK_ACCOUNT_ROLE_ELIGIBILITY_DISABLED;
    throw error;
  }
  const role = knownRole ?? (await prisma.user.findUnique({ where: { id: userId }, select: { role: true } }))?.role;
  assertAskAccountRoleEligible(role);
}

// Sets the property timezone that humanDate() implicitly reads for the
// remainder of this request, instead of always formatting in UTC.
export async function enterAskPropertyTimezoneContext(propertyId: string | null | undefined): Promise<void> {
  const property = propertyId ? await prisma.property.findUnique({ where: { id: propertyId }, select: { timezone: true } }) : null;
  enterAskExecutionContext({ propertyTimezone: property?.timezone });
}
