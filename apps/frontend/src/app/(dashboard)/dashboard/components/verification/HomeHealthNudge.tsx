// apps/frontend/src/app/(dashboard)/dashboard/components/verification/HomeHealthNudge.tsx
'use client';

import React, { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Shield, Camera, Edit3, ArrowRight, AlertCircle, Home, Droplets } from 'lucide-react';
import { api } from '@/lib/api/client';
import { getHomeHealthNudge, verifyItem, getMissingFields } from './verificationApi';
import LabelOcrModal from '../inventory/LabelOcrModal';
import InventoryItemDrawer from '../inventory/InventoryItemDrawer';
import {
  ocrLabelToDraft,
  confirmInventoryDraft,
  getInventoryItem,
  listInventoryRooms,
} from '../../inventory/inventoryApi';
import { InventoryItem, InventoryRoom } from '@/types';

interface HomeHealthNudgeProps {
  propertyId: string | undefined;
}

const HOME_NUDGE_QUERY_KEY = 'home-health-nudge';

export function HomeHealthNudge({ propertyId }: HomeHealthNudgeProps) {
  const queryClient = useQueryClient();
  const [labelOpen, setLabelOpen] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [resilienceChoiceSaving, setResilienceChoiceSaving] = useState<string | null>(null);
  const [utilitySaving, setUtilitySaving] = useState(false);

  // Edit drawer state (asset verification path)
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerItem, setDrawerItem] = useState<InventoryItem | null>(null);
  const [drawerRooms, setDrawerRooms] = useState<InventoryRoom[]>([]);
  const [drawerLoading, setDrawerLoading] = useState(false);

  const { data: nudge, isLoading } = useQuery({
    queryKey: [HOME_NUDGE_QUERY_KEY, propertyId],
    queryFn: () => getHomeHealthNudge(propertyId!),
    enabled: !!propertyId,
    staleTime: 60 * 1000,
  });

  const refreshNudge = useCallback(async () => {
    if (!propertyId) return;
    await queryClient.invalidateQueries({ queryKey: [HOME_NUDGE_QUERY_KEY, propertyId] });
  }, [propertyId, queryClient]);

  const handleOcrCapture = useCallback(
    async (file: File) => {
      if (!propertyId || nudge?.type !== 'ASSET_VERIFICATION') return;
      setOcrLoading(true);
      try {
        const draft = await ocrLabelToDraft(propertyId, file);
        if (draft?.draftId) {
          await confirmInventoryDraft(propertyId, draft.draftId);
        }
        await verifyItem(propertyId, nudge.item.id, { source: 'OCR_LABEL' });
        await refreshNudge();
      } catch (err) {
        console.error('OCR verification failed:', err);
      } finally {
        setOcrLoading(false);
        setLabelOpen(false);
      }
    },
    [propertyId, nudge, refreshNudge]
  );

  const handleAddDetails = useCallback(async () => {
    if (!propertyId || nudge?.type !== 'ASSET_VERIFICATION') return;
    setDrawerLoading(true);
    try {
      const [item, rooms] = await Promise.all([
        getInventoryItem(propertyId, nudge.item.id),
        listInventoryRooms(propertyId),
      ]);
      setDrawerItem(item);
      setDrawerRooms(rooms);
      setDrawerOpen(true);
    } catch (err) {
      console.error('Failed to load item details:', err);
    } finally {
      setDrawerLoading(false);
    }
  }, [propertyId, nudge]);

  const handleDrawerSaved = useCallback(async () => {
    if (propertyId && drawerItem?.id) {
      try {
        await verifyItem(propertyId, drawerItem.id, { source: 'MANUAL' });
      } catch (err) {
        console.error('Failed to mark item verified:', err);
      }
    }
    setDrawerOpen(false);
    setDrawerItem(null);
    await refreshNudge();
  }, [propertyId, drawerItem, refreshNudge]);

  const handleResilienceChoice = useCallback(
    async (value: boolean | null, choiceKey: string) => {
      if (!propertyId) return;
      setResilienceChoiceSaving(choiceKey);
      try {
        await api.patch(`/api/properties/${propertyId}`, {
          hasSumpPumpBackup: value,
          isResilienceVerified: true,
        });
        await refreshNudge();
      } catch (err) {
        console.error('Failed to save resilience answer:', err);
      } finally {
        setResilienceChoiceSaving(null);
      }
    },
    [propertyId, refreshNudge]
  );

  const handleUtilitySelect = useCallback(
    async (value: string) => {
      if (!propertyId || !value) return;
      setUtilitySaving(true);
      try {
        const payload =
          value === '__NOT_SURE__'
            ? { primaryHeatingFuel: null, isUtilityVerified: true }
            : { primaryHeatingFuel: value, isUtilityVerified: true };
        await api.patch(`/api/properties/${propertyId}`, payload);
        await refreshNudge();
      } catch (err) {
        console.error('Failed to save utility setup:', err);
      } finally {
        setUtilitySaving(false);
      }
    },
    [propertyId, refreshNudge]
  );

  if (isLoading || !propertyId || !nudge) return null;

  if (nudge.type === 'RESILIENCE_CHECK') {
    return (
      <div
        className="
          w-full rounded-xl shadow-sm
          bg-gradient-to-r from-cyan-50 to-blue-50
          border-2 border-cyan-200 border-l-4 border-l-cyan-600
          px-5 py-4
          hover:shadow-md transition-shadow
        "
      >
        <div className="flex items-start gap-3">
          <div className="p-2 bg-cyan-100 rounded-lg shrink-0">
            <Droplets className="w-5 h-5 text-cyan-700" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900">{nudge.title}</h3>
            <p className="text-sm text-gray-700 mt-1">
              Heavy rain predicted. Do you have a battery backup for your sump pump?
            </p>
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <button
                onClick={() => handleResilienceChoice(true, 'yes')}
                disabled={!!resilienceChoiceSaving}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-cyan-300 text-cyan-700 hover:bg-cyan-100 disabled:opacity-50 transition-colors"
              >
                {resilienceChoiceSaving === 'yes' ? 'Saving...' : 'Yes'}
              </button>
              <button
                onClick={() => handleResilienceChoice(false, 'no')}
                disabled={!!resilienceChoiceSaving}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-cyan-300 text-cyan-700 hover:bg-cyan-100 disabled:opacity-50 transition-colors"
              >
                {resilienceChoiceSaving === 'no' ? 'Saving...' : 'No'}
              </button>
              <button
                onClick={() => handleResilienceChoice(null, 'not-sure')}
                disabled={!!resilienceChoiceSaving}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                {resilienceChoiceSaving === 'not-sure' ? 'Saving...' : 'Not Sure'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (nudge.type === 'UTILITY_SETUP') {
    return (
      <div
        className="
          w-full rounded-xl shadow-sm
          bg-gradient-to-r from-amber-50 to-orange-50
          border-2 border-amber-200 border-l-4 border-l-amber-600
          px-5 py-4
          hover:shadow-md transition-shadow
        "
      >
        <div className="flex items-start gap-3">
          <div className="p-2 bg-amber-100 rounded-lg shrink-0">
            <Home className="w-5 h-5 text-amber-700" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900">{nudge.title}</h3>
            <p className="text-sm text-gray-700 mt-1">{nudge.question}</p>
            <div className="mt-3">
              <select
                className="w-full max-w-sm rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:opacity-60"
                defaultValue=""
                disabled={utilitySaving}
                onChange={(event) => void handleUtilitySelect(event.target.value)}
              >
                <option value="" disabled>
                  Select heating fuel
                </option>
                {nudge.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
                <option value="__NOT_SURE__">Not sure</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const { item, totalUnverified, totalItems } = nudge;
  const verified = totalItems - totalUnverified;
  const percentVerified = totalItems > 0 ? Math.round((verified / totalItems) * 100) : 0;
  const missingFields = getMissingFields(item);
  const locationHint = item.room?.name ? ` in ${item.room.name}` : '';

  return (
    <>
      <div
        className="
          w-full rounded-xl shadow-sm
          bg-gradient-to-r from-blue-50 to-indigo-50
          border-2 border-blue-200 border-l-4 border-l-blue-500
          px-5 py-4
          hover:shadow-md transition-shadow
        "
      >
        <div className="flex items-start gap-3">
          <div className="p-2 bg-blue-100 rounded-lg shrink-0">
            <Shield className="w-5 h-5 text-blue-600" />
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900">
              Complete details for {item.name}
            </h3>

            <p className="text-sm text-gray-600 mt-0.5">
              Your {item.name}{locationHint} is missing key details needed for lifespan predictions and maintenance alerts.
            </p>

            {missingFields.length > 0 && (
              <div className="mt-2 flex items-start gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-700">
                  <span className="font-medium">Missing:</span>{' '}
                  {missingFields.join(', ')}
                </p>
              </div>
            )}

            <div className="mt-3">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>{verified} of {totalItems} items verified</span>
                <span>{percentVerified}%</span>
              </div>
              <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-500"
                  style={{ width: `${percentVerified}%` }}
                />
              </div>
            </div>

            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <button
                onClick={() => setLabelOpen(true)}
                disabled={ocrLoading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-blue-300 text-blue-700 hover:bg-blue-50 hover:border-blue-400 disabled:opacity-50 transition-colors"
              >
                <Camera className="w-4 h-4" />
                {ocrLoading ? 'Scanning...' : 'Scan Label'}
              </button>

              <button
                onClick={handleAddDetails}
                disabled={drawerLoading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400 disabled:opacity-50 transition-colors"
              >
                <Edit3 className="w-4 h-4" />
                {drawerLoading ? 'Loading...' : 'Add Missing Details'}
              </button>

              {totalUnverified > 1 && (
                <Link
                  href={`/dashboard/properties/${propertyId}/inventory`}
                  className="inline-flex items-center gap-1 ml-auto text-sm font-medium text-blue-600 hover:text-blue-700"
                >
                  View all {totalUnverified} unverified
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>

      <LabelOcrModal
        open={labelOpen}
        onClose={() => setLabelOpen(false)}
        onCaptured={handleOcrCapture}
      />

      <InventoryItemDrawer
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setDrawerItem(null);
        }}
        propertyId={propertyId}
        rooms={drawerRooms}
        initialItem={drawerItem}
        onSaved={() => void handleDrawerSaved()}
      />
    </>
  );
}
