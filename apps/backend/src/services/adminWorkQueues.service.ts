// apps/backend/src/services/adminWorkQueues.service.ts
//
// Operational work-queues overview (ADMIN_MODULE_FRD.md §10.2/§17 Phase 2
// "operational notifications and work queues" — the work-queue half; pushed
// notifications remain PLANNED). One aggregate read of every actionable
// admin queue so an operator can see where work is waiting. Counts only —
// each queue links to its own workspace, which enforces its own capability.
// Gated by the baseline ADMIN_DASHBOARD_VIEW capability for that reason.

import { prisma } from '../lib/prisma';

export interface WorkQueueSummary {
  key: string;
  label: string;
  href: string;
  /** Capability the linked workspace requires (informational, for the UI). */
  capability: string;
  count: number;
}

export async function getWorkQueues(): Promise<{ queues: WorkQueueSummary[]; generatedAt: Date }> {
  const [
    pendingCredentials,
    openComplianceAlerts,
    reviewQueue,
    openCases,
    criticalOpenCases,
    disputedBookings,
    pendingProviders,
    pendingRefundRequests,
    openPrivacyRequests,
    articlesInReview,
    articlesAwaitingPublish,
  ] = await Promise.all([
    prisma.providerCredential.count({ where: { status: 'PENDING_REVIEW' } }),
    prisma.providerComplianceAlert.count({ where: { status: 'NEW' } }),
    prisma.review.count({ where: { status: { in: ['PENDING', 'FLAGGED'] } } }),
    prisma.adminCase.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
    prisma.adminCase.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] }, severity: 'CRITICAL' } }),
    prisma.booking.count({ where: { status: 'DISPUTED' } }),
    prisma.providerProfile.count({ where: { status: 'PENDING_APPROVAL' } }),
    prisma.refundRequest.count({ where: { status: 'PENDING_APPROVAL' } }),
    prisma.privacyRequest.count({
      where: { status: { in: ['RECEIVED', 'VERIFYING', 'VERIFIED', 'IN_PROGRESS'] } },
    }),
    prisma.knowledgeArticle.count({ where: { status: 'REVIEW' } }),
    prisma.knowledgeArticle.count({ where: { status: 'APPROVED' } }),
  ]);

  const queues: WorkQueueSummary[] = [
    {
      key: 'provider-credentials',
      label: 'Provider credentials pending review',
      href: '/dashboard/admin/provider-compliance',
      capability: 'PROVIDER_COMPLIANCE_REVIEW',
      count: pendingCredentials,
    },
    {
      key: 'compliance-alerts',
      label: 'New provider compliance alerts',
      href: '/dashboard/admin/provider-compliance',
      capability: 'PROVIDER_COMPLIANCE_REVIEW',
      count: openComplianceAlerts,
    },
    {
      key: 'providers-pending-approval',
      label: 'Providers awaiting approval',
      href: '/dashboard/admin/providers?status=PENDING_APPROVAL',
      capability: 'PROVIDER_VIEW',
      count: pendingProviders,
    },
    {
      key: 'review-moderation',
      label: 'Reviews awaiting moderation (pending + flagged)',
      href: '/dashboard/admin/reviews',
      capability: 'REVIEW_MODERATE',
      count: reviewQueue,
    },
    {
      key: 'open-cases',
      label: 'Open cases (incl. in progress)',
      href: '/dashboard/admin/cases',
      capability: 'SUPPORT_CASE_MANAGE',
      count: openCases,
    },
    {
      key: 'critical-cases',
      label: 'Critical open cases',
      href: '/dashboard/admin/cases?severity=CRITICAL',
      capability: 'SUPPORT_CASE_MANAGE',
      count: criticalOpenCases,
    },
    {
      key: 'disputed-bookings',
      label: 'Disputed bookings',
      href: '/dashboard/admin/bookings?status=DISPUTED',
      capability: 'BOOKING_VIEW',
      count: disputedBookings,
    },
    {
      key: 'refund-requests',
      label: 'Refund requests pending approval',
      href: '/dashboard/admin/payments',
      capability: 'REFUND_APPROVE',
      count: pendingRefundRequests,
    },
    {
      key: 'privacy-requests',
      label: 'Open privacy requests',
      href: '/dashboard/admin/privacy',
      capability: 'PRIVACY_REQUEST_MANAGE',
      count: openPrivacyRequests,
    },
    {
      key: 'content-review',
      label: 'Knowledge articles awaiting review',
      href: '/dashboard/admin/content-reviews',
      capability: 'CONTENT_REVIEW',
      count: articlesInReview,
    },
    {
      key: 'content-publish',
      label: 'Approved articles awaiting publish',
      href: '/dashboard/admin/content-reviews',
      capability: 'CONTENT_PUBLISH',
      count: articlesAwaitingPublish,
    },
  ];

  return { queues, generatedAt: new Date() };
}
