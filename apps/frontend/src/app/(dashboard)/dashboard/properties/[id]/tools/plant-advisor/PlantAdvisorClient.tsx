'use client';

import React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Home,
  Leaf,
  Loader2,
  RefreshCw,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  ActionPriorityRow,
  BottomSafeAreaReserve,
  CompactEntityRow,
  EmptyStateCard,
  MobileActionRow,
  MobileCard,
  MobileFilterSurface,
  MobilePageContainer,
  MobilePageIntro,
  MobileSection,
  MobileSectionHeader,
  ResultHeroCard,
  StatusChip,
} from '@/components/mobile/dashboard/MobilePrimitives';
import HomeToolHeader from '@/components/tools/HomeToolHeader';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import {
  addRoomPlantRecommendationToHome,
  dismissRoomPlantRecommendation,
  generateRoomPlantRecommendations,
  getRoomPlantAdvisorState,
  listEligiblePlantAdvisorRooms,
  saveRoomPlantRecommendation,
  upsertRoomPlantProfile,
} from './plantAdvisorApi';
import type {
  PlantAdvisorRoomStateDTO,
  PlantAdvisorRoomSummaryDTO,
  PlantGoalType,
  PlantLightLevel,
  PlantMaintenanceLevel,
  PlantRecommendationStatus,
  RoomPlantProfileInput,
  RoomPlantRecommendationDTO,
  RoomType,
} from './types';

type RecommendationFilter = 'ALL' | PlantRecommendationStatus;

type PlantAdvisorDraft = {
  detectedRoomType: RoomType | null;
  lightLevel: PlantLightLevel | null;
  maintenancePreference: PlantMaintenanceLevel | null;
  hasPets: boolean;
  goals: PlantGoalType[];
  notes: string;
};

const PROFILE_QUERY_KEY = 'plant-advisor-room-state';
const ROOMS_QUERY_KEY = 'plant-advisor-rooms';
const UNSET = '__UNSET__';

const LIGHT_OPTIONS: Array<{ value: PlantLightLevel; label: string; hint: string }> = [
  { value: 'LOW', label: 'Low', hint: 'Little natural light, works away from windows.' },
  { value: 'MEDIUM', label: 'Medium', hint: 'Steady ambient light through most of the day.' },
  {
    value: 'BRIGHT_INDIRECT',
    label: 'Bright indirect',
    hint: 'Near a bright window without direct sun hitting leaves.',
  },
  {
    value: 'BRIGHT_DIRECT',
    label: 'Bright direct',
    hint: 'Strong direct sun for several hours each day.',
  },
];

const MAINTENANCE_OPTIONS: Array<{
  value: PlantMaintenanceLevel;
  label: string;
  hint: string;
}> = [
  { value: 'LOW', label: 'Low maintenance', hint: 'Easy care and forgiving watering cadence.' },
  { value: 'MEDIUM', label: 'Moderate', hint: 'Some routine upkeep and occasional adjustments.' },
  { value: 'HIGH', label: 'Hands-on', hint: 'Frequent care and close monitoring.' },
];

const GOAL_OPTIONS: Array<{ value: PlantGoalType; label: string; hint: string }> = [
  { value: 'AIR_QUALITY', label: 'Air quality', hint: 'Plants known for air-freshening support.' },
  { value: 'FRAGRANCE', label: 'Fragrance', hint: 'Natural scent and room freshness.' },
  { value: 'DECOR', label: 'Decor', hint: 'Visual style and interior impact.' },
  { value: 'PET_SAFE', label: 'Pet safety', hint: 'Prefer safer picks around pets.' },
  { value: 'LOW_MAINTENANCE', label: 'Easy care', hint: 'Lower upkeep over time.' },
];

const STATUS_LABELS: Record<PlantRecommendationStatus, string> = {
  RECOMMENDED: 'Recommended',
  SAVED: 'Saved',
  DISMISSED: 'Dismissed',
};

const ROOM_TYPE_LABELS: Record<RoomType, string> = {
  KITCHEN: 'Kitchen',
  LIVING_ROOM: 'Living Room',
  BEDROOM: 'Bedroom',
  BATHROOM: 'Bathroom',
  DINING: 'Dining Room',
  LAUNDRY: 'Laundry',
  GARAGE: 'Garage',
  OFFICE: 'Office',
  BASEMENT: 'Basement',
  OTHER: 'Other',
};

function getRoomTypeLabel(roomType: RoomType | null | undefined): string {
  if (!roomType) return 'Room';
  return ROOM_TYPE_LABELS[roomType] ?? roomType;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
  }

  return fallback;
}

function createDraft(
  roomState: PlantAdvisorRoomStateDTO | null | undefined,
  roomSummary: PlantAdvisorRoomSummaryDTO | null,
): PlantAdvisorDraft {
  const profile = roomState?.profile;

  return {
    detectedRoomType: profile?.detectedRoomType ?? roomSummary?.roomType ?? null,
    lightLevel: profile?.lightLevel ?? null,
    maintenancePreference: profile?.maintenancePreference ?? null,
    hasPets: profile?.hasPets ?? false,
    goals: profile?.goals ?? [],
    notes: profile?.notes ?? '',
  };
}

function toProfileInput(draft: PlantAdvisorDraft): RoomPlantProfileInput {
  return {
    detectedRoomType: draft.detectedRoomType,
    lightLevel: draft.lightLevel,
    maintenancePreference: draft.maintenancePreference,
    hasPets: draft.hasPets,
    goals: draft.goals,
    notes: draft.notes.trim() ? draft.notes.trim() : null,
  };
}

function confidencePercent(confidence: number): number {
  const normalized = Math.max(0, Math.min(1, confidence));
  return Math.round(normalized * 100);
}

function RecommendationCard({
  recommendation,
  onSave,
  onDismiss,
  onAddToHome,
  busyAction,
}: {
  recommendation: RoomPlantRecommendationDTO;
  onSave: () => void;
  onDismiss: () => void;
  onAddToHome: () => void;
  busyAction: null | 'save' | 'dismiss' | 'addToHome';
}) {
  const statusTone =
    recommendation.status === 'SAVED'
      ? 'good'
      : recommendation.status === 'DISMISSED'
      ? 'elevated'
      : 'protected';

  return (
    <MobileCard variant="compact" className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="mb-0 text-base font-semibold text-[hsl(var(--mobile-text-primary))]">
            {recommendation.plantName}
          </p>
          <p className="mb-0 mt-0.5 text-sm text-[hsl(var(--mobile-text-secondary))]">
            {recommendation.shortDescription}
          </p>
          {recommendation.scientificName ? (
            <p className="mb-0 mt-0.5 text-xs italic text-[hsl(var(--mobile-text-muted))]">
              {recommendation.scientificName}
            </p>
          ) : null}
        </div>
        <StatusChip tone={statusTone}>{STATUS_LABELS[recommendation.status]}</StatusChip>
      </div>

      <MobileActionRow>
        <StatusChip tone="info">Rank #{recommendation.rank}</StatusChip>
        <StatusChip tone="protected">Score {recommendation.score.toFixed(2)}</StatusChip>
        <StatusChip tone="good">Fit {confidencePercent(recommendation.confidence)}%</StatusChip>
      </MobileActionRow>

      {recommendation.reason.fitSignals.length > 0 ? (
        <div className="space-y-1">
          <p className="mb-0 text-xs font-semibold uppercase tracking-[0.08em] text-[hsl(var(--mobile-text-muted))]">
            Why this fits
          </p>
          <MobileActionRow>
            {recommendation.reason.fitSignals.slice(0, 4).map((signal) => (
              <StatusChip key={signal} tone="good">
                {signal}
              </StatusChip>
            ))}
          </MobileActionRow>
        </div>
      ) : null}

      <p className="mb-0 text-sm text-[hsl(var(--mobile-text-secondary))]">
        {recommendation.reasonSummary}
      </p>

      {recommendation.careSummary ? (
        <div>
          <p className="mb-0 text-xs font-semibold uppercase tracking-[0.08em] text-[hsl(var(--mobile-text-muted))]">
            Care summary
          </p>
          <p className="mb-0 mt-1 text-sm text-[hsl(var(--mobile-text-secondary))]">
            {recommendation.careSummary}
          </p>
        </div>
      ) : null}

      {recommendation.placementTip ? (
        <div>
          <p className="mb-0 text-xs font-semibold uppercase tracking-[0.08em] text-[hsl(var(--mobile-text-muted))]">
            Placement tip
          </p>
          <p className="mb-0 mt-1 text-sm text-[hsl(var(--mobile-text-secondary))]">
            {recommendation.placementTip}
          </p>
        </div>
      ) : null}

      {recommendation.warningFlags.length > 0 ? (
        <div className="space-y-1.5 rounded-xl border border-amber-200 bg-amber-50 p-2.5">
          <p className="mb-0 text-xs font-semibold uppercase tracking-[0.08em] text-amber-800">
            Warnings
          </p>
          <div className="space-y-1">
            {recommendation.warningFlags.map((warning) => (
              <div key={warning} className="flex items-start gap-2 text-sm text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{warning}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <ActionPriorityRow
        primaryAction={
          <Button
            size="sm"
            className="min-h-[42px]"
            disabled={busyAction !== null}
            onClick={onAddToHome}
          >
            {busyAction === 'addToHome' ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Home className="mr-1.5 h-3.5 w-3.5" />
            )}
            Add to home
          </Button>
        }
        secondaryActions={
          <>
            <Button
              size="sm"
              variant="outline"
              disabled={busyAction !== null || recommendation.status === 'SAVED'}
              onClick={onSave}
            >
              {busyAction === 'save' ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
              )}
              Save
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busyAction !== null || recommendation.status === 'DISMISSED'}
              onClick={onDismiss}
            >
              {busyAction === 'dismiss' ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <XCircle className="mr-1.5 h-3.5 w-3.5" />
              )}
              Dismiss
            </Button>
          </>
        }
      />
    </MobileCard>
  );
}

export default function PlantAdvisorClient() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedRoomId, setSelectedRoomId] = React.useState<string | null>(null);
  const [roomPickerOpen, setRoomPickerOpen] = React.useState(false);
  const [recommendationFilter, setRecommendationFilter] = React.useState<RecommendationFilter>('ALL');
  const [draft, setDraft] = React.useState<PlantAdvisorDraft>({
    detectedRoomType: null,
    lightLevel: null,
    maintenancePreference: null,
    hasPets: false,
    goals: [],
    notes: '',
  });
  const [activeRecommendationAction, setActiveRecommendationAction] = React.useState<{
    recommendationId: string;
    action: 'save' | 'dismiss' | 'addToHome';
  } | null>(null);

  const roomsQuery = useQuery({
    queryKey: [ROOMS_QUERY_KEY, propertyId],
    queryFn: () => listEligiblePlantAdvisorRooms(propertyId),
    enabled: Boolean(propertyId),
    staleTime: 60_000,
  });

  const rooms = React.useMemo(() => roomsQuery.data ?? [], [roomsQuery.data]);

  React.useEffect(() => {
    if (rooms.length === 0) {
      setSelectedRoomId(null);
      return;
    }

    if (!selectedRoomId) {
      setSelectedRoomId(rooms[0].roomId);
      return;
    }

    const stillExists = rooms.some((room) => room.roomId === selectedRoomId);
    if (!stillExists) {
      setSelectedRoomId(rooms[0].roomId);
    }
  }, [rooms, selectedRoomId]);

  const roomStateQuery = useQuery({
    queryKey: [PROFILE_QUERY_KEY, propertyId, selectedRoomId],
    queryFn: () => getRoomPlantAdvisorState(propertyId, selectedRoomId as string),
    enabled: Boolean(propertyId && selectedRoomId),
  });

  const selectedRoomSummary = React.useMemo(
    () => rooms.find((room) => room.roomId === selectedRoomId) ?? null,
    [rooms, selectedRoomId],
  );

  React.useEffect(() => {
    if (!selectedRoomId) return;
    setDraft(createDraft(roomStateQuery.data, selectedRoomSummary));
  }, [selectedRoomId, roomStateQuery.data, selectedRoomSummary]);

  const invalidateRoomData = React.useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: [ROOMS_QUERY_KEY, propertyId] }),
      queryClient.invalidateQueries({ queryKey: [PROFILE_QUERY_KEY, propertyId, selectedRoomId] }),
    ]);
  }, [propertyId, queryClient, selectedRoomId]);

  const saveProfileMutation = useMutation({
    mutationFn: async () => {
      if (!selectedRoomId) throw new Error('Select a room first.');
      return upsertRoomPlantProfile(propertyId, selectedRoomId, toProfileInput(draft));
    },
    onSuccess: async () => {
      toast({ title: 'Plant profile updated' });
      await invalidateRoomData();
    },
    onError: (error) => {
      toast({
        title: getErrorMessage(error, 'Could not save your room preferences.'),
        variant: 'destructive',
      });
    },
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      if (!selectedRoomId) throw new Error('Select a room first.');
      return generateRoomPlantRecommendations(propertyId, selectedRoomId, {
        profile: toProfileInput(draft),
        limit: 8,
      });
    },
    onSuccess: async () => {
      toast({ title: 'Recommendations updated' });
      setRecommendationFilter('ALL');
      await invalidateRoomData();
    },
    onError: (error) => {
      toast({
        title: getErrorMessage(error, 'Could not generate recommendations.'),
        variant: 'destructive',
      });
    },
  });

  const saveRecommendationMutation = useMutation({
    mutationFn: async (recommendationId: string) => {
      if (!selectedRoomId) throw new Error('Select a room first.');
      return saveRoomPlantRecommendation(propertyId, selectedRoomId, recommendationId);
    },
    onSuccess: async () => {
      toast({ title: 'Recommendation saved' });
      await invalidateRoomData();
    },
    onError: (error) => {
      toast({
        title: getErrorMessage(error, 'Could not save recommendation.'),
        variant: 'destructive',
      });
    },
  });

  const dismissRecommendationMutation = useMutation({
    mutationFn: async (recommendationId: string) => {
      if (!selectedRoomId) throw new Error('Select a room first.');
      return dismissRoomPlantRecommendation(propertyId, selectedRoomId, recommendationId);
    },
    onSuccess: async () => {
      toast({ title: 'Recommendation dismissed' });
      await invalidateRoomData();
    },
    onError: (error) => {
      toast({
        title: getErrorMessage(error, 'Could not dismiss recommendation.'),
        variant: 'destructive',
      });
    },
  });

  const addToHomeMutation = useMutation({
    mutationFn: async (recommendationId: string) => {
      if (!selectedRoomId) throw new Error('Select a room first.');
      return addRoomPlantRecommendationToHome(propertyId, selectedRoomId, recommendationId, {});
    },
    onSuccess: async () => {
      toast({ title: 'Added to home timeline' });
      await invalidateRoomData();
    },
    onError: (error) => {
      toast({
        title: getErrorMessage(error, 'Could not add this recommendation to home.'),
        variant: 'destructive',
      });
    },
  });

  const recommendations = React.useMemo(
    () => roomStateQuery.data?.recommendations ?? [],
    [roomStateQuery.data?.recommendations],
  );
  const statusCounts = {
    total: recommendations.length,
    recommended: recommendations.filter((item) => item.status === 'RECOMMENDED').length,
    saved: recommendations.filter((item) => item.status === 'SAVED').length,
    dismissed: recommendations.filter((item) => item.status === 'DISMISSED').length,
  };

  const filteredRecommendations = React.useMemo(() => {
    if (recommendationFilter === 'ALL') return recommendations;
    return recommendations.filter((item) => item.status === recommendationFilter);
  }, [recommendations, recommendationFilter]);

  const roomState = roomStateQuery.data;
  const hasProfile = Boolean(roomState?.profile);
  const hasRecommendations = recommendations.length > 0;

  async function handleRecommendationAction(
    recommendation: RoomPlantRecommendationDTO,
    action: 'save' | 'dismiss' | 'addToHome',
  ) {
    setActiveRecommendationAction({ recommendationId: recommendation.id, action });

    try {
      if (action === 'save') {
        await saveRecommendationMutation.mutateAsync(recommendation.id);
      } else if (action === 'dismiss') {
        await dismissRecommendationMutation.mutateAsync(recommendation.id);
      } else {
        await addToHomeMutation.mutateAsync(recommendation.id);
      }
    } finally {
      setActiveRecommendationAction(null);
    }
  }

  return (
    <MobilePageContainer className="space-y-6 pt-2 lg:max-w-7xl lg:px-8 lg:pb-10">
      <MobileSection className="lg:hidden">
        <div className="flex items-center gap-3">
          <Link
            href={`/dashboard/properties/${propertyId}`}
            className="no-brand-style inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))]"
          >
            <ArrowLeft className="h-4 w-4 text-[hsl(var(--mobile-text-primary))]" />
          </Link>
          <MobilePageIntro
            eyebrow="Home Tools"
            title="Plant Advisor"
            subtitle="Deterministic room-aware plant recommendations"
            className="flex-1 space-y-0 lg:hidden"
          />
        </div>
      </MobileSection>

      <MobileSection className="hidden lg:block">
        <Link
          href={`/dashboard/properties/${propertyId}`}
          className="no-brand-style inline-flex items-center gap-2 text-sm font-semibold text-[hsl(var(--mobile-text-secondary))] hover:text-[hsl(var(--mobile-text-primary))]"
        >
          <ArrowLeft className="h-4 w-4" /> Back to property
        </Link>
      </MobileSection>

      <div className="space-y-6 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-6 lg:space-y-0 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <HomeToolHeader toolId="plant-advisor" propertyId={propertyId} />

          <MobileSection>
            <MobileSectionHeader
              title="1. Choose a room"
              subtitle="Recommendations stay scoped to one room at a time"
            />

            {roomsQuery.isLoading ? (
              <MobileCard variant="compact" className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-[hsl(var(--mobile-text-muted))]" />
              </MobileCard>
            ) : roomsQuery.isError ? (
              <EmptyStateCard
                title="Could not load rooms"
                description="Retry and select the room you want recommendations for."
                action={
                  <Button variant="outline" size="sm" onClick={() => roomsQuery.refetch()}>
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                    Retry
                  </Button>
                }
              />
            ) : rooms.length === 0 ? (
              <EmptyStateCard
                title="No eligible rooms"
                description="Add rooms to this property first, then generate room-aware plant recommendations."
              />
            ) : (
              <MobileFilterSurface>
                <div className="space-y-2">
                  <p className="mb-0 text-sm text-[hsl(var(--mobile-text-secondary))]">
                    Selected room
                  </p>
                  <CompactEntityRow
                    title={selectedRoomSummary?.name ?? 'Select a room'}
                    subtitle={getRoomTypeLabel(selectedRoomSummary?.roomType)}
                    status={
                      <StatusChip tone="info">
                        {selectedRoomSummary?.recommendationCounts.total ?? 0} cards
                      </StatusChip>
                    }
                  />
                </div>

                <Sheet open={roomPickerOpen} onOpenChange={setRoomPickerOpen}>
                  <SheetTrigger asChild>
                    <Button variant="outline" size="sm" className="w-full min-h-[42px]">
                      Change room
                    </Button>
                  </SheetTrigger>
                  <SheetContent
                    side="bottom"
                    className="max-h-[80dvh] overflow-y-auto rounded-t-[22px] px-5 pb-0"
                  >
                    <SheetHeader className="text-left">
                      <SheetTitle>Choose a room</SheetTitle>
                    </SheetHeader>

                    <div className="mt-4 space-y-2 pb-6">
                      {rooms.map((room) => {
                        const isActive = room.roomId === selectedRoomId;
                        return (
                          <button
                            key={room.roomId}
                            type="button"
                            onClick={() => {
                              setSelectedRoomId(room.roomId);
                              setRoomPickerOpen(false);
                            }}
                            className={cn('w-full text-left', isActive && 'opacity-100')}
                          >
                            <CompactEntityRow
                              title={room.name}
                              subtitle={getRoomTypeLabel(room.roomType)}
                              status={
                                isActive ? (
                                  <StatusChip tone="good">Selected</StatusChip>
                                ) : (
                                  <StatusChip tone="info">
                                    {room.recommendationCounts.total} cards
                                  </StatusChip>
                                )
                              }
                            />
                          </button>
                        );
                      })}
                    </div>
                  </SheetContent>
                </Sheet>
              </MobileFilterSurface>
            )}
          </MobileSection>

          {selectedRoomId && rooms.length > 0 ? (
            <>
              <MobileSection>
                <MobileSectionHeader
                  title="2. Set room preferences"
                  subtitle="Tune fit by light, care effort, pets, and goals"
                />

                <MobileCard variant="compact" className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1.5 text-sm text-[hsl(var(--mobile-text-secondary))]">
                      <span className="font-medium text-[hsl(var(--mobile-text-primary))]">
                        Light level
                      </span>
                      <Select
                        value={draft.lightLevel ?? UNSET}
                        onValueChange={(value) =>
                          setDraft((current) => ({
                            ...current,
                            lightLevel: value === UNSET ? null : (value as PlantLightLevel),
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select light level" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={UNSET}>Not sure yet</SelectItem>
                          {LIGHT_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="mb-0 text-xs text-[hsl(var(--mobile-text-muted))]">
                        {LIGHT_OPTIONS.find((item) => item.value === draft.lightLevel)?.hint ??
                          'Set this to improve recommendation accuracy.'}
                      </p>
                    </label>

                    <label className="space-y-1.5 text-sm text-[hsl(var(--mobile-text-secondary))]">
                      <span className="font-medium text-[hsl(var(--mobile-text-primary))]">
                        Maintenance preference
                      </span>
                      <Select
                        value={draft.maintenancePreference ?? UNSET}
                        onValueChange={(value) =>
                          setDraft((current) => ({
                            ...current,
                            maintenancePreference:
                              value === UNSET ? null : (value as PlantMaintenanceLevel),
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select maintenance preference" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={UNSET}>No preference</SelectItem>
                          {MAINTENANCE_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="mb-0 text-xs text-[hsl(var(--mobile-text-muted))]">
                        {MAINTENANCE_OPTIONS.find(
                          (item) => item.value === draft.maintenancePreference,
                        )?.hint ??
                          'Choose how hands-on you want ongoing care to be.'}
                      </p>
                    </label>
                  </div>

                  <div className="space-y-2">
                    <p className="mb-0 text-sm font-medium text-[hsl(var(--mobile-text-primary))]">
                      Pets in this room?
                    </p>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={draft.hasPets ? 'default' : 'outline'}
                        className="min-h-[40px] flex-1"
                        onClick={() => setDraft((current) => ({ ...current, hasPets: true }))}
                      >
                        Yes
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={!draft.hasPets ? 'default' : 'outline'}
                        className="min-h-[40px] flex-1"
                        onClick={() => setDraft((current) => ({ ...current, hasPets: false }))}
                      >
                        No
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="mb-0 text-sm font-medium text-[hsl(var(--mobile-text-primary))]">
                      Goals
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {GOAL_OPTIONS.map((goal) => {
                        const active = draft.goals.includes(goal.value);
                        return (
                          <button
                            key={goal.value}
                            type="button"
                            onClick={() =>
                              setDraft((current) => ({
                                ...current,
                                goals: current.goals.includes(goal.value)
                                  ? current.goals.filter((item) => item !== goal.value)
                                  : [...current.goals, goal.value],
                              }))
                            }
                            className={cn(
                              'inline-flex min-h-[36px] items-center rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                              active
                                ? 'border-[hsl(var(--mobile-brand-border))] bg-[hsl(var(--mobile-brand-soft))] text-[hsl(var(--mobile-brand-strong))]'
                                : 'border-[hsl(var(--mobile-border-subtle))] bg-white text-[hsl(var(--mobile-text-secondary))]',
                            )}
                            title={goal.hint}
                          >
                            {goal.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <label className="space-y-1.5 text-sm text-[hsl(var(--mobile-text-secondary))]">
                    <span className="font-medium text-[hsl(var(--mobile-text-primary))]">
                      Notes (optional)
                    </span>
                    <Textarea
                      value={draft.notes}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          notes: event.target.value,
                        }))
                      }
                      placeholder="Example: Keep plants away from AC vent and leave floor space for pets."
                      className="min-h-[88px]"
                      maxLength={1000}
                    />
                  </label>

                  <ActionPriorityRow
                    primaryAction={
                      <Button
                        className="min-h-[44px]"
                        onClick={() => generateMutation.mutate()}
                        disabled={generateMutation.isPending}
                      >
                        {generateMutation.isPending ? (
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                        )}
                        Generate room recommendations
                      </Button>
                    }
                    secondaryActions={
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => saveProfileMutation.mutate()}
                        disabled={saveProfileMutation.isPending}
                      >
                        {saveProfileMutation.isPending ? (
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                        )}
                        Save preferences
                      </Button>
                    }
                  />
                </MobileCard>
              </MobileSection>

              <MobileSection>
                <div className="flex items-start justify-between gap-3">
                  <MobileSectionHeader
                    title="3. Recommendations"
                    subtitle="Action-ready cards for this room"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={generateMutation.isPending}
                    onClick={() => generateMutation.mutate()}
                  >
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                    Refresh
                  </Button>
                </div>

                {roomStateQuery.isLoading ? (
                  <MobileCard variant="compact" className="flex items-center justify-center py-10">
                    <Loader2 className="h-6 w-6 animate-spin text-[hsl(var(--mobile-text-muted))]" />
                  </MobileCard>
                ) : roomStateQuery.isError ? (
                  <EmptyStateCard
                    title="Could not load advisor state"
                    description="Retry to load recommendations for this room."
                    action={
                      <Button variant="outline" size="sm" onClick={() => roomStateQuery.refetch()}>
                        <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                        Retry
                      </Button>
                    }
                  />
                ) : (
                  <div className="space-y-3">
                    {hasRecommendations ? (
                      <>
                        <MobileFilterSurface>
                          <MobileActionRow>
                            <Button
                              size="sm"
                              variant={recommendationFilter === 'ALL' ? 'default' : 'outline'}
                              onClick={() => setRecommendationFilter('ALL')}
                            >
                              All ({statusCounts.total})
                            </Button>
                            <Button
                              size="sm"
                              variant={
                                recommendationFilter === 'RECOMMENDED' ? 'default' : 'outline'
                              }
                              onClick={() => setRecommendationFilter('RECOMMENDED')}
                            >
                              Recommended ({statusCounts.recommended})
                            </Button>
                            <Button
                              size="sm"
                              variant={recommendationFilter === 'SAVED' ? 'default' : 'outline'}
                              onClick={() => setRecommendationFilter('SAVED')}
                            >
                              Saved ({statusCounts.saved})
                            </Button>
                            <Button
                              size="sm"
                              variant={
                                recommendationFilter === 'DISMISSED' ? 'default' : 'outline'
                              }
                              onClick={() => setRecommendationFilter('DISMISSED')}
                            >
                              Dismissed ({statusCounts.dismissed})
                            </Button>
                          </MobileActionRow>
                        </MobileFilterSurface>

                        {filteredRecommendations.length === 0 ? (
                          <EmptyStateCard
                            title="No cards in this view"
                            description="Try a different filter to see recommended, saved, or dismissed cards."
                          />
                        ) : (
                          filteredRecommendations.map((recommendation) => {
                            const busyAction =
                              activeRecommendationAction?.recommendationId === recommendation.id
                                ? activeRecommendationAction.action
                                : null;

                            return (
                              <RecommendationCard
                                key={recommendation.id}
                                recommendation={recommendation}
                                busyAction={busyAction}
                                onSave={() => handleRecommendationAction(recommendation, 'save')}
                                onDismiss={() =>
                                  handleRecommendationAction(recommendation, 'dismiss')
                                }
                                onAddToHome={() =>
                                  handleRecommendationAction(recommendation, 'addToHome')
                                }
                              />
                            );
                          })
                        )}
                      </>
                    ) : hasProfile ? (
                      <EmptyStateCard
                        title="No-fit state"
                        description="We could not find strong matches with the current room inputs. Try adjusting light, goals, or maintenance preference and regenerate."
                      />
                    ) : (
                      <EmptyStateCard
                        title="No recommendations yet"
                        description="Set room inputs and generate to get card-ready recommendations for this space."
                      />
                    )}
                  </div>
                )}
              </MobileSection>
            </>
          ) : null}
        </div>

        <div className="space-y-4">
          <ResultHeroCard
            eyebrow="Room-aware mode"
            title={selectedRoomSummary?.name ?? 'Plant Advisor'}
            value={hasRecommendations ? `${statusCounts.total} cards` : 'Ready'}
            status={
              hasRecommendations ? (
                <StatusChip tone="good">Generated</StatusChip>
              ) : (
                <StatusChip tone="info">Waiting</StatusChip>
              )
            }
            summary={
              selectedRoomSummary
                ? `${getRoomTypeLabel(selectedRoomSummary.roomType)} · Deterministic profile-based scoring.`
                : 'Select a room to start generating recommendations.'
            }
          />

          <MobileCard variant="compact" className="space-y-2.5">
            <div className="flex items-center gap-2">
              <Leaf className="h-4 w-4 text-[hsl(var(--mobile-brand-strong))]" />
              <p className="mb-0 text-sm font-semibold text-[hsl(var(--mobile-text-primary))]">
                How scoring works
              </p>
            </div>
            <p className="mb-0 text-sm text-[hsl(var(--mobile-text-secondary))]">
              Room type, light conditions, maintenance preference, pet safety, and selected goals
              are scored deterministically. Cards include explicit fit signals and warning flags.
            </p>
          </MobileCard>
        </div>
      </div>

      <BottomSafeAreaReserve />
    </MobilePageContainer>
  );
}
