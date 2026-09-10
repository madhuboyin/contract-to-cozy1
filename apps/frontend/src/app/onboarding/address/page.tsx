'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Home, Sparkles, ArrowRight, Zap, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { motion } from 'framer-motion';
import { track } from '@/lib/analytics/events';
import { api, isAmbiguousNetworkError } from '@/lib/api/client';
import { ErrorBoundary } from '@/components/system/ErrorBoundary';
import { AddressAutocomplete } from '@/components/property/AddressAutocomplete';
import {
  addressOnlyPropertyData,
  normalizeOnboardingAddress,
  onboardingAddressError,
  sameOnboardingAddress,
  type OnboardingAddressSource,
} from '@/lib/onboarding/addressIntegrity';
import { persistCommittedOnboardingProperty } from '@/lib/onboarding/onboardingSessionClient';
import {
  buildOnboardingActivationContext,
  ONBOARDING_TRIGGER_OPTIONS,
  onboardingTriggerOptionsForSituation,
  type BuyerInspectionStatus,
  type BuyerPurchaseStage,
  type OnboardingSituation as Situation,
  type OnboardingTriggerType as TriggerType,
} from '@/lib/onboarding/onboardingEntryContext';

/**
 * AddressOnboardingPage is the first "Wow" moment.
 * It eliminates the data entry wall by allowing users to simply
 * enter or select a complete address and continue without provider latency.
 */
export default function AddressOnboardingPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [address, setAddress] = useState('');
  const [unit, setUnit] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [addressResolved, setAddressResolved] = useState(false);
  const [situation, setSituation] = useState<Situation | null>(null);
  const [triggerType, setTriggerType] = useState<TriggerType | null>(null);
  const [triggerDetail, setTriggerDetail] = useState('');
  const [buyerPurchaseStage, setBuyerPurchaseStage] = useState<BuyerPurchaseStage>('UNDER_CONTRACT');
  const [buyerInspectionStatus, setBuyerInspectionStatus] = useState<BuyerInspectionStatus>('NOT_SCHEDULED');
  const [targetCloseDate, setTargetCloseDate] = useState('');
  const [moveInDate, setMoveInDate] = useState('');
  const [buyerConcern, setBuyerConcern] = useState('');

  // Mount tracking
  React.useEffect(() => {
    track('landing_page_viewed', { source: 'onboarding_address', deviceType: 'web' });
    // Marks the start of the onboarding flow — read back at completion in
    // /onboarding/confirm to compute property_onboarded's durationSeconds.
    if (!sessionStorage.getItem('onboarding_started_at')) {
      sessionStorage.setItem('onboarding_started_at', String(Date.now()));
    }
  }, []);

  const buildActivationContext = () => {
    if (!situation) throw new Error('Choose where you are in the home journey.');
    const selectedTrigger = ONBOARDING_TRIGGER_OPTIONS.find((option) => option.type === triggerType);
    return buildOnboardingActivationContext({
      situation,
      triggerType,
      triggerLabel: selectedTrigger?.label,
      triggerDetail,
      buyerPurchaseStage,
      buyerInspectionStatus,
      targetCloseDate,
      moveInDate,
      buyerConcern,
    });
  };

  const prepareConfirmation = async (
    propertyData: ReturnType<typeof addressOnlyPropertyData>,
    source: OnboardingAddressSource,
  ) => {
    const selectedSituation = situation;
    if (!selectedSituation) throw new Error('Choose where you are in the home journey.');
    const activationContext = buildActivationContext();
    const sessionData = { ...propertyData, activationContext, addressSource: source };
    const sessionRes = await fetch('/api/onboarding-lookup-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: sessionData }),
    });
    if (!sessionRes.ok) throw new Error('Unable to prepare onboarding session');

    // A Property must exist before enrichment can be queued. Commit the minimal,
    // normalized address here, then let the confirmation screen poll the
    // first-party status endpoint while the worker calls RentCast.
    const propertiesResponse = await api.getProperties({ force: true });
    let propertyId = propertiesResponse.success
      ? propertiesResponse.data?.properties?.find((property) => sameOnboardingAddress(property, propertyData))?.id ?? null
      : null;
    if (!propertyId) {
      try {
        const createResponse = await api.createProperty({
          address: String(propertyData.address),
          unit: typeof propertyData.unit === 'string' ? propertyData.unit : null,
          city: String(propertyData.city),
          state: String(propertyData.state),
          zipCode: String(propertyData.zipCode),
          isPrimary: true,
        });
        if (!createResponse.success || !createResponse.data?.id) {
          throw new Error(createResponse.message || 'Unable to add this home.');
        }
        propertyId = createResponse.data.id;
      } catch (createError) {
        if (!isAmbiguousNetworkError(createError)) throw createError;
        const recovery = await api.getProperties({ force: true });
        propertyId = recovery.success
          ? recovery.data?.properties?.find((property) => sameOnboardingAddress(property, propertyData))?.id ?? null
          : null;
        if (!propertyId) throw createError;
      }
    }
    const persisted = await persistCommittedOnboardingProperty(sessionData, propertyId);
    if (!persisted) {
      throw new Error('Your home was saved, but setup could not continue. Please try again.');
    }
    track('active_trigger_selected', {
      triggerType: activationContext.activeTrigger.type,
      situation: selectedSituation,
    });
    track('property_claimed', {
      zipCode: propertyData.zipCode,
      yearBuilt: 0,
      source: source === 'MANUAL' ? 'MANUAL' : 'API',
    });
    router.push('/onboarding/confirm');
  };

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!situation) return;
    const submittedAddress = normalizeOnboardingAddress({ address, unit, city, state, zipCode });
    const validationError = onboardingAddressError(submittedAddress);
    if (validationError) {
      toast({ title: 'Complete the address', description: validationError, variant: 'destructive' });
      return;
    }
    setLoading(true);
    track('address_lookup_started', { source: 'onboarding_page' });
    if (!addressResolved) track('address_entered_manually', { source: 'onboarding_page' });

    const addressSource: OnboardingAddressSource = addressResolved ? 'AUTOCOMPLETE' : 'MANUAL';
    const propertyData = addressOnlyPropertyData(submittedAddress);

    try {
      await prepareConfirmation(propertyData, addressSource);
    } catch (error) {
      console.error('Onboarding setup error:', error);
      toast({
        title: 'Unable to continue',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <ErrorBoundary 
      fallback={
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
          <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mb-6">
            <Zap className="h-8 w-8 text-rose-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Onboarding Temporarily Unavailable</h1>
          <p className="text-slate-500 mt-2 max-w-sm mx-auto">
            We couldn&apos;t prepare home setup. Please refresh the page or try again in a few minutes.
          </p>
          <Button className="mt-8 rounded-xl h-12 px-8" onClick={() => window.location.reload()}>
            Refresh Page
          </Button>
        </div>
      }
    >
      <div className="min-h-screen bg-slate-50 flex flex-col items-center px-4 py-7 sm:px-6 sm:py-10">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-2xl space-y-6 text-center"
        >
          {/* Branding */}
          <div className="flex flex-col items-center gap-2">
            <div className="w-12 h-12 bg-brand-600 rounded-2xl shadow-lg shadow-brand-200 flex items-center justify-center rotate-3">
              <Home className="h-6 w-6 text-white" />
            </div>
            <h2 className="text-sm font-bold tracking-normal text-brand-600">
              ContractToCozy
            </h2>
          </div>

          {/* Hero Copy */}
          <div className="space-y-4">
            <h1 className="text-3xl sm:text-4xl font-black text-slate-900 leading-tight">
              Start with what your <span className="text-brand-600">home needs now.</span>
            </h1>
            <p className="text-base text-slate-500 max-w-lg mx-auto leading-relaxed">
              Tell us what brought you here, then add your address. We’ll give you a useful first action without requiring an inspection report.
            </p>
          </div>

          {/* Search Experience */}
          <form onSubmit={handleLookup} className="space-y-5 text-left">
            <fieldset className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
              <legend className="px-2 text-sm font-bold text-slate-900">Where are you in the home journey?</legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {([
                  ['own', 'I own it'],
                  ['buying', 'Buying existing'],
                  ['new-build', 'New build'],
                  ['exploring', 'Exploring'],
                ] as Array<[Situation, string]>).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setSituation(value);
                      setTriggerType((current) => {
                        if (value === 'exploring') return 'NONE_EXPLORING';
                        return current === 'NONE_EXPLORING' ? null : current;
                      });
                    }}
                    aria-pressed={situation === value}
                    className={`min-h-11 rounded-xl border px-2 text-sm font-semibold ${
                      situation === value
                        ? 'border-brand-600 bg-brand-50 text-brand-800'
                        : 'border-slate-200 text-slate-600'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>

            {situation === 'buying' ? (
              <fieldset className="space-y-5 rounded-2xl border border-brand-200 bg-brand-50 p-5 shadow-sm">
                <legend className="px-2 text-sm font-bold text-brand-950">Prepare my buyer plan</legend>
                <div>
                  <p className="mb-2 text-sm font-semibold text-brand-950">Purchase stage</p>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {([
                      ['EXPLORING', 'Exploring'],
                      ['OFFER_MADE', 'Offer made'],
                      ['UNDER_CONTRACT', 'Under contract'],
                    ] as Array<[BuyerPurchaseStage, string]>).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setBuyerPurchaseStage(value)}
                        aria-pressed={buyerPurchaseStage === value}
                        className={`min-h-11 rounded-xl border px-3 text-sm font-semibold ${buyerPurchaseStage === value
                          ? 'border-brand-600 bg-white text-brand-900'
                          : 'border-brand-200 bg-brand-50 text-brand-800'}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1 text-sm font-semibold text-brand-950">
                    Target closing date <span className="font-normal text-brand-700">(if known)</span>
                    <Input type="date" value={targetCloseDate} onChange={(event) => setTargetCloseDate(event.target.value)} />
                  </label>
                  <label className="space-y-1 text-sm font-semibold text-brand-950">
                    Move-in date <span className="font-normal text-brand-700">(optional)</span>
                    <Input type="date" value={moveInDate} onChange={(event) => setMoveInDate(event.target.value)} />
                  </label>
                </div>
                <label className="block space-y-1 text-sm font-semibold text-brand-950">
                  Inspection status
                  <select
                    value={buyerInspectionStatus}
                    onChange={(event) => setBuyerInspectionStatus(event.target.value as BuyerInspectionStatus)}
                    className="h-10 w-full rounded-md border border-brand-200 bg-white px-3 text-sm text-slate-900"
                  >
                    <option value="NOT_SCHEDULED">Not scheduled</option>
                    <option value="SCHEDULED">Scheduled</option>
                    <option value="REPORT_AVAILABLE">Report available</option>
                    <option value="REVIEWED">Reviewed</option>
                  </select>
                </label>
                <label className="block space-y-1 text-sm font-semibold text-brand-950">
                  What matters most right now? <span className="font-normal text-brand-700">(optional)</span>
                  <Input
                    value={buyerConcern}
                    onChange={(event) => setBuyerConcern(event.target.value)}
                    placeholder="For example: inspection deadline, financing, or insurance"
                    maxLength={2000}
                  />
                </label>
                <p className="text-xs text-brand-800">Unknown dates are fine. Your plan will still start with the next useful action.</p>
              </fieldset>
            ) : situation ? (
              <fieldset className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
                <legend className="px-2 text-sm font-bold text-slate-900">What brought you here? <span className="font-normal text-slate-500">(optional)</span></legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {onboardingTriggerOptionsForSituation(situation).map((option) => (
                    <button
                      key={option.type}
                      type="button"
                      onClick={() => setTriggerType(option.type)}
                      aria-pressed={triggerType === option.type}
                      className={`min-h-11 rounded-xl border px-3 py-2 text-left text-sm font-semibold transition-colors ${
                        triggerType === option.type
                          ? 'border-brand-600 bg-brand-50 text-brand-800'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <Input
                  value={triggerDetail}
                  onChange={(event) => setTriggerDetail(event.target.value)}
                  placeholder={triggerType === 'REPAIR'
                    ? 'What needs repair? Include symptoms and any active leak, gas, smoke, or sparks.'
                    : 'Optional detail — system, deadline, quote, or concern'}
                  maxLength={2000}
                />
                <p className="text-xs text-slate-500">Skip this if you only want to set up your home. You can choose a goal later.</p>
              </fieldset>
            ) : (
              <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-4 text-sm text-slate-600" role="status">
                Choose your home journey above to continue with the right setup.
              </p>
            )}

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-lg space-y-4">
              <div>
                <h2 className="font-bold text-slate-900">Home address</h2>
                <p className="mt-1 text-sm text-slate-500">Choose a suggestion or enter the complete address yourself.</p>
              </div>
              <AddressAutocomplete
                value={{ address, unit, city, state, zipCode }}
                onChange={(next) => {
                  setAddress(next.address);
                  setUnit(next.unit ?? '');
                  setCity(next.city);
                  setState(next.state);
                  setZipCode(next.zipCode);
                  setAddressResolved(false);
                }}
                onResolved={() => setAddressResolved(true)}
                inputClassName="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
                label="Street address"
                placeholder="94 Ashford Drive"
                autoFocus
              />
              <label className="space-y-1.5 text-sm font-medium text-slate-700">
                Unit or apartment <span className="font-normal text-slate-400">(optional)</span>
                <Input
                  value={unit}
                  onChange={(event) => { setUnit(event.target.value.slice(0, 50)); setAddressResolved(false); }}
                  autoComplete="address-line2"
                  maxLength={50}
                  placeholder="Apt 4B"
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-[1fr_96px_128px]">
                <label className="space-y-1.5 text-sm font-medium text-slate-700">
                  City <span className="text-red-500">*</span>
                  <Input value={city} onChange={(event) => { setCity(event.target.value); setAddressResolved(false); }} autoComplete="address-level2" />
                </label>
                <label className="space-y-1.5 text-sm font-medium text-slate-700">
                  State <span className="text-red-500">*</span>
                  <Input
                    value={state}
                    onChange={(event) => { setState(event.target.value.replace(/[^A-Za-z]/g, '').slice(0, 2)); setAddressResolved(false); }}
                    autoComplete="address-level1"
                    aria-label="Two-letter state"
                  />
                </label>
                <label className="space-y-1.5 text-sm font-medium text-slate-700">
                  ZIP code <span className="text-red-500">*</span>
                  <Input
                    value={zipCode}
                    onChange={(event) => { setZipCode(event.target.value.replace(/\D/g, '').slice(0, 5)); setAddressResolved(false); }}
                    autoComplete="postal-code"
                    inputMode="numeric"
                  />
                </label>
              </div>
              <Button 
                type="submit"
                disabled={loading || !address.trim() || !city.trim() || !state.trim() || !zipCode.trim() || !situation}
                className="h-11 w-full rounded-xl bg-slate-900 px-6 text-white font-bold group transition-all"
              >
                {loading ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : (
                  <>
                    Add home and find property details
                    <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </Button>
              <p className="text-center text-xs text-slate-500">
                By continuing, you add this home and allow a secure public-record lookup. You agree to our Terms of Service and Privacy Policy.
              </p>
            </div>
          </form>

          {/* Trust Signals */}
          <div className="flex flex-wrap items-center justify-center gap-6 pt-2 opacity-60">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
              <Zap className="h-4 w-4 text-brand-600 fill-brand-600" />
              Evidence-bounded guidance
            </div>
            <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
              <Sparkles className="h-4 w-4 text-purple-600 fill-purple-600" />
              Works with limited home data
            </div>
          </div>
        </motion.div>

        {/* Background Decoration */}
        <div className="fixed top-0 left-0 w-full h-full -z-10 overflow-hidden pointer-events-none opacity-20">
          <div className="absolute top-1/4 -left-10 w-96 h-96 bg-brand-200 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-1/4 -right-10 w-80 h-80 bg-teal-200 rounded-full blur-3xl" />
        </div>
      </div>
    </ErrorBoundary>
  );
}
