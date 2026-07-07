// apps/frontend/src/app/providers/(dashboard)/credentials/page.tsx
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api/client';
import { useToast } from '@/components/ui/use-toast';
import type { ProviderCategoryEligibility, ProviderComplianceAlert, ProviderCredential } from '@/types';
import { formatEnumLabel } from '@/lib/utils/formatters';
import {
  MobileCard,
  MobileKpiStrip,
  MobileKpiTile,
  EmptyStateCard,
} from '@/components/mobile/dashboard/MobilePrimitives';
import ProviderShellTemplate from '@/components/providers/ProviderShellTemplate';
import { CategoryEligibilityList } from '@/components/features/providerTrust/CategoryEligibilityList';
import { CredentialSubmitForm } from '@/components/features/providerTrust/CredentialSubmitForm';

const STATUS_STYLE: Record<ProviderCredential['status'], string> = {
  PENDING_REVIEW: 'bg-amber-100 text-amber-800',
  APPROVED: 'bg-emerald-100 text-emerald-800',
  REJECTED: 'bg-rose-100 text-rose-800',
  EXPIRED: 'bg-neutral-200 text-neutral-700',
  REVOKED: 'bg-rose-100 text-rose-800',
};

export default function ProviderCredentialsPage() {
  const { toast } = useToast();
  const [credentials, setCredentials] = useState<ProviderCredential[]>([]);
  const [eligibility, setEligibility] = useState<ProviderCategoryEligibility[]>([]);
  const [alerts, setAlerts] = useState<ProviderComplianceAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSubmitForm, setShowSubmitForm] = useState(false);
  const [renewingCredentialId, setRenewingCredentialId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [credentialsRes, eligibilityRes, alertsRes] = await Promise.all([
      api.listProviderCredentials().catch(() => []),
      api.getProviderCategoryEligibility().catch(() => []),
      api.listProviderComplianceAlerts().catch(() => []),
    ]);
    setCredentials(credentialsRes);
    setEligibility(eligibilityRes);
    setAlerts(alertsRes.filter((a) => a.status !== 'RESOLVED'));
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => {
    const eligibleCategories = eligibility.filter((e) => e.isEligible).length;
    const pendingReview = credentials.filter((c) => c.status === 'PENDING_REVIEW').length;
    return { eligibleCategories, totalCategories: eligibility.length, pendingReview };
  }, [eligibility, credentials]);

  function handleSubmitted() {
    setShowSubmitForm(false);
    setRenewingCredentialId(null);
    toast({ title: 'Saved', description: 'Refreshing your credential status…' });
    load();
  }

  const renewingCredential = credentials.find((c) => c.id === renewingCredentialId) ?? null;

  return (
    <ProviderShellTemplate
      title="Credentials"
      subtitle="Submit and track the licenses, insurance, and certifications required for the services you offer."
      eyebrow="Provider Compliance"
      introAction={
        !showSubmitForm && !renewingCredential ? (
          <button
            type="button"
            onClick={() => setShowSubmitForm(true)}
            className="inline-flex min-h-[44px] items-center rounded-lg bg-brand-primary px-3 py-2 text-sm font-semibold text-white hover:bg-brand-primary/90"
          >
            + Submit credential
          </button>
        ) : undefined
      }
      primaryAction={{
        title:
          counts.eligibleCategories > 0
            ? 'Keep your credentials current to stay bookable.'
            : 'Submit your first credential to go live.',
        description:
          counts.eligibleCategories > 0
            ? 'A category becomes bookable once its required credentials are submitted and approved by an admin.'
            : 'Categories you list on your profile need at least one approved credential before homeowners can book you for them.',
        primaryAction: (
          <button
            type="button"
            onClick={() => setShowSubmitForm(true)}
            className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-brand-primary px-4 py-2 text-sm font-semibold text-white hover:bg-brand-primary/90"
          >
            Submit a credential
          </button>
        ),
        impactLabel: counts.eligibleCategories > 0 ? 'Verified Pro status' : 'Required for bookings',
        confidenceLabel: `${counts.eligibleCategories}/${counts.totalCategories || 1} categories verified`,
      }}
      summary={
        <MobileKpiStrip className="sm:grid-cols-3">
          <MobileKpiTile
            label="Verified categories"
            value={counts.eligibleCategories}
            hint="Bookable for homeowners"
            tone={counts.eligibleCategories > 0 ? 'positive' : 'neutral'}
          />
          <MobileKpiTile label="Pending review" value={counts.pendingReview} hint="Awaiting admin decision" />
          <MobileKpiTile label="Open alerts" value={alerts.length} hint="Expiring or missing credentials" />
        </MobileKpiStrip>
      }
      routeState={
        loading
          ? { state: 'loading', title: 'Loading credentials', description: 'Fetching your credential and eligibility records.' }
          : null
      }
      hideContentWhenState={loading}
    >
      {alerts.length > 0 ? (
        <MobileCard variant="compact" className="space-y-2 border-amber-200 bg-amber-50">
          <p className="mb-0 text-sm font-semibold text-amber-900">Compliance alerts</p>
          {alerts.map((alert) => (
            <p key={alert.id} className="mb-0 text-sm text-amber-800">
              {alert.title}
            </p>
          ))}
        </MobileCard>
      ) : null}

      <div>
        <h2 className="mb-2 text-sm font-semibold text-slate-900">Category verification status</h2>
        <CategoryEligibilityList eligibility={eligibility} />
      </div>

      {showSubmitForm ? (
        <MobileCard className="space-y-3">
          <p className="mb-0 text-sm font-semibold text-slate-900">Submit a new credential</p>
          <CredentialSubmitForm onSubmitted={handleSubmitted} onCancel={() => setShowSubmitForm(false)} />
        </MobileCard>
      ) : null}

      {renewingCredential ? (
        <MobileCard className="space-y-3">
          <p className="mb-0 text-sm font-semibold text-slate-900">
            Renew {formatEnumLabel(renewingCredential.type)} — {renewingCredential.issuingAuthority}
          </p>
          <CredentialSubmitForm
            renewalOfCredentialId={renewingCredential.id}
            providerServiceCategories={renewingCredential.serviceCategories}
            onSubmitted={handleSubmitted}
            onCancel={() => setRenewingCredentialId(null)}
          />
        </MobileCard>
      ) : null}

      <div>
        <h2 className="mb-2 text-sm font-semibold text-slate-900">Your credentials</h2>
        {credentials.length === 0 ? (
          <EmptyStateCard
            title="No credentials submitted yet"
            description="Submit a license, insurance certificate, or certification to start the review process."
            action={
              <button
                type="button"
                onClick={() => setShowSubmitForm(true)}
                className="inline-flex min-h-[44px] items-center rounded-lg bg-brand-primary px-3 py-2 text-sm font-semibold text-white hover:bg-brand-primary/90"
              >
                Submit credential
              </button>
            }
          />
        ) : (
          <div className="space-y-3">
            {credentials.map((credential) => (
              <MobileCard key={credential.id} variant="compact" className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="mb-0 truncate text-sm font-semibold text-slate-900">
                      {formatEnumLabel(credential.type)}
                    </p>
                    <p className="mb-0 mt-0.5 text-xs text-slate-500">{credential.issuingAuthority}</p>
                  </div>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLE[credential.status]}`}
                  >
                    {formatEnumLabel(credential.status)}
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {credential.serviceCategories.map((category) => (
                    <span key={category} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                      {formatEnumLabel(category)}
                    </span>
                  ))}
                </div>

                {credential.expiryDate ? (
                  <p className="mb-0 text-xs text-slate-500">
                    Expires {new Date(credential.expiryDate).toLocaleDateString()}
                  </p>
                ) : null}

                {credential.status === 'REJECTED' && credential.rejectionReason ? (
                  <p className="mb-0 text-xs text-rose-700">Rejected: {credential.rejectionReason}</p>
                ) : null}

                {credential.status === 'APPROVED' || credential.status === 'EXPIRED' ? (
                  <button
                    type="button"
                    onClick={() => {
                      setShowSubmitForm(false);
                      setRenewingCredentialId(credential.id);
                    }}
                    className="text-xs font-medium text-brand-primary hover:underline"
                  >
                    Submit renewal
                  </button>
                ) : null}
              </MobileCard>
            ))}
          </div>
        )}
      </div>
    </ProviderShellTemplate>
  );
}
