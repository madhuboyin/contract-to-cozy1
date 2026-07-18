// apps/backend/src/services/adminSearch.service.ts
//
// Global admin search (ADMIN_MODULE_FRD.md §17 Phase 1 "Global search").
// One query fans out across the admin domains the ACTOR can actually see:
// each domain is searched only if the actor holds that domain's view
// capability, so the search endpoint itself needs only the baseline
// ADMIN_DASHBOARD_VIEW and can never leak a domain the actor couldn't
// open. Results are pointers (label + href into the owning workspace) —
// the workspace enforces its own capability again on open.

import { prisma } from '../lib/prisma';
import { getActiveCapabilities } from './adminCapability.service';

export interface AdminSearchResult {
  type: 'USER' | 'PROVIDER' | 'BOOKING' | 'CASE' | 'PRIVACY_REQUEST';
  id: string;
  label: string;
  sublabel: string;
  href: string;
}

const PER_DOMAIN_LIMIT = 5;

export async function globalSearch(actorId: string, rawQuery: string): Promise<AdminSearchResult[]> {
  const q = rawQuery.trim();
  if (!q) return [];

  const capabilities = await getActiveCapabilities(actorId);
  const results: AdminSearchResult[] = [];

  const searches: Promise<void>[] = [];

  if (capabilities.has('USER_VIEW')) {
    searches.push(
      prisma.user
        .findMany({
          where: {
            OR: [
              { email: { contains: q, mode: 'insensitive' } },
              { firstName: { contains: q, mode: 'insensitive' } },
              { lastName: { contains: q, mode: 'insensitive' } },
            ],
          },
          select: { id: true, email: true, firstName: true, lastName: true, role: true, status: true },
          take: PER_DOMAIN_LIMIT,
        })
        .then((users) => {
          for (const u of users) {
            results.push({
              type: 'USER',
              id: u.id,
              label: `${u.firstName} ${u.lastName}`,
              sublabel: `${u.email} · ${u.role} · ${u.status}`,
              href: '/dashboard/admin/users',
            });
          }
        })
    );
  }

  if (capabilities.has('PROVIDER_VIEW')) {
    searches.push(
      prisma.providerProfile
        .findMany({
          where: { businessName: { contains: q, mode: 'insensitive' } },
          select: { id: true, businessName: true, status: true },
          take: PER_DOMAIN_LIMIT,
        })
        .then((providers) => {
          for (const p of providers) {
            results.push({
              type: 'PROVIDER',
              id: p.id,
              label: p.businessName,
              sublabel: `Provider · ${p.status}`,
              href: `/dashboard/admin/providers?status=`,
            });
          }
        })
    );
  }

  if (capabilities.has('BOOKING_VIEW')) {
    searches.push(
      prisma.booking
        .findMany({
          where: { bookingNumber: { contains: q, mode: 'insensitive' } },
          select: { id: true, bookingNumber: true, status: true, category: true },
          take: PER_DOMAIN_LIMIT,
        })
        .then((bookings) => {
          for (const b of bookings) {
            results.push({
              type: 'BOOKING',
              id: b.id,
              label: b.bookingNumber,
              sublabel: `Booking · ${b.category} · ${b.status}`,
              href: '/dashboard/admin/bookings',
            });
          }
        })
    );
  }

  if (capabilities.has('SUPPORT_CASE_MANAGE')) {
    searches.push(
      prisma.adminCase
        .findMany({
          where: {
            OR: [
              { caseNumber: { contains: q, mode: 'insensitive' } },
              { title: { contains: q, mode: 'insensitive' } },
            ],
          },
          select: { id: true, caseNumber: true, title: true, type: true, status: true },
          take: PER_DOMAIN_LIMIT,
        })
        .then((cases) => {
          for (const c of cases) {
            results.push({
              type: 'CASE',
              id: c.id,
              label: `${c.caseNumber} · ${c.title}`,
              sublabel: `Case · ${c.type} · ${c.status}`,
              href: '/dashboard/admin/cases',
            });
          }
        })
    );
  }

  if (capabilities.has('PRIVACY_REQUEST_MANAGE')) {
    searches.push(
      prisma.privacyRequest
        .findMany({
          where: {
            OR: [
              { requestNumber: { contains: q, mode: 'insensitive' } },
              { userEmail: { contains: q, mode: 'insensitive' } },
            ],
          },
          select: { id: true, requestNumber: true, userEmail: true, type: true, status: true },
          take: PER_DOMAIN_LIMIT,
        })
        .then((requests) => {
          for (const r of requests) {
            results.push({
              type: 'PRIVACY_REQUEST',
              id: r.id,
              label: r.requestNumber,
              sublabel: `Privacy · ${r.type} · ${r.status} · ${r.userEmail}`,
              href: '/dashboard/admin/privacy',
            });
          }
        })
    );
  }

  await Promise.all(searches);
  return results;
}
