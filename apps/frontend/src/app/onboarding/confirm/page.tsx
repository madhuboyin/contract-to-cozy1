'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { 
  CheckCircle2, 
  Loader2, 
  ArrowRight, 
  Sparkles,
  ShieldCheck,
  Building,
  PencilLine,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api/client';
import { useToast } from '@/components/ui/use-toast';
import { motion } from 'framer-motion';
import { track } from '@/lib/analytics/events';
import { addressOnlyPropertyData, onboardingAddressError } from '@/lib/onboarding/addressIntegrity';

/**
 * ConfirmOnboardingPage handles the final conversion.
 * It takes the lookup data and creates the real property record 
 * in the user's account.
 */
export default function ConfirmOnboardingPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [data, setData] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [editingAddress, setEditingAddress] = useState(false);
  const [savingAddress, setSavingAddress] = useState(false);
  const [addressDraft, setAddressDraft] = useState({ address: '', city: '', state: '', zipCode: '' });

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/onboarding-lookup-session', {
          method: 'GET',
          cache: 'no-store',
        });
        if (!res.ok) {
          router.push('/onboarding/address');
          return;
        }
        const payload = await res.json();
        setData(payload.data);
        setAddressDraft({
          address: payload.data.address ?? '',
          city: payload.data.city ?? '',
          state: payload.data.state ?? '',
          zipCode: payload.data.zipCode ?? '',
        });
      } catch {
        router.push('/onboarding/address');
      }
    })();
  }, [router]);

  const saveAddressCorrection = async () => {
    const validationError = onboardingAddressError(addressDraft);
    if (validationError) {
      toast({ title: 'Complete the address', description: validationError, variant: 'destructive' });
      return;
    }
    const correctedData = {
      ...data,
      ...addressOnlyPropertyData(addressDraft),
      addressSource: 'MANUAL',
    };
    setSavingAddress(true);
    try {
      const response = await fetch('/api/onboarding-lookup-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: correctedData }),
      });
      if (!response.ok) throw new Error('Unable to save corrected address');
      setData(correctedData);
      setEditingAddress(false);
      toast({ title: 'Address updated', description: 'Public property facts were cleared so they cannot be applied to the wrong home.' });
    } catch {
      toast({ title: 'Unable to update address', description: 'Please try again.', variant: 'destructive' });
    } finally {
      setSavingAddress(false);
    }
  };

  const handleConfirm = async () => {
    if (!data) return;

    setSubmitting(true);
    try {
      // Create the real property from the lookup data
      const response = await api.createProperty({
        address: data.address,
        city: data.city,
        state: data.state,
        zipCode: data.zipCode,
        yearBuilt: data.yearBuilt,
        propertySize: data.propertySize,
        dwellingType: data.dwellingType || undefined,
        isPrimary: true,
        // Pre-populate other fields found during lookup
        purchasePriceCents: data.lastSalePrice,
        purchaseDate: data.lastSaleDate,
      });

      if (response.success) {
        const propertyId = response.data?.id;
        if (!propertyId || !data.activationContext) {
          throw new Error('Trigger-first activation context is missing.');
        }
        const contextResponse = await api.captureEntryContext(propertyId, data.activationContext);
        if (!contextResponse.success) {
          throw new Error(contextResponse.message || 'Unable to save activation context.');
        }
        setSuccess(true);
        await fetch('/api/onboarding-lookup-session', { method: 'DELETE' });
        const buyerJourney = data.activationContext.entryPath === 'EXISTING_HOME_PURCHASE';
        toast({
          title: buyerJourney ? 'Buyer plan created' : 'Home added',
          description: buyerJourney ? 'Your closing journey is ready.' : 'Your first action is ready.',
        });

        track('property_claimed', {
          zipCode: data.zipCode,
          yearBuilt: data.yearBuilt || 0,
          source: data.addressSource === 'MANUAL' ? 'MANUAL' : 'API'
        });

        const startedAt = Number(sessionStorage.getItem('onboarding_started_at'));
        if (propertyId) {
          track('property_onboarded', {
            propertyId,
            durationSeconds: startedAt ? Math.max(0, Math.round((Date.now() - startedAt) / 1000)) : 0,
          });
        }
        sessionStorage.removeItem('onboarding_started_at');

        // Brief celebration delay before redirecting to dashboard
        setTimeout(() => router.push(`/onboarding/first-value?propertyId=${encodeURIComponent(propertyId)}`), 1200);
      } else {
        toast({
          title: "Setup failed",
          description: response.message || "We couldn't claim your home. Please try again.",
          variant: "destructive"
        });
      }
    } catch (error: any) {
      console.error('Confirm error:', error);
      track('api_error_encountered', {
        endpoint: '/api/properties',
        statusCode: 500,
        message: error.message || 'Property creation failed'
      });
      toast({
        title: "Error",
        description: "An unexpected error occurred.",
        variant: "destructive"
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (!data) return null;
  const isBuyerJourney = data.activationContext?.entryPath === 'EXISTING_HOME_PURCHASE';

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-100 p-8 text-center"
      >
        {success ? (
          <div className="space-y-6 py-8">
            <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="h-10 w-10 text-emerald-600" />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-slate-900">{isBuyerJourney ? 'Your closing plan is ready.' : 'Welcome Home.'}</h1>
              <p className="text-slate-500">
                {isBuyerJourney
                  ? 'We saved your stage, known dates, and inspection status before preparing your next action.'
                  : 'We saved what brought you here and prepared an evidence-bounded first action.'}
              </p>
            </div>
            <Loader2 className="h-6 w-6 animate-spin text-brand-600 mx-auto" />
          </div>
        ) : (
          <div className="space-y-8">
            <div className="space-y-2">
              <div className="w-12 h-12 bg-brand-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Building className="h-6 w-6 text-brand-600" />
              </div>
              <h1 className="text-2xl font-bold text-slate-900">{isBuyerJourney ? 'Confirm this purchase' : 'Confirm this home'}</h1>
              <p className="text-slate-500">
                {isBuyerJourney
                  ? 'We’ll create the property-scoped closing plan before showing your first action.'
                  : 'We’ll connect the address to your selected goal and show the next useful action.'}
              </p>
            </div>

            <div className="bg-slate-50 rounded-2xl p-4 text-left border border-slate-100">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-xs font-bold text-slate-500 tracking-normal">Property Address</p>
                {!editingAddress && (
                  <button
                    type="button"
                    onClick={() => setEditingAddress(true)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 underline underline-offset-4"
                  >
                    <PencilLine className="h-3.5 w-3.5" /> Edit address
                  </button>
                )}
              </div>
              {editingAddress ? (
                <div className="space-y-3">
                  <label className="block space-y-1 text-xs font-semibold text-slate-600">
                    Street address
                    <Input value={addressDraft.address} onChange={(event) => setAddressDraft((current) => ({ ...current, address: event.target.value }))} autoComplete="street-address" />
                  </label>
                  <label className="block space-y-1 text-xs font-semibold text-slate-600">
                    City
                    <Input value={addressDraft.city} onChange={(event) => setAddressDraft((current) => ({ ...current, city: event.target.value }))} autoComplete="address-level2" />
                  </label>
                  <div className="grid grid-cols-[96px_1fr] gap-3">
                    <label className="block space-y-1 text-xs font-semibold text-slate-600">
                      State
                      <Input value={addressDraft.state} onChange={(event) => setAddressDraft((current) => ({ ...current, state: event.target.value.replace(/[^A-Za-z]/g, '').slice(0, 2) }))} autoComplete="address-level1" />
                    </label>
                    <label className="block space-y-1 text-xs font-semibold text-slate-600">
                      ZIP code
                      <Input value={addressDraft.zipCode} onChange={(event) => setAddressDraft((current) => ({ ...current, zipCode: event.target.value.replace(/\D/g, '').slice(0, 5) }))} autoComplete="postal-code" inputMode="numeric" />
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" size="sm" onClick={() => void saveAddressCorrection()} disabled={savingAddress}>
                      {savingAddress ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save address'}
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => {
                      setAddressDraft({ address: data.address, city: data.city, state: data.state, zipCode: data.zipCode });
                      setEditingAddress(false);
                    }} disabled={savingAddress}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="font-bold text-slate-900">{data.address}</p>
                  <p className="text-sm text-slate-600">{data.city}, {data.state} {data.zipCode}</p>
                  {data.addressSource !== 'LOOKUP' && (
                    <p className="mt-2 text-xs font-medium text-brand-700">Address confirmed · public property facts remain unknown</p>
                  )}
                </>
              )}
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-3 text-left">
                <ShieldCheck className="h-5 w-5 text-emerald-600 shrink-0" />
                <p className="text-sm text-slate-600">Privacy-first data encryption</p>
              </div>
              <div className="flex items-center gap-3 text-left">
                <Sparkles className="h-5 w-5 text-purple-600 shrink-0" />
                <p className="text-sm text-slate-600">Guidance limited to the evidence we actually have</p>
              </div>
            </div>

            <Button 
              className="w-full h-14 rounded-2xl bg-brand-600 hover:bg-brand-700 text-white font-bold text-lg transition-all"
              onClick={handleConfirm}
              disabled={submitting || editingAddress}
            >
              {submitting ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <>
                  {isBuyerJourney ? 'Create my closing plan' : 'Add home and see first action'}
                  <ArrowRight className="ml-2 h-5 w-5" />
                </>
              )}
            </Button>

            <p className="text-xs text-slate-400">
              By continuing, you agree to our Terms of Service and Privacy Policy.
            </p>
          </div>
        )}
      </motion.div>
    </div>
  );
}
