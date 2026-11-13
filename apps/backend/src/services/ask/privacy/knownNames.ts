// The authorised property's own names, for FR-PRV-1 pass-1 protection (reliability FRD FR-NRM-1): insurers, contractors the home has booked, lenders, and household members. Loaded AFTER the property is authorised and only for
// that property; nothing here is sent anywhere. A source that cannot be read is skipped (protection of the other sources and of ordinary identifiers still applies), never a reason to fail the turn.
import { prisma } from '../../../lib/prisma';
import type { KnownName } from './promptMinimizer';

export const KNOWN_NAME_MIN_LENGTH = 3;
export const KNOWN_NAME_MAX_PER_ROLE = 25;

/** Dedupe (case-insensitive), drop names shorter than the minimiser accepts, cap per role. Pure. */
export function normalizeKnownNames(candidates: ReadonlyArray<KnownName>): KnownName[] {
  const seen = new Set<string>(); const perRole = new Map<string, number>(); const out: KnownName[] = [];
  for (const c of candidates) {
    const name = String(c.name ?? '').replace(/\s+/g, ' ').trim(); const key = `${c.role}:${name.toLowerCase()}`;
    if (name.length < KNOWN_NAME_MIN_LENGTH || seen.has(key) || (perRole.get(c.role) ?? 0) >= KNOWN_NAME_MAX_PER_ROLE) continue;
    seen.add(key); perRole.set(c.role, (perRole.get(c.role) ?? 0) + 1); out.push({ name, role: c.role });
  }
  return out;
}

async function safely<T>(read: () => Promise<T[]>): Promise<T[]> { try { return await read(); } catch { return []; } }

export async function loadKnownNames(propertyId: string): Promise<KnownName[]> {
  const db = prisma as any;
  const [policies, loans, bookings, members] = await Promise.all([
    safely<any>(() => db.insurancePolicy.findMany({ where: { propertyId }, select: { carrierName: true }, take: 50 })),
    safely<any>(() => db.buyerPurchaseLoanOffer.findMany({ where: { propertyId }, select: { lenderName: true }, take: 50 })),
    safely<any>(() => db.booking.findMany({ where: { propertyId }, select: { providerProfile: { select: { businessName: true } } }, take: 50 })),
    safely<any>(() => db.householdMember.findMany({ where: { propertyId }, select: { displayName: true, user: { select: { firstName: true, lastName: true } } }, take: 50 })),
  ]);
  return normalizeKnownNames([
    ...policies.map((r) => ({ name: r.carrierName, role: 'INSURER' as const })),
    ...loans.map((r) => ({ name: r.lenderName, role: 'LENDER' as const })),
    ...bookings.map((r) => ({ name: r.providerProfile?.businessName, role: 'CONTRACTOR' as const })),
    ...members.flatMap((r) => [{ name: r.displayName, role: 'PERSON' as const }, { name: [r.user?.firstName, r.user?.lastName].filter(Boolean).join(' '), role: 'PERSON' as const }]),
  ]);
}
