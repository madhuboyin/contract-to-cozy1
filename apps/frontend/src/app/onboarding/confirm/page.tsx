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
import { api, isAmbiguousNetworkError } from '@/lib/api/client';
import { useToast } from '@/components/ui/use-toast';
import { motion } from 'framer-motion';
import { track } from '@/lib/analytics/events';
import { addressOnlyPropertyData, onboardingAddressError, sameOnboardingAddress } from '@/lib/onboarding/addressIntegrity';
import { buildConfirmedPropertyCreatePayload } from '@/lib/onboarding/propertySetupPayload';
import {
  clearOnboardingLookupSession,
  persistCommittedOnboardingProperty,
} from '@/lib/onboarding/onboardingSessionClient';
import { DWELLING_TYPE_LABELS, DWELLING_TYPE_OPTIONS } from '@/lib/property/propertyContextForm';
import type { BasementConfiguration, DwellingType, Property } from '@/types';
import type { PropertyEnrichmentStatus } from '@/lib/api/client';

type HomeProfileDraft = {
  dwellingType: DwellingType;
  yearBuilt: string;
  propertySize: string;
  bedrooms: string;
  bathrooms: string;
  basementConfiguration: BasementConfiguration;
  hasPoolOrSpa: 'YES' | 'NO' | 'UNKNOWN';
};

const EMPTY_HOME_PROFILE: HomeProfileDraft = {
  dwellingType: 'UNKNOWN',
  yearBuilt: '',
  propertySize: '',
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
 * It takes the confirmed address and explicit user inputs and creates the Property
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
  const [addressDraft, setAddressDraft] = useState({ address: '', unit: '', city: '', state: '', zipCode: '' });
  const [homeProfile, setHomeProfile] = useState<HomeProfileDraft>(EMPTY_HOME_PROFILE);
  const [committedPropertyId, setCommittedPropertyId] = useState<string | null>(null);
  const [enrichedProperty, setEnrichedProperty] = useState<Property | null>(null);
  const [enrichmentStatus, setEnrichmentStatus] = useState<PropertyEnrichmentStatus['status']>(null);
  const [checkingEnrichment, setCheckingEnrichment] = useState(false);
  const [enrichmentRefreshVersion, setEnrichmentRefreshVersion] = useState(0);

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
        setCommittedPropertyId(payload.data.committedPropertyId ?? null);
        setAddressDraft({
          address: payload.data.address ?? '',
          unit: payload.data.unit ?? '',
          city: payload.data.city ?? '',
          state: payload.data.state ?? '',
          zipCode: payload.data.zipCode ?? '',
        });
        setHomeProfile({
          dwellingType: dwellingTypeDraft(payload.data.dwellingType),
          yearBuilt: numericDraft(payload.data.yearBuilt),
          propertySize: numericDraft(payload.data.propertySize),
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

  useEffect(() => {
    if (!committedPropertyId) return;
    let active = true;
    const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));
    (async () => {
      setCheckingEnrichment(true);
      try {
        for (let attempt = 0; attempt < 7 && active; attempt += 1) {
          const [statusResponse, propertyResponse] = await Promise.all([
            api.getPropertyEnrichmentStatus(committedPropertyId),
            api.getProperty(committedPropertyId),
          ]);
          if (!active) return;
          const status = statusResponse.success ? statusResponse.data.status : null;
          setEnrichmentStatus(status);
          if (propertyResponse.success && propertyResponse.data) {
            const property = propertyResponse.data;
            setEnrichedProperty(property);
            setHomeProfile((current) => ({
              ...current,
              dwellingType: current.dwellingType === 'UNKNOWN' ? dwellingTypeDraft(property.dwellingType) : current.dwellingType,
              yearBuilt: current.yearBuilt || numericDraft(property.yearBuilt),
              propertySize: current.propertySize || numericDraft(property.propertySize),
              bedrooms: current.bedrooms || numericDraft(property.bedrooms),
              bathrooms: current.bathrooms || numericDraft(property.bathrooms),
              basementConfiguration: current.basementConfiguration === 'UNKNOWN'
                ? property.basementConfiguration
                : current.basementConfiguration,
              hasPoolOrSpa: current.hasPoolOrSpa === 'UNKNOWN'
                ? property.exteriorProfile?.hasPoolOrSpa === true ? 'YES'
                  : property.exteriorProfile?.hasPoolOrSpa === false ? 'NO' : 'UNKNOWN'
                : current.hasPoolOrSpa,
            }));
          }
          if (['MATCHED', 'NO_MATCH', 'AMBIGUOUS', 'FAILED', 'NOT_CONFIGURED'].includes(String(status))) break;
          await wait(800);
        }
      } catch (error) {
        console.warn('Unable to refresh property details after setup:', error);
      } finally {
        if (active) setCheckingEnrichment(false);
      }
    })();
    return () => { active = false; };
  }, [committedPropertyId, enrichmentRefreshVersion]);

  const saveAddressCorrection = async () => {
    const validationError = onboardingAddressError(addressDraft);
    if (validationError) {
      toast({ title: 'Complete the address', description: validationError, variant: 'destructive' });
      return;
    }
    const correctedData = {
      ...data,
      ...addressOnlyPropertyData(addressDraft),
      // Explicitly clear a previously resolved subpremise when the homeowner
      // removes it; the normalized address object omits empty optional fields.
      unit: addressDraft.unit.trim() || null,
      addressSource: 'MANUAL',
    };
    setSavingAddress(true);
    try {
      if (committedPropertyId) {
        const normalized = addressOnlyPropertyData(addressDraft);
        const propertyResponse = await api.updateProperty(committedPropertyId, {
          ...normalized,
          unit: normalized.unit ?? null,
        });
        if (!propertyResponse.success) throw new Error(propertyResponse.message || 'Unable to update the saved home address');
      }
      const response = await fetch('/api/onboarding-lookup-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: correctedData }),
      });
      if (!response.ok) throw new Error('Unable to save corrected address');
      setData(correctedData);
      setHomeProfile(EMPTY_HOME_PROFILE);
      setEnrichedProperty(null);
      setEnrichmentStatus(null);
      setEnrichmentRefreshVersion((current) => current + 1);
      setEditingAddress(false);
      toast({ title: 'Address updated', description: 'Review any optional home details before continuing.' });
    } catch {
      toast({ title: 'Unable to update address', description: 'Please try again.', variant: 'destructive' });
    } finally {
      setSavingAddress(false);
    }
  };

  const handleConfirm = async () => {
    if (!data) return;

    const activationContext = data.activationContext;
    if (!activationContext) {
      toast({
        title: 'Setup context is missing',
        description: 'Return to the previous step and choose what brought you here before adding the home.',
        variant: 'destructive',
      });
      return;
    }
    const yearBuilt = optionalNumber(homeProfile.yearBuilt);
    const propertySize = optionalNumber(homeProfile.propertySize);
    const bedrooms = optionalNumber(homeProfile.bedrooms);
    const bathrooms = optionalNumber(homeProfile.bathrooms);
    const currentYear = new Date().getFullYear();
    if (yearBuilt !== undefined && (!Number.isInteger(yearBuilt) || yearBuilt < 1700 || yearBuilt > currentYear + 1)) {
      toast({ title: 'Check the year built', description: `Enter a year from 1700 to ${currentYear + 1}, or leave it blank.`, variant: 'destructive' });
      return;
    }
    if (propertySize !== undefined && (!Number.isFinite(propertySize) || propertySize <= 0 || propertySize > 1_000_000)) {
      toast({ title: 'Check the square footage', description: 'Enter a positive square-foot value, or leave it blank.', variant: 'destructive' });
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

    let propertyWasCommitted = Boolean(committedPropertyId);
    setSubmitting(true);
    try {
      let propertyId = committedPropertyId;
      let recoveredCommittedCreate = false;

      if (!propertyId) {
        try {
          const response = await api.createProperty(buildConfirmedPropertyCreatePayload(data, {
            ...homeProfile,
            yearBuilt,
            propertySize,
            bedrooms,
            bathrooms,
          }));
          if (!response.success || !response.data?.id) {
            throw new Error(response.message || "We couldn't claim your home. Please try again.");
          }
          propertyId = response.data.id;
        } catch (createError) {
          if (!isAmbiguousNetworkError(createError)) throw createError;
          const propertiesResponse = await api.getProperties({ force: true });
          propertyId = propertiesResponse.success
            ? propertiesResponse.data?.properties?.find((property) => sameOnboardingAddress(property, data))?.id ?? null
            : null;
          if (!propertyId) throw createError;
          recoveredCommittedCreate = true;
        }

        setCommittedPropertyId(propertyId);
        propertyWasCommitted = true;
        setData((current: Record<string, unknown> | null) => current
          ? { ...current, committedPropertyId: propertyId }
          : current);
      }

      // Retry this write on every confirmation attempt so a transient session failure can heal.
      await persistCommittedOnboardingProperty(data, propertyId);

      const propertyChanges: Parameters<typeof api.updateProperty>[1] = {};
      if (homeProfile.dwellingType !== 'UNKNOWN' && homeProfile.dwellingType !== enrichedProperty?.dwellingType) {
        propertyChanges.dwellingType = homeProfile.dwellingType;
      }
      if (yearBuilt !== undefined && yearBuilt !== enrichedProperty?.yearBuilt) propertyChanges.yearBuilt = yearBuilt;
      if (propertySize !== undefined && propertySize !== enrichedProperty?.propertySize) propertyChanges.propertySize = propertySize;
      if (bedrooms !== undefined && bedrooms !== enrichedProperty?.bedrooms) propertyChanges.bedrooms = bedrooms;
      if (bathrooms !== undefined && bathrooms !== enrichedProperty?.bathrooms) propertyChanges.bathrooms = bathrooms;
      if (homeProfile.basementConfiguration !== 'UNKNOWN' && homeProfile.basementConfiguration !== enrichedProperty?.basementConfiguration) {
        propertyChanges.basementConfiguration = homeProfile.basementConfiguration;
      }
      if (homeProfile.hasPoolOrSpa !== 'UNKNOWN') {
        const hasPoolOrSpa = homeProfile.hasPoolOrSpa === 'YES';
        if (hasPoolOrSpa !== enrichedProperty?.exteriorProfile?.hasPoolOrSpa) {
          propertyChanges.exteriorProfile = { ...enrichedProperty?.exteriorProfile, hasPoolOrSpa };
        }
      }
      if (Object.keys(propertyChanges).length > 0) {
        const updateResponse = await api.updateProperty(propertyId, propertyChanges);
        if (!updateResponse.success) throw new Error(updateResponse.message || 'Unable to save confirmed property details.');
      }

      const contextResponse = await api.captureEntryContext(propertyId, activationContext);
      if (!contextResponse.success) {
        throw new Error(contextResponse.message || 'Unable to save activation context.');
      }

      setSuccess(true);
      const buyerJourney = activationContext.entryPath === 'EXISTING_HOME_PURCHASE';
      toast({
        title: buyerJourney ? 'Buyer plan created' : 'Home added',
        description: recoveredCommittedCreate
          ? 'We found the saved home and continued without creating a duplicate.'
          : buyerJourney ? 'Your closing journey is ready.' : 'Your first action is ready.',
      });

      const startedAt = Number(sessionStorage.getItem('onboarding_started_at'));
      track('property_onboarded', {
        propertyId,
        durationSeconds: startedAt ? Math.max(0, Math.round((Date.now() - startedAt) / 1000)) : 0,
      });
      sessionStorage.removeItem('onboarding_started_at');

      let destination = `/dashboard?propertyId=${encodeURIComponent(propertyId)}`;
      if (activationContext.activeTrigger.type !== 'NONE_EXPLORING') {
        const firstValueResponse = await api.getActivationFirstValue(propertyId);
        if (firstValueResponse.success && firstValueResponse.data) {
          destination = firstValueResponse.data.buyer?.planHref
            ?? firstValueResponse.data.action.primaryCta.href;
        }
      }

      // Continue directly into the actionable property workflow. The former
      // standalone first-value page repeated this same action before routing.
      router.push(destination);
      void clearOnboardingLookupSession();
    } catch (error: any) {
      console.error('Confirm error:', error);
      track('api_error_encountered', {
        endpoint: propertyWasCommitted ? '/api/properties/:propertyId/onboarding/entry-context' : '/api/properties',
        statusCode: 500,
        message: error.message || 'Property creation failed'
      });
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "An unexpected error occurred.",
        variant: "destructive"
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (!data) return null;
  const isBuyerJourney = data.activationContext?.entryPath === 'EXISTING_HOME_PURCHASE';
  const displayedYearBuilt = Number(homeProfile.yearBuilt);
  const propertyInsight = enrichmentStatus === 'MATCHED' && Number.isInteger(displayedYearBuilt)
    ? `Built about ${Math.max(0, new Date().getFullYear() - displayedYearBuilt)} years ago — we’ll prioritize age-relevant systems and maintenance.`
    : enrichmentStatus === 'MATCHED' && homeProfile.propertySize
      ? `${Number(homeProfile.propertySize).toLocaleString()} sq ft can now inform project scope and maintenance planning.`
      : null;

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
              <h1 className="text-2xl font-bold text-slate-900">Review your home details</h1>
              <p className="text-slate-500">
                {isBuyerJourney
                  ? 'Confirm the public-record details we found, then open your closing plan.'
                  : 'Confirm what we found, correct anything that is wrong, then continue to your home workspace.'}
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
                    Unit or apartment <span className="font-normal text-slate-400">(optional)</span>
                    <Input value={addressDraft.unit} onChange={(event) => setAddressDraft((current) => ({ ...current, unit: event.target.value.slice(0, 50) }))} autoComplete="address-line2" maxLength={50} />
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
                      setAddressDraft({ address: data.address, unit: data.unit ?? '', city: data.city, state: data.state, zipCode: data.zipCode });
                      setEditingAddress(false);
                    }} disabled={savingAddress}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="font-bold text-slate-900">{data.address}</p>
                  {data.unit && <p className="text-sm text-slate-600">{data.unit}</p>}
                  <p className="text-sm text-slate-600">{data.city}, {data.state} {data.zipCode}</p>
                  <p className="mt-2 text-xs font-medium text-brand-700">Address confirmed · add only the home details you know</p>
                </>
              )}
            </div>

            <div className="rounded-2xl border border-brand-200 bg-brand-50 p-5 text-left" aria-live="polite">
              <div className="flex items-start gap-3">
                {checkingEnrichment
                  ? <Loader2 className="mt-0.5 h-5 w-5 animate-spin text-brand-700" />
                  : <Sparkles className="mt-0.5 h-5 w-5 text-brand-700" />}
                <div>
                  <p className="font-bold text-brand-950">
                    {checkingEnrichment ? 'Finding available property details…' : enrichmentStatus === 'MATCHED'
                      ? 'Public-record details found'
                      : enrichmentStatus === 'PENDING' || enrichmentStatus === null
                        ? 'Property lookup is continuing in the background'
                        : 'Public-record lookup complete'}
                  </p>
                  <p className="mt-1 text-sm text-brand-900">
                    {checkingEnrichment
                      ? 'You can continue at any time; this lookup will not block setup.'
                      : enrichmentStatus === 'MATCHED'
                        ? 'Review the details below. We save only the corrections you make.'
                        : enrichmentStatus === 'PENDING' || enrichmentStatus === null
                          ? 'Continue now or add only what you know. Any later match will update your home record.'
                        : enrichmentStatus === 'NOT_CONFIGURED'
                          ? 'Automatic property details are not configured right now. Add only what you know.'
                          : enrichmentStatus === 'AMBIGUOUS'
                            ? 'We found more than one possible record, so we did not guess.'
                            : 'We could not confidently match this address. Add only what you know.'}
                  </p>
                  {propertyInsight && (
                    <p className="mt-3 rounded-xl bg-white/80 px-3 py-2 text-sm font-semibold text-brand-950">
                      First useful insight: {propertyInsight}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm">
              <div className="mb-4">
                <p className="font-bold text-slate-900">Confirm the available details</p>
                <p className="mt-1 text-sm text-slate-500">
                  Correct anything that is wrong, or leave unknown fields blank.
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
                  Square footage <span className="font-normal text-slate-500">(optional)</span>
                  <Input
                    type="number"
                    min={1}
                    max={1000000}
                    inputMode="numeric"
                    placeholder="e.g., 2200"
                    value={homeProfile.propertySize}
                    onChange={(event) => setHomeProfile((current) => ({ ...current, propertySize: event.target.value }))}
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
                  {isBuyerJourney ? 'Confirm and open my closing plan' : 'Confirm and continue'}
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
