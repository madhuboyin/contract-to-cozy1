'use client';

import React from 'react';
import Link from 'next/link';
import {
  Armchair,
  Building,
  CheckCircle,
  Droplets,
  Monitor,
  Package,
  Plus,
  Shield,
  Upload,
  Wind,
  Zap,
  type LucideIcon,
} from 'lucide-react';

import type { InventoryItem } from '@/types';

const ITEM_ICONS: Record<string, LucideIcon> = {
  FURNITURE: Armchair,
  APPLIANCE: Zap,
  ELECTRONICS: Monitor,
  PLUMBING: Droplets,
  HVAC: Wind,
  SAFETY: Shield,
  STRUCTURAL: Building,
  ROOF_EXTERIOR: Building,
  ELECTRICAL: Zap,
  DEFAULT: Package,
};

function titleCase(value?: string | null): string {
  if (!value) return 'Other';
  return value
    .toLowerCase()
    .split('_')
    .map((part) => (part ? `${part[0].toUpperCase()}${part.slice(1)}` : part))
    .join(' ');
}

function replacementDisplay(cents: number | null | undefined): string | null {
  if (!cents || cents <= 0) return null;
  const dollars = Math.round(cents / 100);
  return `$${dollars.toLocaleString()}`;
}

type RoomItemCardProps = {
  item: InventoryItem;
  roomName?: string;
  onOpenItem: (item: InventoryItem) => void;
  onOpenValueEditor: (itemId: string) => void;
  onOpenDocUpload: (itemId: string) => void;
};

export default function RoomItemCard({
  item,
  roomName,
  onOpenItem,
  onOpenValueEditor,
  onOpenDocUpload,
}: RoomItemCardProps) {
  const hasCoverageGap = !item.warrantyId || !item.insurancePolicyId;
  const ItemIcon = ITEM_ICONS[item.category || 'DEFAULT'] || ITEM_ICONS.DEFAULT;
  const docCount = item.documents?.length ?? 0;
  const replacementValue = replacementDisplay(item.replacementCostCents);

  return (
    <div
      className={[
        'relative cursor-pointer rounded-xl border bg-white transition-all duration-150',
        'hover:-translate-y-0.5 hover:shadow-md',
        hasCoverageGap ? 'border-red-200 ring-1 ring-red-100' : 'border-gray-200 hover:border-gray-300',
      ].join(' ')}
      onClick={() => onOpenItem(item)}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpenItem(item);
        }
      }}
    >
      {hasCoverageGap && <div className="absolute bottom-0 left-0 top-0 w-[3px] rounded-l-xl bg-red-400" />}

      <div className="p-4 pl-5">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className={`flex-shrink-0 rounded-lg p-1.5 ${hasCoverageGap ? 'bg-red-50' : 'bg-gray-100'}`}>
              <ItemIcon className={`h-4 w-4 ${hasCoverageGap ? 'text-red-500' : 'text-gray-500'}`} />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">{item.name}</p>
              <p className="text-[10px] uppercase tracking-wide text-gray-400">
                {titleCase(item.category)} - {item.room?.name || roomName || 'Room'}
              </p>
            </div>
          </div>

          {hasCoverageGap ? (
            <span className="whitespace-nowrap rounded-full border border-red-200 bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
              Coverage gap
            </span>
          ) : (
            <span className="whitespace-nowrap rounded-full border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
              Covered
            </span>
          )}
        </div>

        <div className="mb-3 flex items-center justify-between">
          <span className="text-[10px] font-medium uppercase tracking-wider text-gray-400">Replacement Value</span>
          {replacementValue ? (
            <span className="text-sm font-bold text-gray-800">{replacementValue}</span>
          ) : (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onOpenValueEditor(item.id);
              }}
              className="flex items-center gap-1 text-xs font-medium text-teal-600 underline-offset-2 hover:text-teal-700 hover:underline"
            >
              <Plus className="h-3 w-3" />
              Add value
            </button>
          )}
        </div>

        <div className="mb-4 flex items-center justify-between">
          <span className="text-[10px] font-medium uppercase tracking-wider text-gray-400">Documents</span>
          {docCount > 0 ? (
            <span className="text-xs font-semibold text-gray-700">{docCount} attached</span>
          ) : (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onOpenDocUpload(item.id);
              }}
              className="flex items-center gap-1 text-xs font-medium text-teal-600 underline-offset-2 hover:text-teal-700 hover:underline"
            >
              <Upload className="h-3 w-3" />
              Attach receipt
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {hasCoverageGap ? (
            <Link
              href={`/dashboard/properties/${item.propertyId}/inventory/items/${item.id}/coverage`}
              onClick={(event) => event.stopPropagation()}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-teal-600 py-2 text-xs font-semibold text-white transition-colors hover:bg-teal-700"
            >
              <Shield className="h-3.5 w-3.5" />
              Get coverage
            </Link>
          ) : (
            <Link
              href={`/dashboard/properties/${item.propertyId}/inventory/items/${item.id}/coverage`}
              onClick={(event) => event.stopPropagation()}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-200 py-2 text-xs font-medium text-gray-600 transition-colors hover:border-gray-300 hover:text-gray-800"
            >
              <CheckCircle className="h-3.5 w-3.5" />
              Coverage review
            </Link>
          )}

          <Link
            href={`/dashboard/properties/${item.propertyId}/inventory/items/${item.id}/replace-repair`}
            onClick={(event) => event.stopPropagation()}
            className="whitespace-nowrap rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 transition-colors hover:border-gray-300 hover:text-gray-800"
          >
            Replace/Repair
          </Link>
        </div>
      </div>
    </div>
  );
}
