// apps/backend/src/services/incidents/integrations/providerCredentialLapse.adapter.ts
//
// Only writer of PROVIDER_CREDENTIAL_LAPSE incidents — the property-scoped,
// homeowner-visible jeopardy case from
// docs/functional/PROVIDER_TRUST_COMPLIANCE_FRD.md, Section 6 (Case B).
// Mirrors maintenanceTask.adapter.ts's role as the single integration point
// between a source-of-truth table and the Incident pipeline.
//
// A provider's general compliance housekeeping (Case A — no affected
// booking) never goes through this adapter; that stays a
// ProviderComplianceAlert, admin/provider-facing only, so a provider's
// day-to-day compliance drift never leaks into a homeowner's Incident feed.

import { IncidentService } from '../incident.service';
import { ProviderCredentialType } from '@prisma/client';

type LapsingCredential = {
  id: string;
  type: ProviderCredentialType;
  expiryDate: Date;
};

type AtRiskBooking = {
  id: string;
  propertyId: string;
  homeownerId: string;
  category: string;
};

type LapseRiskProvider = {
  id: string;
  businessName: string;
};

const CREDENTIAL_TYPE_LABEL: Record<ProviderCredentialType, string> = {
  TRADE_LICENSE: 'trade license',
  LIABILITY_INSURANCE: 'liability insurance',
  WORKERS_COMP_INSURANCE: "workers' comp insurance",
  BONDING: 'bonding',
  CERTIFICATION: 'certification',
  BACKGROUND_CHECK: 'background check',
};

function daysBetween(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

export class ProviderCredentialLapseAdapter {
  static async emitBookingRiskIncident(args: {
    credential: LapsingCredential;
    booking: AtRiskBooking;
    provider: LapseRiskProvider;
    now?: Date;
  }) {
    const now = args.now ?? new Date();
    const { credential, booking, provider } = args;

    const days = daysBetween(now, credential.expiryDate);
    const severityScore = days <= 3 ? 75 : days <= 7 ? 60 : 40;
    const credentialLabel = CREDENTIAL_TYPE_LABEL[credential.type] ?? credential.type;

    return IncidentService.upsertIncident(
      {
        propertyId: booking.propertyId,
        userId: booking.homeownerId,
        sourceType: 'SYSTEM',
        typeKey: 'PROVIDER_CREDENTIAL_LAPSE',
        category: 'PROVIDER',
        title: `Your provider's ${credentialLabel} is expiring before your scheduled job`,
        summary: `${provider.businessName}'s ${credentialLabel} expires in ${days} day${
          days === 1 ? '' : 's'
        }, before your ${booking.category} appointment.`,
        details: {
          bookingId: booking.id,
          providerProfileId: provider.id,
          credentialId: credential.id,
          credentialType: credential.type,
          expiryDate: credential.expiryDate.toISOString(),
          // W3 (provider compliance): evaluateIncident's generic
          // computeSeverity() reads timeWindowHours from `details`, not
          // the severityScore hint above (that gets recomputed and
          // discarded) — without this, every booking-risk incident
          // defaulted to the same lowest urgency bucket regardless of
          // whether expiry was in 1 day or 29 days.
          timeWindowHours: Math.max(days, 0) * 24,
        },
        status: 'DETECTED',
        fingerprint: `property:${booking.propertyId}|PROVIDER_CREDENTIAL_LAPSE|booking:${booking.id}|cred:${credential.id}`,
        dedupeWindowMins: 24 * 60,
        severityScore,
      },
      [
        {
          signalType: 'PROVIDER_CREDENTIAL_EXPIRY',
          externalRef: `providerCredential:${credential.id}`,
          observedAt: now.toISOString(),
          payload: {
            providerCredentialId: credential.id,
            bookingId: booking.id,
            expiryDate: credential.expiryDate.toISOString(),
            daysToExpiry: days,
          },
          scoreHint: severityScore,
          confidence: 85,
        },
      ]
    );
  }
}
