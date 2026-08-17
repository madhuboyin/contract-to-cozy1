'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Home, Sparkles, ArrowRight, Zap, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api/client';
import { useToast } from '@/components/ui/use-toast';
import { motion } from 'framer-motion';
import { track } from '@/lib/analytics/events';
import { ErrorBoundary } from '@/components/system/ErrorBoundary';
import type { ActivationEntryContextInput } from '@/types';
import { AddressAutocomplete } from '@/components/property/AddressAutocomplete';
import {
  addressOnlyPropertyData,
  normalizeOnboardingAddress,
  onboardingAddressError,
  reconcilePropertyLookup,
  type OnboardingAddressSource,
} from '@/lib/onboarding/addressIntegrity';

type Situation = 'own' | 'buying' | 'new-build' | 'exploring';
type TriggerType = ActivationEntryContextInput['activeTrigger']['type'];
type BuyerPurchaseStage = NonNullable<ActivationEntryContextInput['buyer']>['purchaseStage'];
type BuyerInspectionStatus = NonNullable<ActivationEntryContextInput['buyer']>['inspectionStatus'];

const TRIGGER_OPTIONS: Array<{ type: TriggerType; label: string }> = [
  { type: 'REPAIR', label: 'Something needs repair' },
  { type: 'REPLACEMENT', label: 'Repair or replace a system' },
  { type: 'CONTRACTOR_QUOTE', label: 'Review a contractor quote' },
  { type: 'MAINTENANCE_BACKLOG', label: 'Catch up on maintenance' },
  { type: 'INSURANCE_COVERAGE', label: 'Insurance or warranty question' },
  { type: 'PROJECT', label: 'Plan a home project' },
  { type: 'ANTICIPATED_COST', label: 'Prepare for a future cost' },
  { type: 'NONE_EXPLORING', label: 'Just understand my home' },
];

function isoFromDateInput(value: string): string | null {
  return value ? new Date(`${value}T12:00:00.000Z`).toISOString() : null;
}

/**
 * AddressOnboardingPage is the first "Wow" moment.
 * It eliminates the data entry wall by allowing users to simply
 * lookup their address to see what we already know about their home.
 */
export default function AddressOnboardingPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [address, setAddress] = useState('');
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

  const buildActivationContext = (): ActivationEntryContextInput => {
    if (!situation) throw new Error('Choose where you are in the home journey.');
    const selectedTrigger = TRIGGER_OPTIONS.find((option) => option.type === triggerType);
    if (situation === 'buying') {
      const buyerLabel = buyerConcern.trim()
        || (buyerPurchaseStage === 'EXPLORING'
          ? 'Compare this home before making an offer'
          : buyerPurchaseStage === 'OFFER_MADE'
            ? 'Prepare for a possible contract'
            : 'Prepare for closing');
      return {
        entryPath: 'EXISTING_HOME_PURCHASE',
        ownershipState: buyerPurchaseStage === 'UNDER_CONTRACT' ? 'UNDER_CONTRACT' : 'SHOPPING',
        propertyOrigin: 'EXISTING_HOME',
        activeTrigger: {
          type: ['REPORT_AVAILABLE', 'REVIEWED'].includes(buyerInspectionStatus) ? 'INSPECTION_FINDING' : 'OTHER',
          label: buyerLabel,
          detail: buyerConcern.trim() || null,
          entityType: 'PROPERTY',
          entityId: null,
          source: 'USER_SELECTED',
        },
        buyer: {
          purchaseStage: buyerPurchaseStage,
          targetCloseDate: isoFromDateInput(targetCloseDate),
          inspectionStatus: buyerInspectionStatus,
          moveInDate: isoFromDateInput(moveInDate),
          immediateConcern: buyerConcern.trim() || null,
        },
        consentContext: 'User submitted buyer journey context to prepare a property-scoped closing plan.',
        sourceMetadata: { onboardingSurface: 'address', experienceMode: 'BUYER_CLOSING' },
      };
    }
    return {
          entryPath: situation === 'new-build'
              ? 'NEW_HOME_SETUP'
              : situation === 'exploring'
                ? 'EXPLORATION'
                : 'EXISTING_OWNER_TRIGGER',
          ownershipState: situation === 'new-build'
            ? 'UNDER_CONTRACT'
            : situation === 'exploring'
              ? 'SHOPPING'
              : 'ESTABLISHED_OWNER',
          propertyOrigin: situation === 'new-build'
            ? 'NEW_CONSTRUCTION'
            : situation === 'exploring'
              ? 'UNKNOWN'
              : 'EXISTING_HOME',
          activeTrigger: {
            type: triggerType!,
            label: selectedTrigger?.label ?? 'Home planning question',
            detail: triggerDetail.trim() || null,
            entityType: 'PROPERTY',
            entityId: null,
            source: 'USER_SELECTED',
          },
          consentContext: 'User submitted this trigger to receive property-specific onboarding guidance.',
          sourceMetadata: { onboardingSurface: 'address' },
    };
  };

  const prepareConfirmation = async (propertyData: Record<string, unknown>, source: OnboardingAddressSource) => {
    const selectedSituation = situation;
    if (!selectedSituation) throw new Error('Choose where you are in the home journey.');
    const activationContext = buildActivationContext();
    const sessionRes = await fetch('/api/onboarding-lookup-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: { ...propertyData, activationContext, addressSource: source } }),
        });
    if (!sessionRes.ok) throw new Error('Unable to prepare onboarding session');
    track('active_trigger_selected', { triggerType: triggerType!, situation: selectedSituation });
    router.push('/onboarding/confirm');
  };

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!situation || (situation !== 'buying' && !triggerType)) return;
    const submittedAddress = normalizeOnboardingAddress({ address, city, state, zipCode });
    const validationError = onboardingAddressError(submittedAddress);
    if (validationError) {
      toast({ title: 'Complete the address', description: validationError, variant: 'destructive' });
      return;
    }

    setLoading(true);
    track('address_lookup_started', { source: 'onboarding_page' });

    let propertyData: Record<string, unknown> = addressOnlyPropertyData(submittedAddress);
    let addressSource: OnboardingAddressSource = addressResolved ? 'AUTOCOMPLETE' : 'MANUAL';
    try {
      const response = await api.lookupProperty(submittedAddress.address, submittedAddress.zipCode);
      if (!response.success || !response.data) throw new Error('No usable public record');
      const reconciled = reconcilePropertyLookup(submittedAddress, response.data as unknown as Record<string, unknown>);
      if (!reconciled) {
        track('api_error_encountered', {
          endpoint: '/api/properties/lookup',
          statusCode: 422,
          message: 'Property lookup location did not match submitted state and ZIP',
        });
        toast({
          title: 'Public record did not match',
          description: 'We kept the address you entered and discarded the conflicting property result.',
        });
      } else {
        propertyData = reconciled;
        addressSource = 'LOOKUP';
      }
    } catch (error) {
      console.error('Lookup error:', error);
      if (!addressResolved) track('address_entered_manually', { source: 'onboarding_page' });
      toast({
        title: 'Public record unavailable',
        description: 'Your address is saved. Unknown property facts will stay unknown.',
      });
    }

    try {
      await prepareConfirmation(propertyData, addressSource);
    } catch (error) {
      console.error('Onboarding session error:', error);
      toast({ title: 'Unable to continue', description: 'Please try again.', variant: 'destructive' });
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
            We&apos;re experiencing a high volume of home lookups. Please refresh the page or try again in a few minutes.
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
                      if (value === 'exploring') setTriggerType('NONE_EXPLORING');
                      if (value !== 'exploring' && triggerType === 'NONE_EXPLORING') setTriggerType(null);
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
                <legend className="px-2 text-sm font-bold text-slate-900">What brought you here?</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {TRIGGER_OPTIONS.map((option) => (
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
                  placeholder="Optional detail — system, deadline, quote, or concern"
                  maxLength={2000}
                />
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
                value={{ address, city, state, zipCode }}
                onChange={(next) => {
                  setAddress(next.address);
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
                disabled={loading || !address.trim() || !city.trim() || !state.trim() || !zipCode.trim() || !situation || (situation !== 'buying' && !triggerType)}
                className="h-11 w-full rounded-xl bg-slate-900 px-6 text-white font-bold group transition-all"
              >
                {loading ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : (
                  <>
                    Review this address
                    <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </Button>
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
