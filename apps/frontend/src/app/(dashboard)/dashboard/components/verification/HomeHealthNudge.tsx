// apps/frontend/src/app/(dashboard)/dashboard/components/verification/HomeHealthNudge.tsx
'use client';

import React, { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Shield, Camera, Edit3, ArrowRight, AlertCircle } from 'lucide-react';
import { getVerificationNudge, verifyItem, getMissingFields } from './verificationApi';
import LabelOcrModal from '../inventory/LabelOcrModal';
import InventoryItemDrawer from '../inventory/InventoryItemDrawer';
import { ocrLabelToDraft, confirmInventoryDraft, getInventoryItem, listInventoryRooms } from '../../inventory/inventoryApi';
import { InventoryItem, InventoryRoom } from '@/types';

interface HomeHealthNudgeProps {
  propertyId: string | undefined;
}

export function HomeHealthNudge({ propertyId }: HomeHealthNudgeProps) {
  const queryClient = useQueryClient();
  const [labelOpen, setLabelOpen] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);

  // Edit drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerItem, setDrawerItem] = useState<InventoryItem | null>(null);
  const [drawerRooms, setDrawerRooms] = useState<InventoryRoom[]>([]);
  const [drawerLoading, setDrawerLoading] = useState(false);

  const { data: nudge, isLoading } = useQuery({
    queryKey: ['verification-nudge', propertyId],
    queryFn: () => getVerificationNudge(propertyId!),
    enabled: !!propertyId,
    staleTime: 5 * 60 * 1000,
  });

  const handleOcrCapture = useCallback(
    async (file: File) => {
      if (!propertyId || !nudge?.item) return;
      setOcrLoading(true);
      try {
        const draft = await ocrLabelToDraft(propertyId, file);
        if (draft?.draftId) {
          await confirmInventoryDraft(propertyId, draft.draftId);
        }
        await verifyItem(propertyId, nudge.item.id, { source: 'OCR_LABEL' });
        queryClient.invalidateQueries({ queryKey: ['verification-nudge', propertyId] });
      } catch (err) {
        console.error('OCR verification failed:', err);
      } finally {
        setOcrLoading(false);
        setLabelOpen(false);
      }
    },
    [propertyId, nudge, queryClient]
  );

  const handleAddDetails = useCallback(async () => {
    if (!propertyId || !nudge?.item) return;
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
    // Mark item as manually verified after user fills in details and saves
    if (propertyId && drawerItem?.id) {
      try {
        await verifyItem(propertyId, drawerItem.id, { source: 'MANUAL' });
      } catch (err) {
        console.error('Failed to mark item verified:', err);
      }
    }
    setDrawerOpen(false);
    setDrawerItem(null);
    queryClient.invalidateQueries({ queryKey: ['verification-nudge', propertyId] });
  }, [propertyId, drawerItem, queryClient]);

  // Don't render if loading, no property, or all verified
  if (isLoading || !propertyId || !nudge?.item) return null;

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

            {/* Missing fields */}
            {missingFields.length > 0 && (
              <div className="mt-2 flex items-start gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-700">
                  <span className="font-medium">Missing:</span>{' '}
                  {missingFields.join(', ')}
                </p>
              </div>
            )}

            {/* Progress bar */}
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

            {/* Action buttons */}
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <button
                onClick={() => setLabelOpen(true)}
                disabled={ocrLoading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium
                  rounded-lg border border-blue-300 text-blue-700
                  hover:bg-blue-50 hover:border-blue-400
                  disabled:opacity-50 transition-colors"
              >
                <Camera className="w-4 h-4" />
                {ocrLoading ? 'Scanning...' : 'Scan Label'}
              </button>

              <button
                onClick={handleAddDetails}
                disabled={drawerLoading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium
                  rounded-lg border border-gray-300 text-gray-700
                  hover:bg-gray-50 hover:border-gray-400
                  disabled:opacity-50 transition-colors"
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

      {/* Edit drawer opens directly on the dashboard */}
      <InventoryItemDrawer
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setDrawerItem(null); }}
        propertyId={propertyId}
        rooms={drawerRooms}
        initialItem={drawerItem}
        onSaved={handleDrawerSaved}
      />
    </>
  );
}
