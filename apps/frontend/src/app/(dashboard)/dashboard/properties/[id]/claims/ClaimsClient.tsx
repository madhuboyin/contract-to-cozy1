// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/claims/ClaimsClient.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

import { SectionHeader } from '../../../components/SectionHeader';
import { ClaimDTO, listClaims } from './claimsApi';
import ClaimStatusBadge from '@/app/(dashboard)/dashboard/components/claims/ClaimStatusBadge';
import ClaimCreateModal from '@/app/(dashboard)/dashboard/components/claims/ClaimCreateModal';

export default function ClaimsClient() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;

  const [claims, setClaims] = useState<ClaimDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const data = await listClaims(propertyId);
      setClaims(data || []);
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
      // FIX: Safely handle null values from the API response
      const searchFields = [
        c.title,
        c.status,
        c.type,
        c.providerName,
        c.claimNumber,
        c.description
      ];
  
      return searchFields.some(field => 
        (field || '').toLowerCase().includes(query)
      );
    });
  }, [claims, q]);

  return (
    <div className="space-y-4">
      <SectionHeader
        icon="📋"
        title="Claims"
        description="Track claim checklists, documents, and status updates"
        action={
          <div className="flex gap-2">
            <button
              className="rounded-lg border px-3 py-2 text-sm hover:bg-gray-50"
              onClick={refresh}
              disabled={loading}
            >
              Refresh
            </button>
            <button
              className="rounded-lg bg-emerald-700 px-3 py-2 text-sm text-white hover:bg-emerald-800"
              onClick={() => setCreateOpen(true)}
            >
              New claim
            </button>
          </div>
        }
      />

      <div className="flex items-center gap-2">
        <input
          className="w-full rounded-lg border px-3 py-2 text-sm"
          placeholder="Search claims (title, status, provider, claim #)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {loading && <div className="text-sm text-gray-600">Loading…</div>}

      {!loading && filtered.length === 0 && (
        <div className="rounded-xl border bg-white p-6 text-sm text-gray-700">
          No claims yet. Create one to get a guided checklist and timeline.
        </div>
      )}

      <div className="grid gap-3">
        {filtered.map((c) => (
          <Link
            key={c.id}
            href={`/dashboard/properties/${propertyId}/claims/${c.id}`}
            className="rounded-xl border bg-white p-4 hover:bg-gray-50"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <div className="truncate text-base font-semibold text-gray-900">
                    {c.title}
                  </div>
                  <ClaimStatusBadge status={c.status} />
                </div>

                <div className="mt-1 text-sm text-gray-600">
                  <span className="font-medium">{c.type}</span>
                  {c.providerName ? (
                    <>
                      <span className="mx-2 text-gray-300">•</span>
                      <span>{c.providerName}</span>
                    </>
                  ) : null}
                  {c.claimNumber ? (
                    <>
                      <span className="mx-2 text-gray-300">•</span>
                      <span>#{c.claimNumber}</span>
                    </>
                  ) : null}
                </div>
              </div>

              <div className="shrink-0 text-right">
                <div className="text-xs text-gray-600">Checklist</div>
                <div className="text-sm font-semibold text-gray-900">
                  {c.checklistCompletionPct ?? 0}%
                </div>
              </div>
            </div>

            {c.description ? (
              <div className="mt-2 line-clamp-2 text-sm text-gray-700">
                {c.description}
              </div>
            ) : null}
          </Link>
        ))}
      </div>
      <ClaimCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        propertyId={propertyId}
        onCreated={(newClaim) => {
          // 1. Update the underlying data state
          setClaims((prev) => {
            // Prevent duplicates if the API or refresh logic already added it
            if (prev.some(c => c.id === newClaim.id)) return prev;
            return [newClaim, ...prev];
          });
          
          // 2. Close the modal
          setCreateOpen(false);
          
          // 3. Optional: Clear any search query to make sure the new claim is visible
          setQ(''); 
        }}
      />
    </div>
  );
}