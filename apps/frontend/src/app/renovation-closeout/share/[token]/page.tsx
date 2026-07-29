'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { CheckCircle2, TriangleAlert } from 'lucide-react';
import { api } from '@/lib/api/client';
import type { ProjectCloseoutPackage } from '@/types';
import { MobileCard, MobilePageContainer } from '@/components/mobile/dashboard/MobilePrimitives';

export default function SharedRenovationCloseoutPage() {
  const { token } = useParams<{ token: string }>();
  const [closeout, setCloseout] = useState<ProjectCloseoutPackage | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getPublicProjectCloseoutPackage(token)
      .then((data) => {
        setCloseout(data.package);
        setExpiresAt(data.expiresAt ?? null);
      })
      .catch((caught: any) => setError(caught?.message ?? 'This closeout package is unavailable.'));
  }, [token]);

  return (
    <MobilePageContainer className="space-y-4 py-8 lg:max-w-3xl">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Contract to Cozy</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">Shared renovation closeout</h1>
        {expiresAt && <p className="mt-1 text-xs text-slate-500">Share expires {new Date(expiresAt).toLocaleDateString()}.</p>}
      </div>
      {error && <MobileCard className="border-rose-200 bg-rose-50 text-sm text-rose-800">{error}</MobileCard>}
      {!error && !closeout && <p className="text-sm text-slate-500">Loading closeout package…</p>}
      {closeout && (
        <>
          <MobileCard className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold text-slate-900">{closeout.project.name}</h2>
                <p className="text-sm text-slate-500">{closeout.project.outcomeStatus.replace(/_/g, ' ').toLowerCase()}</p>
              </div>
              {closeout.verifiedInstalledFactsApplied
                ? <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                : <TriangleAlert className="h-6 w-6 text-amber-600" />}
            </div>
            <p className="text-sm text-slate-700">
              Actual cost: ${((closeout.project.actualCostCents ?? 0) / 100).toLocaleString()}
            </p>
            <p className="text-sm text-slate-700">
              Case status: {closeout.renovationCase?.lifecycle?.replace(/_/g, ' ') ?? 'No linked renovation case'}
            </p>
          </MobileCard>
          <MobileCard className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-700">Evidence and reconciliation</h2>
            <p className="text-sm text-slate-600">{closeout.evidence.documentIds.length} documents and {closeout.evidence.materialSpecIds.length} verified material records.</p>
            <p className="text-sm text-slate-600">{closeout.refreshes.length} downstream home-record refreshes requested.</p>
            <p className="text-sm text-slate-600">{closeout.unresolvedItems.length} open items.</p>
          </MobileCard>
        </>
      )}
    </MobilePageContainer>
  );
}
