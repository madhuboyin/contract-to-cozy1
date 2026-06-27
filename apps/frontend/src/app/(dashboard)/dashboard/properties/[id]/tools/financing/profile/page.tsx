'use client';
// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/financing/profile/page.tsx
import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { api } from '@/lib/api/client';
import { MobilePageContainer } from '@/components/mobile/dashboard/MobilePrimitives';
import MortgageProfileForm from '@/components/features/financing/MortgageProfileForm';
import type { PropertyFinancingProfile } from '@/types';

export default function FinancingProfilePage() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;
  const router = useRouter();

  const [profile, setProfile] = useState<PropertyFinancingProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!propertyId) return;
    api
      .getFinancingProfile(propertyId)
      .then(setProfile)
      .catch(() => null)
      .finally(() => setLoading(false));
  }, [propertyId]);

  async function handleSave(payload: Parameters<typeof api.upsertFinancingProfile>[1]) {
    setSaving(true);
    setError(null);
    try {
      const updated = await api.upsertFinancingProfile(propertyId, payload);
      setProfile(updated);
      setSaved(true);
      setTimeout(() => {
        router.push(`/dashboard/properties/${propertyId}/tools/financing`);
      }, 800);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  const backHref = `/dashboard/properties/${propertyId}/tools/financing`;

  return (
    <MobilePageContainer className="space-y-5 pb-10">
      <Link
        href={backHref}
        className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Financing Center
      </Link>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Financing Center
        </p>
        <h1 className="mt-1 text-xl font-bold text-slate-900 dark:text-slate-100">
          Mortgage Details
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          These details power your equity calculation and HELOC capacity estimate.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        </div>
      ) : (
        <>
          {saved && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
              Saved — returning to Financing Center…
            </div>
          )}
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50/80 px-4 py-3 text-sm text-red-600 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
              {error}
            </div>
          )}
          <MortgageProfileForm initial={profile} onSave={handleSave} saving={saving} />
        </>
      )}
    </MobilePageContainer>
  );
}
