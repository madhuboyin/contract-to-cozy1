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
import { DWELLING_TYPE_LABELS, DWELLING_TYPE_OPTIONS } from '@/lib/property/propertyContextForm';
import type { BasementConfiguration, DwellingType } from '@/types';

type HomeProfileDraft = {
  dwellingType: DwellingType;
  yearBuilt: string;
  bedrooms: string;
  bathrooms: string;
  basementConfiguration: BasementConfiguration;
  hasPoolOrSpa: 'YES' | 'NO' | 'UNKNOWN';
};

const EMPTY_HOME_PROFILE: HomeProfileDraft = {
  dwellingType: 'UNKNOWN',
  yearBuilt: '',
  bedrooms: '',
  bathrooms: '',
  basementConfiguration: 'UNKNOWN',
  hasPoolOrSpa: 'UNKNOWN',
};

function numericDraft(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
}

function dwellingTypeDraft(value: unknown): DwellingType {
  return typeof value === 'string' && (DWELLING_TYPE_OPTIONS as readonly string[]).includes(value)
    ? value as DwellingType
    : 'UNKNOWN';
}

function optionalNumber(value: string): number | undefined {
  return value.trim() === '' ? undefined : Number(value);
}

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
  const [homeProfile, setHomeProfile] = useState<HomeProfileDraft>(EMPTY_HOME_PROFILE);

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
        setHomeProfile({
          dwellingType: dwellingTypeDraft(payload.data.dwellingType),
          yearBuilt: numericDraft(payload.data.yearBuilt),
          bedrooms: numericDraft(payload.data.bedrooms),
          bathrooms: numericDraft(payload.data.bathrooms),
          basementConfiguration: ['NONE', 'UNFINISHED', 'FINISHED', 'UNKNOWN'].includes(payload.data.basementConfiguration)
            ? payload.data.basementConfiguration
            : 'UNKNOWN',
          hasPoolOrSpa: payload.data.hasPoolOrSpa === true ? 'YES' : payload.data.hasPoolOrSpa === false ? 'NO' : 'UNKNOWN',
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
      setHomeProfile(EMPTY_HOME_PROFILE);
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

    const yearBuilt = optionalNumber(homeProfile.yearBuilt);
    const bedrooms = optionalNumber(homeProfile.bedrooms);
    const bathrooms = optionalNumber(homeProfile.bathrooms);
    const currentYear = new Date().getFullYear();
    if (yearBuilt !== undefined && (!Number.isInteger(yearBuilt) || yearBuilt < 1700 || yearBuilt > currentYear + 1)) {
      toast({ title: 'Check the year built', description: `Enter a year from 1700 to ${currentYear + 1}, or leave it blank.`, variant: 'destructive' });
      return;
    }
    if (bedrooms !== undefined && (!Number.isInteger(bedrooms) || bedrooms <= 0 || bedrooms > 99)) {
      toast({ title: 'Check the bedrooms', description: 'Enter a whole number greater than zero, or leave it blank.', variant: 'destructive' });
      return;
    }
    if (bathrooms !== undefined && (bathrooms <= 0 || bathrooms > 99)) {
      toast({ title: 'Check the bathrooms', description: 'Enter a number greater than zero, or leave it blank.', variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    try {
      // Create the real property from the lookup data
      const response = await api.createProperty({
        address: data.address,
        city: data.city,
        state: data.state,
        zipCode: data.zipCode,
        yearBuilt,
        propertySize: typeof data.propertySize === 'number' ? data.propertySize : undefined,
        dwellingType: homeProfile.dwellingType,
        bedrooms,
        bathrooms,
        basementConfiguration: homeProfile.basementConfiguration,
        exteriorProfile: {
          hasPoolOrSpa: homeProfile.hasPoolOrSpa === 'UNKNOWN' ? null : homeProfile.hasPoolOrSpa === 'YES',
        },
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
          yearBuilt: yearBuilt || 0,
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
        className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-100 p-8 text-center"
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

            <div className="rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm">
              <div className="mb-4">
                <p className="font-bold text-slate-900">A few details for better guidance</p>
                <p className="mt-1 text-sm text-slate-500">
                  We use these to tailor inspection questions and age-specific reminders. Estimates are fine.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1.5 text-sm font-semibold text-slate-700">
                  Home type
                  <select
                    value={homeProfile.dwellingType}
                    onChange={(event) => setHomeProfile((current) => ({ ...current, dwellingType: event.target.value as DwellingType }))}
                    className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-base font-normal text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
                  >
                    {DWELLING_TYPE_OPTIONS.map((type) => (
                      <option key={type} value={type}>{DWELLING_TYPE_LABELS[type]}</option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1.5 text-sm font-semibold text-slate-700">
                  Approximate year built <span className="font-normal text-slate-500">(optional)</span>
                  <Input
                    type="number"
                    min={1700}
                    max={new Date().getFullYear() + 1}
                    inputMode="numeric"
                    placeholder="e.g., 1998"
                    value={homeProfile.yearBuilt}
                    onChange={(event) => setHomeProfile((current) => ({ ...current, yearBuilt: event.target.value }))}
                  />
                </label>
                <label className="space-y-1.5 text-sm font-semibold text-slate-700">
                  Bedrooms <span className="font-normal text-slate-500">(optional)</span>
                  <Input
                    type="number"
                    min={1}
                    max={99}
                    inputMode="numeric"
                    placeholder="e.g., 3"
                    value={homeProfile.bedrooms}
                    onChange={(event) => setHomeProfile((current) => ({ ...current, bedrooms: event.target.value }))}
                  />
                </label>
                <label className="space-y-1.5 text-sm font-semibold text-slate-700">
                  Bathrooms <span className="font-normal text-slate-500">(optional)</span>
                  <Input
                    type="number"
                    min={0.5}
                    max={99}
                    step={0.5}
                    inputMode="decimal"
                    placeholder="e.g., 2.5"
                    value={homeProfile.bathrooms}
                    onChange={(event) => setHomeProfile((current) => ({ ...current, bathrooms: event.target.value }))}
                  />
                </label>
                <label className="space-y-1.5 text-sm font-semibold text-slate-700">
                  Basement <span className="font-normal text-slate-500">(optional)</span>
                  <select
                    value={homeProfile.basementConfiguration}
                    onChange={(event) => setHomeProfile((current) => ({ ...current, basementConfiguration: event.target.value as BasementConfiguration }))}
                    className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-base font-normal text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
                  >
                    <option value="UNKNOWN">I’m not sure</option>
                    <option value="NONE">No basement</option>
                    <option value="UNFINISHED">Unfinished basement</option>
                    <option value="FINISHED">Finished basement</option>
                  </select>
                </label>
                <label className="space-y-1.5 text-sm font-semibold text-slate-700">
                  Pool or spa <span className="font-normal text-slate-500">(optional)</span>
                  <select
                    value={homeProfile.hasPoolOrSpa}
                    onChange={(event) => setHomeProfile((current) => ({ ...current, hasPoolOrSpa: event.target.value as HomeProfileDraft['hasPoolOrSpa'] }))}
                    className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-base font-normal text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
                  >
                    <option value="UNKNOWN">I’m not sure</option>
                    <option value="NO">No</option>
                    <option value="YES">Yes</option>
                  </select>
                </label>
              </div>
              <p className="mt-3 text-xs text-slate-500">Not sure? Choose “I’m not sure” for home type and leave the other fields blank.</p>
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
