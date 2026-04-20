'use client';

import React, { useState, useCallback } from 'react';
import { 
  Camera, 
  Loader2, 
  Sparkles, 
  CheckCircle2, 
  X, 
  ShieldCheck,
  Zap
} from 'lucide-react';
import { 
  Sheet, 
  SheetContent, 
  SheetHeader, 
  SheetTitle, 
  SheetDescription 
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { CameraCapture } from '@/components/mobile/CameraCapture';
import { WinCard } from '@/components/shared/WinCard';
import { cn } from '@/lib/utils';
import { usePropertyContext } from '@/lib/property/PropertyContext';
import { toast } from '@/components/ui/use-toast';
import { track } from '@/lib/analytics/events';
import { useRouter } from 'next/navigation';
import { ConfirmationForm } from './ConfirmationForm';
import { updateInventoryDraft, confirmInventoryDraft } from '@/app/(dashboard)/dashboard/inventory/inventoryApi';

interface MagicCaptureSheetProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: (data: any) => void;
}

type CaptureStep = 'idle' | 'analyzing' | 'review' | 'outcome' | 'error';

type CaptureErrorState = {
  message: string;
  code?: string;
  statusCode?: number;
  retryAfterSeconds?: number | null;
};

function parseRetryAfterSeconds(rawValue: string | null | undefined): number | null {
  if (!rawValue) return null;
  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

/**
 * MagicCaptureSheet implements the flagship "Camera -> Vault -> Action" loop.
 * It provides a high-speed, zero-friction path for homeowners to protect 
 * their assets by simply taking a photo.
 */
export function MagicCaptureSheet({ 
  isOpen, 
  onOpenChange,
  onComplete 
}: MagicCaptureSheetProps) {
  const router = useRouter();
  const { selectedPropertyId } = usePropertyContext();
  const [step, setStep] = useState<CaptureStep>('idle');
  const [outcomeData, setOutcomeData] = useState<any>(null);
  const [errorState, setErrorState] = useState<CaptureErrorState | null>(null);
  const [isConfirming, setIsSubmitting] = useState(false);

  const handleCapture = useCallback(async (file: File) => {
    if (!selectedPropertyId) {
      toast({
        title: "No property selected",
        description: "Please select a property before scanning.",
        variant: "destructive"
      });
      return;
    }

    setStep('analyzing');
    setErrorState(null);
    
    track('magic_scan_started', {
      propertyId: selectedPropertyId,
      source: 'command_center_sheet'
    });

    const formData = new FormData();
    formData.append('image', file);
    formData.append('propertyId', selectedPropertyId);

    try {
      const token = localStorage.getItem('token');
      // Use the dedicated OCR endpoint which returns a draftId
      const response = await fetch(`/api/properties/${selectedPropertyId}/inventory/ocr/label`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      let result: any = null;
      try {
        result = await response.json();
      } catch {
        result = null;
      }

      if (response.ok && result.success) {
        setOutcomeData(result.data);
        
        // Decide whether to show review screen or go straight to outcome
        // Threshold: 0.85 confidence
        if (result.data.confidence?.overall < 0.85 || !result.data.extracted?.productName) {
          setStep('review');
        } else {
          setStep('outcome');
        }
        
        track('magic_scan_completed', {
          propertyId: selectedPropertyId,
          draftId: result.data.draftId,
          confidence: result.data.confidence?.overall || 0,
        });

        if (onComplete) onComplete(result.data);
      } else {
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
        return;
      }
    } catch (err: any) {
      console.error('Capture error:', err);
      setStep('error');
      setErrorState({
        message: err?.message || 'Unable to complete analysis right now.',
        code: err?.code,
      });
    }
  }, [selectedPropertyId, onComplete]);

  const handleConfirm = async (finalData: any) => {
    if (!selectedPropertyId || !outcomeData?.draftId) return;

    setIsSubmitting(true);
    try {
      // 1. Update the draft with any manual corrections
      await updateInventoryDraft(selectedPropertyId, outcomeData.draftId, {
        extracted: finalData
      });

      // 2. Confirm the draft to create the real inventory item
      const item = await confirmInventoryDraft(selectedPropertyId, outcomeData.draftId);
      
      setOutcomeData({ ...outcomeData, item });
      setStep('outcome');
      
      toast({
        title: "Asset Secured",
        description: `${finalData.productName || 'Item'} has been added to your Vault.`,
      });
    } catch (err: any) {
      toast({
        title: "Confirmation failed",
        description: err.message,
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const reset = () => {
    setStep('idle');
    setOutcomeData(null);
    setErrorState(null);
  };

  const renderContent = () => {
    switch (step) {
      case 'idle':
        return (
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
            
            <CameraCapture 
              onCapture={handleCapture} 
              className="px-4"
            />
            
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

      case 'analyzing':
        return (
          <div className="flex flex-col items-center justify-center py-20 space-y-6 text-center px-6">
            <div className="relative">
              <div className="absolute inset-0 bg-brand-100 rounded-full animate-ping opacity-25" />
              <div className="relative bg-white p-6 rounded-full border shadow-sm">
                <Loader2 className="h-12 w-12 text-brand-600 animate-spin" />
              </div>
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-bold text-slate-900">Extracting Home Intelligence...</h3>
              <div className="flex flex-col gap-1.5">
                <p className="text-sm text-slate-500 animate-pulse">Identifying model and serial...</p>
                <p className="text-xs text-slate-400">Searching for warranty data...</p>
              </div>
            </div>
          </div>
        );

      case 'review':
        return (
          <ConfirmationForm 
            initialData={outcomeData.extracted} 
            confidence={outcomeData.confidence?.overall || 0}
            onConfirm={handleConfirm}
            onCancel={reset}
            isSubmitting={isConfirming}
          />
        );

      case 'outcome':
        const { extracted, item } = outcomeData;
        const itemName = extracted?.productName || extracted?.manufacturer || 'New Asset';
        
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
                onOpenChange(false);
                if (selectedPropertyId) {
                  router.push(`/dashboard/properties/${selectedPropertyId}/vault`);
                }
              }}
              trust={{
                confidenceLabel: "Verified",
                freshnessLabel: "Just now",
                sourceLabel: "Gemini Vision AI",
                rationale: `Details extracted from photo and confirmed for your property.`
              }}
              className="border-2 border-emerald-100"
            />

            <Button 
              variant="outline" 
              className="w-full h-12 rounded-xl"
              onClick={reset}
            >
              Scan Something Else
            </Button>
          </div>
        );

      case 'error':
        {
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
            
            <Button variant="ghost" className="w-full text-slate-500" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        );
        }
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent 
        side="bottom" 
        className="px-0 pt-2 pb-8 h-[92vh] max-h-[92vh] flex flex-col rounded-t-3xl border-t-0 shadow-2xl"
      >
        <div className="mx-auto w-12 h-1.5 bg-slate-200 rounded-full mb-2 shrink-0" />
        
        <SheetHeader className="px-6 border-b border-slate-50 pb-4">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-base font-semibold text-slate-400 uppercase tracking-widest">
              Command Center
            </SheetTitle>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {renderContent()}
        </div>
      </SheetContent>
    </Sheet>
  );
}
