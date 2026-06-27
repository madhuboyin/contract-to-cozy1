'use client';
// apps/frontend/src/app/(dashboard)/dashboard/financing/page.tsx
import React, { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, PlusCircle } from 'lucide-react';
import { api } from '@/lib/api/client';
import {
  MobilePageContainer,
  MobilePageIntro,
} from '@/components/mobile/dashboard/MobilePrimitives';
import EquityCard from '@/components/features/financing/EquityCard';
import ScenarioCard from '@/components/features/financing/ScenarioCard';
import FinancingCalculatorSheet from '@/components/features/financing/FinancingCalculatorSheet';
import type {
  EquityPosition,
  PropertyFinancingProfile,
  FinancingScenarioSummary,
} from '@/types';

export default function FinancingHubPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const propertyId = searchParams.get('propertyId') ?? '';

  const [equity, setEquity] = useState<EquityPosition | null>(null);
  const [profile, setProfile] = useState<PropertyFinancingProfile | null>(null);
  const [scenarios, setScenarios] = useState<FinancingScenarioSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showCalculator, setShowCalculator] = useState(false);

  useEffect(() => {
    if (!propertyId) return;
    setLoading(true);
    Promise.all([
      api.getFinancingProfile(propertyId).catch(() => null),
      api.getEquityPosition(propertyId).catch(() => null),
      api.listFinancingScenarios(propertyId).catch(() => []),
    ])
      .then(([p, e, s]) => {
        setProfile(p);
        setEquity(e);
        setScenarios(s);
      })
      .finally(() => setLoading(false));
  }, [propertyId]);

  async function handleRefreshEquity() {
    if (!propertyId) return;
    setRefreshing(true);
    try {
      const e = await api.refreshEquityPosition(propertyId);
      setEquity(e);
    } finally {
      setRefreshing(false);
    }
  }

  async function handleArchive(scenarioId: string) {
    if (!propertyId) return;
    await api.archiveFinancingScenario(propertyId, scenarioId);
    setScenarios((prev) => prev.filter((s) => s.id !== scenarioId));
  }

  if (!propertyId) {
    return (
      <MobilePageContainer className="py-16 text-center">
        <p className="text-sm text-slate-500">No property selected.</p>
        <Link href="/dashboard" className="mt-3 block text-sm text-emerald-600 underline">
          Go to dashboard
        </Link>
      </MobilePageContainer>
    );
  }

  return (
    <MobilePageContainer className="space-y-6 pb-10">
      <MobilePageIntro
        eyebrow="Home Tool"
        title="Financing Center"
        subtitle="Understand your equity and compare funding options for home projects"
      />

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : (
        <>
          <EquityCard
            equity={equity}
            profile={profile}
            propertyId={propertyId}
            onRefresh={handleRefreshEquity}
            refreshing={refreshing}
          />

          {/* Calculator */}
          <div className="overflow-hidden rounded-2xl border border-white/70 bg-white/80 shadow-sm backdrop-blur dark:border-slate-700/60 dark:bg-slate-900/50">
            <div className="flex items-center justify-between border-b border-slate-100/70 px-5 py-4 dark:border-slate-800/60">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                Calculate Financing
              </p>
            </div>
            {showCalculator ? (
              <div className="px-5 py-5">
                <FinancingCalculatorSheet
                  propertyId={propertyId}
                  equity={equity}
                  entryPoint="DIRECT"
                  onScenarioSaved={() =>
                    api
                      .listFinancingScenarios(propertyId)
                      .then(setScenarios)
                      .catch(() => null)
                  }
                />
              </div>
            ) : (
              <button
                onClick={() => setShowCalculator(true)}
                className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-slate-50/60 dark:hover:bg-slate-800/40"
              >
                <PlusCircle className="h-4 w-4 text-emerald-600" />
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Enter a project cost to compare payment options
                </p>
              </button>
            )}
          </div>

          {/* Saved scenarios */}
          <div className="space-y-3">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              Saved Scenarios
            </p>
            {scenarios.length === 0 ? (
              <p className="text-sm text-slate-400">No saved scenarios yet.</p>
            ) : (
              scenarios.map((s) => (
                <ScenarioCard
                  key={s.id}
                  scenario={s}
                  propertyId={propertyId}
                  onArchive={handleArchive}
                />
              ))
            )}
          </div>

          <div className="space-y-1 text-xs text-slate-500">
            <Link
              href={`/dashboard/properties/${propertyId}/tools/financing/profile`}
              className="block underline"
            >
              Update mortgage details
            </Link>
          </div>
        </>
      )}
    </MobilePageContainer>
  );
}
