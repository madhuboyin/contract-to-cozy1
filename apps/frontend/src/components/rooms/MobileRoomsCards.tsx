'use client';

import Link from 'next/link';
import { Sparkles } from 'lucide-react';

import { InventoryRoom } from '@/types';
import { getRoomConfig, getSpecificRoomTip, getStatusLabel } from './roomVisuals';
import {
  IconBadge,
  MobileCard,
  StatusChip,
  SummaryCard,
} from '@/components/mobile/dashboard/MobilePrimitives';
import { MOBILE_TYPE_TOKENS } from '@/components/mobile/dashboard/mobileDesignTokens';

export type MobileRoomCardModel = {
  room: InventoryRoom & { type?: string | null };
  roomType: string;
  score: number;
  itemCount: number;
  docCount: number;
  gapCount: number;
  completenessPercent: number;
  loading: boolean;
  hasInsights: boolean;
  showDetect: boolean;
  tipText: string;
};

function roomStatusTone(score: number): 'good' | 'elevated' | 'needsAction' {
  if (score < 40) return 'needsAction';
  if (score <= 65) return 'elevated';
  return 'good';
}

function roomStatusCopy(score: number): string {
  return getStatusLabel(score).replaceAll('_', ' ');
}

function RoomSupportActions({
  card,
  detectingId,
  onEnsureType,
  onLoadInsight,
}: {
  card: MobileRoomCardModel;
  detectingId: string | null;
  onEnsureType: (room: InventoryRoom & { type?: string | null }) => void;
  onLoadInsight: (roomId: string) => void;
}) {
  if (!(card.showDetect || (!card.hasInsights && !card.loading) || card.loading)) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {card.showDetect ? (
        <button
          type="button"
          onClick={() => onEnsureType(card.room)}
          disabled={detectingId === card.room.id}
          className="rounded-full border border-[hsl(var(--mobile-border-subtle))] bg-white px-2.5 py-1 text-xs font-medium text-[hsl(var(--mobile-text-secondary))] disabled:opacity-60"
        >
          {detectingId === card.room.id ? 'Detecting...' : 'Apply type'}
        </button>
      ) : null}
      {!card.hasInsights && !card.loading ? (
        <button
          type="button"
          onClick={() => onLoadInsight(card.room.id)}
          className="rounded-full border border-[hsl(var(--mobile-border-subtle))] bg-white px-2.5 py-1 text-xs font-medium text-[hsl(var(--mobile-text-secondary))]"
        >
          Load health score
        </button>
      ) : null}
      {card.loading ? (
        <span className="text-xs text-[hsl(var(--mobile-text-muted))]">Loading insights...</span>
      ) : null}
    </div>
  );
}

export function RoomsHeroCard({
  propertyId,
}: {
  propertyId: string;
}) {
  return (
    <SummaryCard
      title="Rooms"
      subtitle="Track health, value, and coverage of each room."
      action={
        <IconBadge tone="brand">
          <Sparkles className="h-4 w-4" />
        </IconBadge>
      }
    >
      <div className="grid grid-cols-2 gap-2.5">
        <Link
          href={`/dashboard/properties/${propertyId}/inventory/rooms`}
          className="no-brand-style inline-flex min-h-[44px] items-center justify-center rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] px-3 py-2 text-sm font-semibold text-[hsl(var(--mobile-text-primary))]"
        >
          Manage Rooms
        </Link>
        <Link
          href={`/dashboard/properties/${propertyId}/inventory`}
          className="no-brand-style inline-flex min-h-[44px] items-center justify-center rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] px-3 py-2 text-sm font-semibold text-[hsl(var(--mobile-text-primary))]"
        >
          Inventory
        </Link>
      </div>
    </SummaryCard>
  );
}

export function RoomsHealthSummaryCard({
  overallHealth,
  lowestRoomName,
}: {
  overallHealth: number | null;
  lowestRoomName: string | null;
}) {
  return (
    <SummaryCard
      title="Rooms Health"
      subtitle={
        lowestRoomName
          ? `Focus next on ${lowestRoomName}`
          : 'Load room insights to see room health trends'
      }
    >
      <p className={`mb-0 text-[hsl(var(--mobile-text-primary))] ${MOBILE_TYPE_TOKENS.heroMetric}`}>
        {overallHealth !== null ? `${overallHealth}% Cozy` : '—'}
      </p>
    </SummaryCard>
  );
}

export function FocusRoomCard({
  propertyId,
  card,
  scanLaunchingId,
  detectingId,
  onOpenScan,
  onEnsureType,
  onLoadInsight,
}: {
  propertyId: string;
  card: MobileRoomCardModel;
  scanLaunchingId: string | null;
  detectingId: string | null;
  onOpenScan: (room: InventoryRoom) => void;
  onEnsureType: (room: InventoryRoom & { type?: string | null }) => void;
  onLoadInsight: (roomId: string) => void;
}) {
  return (
    <SummaryCard
      title={card.room.name || 'Unnamed room'}
      subtitle={`Score ${Math.round(card.score)} • ${roomStatusCopy(card.score)}`}
      action={<StatusChip tone={roomStatusTone(card.score)}>{roomStatusCopy(card.score)}</StatusChip>}
    >
      <div className="space-y-3">
        <p className="mb-0 text-sm text-[hsl(var(--mobile-text-secondary))]">{card.tipText}</p>
        <div className="flex items-center justify-between text-sm text-[hsl(var(--mobile-text-secondary))]">
          <span>{card.gapCount} gap{card.gapCount === 1 ? '' : 's'} detected</span>
          <span className="font-semibold text-[hsl(var(--mobile-text-primary))]">
            {card.completenessPercent}% completeness
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-[hsl(var(--mobile-bg-muted))]">
          <div
            className="h-full rounded-full bg-[hsl(var(--mobile-brand-strong))] transition-all duration-700"
            style={{ width: `${card.completenessPercent}%` }}
          />
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <Link
            href={`/dashboard/properties/${propertyId}/rooms/${card.room.id}`}
            className="no-brand-style inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[hsl(var(--mobile-brand-strong))] px-4 py-2 text-sm font-semibold text-white"
          >
            Open Room
          </Link>
          <button
            type="button"
            onClick={() => onOpenScan(card.room)}
            disabled={card.loading}
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-white px-4 py-2 text-sm font-semibold text-[hsl(var(--mobile-brand-strong))] disabled:opacity-60"
          >
            {scanLaunchingId === card.room.id ? 'Launching...' : 'AI Scan'}
          </button>
        </div>

        <RoomSupportActions
          card={card}
          detectingId={detectingId}
          onEnsureType={onEnsureType}
          onLoadInsight={onLoadInsight}
        />
      </div>
    </SummaryCard>
  );
}

export function CompactRoomCard({
  propertyId,
  card,
  scanLaunchingId,
  detectingId,
  onOpenScan,
  onEnsureType,
  onLoadInsight,
}: {
  propertyId: string;
  card: MobileRoomCardModel;
  scanLaunchingId: string | null;
  detectingId: string | null;
  onOpenScan: (room: InventoryRoom) => void;
  onEnsureType: (room: InventoryRoom & { type?: string | null }) => void;
  onLoadInsight: (roomId: string) => void;
}) {
  const roomConfig = getRoomConfig(card.roomType);
  const RoomIcon = roomConfig.icon;

  return (
    <MobileCard variant="compact" className="py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <div className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${roomConfig.iconBg}`}>
              <RoomIcon className={`h-4 w-4 ${roomConfig.iconColor}`} />
            </div>
            <div className="min-w-0">
              <p className="mb-0 truncate text-base font-semibold text-[hsl(var(--mobile-text-primary))]">
                {card.room.name || 'Unnamed room'}
              </p>
              <div className="mt-1">
                <StatusChip tone={roomStatusTone(card.score)}>{roomStatusCopy(card.score)}</StatusChip>
              </div>
            </div>
          </div>
          <p className="mb-0 text-sm text-[hsl(var(--mobile-text-secondary))]">
            {card.itemCount} items • {card.docCount} docs • {card.gapCount} gaps
          </p>
          <div className="mt-1 flex items-center gap-2 text-xs text-[hsl(var(--mobile-text-secondary))]">
            <span>Score {Math.round(card.score)}</span>
            <span className="h-1 w-1 rounded-full bg-[hsl(var(--mobile-text-muted))]" />
            <span>{card.completenessPercent}% complete</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[hsl(var(--mobile-bg-muted))]">
            <div
              className="h-full rounded-full bg-[hsl(var(--mobile-brand-strong))] transition-all duration-700"
              style={{ width: `${card.completenessPercent}%` }}
            />
          </div>
        </div>

        <div className="flex w-24 shrink-0 flex-col gap-2">
          <Link
            href={`/dashboard/properties/${propertyId}/rooms/${card.room.id}`}
            className="no-brand-style inline-flex min-h-[40px] items-center justify-center rounded-xl bg-[hsl(var(--mobile-brand-strong))] px-3 py-2 text-sm font-semibold text-white"
          >
            Open
          </Link>
          <button
            type="button"
            onClick={() => onOpenScan(card.room)}
            disabled={card.loading}
            className="inline-flex min-h-[36px] items-center justify-center rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] px-3 py-1.5 text-sm font-semibold text-[hsl(var(--mobile-brand-strong))] disabled:opacity-60"
          >
            {scanLaunchingId === card.room.id ? 'Launching...' : 'AI Scan'}
          </button>
        </div>
      </div>

      <div className="mt-2">
        <RoomSupportActions
          card={card}
          detectingId={detectingId}
          onEnsureType={onEnsureType}
          onLoadInsight={onLoadInsight}
        />
      </div>
    </MobileCard>
  );
}

export function buildRoomTip({
  itemCount,
  docCount,
  gapCount,
}: {
  itemCount: number;
  docCount: number;
  gapCount: number;
}): string {
  return getSpecificRoomTip({ itemCount, docCount, gapCount });
}
