'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Plus } from 'lucide-react';

import { ClaimDTO, getClaimsSummary, listClaims } from './claimsApi';
import ClaimStatusBadge from '@/app/(dashboard)/dashboard/components/claims/ClaimStatusBadge';
import ClaimCreateModal from '@/app/(dashboard)/dashboard/components/claims/ClaimCreateModal';
import { Button } from '@/components/ui/button';
import {
  EmptyStateCard,
  MobileActionRow,
  MobileCard,
  MobileFilterSurface,
  MobileKpiStrip,
  MobileKpiTile,
  MobilePageContainer,
  StatusChip,
} from '@/components/mobile/dashboard/MobilePrimitives';
import DetailTemplate from '../components/route-templates/DetailTemplate';

export default function ClaimsClient() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;
  const [claims, setClaims] = useState<ClaimDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [summary, setSummary] = useState<any | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const claimsData = await listClaims(propertyId);
      setClaims(claimsData || []);

      try {
        const summaryData = await getClaimsSummary(propertyId);
        setSummary(summaryData || null);
      } catch {
        setSummary(null);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return claims;

    return claims.filter((c) => {
      const searchFields = [c.title, c.status, c.type, c.providerName, c.claimNumber, c.description];
      return searchFields.some((field) => (field || '').toLowerCase().includes(query));
    });
  }, [claims, q]);

  return (
    <MobilePageContainer className="space-y-4 pb-[calc(8rem+env(safe-area-inset-bottom))] lg:max-w-7xl lg:px-8 lg:pb-10">
      <Button variant="ghost" className="min-h-[44px] w-fit px-0 text-muted-foreground" asChild>
        <Link href={`/dashboard/properties/${propertyId}`}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to property
        </Link>
      </Button>

      <DetailTemplate
        title="Claims"
        subtitle="Track claim checklists, documents, and status updates."
        trust={{
          confidenceLabel: 'High once claim timeline updates are kept current',
          freshnessLabel: loading ? 'Refreshing claim ledger' : 'Live from claim records',
          sourceLabel: 'Claim records + checklist progress + provider updates',
          rationale: 'Keeps every claim in one operational queue so follow-ups are not missed.',
        }}
        controls={
          <Button className="min-h-[44px] gap-1.5" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">New claim</span>
            <span className="sm:hidden">New</span>
          </Button>
        }
      >

      <MobileFilterSurface>
        <MobileActionRow>
          <input
            className="min-h-[44px] flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm"
            placeholder="Search title, status, provider, claim #"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <Button variant="outline" className="min-h-[44px]" onClick={refresh} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </Button>
        </MobileActionRow>
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip tone="info">{filtered.length} shown</StatusChip>
          <StatusChip tone="elevated">{claims.length} total</StatusChip>
        </div>
      </MobileFilterSurface>

      {summary ? (
        <MobileKpiStrip>
          <MobileKpiTile
            label="Open claims"
            value={summary.counts.open}
            tone={summary.counts.open > 0 ? 'warning' : 'neutral'}
          />
          <MobileKpiTile
            label="Overdue follow-ups"
            value={summary.counts.overdueFollowUps}
            tone={summary.counts.overdueFollowUps > 0 ? 'danger' : 'neutral'}
          />
          <MobileKpiTile label="Avg aging (open)" value={`${summary.aging.avgAgingDaysOpen}d`} tone="neutral" />
          <MobileKpiTile
            label="Est. loss (open)"
            value={`$${Number(summary.money.totalEstimatedLossOpen ?? 0).toLocaleString()}`}
            tone="neutral"
          />
        </MobileKpiStrip>
      ) : null}

      {loading ? (
        <MobileCard variant="compact" className="text-sm text-slate-600">
          Loading claims...
        </MobileCard>
      ) : null}

      {!loading && filtered.length === 0 ? (
        <EmptyStateCard
          title="No claims yet"
          description="Create a claim to start a guided checklist and timeline."
          action={
            <Button onClick={() => setCreateOpen(true)} className="min-h-[44px]">
              New claim
            </Button>
          }
        />
      ) : null}

      <div className="grid gap-3">
        {filtered.map((c) => (
          <Link key={c.id} href={`/dashboard/properties/${propertyId}/claims/${c.id}`} className="no-brand-style block">
            <MobileCard variant="compact" className="space-y-2 transition-colors hover:bg-slate-50/70">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                    <p className="truncate text-sm font-semibold text-slate-900">{c.title}</p>
                    <ClaimStatusBadge status={c.status} />
                  </div>
                  <p className="mt-0.5 text-xs text-slate-600">
                    {[c.type, c.providerName, c.claimNumber ? `#${c.claimNumber}` : null].filter(Boolean).join(' • ')}
                  </p>
                </div>
                <StatusChip tone="info">Checklist {c.checklistCompletionPct ?? 0}%</StatusChip>
              </div>

              {c.description ? <p className="line-clamp-2 text-sm text-slate-700">{c.description}</p> : null}
            </MobileCard>
          </Link>
        ))}
      </div>
      </DetailTemplate>

      <ClaimCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        propertyId={propertyId}
        onCreated={(newClaim) => {
          try {
            if (!newClaim || !newClaim.id) {
              console.error('Invalid claim:', newClaim);
              return;
            }

            setClaims((prev) => {
              const safePrev = (prev ?? []).filter((c): c is any => !!c && !!c.id);

              if (safePrev.some((c) => c.id === newClaim.id)) {
                return safePrev;
              }

              return [newClaim, ...safePrev];
            });

            setCreateOpen(false);
            setQ('');
          } catch (error) {
            console.error('Error in onCreated:', error);
            throw error;
          }
        }}
      />
    </MobilePageContainer>
  );
}
