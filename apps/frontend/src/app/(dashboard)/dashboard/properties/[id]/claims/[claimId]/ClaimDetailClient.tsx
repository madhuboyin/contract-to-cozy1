// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/claims/[claimId]/ClaimDetailClient.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

import { SectionHeader } from '../../../../components/SectionHeader';
import {
  ClaimDTO,
  getClaim,
  regenerateChecklist,
  updateClaim,
} from '../claimsApi';

import ClaimStatusBadge from '@/app/(dashboard)/dashboard/components/claims/ClaimStatusBadge';
import ClaimChecklist from '@/app/(dashboard)/dashboard/components/claims/ClaimChecklist';
import ClaimTimeline from '@/app/(dashboard)/dashboard/components/claims/ClaimTimeline';
import ClaimQuickActions from '@/app/(dashboard)/dashboard/components/claims/ClaimQuickActions';

export default function ClaimDetailClient() {
  const params = useParams<{ id: string; claimId: string }>();
  const propertyId = params.id;
  const claimId = params.claimId;

  const [claim, setClaim] = useState<ClaimDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const data = await getClaim(propertyId, claimId);
      setClaim(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId, claimId]);

  const completion = useMemo(() => claim?.checklistCompletionPct ?? 0, [claim]);

  async function onUpdate(patch: any) {
    setBusy('update');
    try {
      const updated = await updateClaim(propertyId, claimId, patch);
      setClaim((prev: ClaimDTO | null) => ({ ...(prev as ClaimDTO), ...updated }));
      // reload to get timeline/doc/checklist updates if backend includes them
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  async function onRegenerateChecklist() {
    setBusy('regen');
    try {
      const updated = await regenerateChecklist(propertyId, claimId, {
        // default backend behavior: replace existing
        replaceExisting: true,
      });
      setClaim(updated);
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  if (loading && !claim) {
    return <div className="text-sm text-gray-600">Loading…</div>;
  }

  if (!claim) {
    return (
      <div className="rounded-xl border bg-white p-6 text-sm text-gray-700">
        Claim not found.
        <div className="mt-3">
          <Link
            className="text-emerald-700 hover:underline"
            href={`/dashboard/properties/${propertyId}/claims`}
          >
            Back to Claims
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        icon="📋"
        title={claim.title}
        description={
          <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
            <ClaimStatusBadge status={claim.status} />
            <span className="text-gray-300">•</span>
            <span className="font-medium">{claim.type}</span>
            {claim.providerName ? (
              <>
                <span className="text-gray-300">•</span>
                <span>{claim.providerName}</span>
              </>
            ) : null}
            {claim.claimNumber ? (
              <>
                <span className="text-gray-300">•</span>
                <span>#{claim.claimNumber}</span>
              </>
            ) : null}
            <span className="text-gray-300">•</span>
            <span>Checklist {completion}%</span>
          </div>
        }
        action={
          <div className="flex items-center gap-2">
            <Link
              href={`/dashboard/properties/${propertyId}/claims`}
              className="rounded-lg border px-3 py-2 text-sm hover:bg-gray-50"
            >
              Back
            </Link>
            <button
              className="rounded-lg border px-3 py-2 text-sm hover:bg-gray-50"
              onClick={refresh}
              disabled={busy !== null}
            >
              Refresh
            </button>
            <button
              className="rounded-lg bg-emerald-700 px-3 py-2 text-sm text-white hover:bg-emerald-800"
              onClick={onRegenerateChecklist}
              disabled={busy !== null}
              title="Regenerate checklist from template"
            >
              {busy === 'regen' ? 'Regenerating…' : 'Regenerate checklist'}
            </button>
          </div>
        }
      />

      <ClaimQuickActions
        claim={claim}
        busy={busy !== null}
        onPatch={onUpdate}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="rounded-xl border bg-white p-4">
            <div className="text-sm font-semibold text-gray-900">Checklist</div>
            <div className="mt-1 text-sm text-gray-600">
              Mark items done. Your completion updates automatically.
            </div>
            <div className="mt-3">
              <ClaimChecklist
                propertyId={propertyId}
                claim={claim}
                onChanged={refresh}
              />
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border bg-white p-4">
            <div className="text-sm font-semibold text-gray-900">Timeline</div>
            <div className="mt-1 text-sm text-gray-600">
              Keep notes and milestones in one place.
            </div>
            <div className="mt-3">
              <ClaimTimeline
                propertyId={propertyId}
                claim={claim}
                onChanged={refresh}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
