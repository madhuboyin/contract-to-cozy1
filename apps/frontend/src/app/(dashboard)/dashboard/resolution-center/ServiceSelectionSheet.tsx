'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  X,
  ArrowRight,
  TrendingUp,
  DollarSign,
  Search,
  ShieldCheck,
  Loader2,
  ChevronRight as ChevronRightIcon,
} from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  createServicePriceRadarCheck,
  ServicePriceRadarCheckDetail,
} from '@/app/(dashboard)/dashboard/properties/[id]/tools/service-price-radar/servicePriceRadarApi';
import { ConfidenceBadge, SourceChip } from '@/components/trust';
import { normalizeProviderCategoryForSearch } from '@/lib/config/serviceCategoryMapping';

interface ServiceSelectionSheetProps {
  item: any;
  propertyId: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ServiceSelectionSheet({
  item,
  propertyId,
  isOpen,
  onOpenChange,
}: ServiceSelectionSheetProps) {
  const router = useRouter();
  const [step, setStep] = useState<'selection' | 'radar'>('selection');
  const [quoteAmount, setQuoteAmount] = useState('');
  const [vendorName, setVendorName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [radarResult, setRadarResult] = useState<ServicePriceRadarCheckDetail | null>(null);

  const serviceCategory =
    normalizeProviderCategoryForSearch(item?.serviceCategory) ||
    normalizeProviderCategoryForSearch(item?.category) ||
    'GENERAL_HANDYMAN';

  const handleCheckPrice = async () => {
    if (!quoteAmount || !propertyId) return;

    setIsSubmitting(true);
    try {
      const result = await createServicePriceRadarCheck(propertyId, {
        serviceCategory,
        quoteAmount: Number(quoteAmount),
        quoteVendorName: vendorName,
        serviceLabelRaw: item.title,
        linkedEntities: [{ linkedEntityType: 'SYSTEM', linkedEntityId: item.id }],
      });
      setRadarResult(result);
      setStep('radar');
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBookProvider = () => {
    onOpenChange(false);
    const params = new URLSearchParams({
      propertyId,
      from: 'resolution-center',
      category: serviceCategory,
      intent: 'service-booking',
      returnTo: '/dashboard/resolution-center',
    });
    if (item?.title) params.set('serviceLabel', item.title);
    if (item?.actionKey) params.set('actionKey', item.actionKey);
    router.push(`/dashboard/providers?${params.toString()}`);
  };

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) {
          setStep('selection');
          setQuoteAmount('');
          setVendorName('');
          setRadarResult(null);
        }
      }}
    >
      <SheetContent
        side="bottom"
        className="h-[92vh] max-h-[92vh] flex flex-col rounded-t-3xl border-t-0 p-0 shadow-2xl overflow-hidden"
      >
        <div className="mx-auto w-12 h-1.5 bg-slate-200 rounded-full my-3 shrink-0" />

        <SheetHeader className="px-6 border-b border-slate-50 pb-4 shrink-0">
          <SheetTitle className="text-base font-semibold text-slate-400 uppercase tracking-widest text-left">
            Service Selection
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          {step === 'selection' ? (
            <div className="space-y-8">
              <div className="space-y-1">
                <h3 className="text-2xl font-bold text-slate-900">{item?.title}</h3>
                <p className="text-sm text-slate-500">
                  Compare quotes or browse vetted local providers.
                </p>
              </div>

              {/* Option 1: Price Radar */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-brand-600" />
                  <h4 className="text-sm font-bold text-slate-900 uppercase tracking-tight">
                    AI Price Check
                  </h4>
                </div>

                <div className="rounded-2xl border-2 border-brand-100 bg-brand-50/30 p-5 space-y-5">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label
                        htmlFor="quoteAmount"
                        className="text-[10px] font-bold uppercase tracking-widest text-slate-400"
                      >
                        Quote Amount ($)
                      </Label>
                      <div className="relative">
                        <DollarSign className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input
                          id="quoteAmount"
                          value={quoteAmount}
                          onChange={(e) => setQuoteAmount(e.target.value)}
                          placeholder="0.00"
                          type="number"
                          className="pl-9 h-12 rounded-xl bg-white border-slate-200 text-lg font-bold"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label
                        htmlFor="vendorName"
                        className="text-[10px] font-bold uppercase tracking-widest text-slate-400"
                      >
                        Provider Name (Optional)
                      </Label>
                      <Input
                        id="vendorName"
                        value={vendorName}
                        onChange={(e) => setVendorName(e.target.value)}
                        placeholder="e.g. Acme Plumbing"
                        className="h-12 rounded-xl bg-white border-slate-200"
                      />
                    </div>
                  </div>

                  <Button
                    onClick={handleCheckPrice}
                    disabled={!quoteAmount || isSubmitting}
                    className="w-full h-12 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-bold shadow-lg shadow-brand-100"
                  >
                    {isSubmitting ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      'Verify Fair Price'
                    )}
                    {!isSubmitting && <ArrowRight className="ml-2 h-4 w-4" />}
                  </Button>
                </div>
              </div>

              {/* Option 2: Browse Marketplace */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Search className="h-4 w-4 text-slate-400" />
                  <h4 className="text-sm font-bold text-slate-900 uppercase tracking-tight">
                    C2C Marketplace
                  </h4>
                </div>

                <button
                  onClick={handleBookProvider}
                  className="w-full rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-between px-5 py-5 text-left transition-colors"
                >
                  <div className="space-y-0.5">
                    <p className="font-bold text-slate-900">Find Local Pros</p>
                    <p className="text-xs text-slate-500">
                      Vetted providers in your neighborhood.
                    </p>
                  </div>
                  <ChevronRightIcon className="h-5 w-5 text-slate-300" />
                </button>
              </div>
            </div>
          ) : (
            /* Radar Result Step */
            <div className="space-y-8">
              <div className="text-center space-y-2">
                <div
                  className={cn(
                    'mx-auto w-16 h-16 rounded-full flex items-center justify-center mb-4',
                    radarResult?.verdict === 'FAIR'
                      ? 'bg-emerald-50 text-emerald-600'
                      : 'bg-amber-50 text-amber-600',
                  )}
                >
                  <ShieldCheck className="h-8 w-8" />
                </div>
                <h3 className="text-2xl font-bold text-slate-900">
                  {radarResult?.verdict === 'FAIR' ? 'Fair Price Match' : 'Quote Above Range'}
                </h3>
                <p className="text-sm text-slate-500">
                  {radarResult?.explanationShort ||
                    'We compared your quote against local market data.'}
                </p>
              </div>

              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-slate-50 p-4 border border-slate-100">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">
                      Your Quote
                    </p>
                    <p className="text-lg font-bold text-slate-900">
                      ${radarResult?.quoteAmount.toLocaleString()}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4 border border-slate-100">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">
                      Market Median
                    </p>
                    <p className="text-lg font-bold text-slate-900">
                      ${radarResult?.expectedMedian?.toLocaleString() || '---'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <ConfidenceBadge
                    level="high"
                    score={
                      radarResult?.confidenceScore
                        ? Math.round(radarResult.confidenceScore * 100)
                        : 92
                    }
                  />
                  <SourceChip source="Local Market Index" />
                </div>

                <div className="pt-4 space-y-3">
                  <Button
                    onClick={handleBookProvider}
                    className="w-full h-12 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold"
                  >
                    Accept & Book Appointment
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => setStep('selection')}
                    className="w-full h-12 text-slate-500 font-medium"
                  >
                    Edit Quote Details
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
