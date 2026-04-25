'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, CheckCircle2, X, ShieldCheck, Zap } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { CameraCapture } from '@/components/mobile/CameraCapture';
import { WinCard } from '@/components/shared/WinCard';
import { usePropertyContext } from '@/lib/property/PropertyContext';
import { toast } from '@/components/ui/use-toast';
import { track } from '@/lib/analytics/events';
import { useRouter } from 'next/navigation';
import { ConfirmationForm } from './ConfirmationForm';
import {
  updateInventoryDraft,
  confirmInventoryDraft,
} from '@/app/(dashboard)/dashboard/inventory/inventoryApi';

interface MagicCaptureSheetProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: (data: any) => void;
}

type CaptureStep =
  | 'idle'
  | 'capturing'
  | 'processing'
  | 'result-high'
  | 'result-medium'
  | 'result-low'
  | 'saving'
  | 'success'
  | 'error';

type CaptureErrorState = {
  message: string;
  code?: string;
  statusCode?: number;
  retryAfterSeconds?: number | null;
};

type CaptureOutcomeData = {
  draftId?: string;
  extracted?: Record<string, any>;
  confidence?: {
    overall?: number;
  };
  item?: any;
};

const HIGH_CONFIDENCE_THRESHOLD = 0.85;
const MEDIUM_CONFIDENCE_THRESHOLD = 0.6;

function parseRetryAfterSeconds(rawValue: string | null | undefined): number | null {
  if (!rawValue) return null;
  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function resolveResultStep(data: CaptureOutcomeData): Extract<CaptureStep, 'result-high' | 'result-medium' | 'result-low'> {
  const confidence = Number(data.confidence?.overall ?? 0);
  const hasProductName = Boolean(data.extracted?.productName);

  if (confidence >= HIGH_CONFIDENCE_THRESHOLD && hasProductName) return 'result-high';
  if (confidence >= MEDIUM_CONFIDENCE_THRESHOLD) return 'result-medium';
  return 'result-low';
}

/**
 * MagicCaptureSheet implements the flagship "Camera -> Vault -> Action" loop.
 * It provides a high-speed, zero-friction path for homeowners to protect
 * their assets by simply taking a photo.
 */
export function MagicCaptureSheet({
  isOpen,
  onOpenChange,
  onComplete,
}: MagicCaptureSheetProps) {
  const router = useRouter();
  const { selectedPropertyId } = usePropertyContext();
  const [step, setStep] = useState<CaptureStep>('capturing');
  const [outcomeData, setOutcomeData] = useState<CaptureOutcomeData | null>(null);
  const [errorState, setErrorState] = useState<CaptureErrorState | null>(null);

  useEffect(() => {
    if (isOpen && step === 'idle') {
      setStep('capturing');
    }
    if (!isOpen && step !== 'idle') {
      setStep('idle');
    }
  }, [isOpen, step]);

  const reset = useCallback(() => {
    setStep('capturing');
    setOutcomeData(null);
    setErrorState(null);
  }, []);

  const handleSheetOpenChange = useCallback(
    (open: boolean) => {
      onOpenChange(open);
      if (open) {
        reset();
      } else {
        setStep('idle');
        setOutcomeData(null);
        setErrorState(null);
      }
    },
    [onOpenChange, reset],
  );

  const persistDraft = useCallback(
    async (finalData: Record<string, any>) => {
      if (!selectedPropertyId || !outcomeData?.draftId) return;

      setStep('saving');
      try {
        await updateInventoryDraft(selectedPropertyId, outcomeData.draftId, {
          extracted: finalData,
        });

        const item = await confirmInventoryDraft(selectedPropertyId, outcomeData.draftId);

        setOutcomeData((prev) => ({
          ...(prev ?? {}),
          extracted: {
            ...(prev?.extracted ?? {}),
            ...finalData,
          },
          item,
        }));
        setStep('success');

        toast({
          title: 'Asset Secured',
          description: `${finalData.productName || 'Item'} has been added to your Vault.`,
        });
      } catch (err: any) {
        console.error('Capture confirmation error:', err);
        setStep('error');
        setErrorState({
          message: err?.message || 'Unable to save this scan right now.',
          code: err?.code,
        });
      }
    },
    [selectedPropertyId, outcomeData],
  );

  const handleCapture = useCallback(
    async (file: File) => {
      if (!selectedPropertyId) {
        toast({
          title: 'No property selected',
          description: 'Please select a property before scanning.',
          variant: 'destructive',
        });
        return;
      }

      setStep('processing');
      setErrorState(null);

      track('magic_scan_started', {
        propertyId: selectedPropertyId,
        source: 'command_center_sheet',
      });

      const formData = new FormData();
      formData.append('image', file);
      formData.append('propertyId', selectedPropertyId);

      try {
        const token = localStorage.getItem('token');
        const response = await fetch(
          `/api/properties/${selectedPropertyId}/inventory/ocr/label`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
            },
            body: formData,
          },
        );

        let result: any = null;
        try {
          result = await response.json();
        } catch {
          result = null;
        }

        if (response.ok && result.success) {
          const nextOutcome: CaptureOutcomeData = result.data ?? {};
          setOutcomeData(nextOutcome);
          setStep(resolveResultStep(nextOutcome));

          track('magic_scan_completed', {
            propertyId: selectedPropertyId,
            draftId: nextOutcome.draftId,
            confidence: nextOutcome.confidence?.overall || 0,
          });

          if (onComplete) onComplete(nextOutcome);
          return;
        }

        const apiError = result?.error;
        const message =
          (typeof apiError === 'object' && apiError?.message) ||
          (typeof apiError === 'string' ? apiError : null) ||
          result?.message ||
          (response.status === 504
            ? 'Document analysis timed out. Please try again.'
            : 'Analysis failed');
        const code =
          (typeof apiError === 'object' && apiError?.code) ||
          result?.code ||
          (response.status === 504 ? 'AI_TIMEOUT' : undefined);

        setStep('error');
        setErrorState({
          message,
          code,
          statusCode: response.status,
          retryAfterSeconds: parseRetryAfterSeconds(response.headers?.get('retry-after')),
        });
      } catch (err: any) {
        console.error('Capture error:', err);
        setStep('error');
        setErrorState({
          message: err?.message || 'Unable to complete analysis right now.',
          code: err?.code,
        });
      }
    },
    [selectedPropertyId, onComplete],
  );

  const handleConfirm = useCallback(
    async (finalData: Record<string, any>) => {
      await persistDraft(finalData);
    },
    [persistDraft],
  );

  const handleQuickSave = useCallback(async () => {
    await persistDraft(outcomeData?.extracted ?? {});
  }, [persistDraft, outcomeData]);

  const renderCaptureSurface = () => (
    <div className="space-y-6 py-4">
      <div className="text-center space-y-2 px-4">
        <div className="mx-auto w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center mb-4">
          <Zap className="h-6 w-6 text-blue-600" />
        </div>
        <h3 className="text-xl font-bold text-slate-900">Magic Scan</h3>
        <p className="text-sm text-slate-500 max-w-xs mx-auto">
          Snap a photo of any appliance label, receipt, or document.
          Our AI handles the rest.
        </p>
      </div>

      <CameraCapture onCapture={handleCapture} className="px-4" />

      <div className="bg-slate-50 p-4 rounded-xl mx-4 flex items-start gap-3 border border-slate-100">
        <ShieldCheck className="h-5 w-5 text-emerald-600 flex-shrink-0" />
        <div className="text-xs text-slate-600 leading-relaxed">
          <span className="font-semibold text-slate-900 block mb-1">Privacy First Vaulting</span>
          Your photos are processed securely and used only to build your home record.
          Powered by Google Gemini.
        </div>
      </div>
    </div>
  );

  const renderContent = () => {
    switch (step) {
      case 'idle':
      case 'capturing':
        return renderCaptureSurface();

      case 'processing':
        return (
          <div className="flex flex-col items-center justify-center py-20 space-y-6 text-center px-6">
            <div className="relative">
              <div className="absolute inset-0 bg-brand-100 rounded-full animate-ping opacity-25" />
              <div className="relative bg-white p-6 rounded-full border shadow-sm">
                <Loader2 className="h-12 w-12 text-brand-600 animate-spin" />
              </div>
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-bold text-slate-900">Reading your scan...</h3>
              <div className="flex flex-col gap-1.5">
                <p className="text-sm text-slate-500 animate-pulse">Identifying model and serial...</p>
                <p className="text-xs text-slate-400">Searching for warranty data...</p>
              </div>
            </div>
          </div>
        );

      case 'result-high': {
        const extracted = outcomeData?.extracted ?? {};
        const confidenceScore = Math.round((outcomeData?.confidence?.overall ?? 0) * 100);
        const itemName = extracted.productName || extracted.manufacturer || 'New Asset';

        return (
          <div className="space-y-4 py-6 px-4">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-center">
              <p className="text-xs font-bold tracking-normal text-emerald-700">High Confidence</p>
              <h3 className="mt-1 text-lg font-bold text-emerald-900">{itemName}</h3>
              <p className="mt-1 text-sm text-emerald-800">
                We captured this label with {confidenceScore}% confidence.
              </p>
            </div>

            <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-bold tracking-normal text-slate-400">Captured details</p>
              <p className="text-sm text-slate-700">Brand: {extracted.manufacturer || 'Not detected'}</p>
              <p className="text-sm text-slate-700">Model: {extracted.modelNumber || 'Not detected'}</p>
              <p className="text-sm text-slate-700">Serial: {extracted.serialNumber || 'Not detected'}</p>
            </div>

            <Button className="w-full h-12 rounded-xl" onClick={() => void handleQuickSave()}>
              Save to Vault
            </Button>
            <Button
              variant="ghost"
              className="w-full text-slate-500"
              onClick={() => setStep('result-medium')}
            >
              Review Before Saving
            </Button>
          </div>
        );
      }

      case 'result-medium':
      case 'result-low': {
        const confidence = outcomeData?.confidence?.overall || 0;
        const isLow = step === 'result-low';

        return (
          <div className="space-y-4 py-4">
            <div
              className={
                isLow
                  ? 'mx-6 rounded-xl border border-amber-200 bg-amber-50 p-3'
                  : 'mx-6 rounded-xl border border-yellow-200 bg-yellow-50 p-3'
              }
            >
              <p className="text-xs font-semibold tracking-normal text-slate-500">
                {isLow ? 'Low confidence capture' : 'Medium confidence capture'}
              </p>
              <p className="mt-1 text-sm text-slate-700">
                {isLow
                  ? 'Add or correct the fields below to save this item accurately.'
                  : 'Quickly confirm these fields and we will secure it in your Vault.'}
              </p>
            </div>

            <ConfirmationForm
              initialData={outcomeData?.extracted ?? {}}
              confidence={confidence}
              onConfirm={(finalData) => void handleConfirm(finalData)}
              onCancel={reset}
            />
          </div>
        );
      }

      case 'saving': {
        const itemName =
          outcomeData?.extracted?.productName ||
          outcomeData?.extracted?.manufacturer ||
          'your item';

        return (
          <div className="flex flex-col items-center justify-center py-24 px-6 text-center space-y-4">
            <Loader2 className="h-10 w-10 animate-spin text-brand-600" />
            <h3 className="text-lg font-bold text-slate-900">Securing {itemName}...</h3>
            <p className="text-sm text-slate-500">
              Finalizing your vault record and activating monitoring.
            </p>
          </div>
        );
      }

      case 'success': {
        const extracted = outcomeData?.extracted ?? {};
        const itemName = extracted.productName || extracted.manufacturer || 'New Asset';

        return (
          <div className="space-y-6 py-6 px-4">
            <div className="flex flex-col items-center text-center space-y-2 mb-2">
              <div className="w-14 h-14 bg-emerald-50 rounded-full flex items-center justify-center mb-2">
                <CheckCircle2 className="h-8 w-8 text-emerald-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-900">Intelligence Locked</h3>
              <p className="text-sm text-slate-500">
                We&apos;ve identified your {itemName} and secured it in the Vault.
              </p>
            </div>

            <WinCard
              title="Asset Vaulted"
              value={itemName}
              description="This item is now being monitored for recalls and maintenance needs."
              actionLabel="View in Vault"
              onAction={() => {
                handleSheetOpenChange(false);
                if (selectedPropertyId) {
                  router.push(`/dashboard/properties/${selectedPropertyId}/vault`);
                }
              }}
              trust={{
                confidenceLabel: 'Verified',
                freshnessLabel: 'Just now',
                sourceLabel: 'Gemini Vision AI',
                rationale: 'Details extracted from photo and confirmed for your property.',
              }}
              className="border-2 border-emerald-100"
            />

            <Button variant="outline" className="w-full h-12 rounded-xl" onClick={reset}>
              Scan Something Else
            </Button>
          </div>
        );
      }

      case 'error': {
        const isTimeout =
          errorState?.code === 'AI_TIMEOUT' || errorState?.statusCode === 504;

        return (
          <div className="py-8 px-4 space-y-5">
            <div className="mx-auto w-12 h-12 bg-red-50 rounded-full flex items-center justify-center">
              <X className="h-6 w-6 text-red-600" />
            </div>
            <div className="space-y-1 text-center">
              <h3 className="text-lg font-bold text-slate-900">
                {isTimeout ? 'AI response timed out' : 'Analysis Interrupted'}
              </h3>
              <p className="text-sm text-slate-500">{errorState?.message}</p>
              {isTimeout && (
                <p className="text-sm text-slate-500">
                  {errorState?.retryAfterSeconds
                    ? `Try again in about ${errorState.retryAfterSeconds} seconds.`
                    : 'Try again in a few moments.'}
                </p>
              )}
            </div>

            {isTimeout && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <p className="text-sm font-semibold text-amber-900">Manual fallback ready</p>
                <p className="mt-1 text-xs text-amber-800">
                  You can retry the scan now, or add this item manually from Inventory if the issue continues.
                </p>
              </div>
            )}

            <Button className="w-full rounded-xl h-12" onClick={reset}>
              Retry Magic Scan
            </Button>

            <Button
              variant="ghost"
              className="w-full text-slate-500"
              onClick={() => handleSheetOpenChange(false)}
            >
              Close
            </Button>
          </div>
        );
      }

      default:
        return renderCaptureSurface();
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={handleSheetOpenChange}>
      <SheetContent
        side="bottom"
        className="px-0 pt-2 pb-8 h-[92vh] max-h-[92vh] flex flex-col rounded-t-3xl border-t-0 shadow-2xl"
      >
        <div className="mx-auto w-12 h-1.5 bg-slate-200 rounded-full mb-2 shrink-0" />

        <SheetHeader className="px-6 border-b border-slate-50 pb-4">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-base font-semibold text-slate-400 tracking-normal">
              Command Center
            </SheetTitle>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">{renderContent()}</div>
      </SheetContent>
    </Sheet>
  );
}
