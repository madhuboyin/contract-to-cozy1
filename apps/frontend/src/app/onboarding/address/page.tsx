'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Home, Search, Sparkles, ArrowRight, Zap, Loader2, PenLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api/client';
import { useToast } from '@/components/ui/use-toast';
import { motion } from 'framer-motion';
import { track } from '@/lib/analytics/events';
import { ErrorBoundary } from '@/components/system/ErrorBoundary';
import type { ActivationEntryContextInput } from '@/types';

type Situation = 'own' | 'buying' | 'new-build' | 'exploring';
type TriggerType = ActivationEntryContextInput['activeTrigger']['type'];

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
  const [manualMode, setManualMode] = useState(false);
  const [situation, setSituation] = useState<Situation>('own');
  const [triggerType, setTriggerType] = useState<TriggerType | null>(null);
  const [triggerDetail, setTriggerDetail] = useState('');

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
    const selectedTrigger = TRIGGER_OPTIONS.find((option) => option.type === triggerType);
    return {
          entryPath: situation === 'buying'
            ? 'EXISTING_HOME_PURCHASE'
            : situation === 'new-build'
              ? 'NEW_HOME_SETUP'
              : situation === 'exploring'
                ? 'EXPLORATION'
                : 'EXISTING_OWNER_TRIGGER',
          ownershipState: situation === 'buying' || situation === 'new-build'
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

  const prepareConfirmation = async (propertyData: Record<string, unknown>, source: 'LOOKUP' | 'MANUAL') => {
    const activationContext = buildActivationContext();
    const sessionRes = await fetch('/api/onboarding-lookup-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: { ...propertyData, activationContext, addressSource: source } }),
        });
    if (!sessionRes.ok) throw new Error('Unable to prepare onboarding session');
    track('active_trigger_selected', { triggerType: triggerType!, situation });
    router.push('/onboarding/confirm');
  };

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!address.trim() || !triggerType) return;

    if (manualMode) {
      if (!city.trim() || !/^[A-Za-z]{2}$/.test(state.trim()) || !/^\d{5}$/.test(zipCode.trim())) {
        toast({
          title: 'Complete the address',
          description: 'Enter a city, two-letter state, and five-digit ZIP code.',
          variant: 'destructive',
        });
        return;
      }
      setLoading(true);
      try {
        await prepareConfirmation({
          address: address.trim(),
          city: city.trim(),
          state: state.trim().toUpperCase(),
          zipCode: zipCode.trim(),
          yearBuilt: null,
          propertySize: null,
          dwellingType: null,
        }, 'MANUAL');
        track('address_entered_manually', { source: 'onboarding_page' });
      } catch (error) {
        console.error('Manual address error:', error);
        toast({ title: 'Unable to continue', description: 'Please try again.', variant: 'destructive' });
      } finally {
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    track('address_lookup_started', { source: 'onboarding_page' });

    try {
      const response = await api.lookupProperty(address, zipCode);
      if (!response.success || !response.data) throw new Error('No usable public record');
      await prepareConfirmation(response.data, 'LOOKUP');
    } catch (error) {
      console.error('Lookup error:', error);
      setManualMode(true);
      toast({
        title: 'Public record unavailable',
        description: 'No problem—complete the address manually. Unknown home facts will stay unknown.',
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
            We're experiencing a high volume of home lookups. Please refresh the page or try again in a few minutes.
          </p>
          <Button className="mt-8 rounded-xl h-12 px-8" onClick={() => window.location.reload()}>
            Refresh Page
          </Button>
        </div>
      }
    >
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 sm:p-12">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-xl space-y-10 text-center"
        >
          {/* Branding */}
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 bg-brand-600 rounded-3xl shadow-xl shadow-brand-200 flex items-center justify-center rotate-3">
              <Home className="h-8 w-8 text-white" />
            </div>
            <h2 className="text-sm font-bold tracking-normal text-brand-600">
              ContractToCozy
            </h2>
          </div>

          {/* Hero Copy */}
          <div className="space-y-4">
            <h1 className="text-4xl sm:text-5xl font-black text-slate-900 leading-tight">
              Start with what your <br />
              <span className="text-brand-600">home needs now.</span>
            </h1>
            <p className="text-lg text-slate-500 max-w-md mx-auto leading-relaxed">
              Tell us what brought you here, then add your address. We’ll give you a useful first action without requiring an inspection report.
            </p>
          </div>

          {/* Search Experience */}
          <form onSubmit={handleLookup} className="space-y-5 text-left">
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

            <div className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-brand-600 to-teal-500 rounded-3xl blur opacity-20 group-focus-within:opacity-40 transition-opacity" />
              <div className="relative bg-white rounded-2xl shadow-xl border border-slate-100 p-2 flex flex-col sm:flex-row gap-2">
              <div className="flex-1 relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                <Input 
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Street Address" 
                  className="h-14 pl-12 border-none text-lg placeholder:text-slate-300 focus-visible:ring-0 focus-visible:ring-offset-0"
                  autoFocus
                />
              </div>
              <div className="w-full sm:w-32 border-t sm:border-t-0 sm:border-l border-slate-100">
                <Input 
                  value={zipCode}
                  onChange={(e) => setZipCode(e.target.value)}
                  placeholder="Zip" 
                  className="h-14 border-none text-lg placeholder:text-slate-300 text-center focus-visible:ring-0 focus-visible:ring-offset-0"
                />
              </div>
              <Button 
                type="submit"
                disabled={loading || !address.trim() || !triggerType}
                className="h-14 px-8 rounded-xl bg-slate-900 hover:bg-black text-white font-bold text-lg group transition-all"
              >
                {loading ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : (
                  <>
                    {manualMode ? 'Continue without public records' : 'Find My Home'}
                    <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </Button>
              </div>
            </div>

            {manualMode && (
              <div className="rounded-2xl border border-brand-200 bg-brand-50 p-5">
                <div className="mb-4 flex items-start gap-3">
                  <PenLine className="mt-0.5 h-5 w-5 shrink-0 text-brand-700" />
                  <div>
                    <p className="font-bold text-brand-950">Add the address manually</p>
                    <p className="text-sm text-brand-800">Public records are optional. We will preserve missing property facts as unknown.</p>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-[1fr_96px_120px]">
                  <Input value={city} onChange={(event) => setCity(event.target.value)} placeholder="City" />
                  <Input
                    value={state}
                    onChange={(event) => setState(event.target.value.replace(/[^A-Za-z]/g, '').slice(0, 2))}
                    placeholder="State"
                    aria-label="Two-letter state"
                  />
                  <Input
                    value={zipCode}
                    onChange={(event) => setZipCode(event.target.value.replace(/\D/g, '').slice(0, 5))}
                    placeholder="ZIP"
                  />
                </div>
                <button
                  type="button"
                  className="mt-4 text-sm font-semibold text-brand-800 underline underline-offset-4"
                  onClick={() => setManualMode(false)}
                >
                  Try public-record lookup again
                </button>
              </div>
            )}
          </form>

          {/* Trust Signals */}
          <div className="flex flex-wrap items-center justify-center gap-6 pt-6 opacity-60">
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
