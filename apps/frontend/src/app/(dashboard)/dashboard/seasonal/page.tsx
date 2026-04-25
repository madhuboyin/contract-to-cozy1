// apps/frontend/src/app/(dashboard)/dashboard/seasonal/page.tsx
'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Calendar, ChevronDown, ChevronRight, Clock, Settings } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useSeasonalChecklists, useClimateInfo } from '@/lib/hooks/useSeasonalChecklists';
import { SeasonalChecklistModal } from '@/components/seasonal/SeasonalChecklistModal';
import {
  getSeasonIcon,
  getSeasonName,
  getSeasonColors,
  getCompletionPercentage,
  getProgressBarColor,
  formatDaysRemaining,
} from '@/lib/utils/seasonHelpers';
import { SeasonalChecklist } from '@/types/seasonal.types';
import { usePropertyContext } from '@/lib/property/PropertyContext';
import {
  ActionPriorityRow,
  BottomSafeAreaReserve,
  EmptyStateCard,
  MobileCard,
  MobileFilterSurface,
  MobilePageIntro,
  MobileToolWorkspace,
  ReadOnlySummaryBlock,
  ResultHeroCard,
  StatusChip,
} from '@/components/mobile/dashboard/MobilePrimitives';

const TABS = [
  { key: 'current', label: 'Current season' },
  { key: 'all', label: 'All seasons' },
  { key: 'completed', label: 'Completed' },
] as const;

export default function SeasonalMaintenancePage() {
  const router = useRouter();
  const [selectedChecklistId, setSelectedChecklistId] = useState<string | null>(null);
  const [expandedSeasons, setExpandedSeasons] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]['key']>('current');

  const searchParams = useSearchParams();
  const { selectedPropertyId } = usePropertyContext();
  const propertyId = searchParams.get('propertyId') || selectedPropertyId;
  const from = searchParams.get('from');

  const backLink =
    from === 'dashboard'
      ? {
          href: `/dashboard${propertyId ? `?propertyId=${propertyId}` : ''}`,
          label: 'Back to dashboard',
        }
      : null;

  const { data: climateInfo } = useClimateInfo(propertyId!);
  const { data: checklistsData, isLoading } = useSeasonalChecklists(propertyId!);

  if (!propertyId) {
    return (
      <MobileToolWorkspace className="lg:max-w-7xl lg:px-8 lg:pb-10"
        intro={
          <MobilePageIntro
            title="Seasonal Maintenance"
            subtitle="Track recurring home tasks by season and climate."
          />
        }
      >
        <EmptyStateCard
          title="Select a property"
          description="Choose a property from dashboard first to view seasonal maintenance checklists."
        />
      </MobileToolWorkspace>
    );
  }

  if (isLoading) {
    return (
      <MobileToolWorkspace className="lg:max-w-7xl lg:px-8 lg:pb-10"
        intro={<MobilePageIntro title="Seasonal Maintenance" subtitle="Loading your seasonal checklist data." />}
      >
        <MobileCard variant="compact" className="py-10 text-center">
          <div className="mx-auto h-9 w-9 animate-spin rounded-full border-b-2 border-brand-primary" />
          <p className="mt-3 text-sm text-muted-foreground">Loading checklists...</p>
        </MobileCard>
      </MobileToolWorkspace>
    );
  }

  const checklists: SeasonalChecklist[] = checklistsData?.checklists || [];
  const currentSeason = climateInfo?.currentSeason;
  const currentYear = new Date().getFullYear();

  const filteredChecklists = checklists.filter((checklist) => {
    if (activeTab === 'current') {
      return checklist.season === currentSeason && checklist.year === currentYear;
    }
    if (activeTab === 'completed') {
      return checklist.status === 'COMPLETED';
    }
    return true;
  });

  const groupedChecklists = filteredChecklists.reduce<Record<string, SeasonalChecklist[]>>((acc, checklist) => {
    const key = `${checklist.season}-${checklist.year}`;
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(checklist);
    return acc;
  }, {});

  const toggleSeason = (seasonKey: string) => {
    const nextExpanded = new Set(expandedSeasons);
    if (nextExpanded.has(seasonKey)) {
      nextExpanded.delete(seasonKey);
    } else {
      nextExpanded.add(seasonKey);
    }
    setExpandedSeasons(nextExpanded);
  };

  const formatSeasonYearLabel = (checklist: SeasonalChecklist): string => {
    const seasonStart = new Date(checklist.seasonStartDate);
    const seasonEnd = new Date(checklist.seasonEndDate);

    if (
      Number.isFinite(seasonStart.getTime()) &&
      Number.isFinite(seasonEnd.getTime()) &&
      seasonStart.getFullYear() !== seasonEnd.getFullYear()
    ) {
      return `${seasonStart.getFullYear()}-${String(seasonEnd.getFullYear()).slice(-2)}`;
    }

    return String(checklist.year);
  };

  const totalTasks = checklists.reduce((sum, list) => sum + list.totalTasks, 0);
  const completedTasks = checklists.reduce((sum, list) => sum + list.tasksCompleted, 0);
  const completionPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  return (
    <MobileToolWorkspace className="lg:max-w-7xl lg:px-8 lg:pb-10"
      intro={
        <div className="space-y-3">
          {backLink ? (
            <Link href={backLink.href} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" />
              {backLink.label}
            </Link>
          ) : null}
          <MobilePageIntro
            title="Seasonal Maintenance"
            subtitle="Stay on top of climate-specific tasks with cleaner seasonal checklists."
            action={
              <button
                onClick={() => router.push(`/dashboard/seasonal/settings?propertyId=${propertyId}`)}
                className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-50"
              >
                <Settings className="h-4 w-4" />
                Settings
              </button>
            }
          />
        </div>
      }
      summary={
        climateInfo?.data ? (
          <ResultHeroCard
            eyebrow="Climate profile"
            title={`${currentSeason || 'Current'} maintenance focus`}
            value={`${completionPercent}%`}
            status={<StatusChip tone={completionPercent >= 75 ? 'good' : completionPercent >= 40 ? 'elevated' : 'needsAction'}>{completionPercent >= 75 ? 'On track' : 'Needs attention'}</StatusChip>}
            summary={`Region: ${climateInfo.data.climateRegion}. Next season: ${climateInfo.data.nextSeason}.`}
            highlights={[
              `${completedTasks} of ${totalTasks} tasks completed`,
              `${climateInfo.data.daysUntilNextSeason} days until ${climateInfo.data.nextSeason}`,
              `${Object.keys(groupedChecklists).length} seasonal checklist groups available`,
            ]}
          />
        ) : undefined
      }
      filters={
        <MobileFilterSurface className="space-y-2.5">
          <p className="text-[11px] font-medium tracking-normal text-slate-500">View</p>
          <div className="inline-flex w-full gap-1 rounded-xl bg-slate-100 p-1">
            {TABS.map((tab) => {
              const active = tab.key === activeTab;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`min-h-[36px] flex-1 rounded-lg px-2.5 text-xs font-semibold transition-colors ${
                    active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </MobileFilterSurface>
      }
    >
      {Object.keys(groupedChecklists).length === 0 ? (
        <EmptyStateCard
          title="No seasonal checklists"
          description="Checklists are generated automatically as seasons progress for your property."
        />
      ) : (
        Object.entries(groupedChecklists).map(([seasonKey, seasonChecklists]) => {
          const isExpanded = expandedSeasons.has(seasonKey);
          const firstChecklist = seasonChecklists[0];
          const season = firstChecklist.season;
          const colors = getSeasonColors(season);
          const SeasonIcon = getSeasonIcon(season);

          return (
            <MobileCard key={seasonKey} variant="compact" className={`overflow-hidden border ${colors.borderColor}`}>
              <button
                type="button"
                onClick={() => toggleSeason(seasonKey)}
                className={`-m-3.5 mb-0 flex w-[calc(100%+1.75rem)] items-center justify-between gap-3 px-4 py-3.5 text-left ${colors.bgColor}`}
              >
                <div className="min-w-0">
                  <SeasonIcon className={`h-5 w-5 ${colors.textColor}`} />
                  <p className={`mb-0 mt-1 text-sm font-semibold ${colors.textColor}`}>
                    {getSeasonName(season)} {formatSeasonYearLabel(firstChecklist)}
                  </p>
                  <p className="mb-0 mt-0.5 text-xs text-slate-600">
                    {firstChecklist.tasksCompleted}/{firstChecklist.totalTasks} tasks completed
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="mb-0 text-base font-semibold text-slate-900">
                    {getCompletionPercentage(firstChecklist.tasksCompleted, firstChecklist.totalTasks)}%
                  </p>
                  <div className="mt-1 text-slate-500">{isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</div>
                </div>
              </button>

              {isExpanded ? (
                <div className="space-y-3 pt-3">
                  {seasonChecklists.map((checklist) => {
                    const percent = getCompletionPercentage(checklist.tasksCompleted, checklist.totalTasks);
                    return (
                      <MobileCard key={checklist.id} variant="compact" className="space-y-3 border-slate-200 bg-slate-50/50">
                        <div className="flex items-center justify-between gap-2">
                          <StatusChip tone={checklist.status === 'COMPLETED' ? 'good' : 'needsAction'}>{checklist.status}</StatusChip>
                          <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                            <Clock className="h-3.5 w-3.5" />
                            {checklist.daysRemaining !== undefined ? formatDaysRemaining(checklist.daysRemaining) : 'N/A'}
                          </span>
                        </div>

                        <ReadOnlySummaryBlock
                          items={[
                            { label: 'Progress', value: `${checklist.tasksCompleted} / ${checklist.totalTasks}`, emphasize: true },
                            { label: 'Completion', value: `${percent}%` },
                          ]}
                          columns={2}
                        />

                        <div className="h-2 rounded-full bg-slate-200">
                          <div
                            className={`h-2 rounded-full transition-all ${getProgressBarColor(percent)}`}
                            style={{ width: `${percent}%` }}
                          />
                        </div>

                        <ActionPriorityRow
                          primaryAction={
                            <button
                              type="button"
                              onClick={() => setSelectedChecklistId(checklist.id)}
                              className="min-h-[40px] w-full rounded-lg bg-brand-primary px-4 text-sm font-semibold text-white hover:bg-brand-primary/90"
                            >
                              View checklist details
                            </button>
                          }
                        />
                      </MobileCard>
                    );
                  })}
                </div>
              ) : null}
            </MobileCard>
          );
        })
      )}

      <BottomSafeAreaReserve size="chatAware" />

      {selectedChecklistId ? (
        <SeasonalChecklistModal checklistId={selectedChecklistId} onClose={() => setSelectedChecklistId(null)} />
      ) : null}
    </MobileToolWorkspace>
  );
}
