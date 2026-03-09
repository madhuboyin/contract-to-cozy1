// apps/frontend/src/app/(dashboard)/dashboard/seasonal/settings/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, Bell, CheckCircle2, MapPin, Save } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useClimateInfo, useUpdateClimateSettings } from '@/lib/hooks/useSeasonalChecklists';
import { ClimateRegion, NotificationTiming } from '@/types/seasonal.types';
import { getClimateRegionName, getClimateRegionIcon } from '@/lib/utils/seasonHelpers';
import { usePropertyContext } from '@/lib/property/PropertyContext';
import {
  ActionPriorityRow,
  BottomSafeAreaReserve,
  EmptyStateCard,
  MobilePageIntro,
  MobileToolWorkspace,
  ScenarioInputCard,
  StatusChip,
} from '@/components/mobile/dashboard/MobilePrimitives';

export default function SeasonalSettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { selectedPropertyId } = usePropertyContext();
  const propertyId = searchParams.get('propertyId') || selectedPropertyId;

  const { data: climateData, isLoading } = useClimateInfo(propertyId!);
  const updateSettingsMutation = useUpdateClimateSettings();

  const [formData, setFormData] = useState({
    climateRegion: 'MODERATE' as ClimateRegion,
    notificationTiming: 'STANDARD' as NotificationTiming,
    notificationEnabled: true,
    autoGenerateChecklists: true,
  });

  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!climateData?.data) return;
    setFormData({
      climateRegion: climateData.data.climateRegion,
      notificationTiming: 'STANDARD',
      notificationEnabled: true,
      autoGenerateChecklists: true,
    });
  }, [climateData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!propertyId) return;

    try {
      await updateSettingsMutation.mutateAsync({
        propertyId,
        data: formData,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      // mutation handles error state
    }
  };

  if (!propertyId) {
    return (
      <MobileToolWorkspace className="lg:max-w-7xl lg:px-8 lg:pb-10"
        intro={<MobilePageIntro title="Seasonal Settings" subtitle="Customize climate defaults and reminders." />}
      >
        <EmptyStateCard
          title="Select a property"
          description="Choose a property from dashboard to configure seasonal settings."
        />
      </MobileToolWorkspace>
    );
  }

  if (isLoading) {
    return (
      <MobileToolWorkspace className="lg:max-w-7xl lg:px-8 lg:pb-10"
        intro={<MobilePageIntro title="Seasonal Settings" subtitle="Loading current climate profile." />}
      >
        <div className="rounded-2xl border border-slate-200 bg-white py-10 text-center">
          <div className="mx-auto h-9 w-9 animate-spin rounded-full border-b-2 border-brand-primary" />
          <p className="mt-3 text-sm text-muted-foreground">Loading settings...</p>
        </div>
      </MobileToolWorkspace>
    );
  }

  const climateRegions: ClimateRegion[] = ['VERY_COLD', 'COLD', 'MODERATE', 'WARM', 'TROPICAL'];
  const isAutoDetected = climateData?.data?.climateRegionSource === 'AUTO_DETECTED';

  return (
    <MobileToolWorkspace className="lg:max-w-7xl lg:px-8 lg:pb-10"
      intro={
        <MobilePageIntro
          title="Seasonal Settings"
          subtitle="Tune climate region and reminder behavior for this property."
          action={
            <button
              type="button"
              onClick={() => router.back()}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
          }
        />
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <ScenarioInputCard
          title="Climate Zone"
          subtitle="Use the right climate profile so tasks and timing stay relevant."
          badge={<MapPin className="h-4 w-4 text-brand-primary" />}
        >
          {isAutoDetected && climateData?.data ? (
            <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-xs text-sky-800">
              Auto-detected: <span className="font-semibold">{getClimateRegionName(climateData.data.climateRegion)}</span> based on property location.
            </div>
          ) : null}

          <div className="space-y-2">
            {climateRegions.map((region) => {
              const selected = formData.climateRegion === region;
              const RegionIcon = getClimateRegionIcon(region);
              return (
                <label
                  key={region}
                  className={`flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors ${
                    selected ? 'border-brand-primary bg-brand-primary/5' : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="climateRegion"
                    value={region}
                    checked={selected}
                    onChange={(e) => setFormData({ ...formData, climateRegion: e.target.value as ClimateRegion })}
                    className="h-4 w-4 text-brand-primary"
                  />
                  <RegionIcon className="h-5 w-5 text-slate-600" />
                  <span className="text-sm font-medium text-slate-900">{getClimateRegionName(region)}</span>
                </label>
              );
            })}
          </div>
        </ScenarioInputCard>

        <ScenarioInputCard
          title="Notification Settings"
          subtitle="Control when reminders and seasonal checklist nudges are delivered."
          badge={<Bell className="h-4 w-4 text-brand-primary" />}
        >
          <div className="space-y-2.5">
            <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
              <div>
                <p className="mb-0 text-sm font-medium text-slate-900">Enable notifications</p>
                <p className="mb-0 text-xs text-slate-500">Receive seasonal reminders and due-task alerts.</p>
              </div>
              <input
                type="checkbox"
                checked={formData.notificationEnabled}
                onChange={(e) => setFormData({ ...formData, notificationEnabled: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300 text-brand-primary"
              />
            </label>

            <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
              <div>
                <p className="mb-0 text-sm font-medium text-slate-900">Auto-generate checklists</p>
                <p className="mb-0 text-xs text-slate-500">Create each season&apos;s checklist automatically.</p>
              </div>
              <input
                type="checkbox"
                checked={formData.autoGenerateChecklists}
                onChange={(e) => setFormData({ ...formData, autoGenerateChecklists: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300 text-brand-primary"
              />
            </label>
          </div>

          <ActionPriorityRow
            primaryAction={
              <button
                type="submit"
                disabled={updateSettingsMutation.isPending}
                className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-brand-primary px-4 text-sm font-semibold text-white hover:bg-brand-primary/90 disabled:opacity-60"
              >
                <Save className="h-4 w-4" />
                {updateSettingsMutation.isPending ? 'Saving...' : 'Save settings'}
              </button>
            }
            secondaryActions={
              saved ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Saved
                </span>
              ) : (
                <StatusChip tone="info">Changes apply immediately</StatusChip>
              )
            }
          />
        </ScenarioInputCard>
      </form>

      <BottomSafeAreaReserve size="chatAware" />
    </MobileToolWorkspace>
  );
}
