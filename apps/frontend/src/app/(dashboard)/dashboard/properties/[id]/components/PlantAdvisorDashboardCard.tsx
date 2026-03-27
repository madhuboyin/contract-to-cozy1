'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Leaf } from 'lucide-react';
import { MobileCard, StatusChip } from '@/components/mobile/dashboard/MobilePrimitives';
import { listEligiblePlantAdvisorRooms } from '../tools/plant-advisor/plantAdvisorApi';
import type { PlantAdvisorRoomSummaryDTO, RoomType } from '../tools/plant-advisor/types';

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

function getRoomTypeLabel(roomType: RoomType | null): string {
  if (!roomType) return 'Room';
  return ROOM_TYPE_LABELS[roomType] ?? roomType;
}

function selectPrimaryRoom(rooms: PlantAdvisorRoomSummaryDTO[]): PlantAdvisorRoomSummaryDTO | null {
  if (rooms.length === 0) return null;

  return [...rooms].sort((left, right) => {
    const bySaved = right.recommendationCounts.saved - left.recommendationCounts.saved;
    if (bySaved !== 0) return bySaved;

    const byTotal = right.recommendationCounts.total - left.recommendationCounts.total;
    if (byTotal !== 0) return byTotal;

    if (left.hasProfile !== right.hasProfile) {
      return left.hasProfile ? -1 : 1;
    }

    return left.name.localeCompare(right.name);
  })[0];
}

export default function PlantAdvisorDashboardCard({ propertyId }: { propertyId: string }) {
  const { data: rooms, isLoading } = useQuery({
    queryKey: ['plant-advisor-dashboard-rooms', propertyId],
    queryFn: () => listEligiblePlantAdvisorRooms(propertyId),
    enabled: Boolean(propertyId),
    staleTime: 60_000,
  });

  if (isLoading) {
    return <div className="h-16 animate-pulse rounded-[22px] bg-slate-100" aria-hidden="true" />;
  }

  const safeRooms = rooms ?? [];
  const primaryRoom = selectPrimaryRoom(safeRooms);
  const totalRecommendations = safeRooms.reduce(
    (acc, room) => acc + room.recommendationCounts.total,
    0,
  );
  const savedRecommendations = safeRooms.reduce(
    (acc, room) => acc + room.recommendationCounts.saved,
    0,
  );

  const query = new URLSearchParams({ launchSurface: 'property_dashboard' });
  if (primaryRoom) {
    query.set('roomId', primaryRoom.roomId);
    if (primaryRoom.roomType) {
      query.set('roomType', primaryRoom.roomType);
    }
  }

  const href = `/dashboard/properties/${propertyId}/tools/plant-advisor?${query.toString()}`;

  if (safeRooms.length === 0) {
    return (
      <Link href={href} className="no-brand-style block">
        <MobileCard
          variant="compact"
          className="flex items-center gap-3 transition-colors hover:bg-[hsl(var(--mobile-bg-muted))]"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))]">
            <Leaf
              className="h-4 w-4 text-[hsl(var(--mobile-text-muted))]"
              aria-hidden="true"
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="mb-0 text-sm font-semibold text-[hsl(var(--mobile-text-primary))]">
              Plant Advisor
            </p>
            <p className="mb-0 mt-0.5 text-[12px] text-[hsl(var(--mobile-text-secondary))]">
              Add rooms to unlock room-aware plant recommendations
            </p>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
        </MobileCard>
      </Link>
    );
  }

  return (
    <Link href={href} className="no-brand-style block">
      <MobileCard
        variant="compact"
        className="space-y-2.5 transition-colors hover:bg-[hsl(var(--mobile-bg-muted))]"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[hsl(var(--mobile-brand-border))] bg-[hsl(var(--mobile-brand-soft))]">
              <Leaf
                className="h-3.5 w-3.5 text-[hsl(var(--mobile-brand-strong))]"
                aria-hidden="true"
              />
            </div>
            <p className="mb-0 text-sm font-semibold text-[hsl(var(--mobile-text-primary))]">
              Plant Advisor
            </p>
          </div>
          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <StatusChip tone={savedRecommendations > 0 ? 'good' : 'info'}>
            {savedRecommendations > 0
              ? `${savedRecommendations} saved`
              : `${totalRecommendations} recommendations`}
          </StatusChip>
          {primaryRoom ? (
            <span className="text-[12px] text-[hsl(var(--mobile-text-secondary))]">
              Focus room: {primaryRoom.name} ({getRoomTypeLabel(primaryRoom.roomType)})
            </span>
          ) : null}
        </div>

        <p className="mb-0 text-[12px] text-[hsl(var(--mobile-text-secondary))]">
          {totalRecommendations > 0
            ? 'Review room-fit plant cards, then save or add picks into your home timeline.'
            : 'Set light, goals, and pet context for a room to generate deterministic picks.'}
        </p>
      </MobileCard>
    </Link>
  );
}
