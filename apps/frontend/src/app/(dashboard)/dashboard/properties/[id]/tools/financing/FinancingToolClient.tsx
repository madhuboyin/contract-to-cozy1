'use client';
// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/financing/FinancingToolClient.tsx
import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Loader2, PlusCircle } from 'lucide-react';
import { api } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import HomeToolHeader from '@/components/tools/HomeToolHeader';
import ToolWorkspaceTemplate from '../../components/route-templates/ToolWorkspaceTemplate';
import EquityCard from '@/components/features/financing/EquityCard';
import ScenarioCard from '@/components/features/financing/ScenarioCard';
import FinancingCalculatorSheet from '@/components/features/financing/FinancingCalculatorSheet';
import { track } from '@/lib/analytics/events';
import { PropertyContextNotice } from '@/components/property-context/PropertyContextNotice';
import type {
  EquityPosition,
  PropertyFinancingProfile,
  FinancingScenarioSummary,
} from '@/types';

export default function FinancingToolClient() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;

  const [equity, setEquity] = useState<EquityPosition | null>(null);
  const [profile, setProfile] = useState<PropertyFinancingProfile | null>(null);
  const [scenarios, setScenarios] = useState<FinancingScenarioSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCalculator, setShowCalculator] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!propertyId) return;
    track('workflow_started', { tool: 'financing', propertyId, entryPoint: 'direct' });
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
      .catch(() => setError('Failed to load financing data'))
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

  const backHref = `/dashboard/properties/${propertyId}`;

  return (
    <ToolWorkspaceTemplate
      backHref={backHref}
      backLabel="Back to property"
      eyebrow="Home Tool"
      title="Financing Center"
      subtitle="Understand your equity and compare payment options for home projects"
      rail={
        <HomeToolHeader
          toolId="financing"
          propertyId={propertyId}
          currentToolId="financing"
        />
      }
    >
      <PropertyContextNotice
        context={profile?.propertyContext ?? equity?.propertyContext ?? scenarios[0]?.propertyContext}
        title="Financing context"
      />
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50/80 px-5 py-4 text-sm text-red-600 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
          {error}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Equity card */}
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
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowCalculator((v) => !v)}
                className="text-xs text-slate-500"
              >
                {showCalculator ? 'Hide' : 'Show'}
              </Button>
            </div>
            {showCalculator && (
              <div className="px-5 py-5">
                <FinancingCalculatorSheet
                  propertyId={propertyId}
                  equity={equity}
                  entryPoint="DIRECT"
                  onScenarioSaved={(id) => {
                    api
                      .listFinancingScenarios(propertyId)
                      .then(setScenarios)
                      .catch(() => null);
                    track('action_completed', { tool: 'financing', actionType: 'save_scenario', propertyId });
                  }}
                />
              </div>
            )}
            {!showCalculator && (
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

          {/* Quick links */}
          <div className="space-y-1 text-xs text-slate-500">
            <a
              href={`/dashboard/properties/${propertyId}/tools/financing/profile`}
              className="block underline"
            >
              Update mortgage details
            </a>
          </div>
        </div>
      )}
    </ToolWorkspaceTemplate>
  );
}
