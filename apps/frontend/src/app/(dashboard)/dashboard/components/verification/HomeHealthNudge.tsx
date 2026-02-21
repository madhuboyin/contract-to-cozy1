// apps/frontend/src/app/(dashboard)/dashboard/components/verification/HomeHealthNudge.tsx
'use client';

import React, { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Shield, Camera, CheckCircle } from 'lucide-react';
import { getVerificationNudge, verifyItem } from './verificationApi';
import LabelOcrModal from '../inventory/LabelOcrModal';
import { ocrLabelToDraft, confirmInventoryDraft } from '../../inventory/inventoryApi';

interface HomeHealthNudgeProps {
  propertyId: string | undefined;
}

export function HomeHealthNudge({ propertyId }: HomeHealthNudgeProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [labelOpen, setLabelOpen] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);

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
        // Also mark the current nudge item as verified via OCR
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

  const handleManualVerify = useCallback(() => {
    if (!propertyId || !nudge?.item) return;
    router.push(
      `/dashboard/properties/${propertyId}/tools/inventory?itemId=${nudge.item.id}&verify=true`
    );
  }, [propertyId, nudge, router]);

  // Don't render if loading, no property, or all verified
  if (isLoading || !propertyId || !nudge?.item) return null;

  const { item, totalUnverified, totalItems } = nudge;
  const verified = totalItems - totalUnverified;
  const percentVerified = totalItems > 0 ? Math.round((verified / totalItems) * 100) : 0;

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
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-gray-900 truncate">
                Verify Your {item.name}
              </h3>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                {totalUnverified} unverified
              </span>
            </div>

            <p className="text-sm text-gray-600 mt-0.5">
              Scan the label or confirm details to unlock lifespan predictions
            </p>

            {/* Progress bar */}
            <div className="mt-3">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>{verified} of {totalItems} verified</span>
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
            <div className="flex gap-2 mt-3">
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
                onClick={handleManualVerify}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium
                  rounded-lg border border-gray-300 text-gray-700
                  hover:bg-gray-50 hover:border-gray-400
                  transition-colors"
              >
                <CheckCircle className="w-4 h-4" />
                Verify Manually
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* LabelOcrModal */}
      <LabelOcrModal
        open={labelOpen}
        onClose={() => setLabelOpen(false)}
        onCaptured={handleOcrCapture}
      />
    </>
  );
}
