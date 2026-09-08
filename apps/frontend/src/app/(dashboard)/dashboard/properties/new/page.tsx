'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Home, Loader2, MapPin, Sparkles } from 'lucide-react';
import { AddressAutocomplete } from '@/components/property/AddressAutocomplete';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { api, isAmbiguousNetworkError } from '@/lib/api/client';
import {
  normalizeOnboardingAddress,
  onboardingAddressError,
  sameOnboardingAddress,
  type OnboardingAddress,
} from '@/lib/onboarding/addressIntegrity';

const PROPERTY_SETUP_SKIPPED_KEY = 'propertySetupSkipped';
const EMPTY_ADDRESS: OnboardingAddress = { address: '', city: '', state: '', zipCode: '' };
const INPUT_CLASS = 'min-h-[44px] w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-500/40 focus:outline-none focus:ring-2 focus:ring-teal-500/20';

export default function NewPropertyPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [address, setAddress] = useState<OnboardingAddress>(EMPTY_ADDRESS);
  const [showAddressDetails, setShowAddressDetails] = useState(false);
  const [hasExistingProperty, setHasExistingProperty] = useState(false);
  const [makePrimary, setMakePrimary] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void api.getProperties().then((response) => {
      if (active && response.success) {
        setHasExistingProperty((response.data?.properties?.length ?? 0) > 0);
      }
    }).catch(() => {
      // The service enforces first-primary even when this optional UI hint cannot load.
    });
    return () => { active = false; };
  }, []);

  const updateAddress = (next: OnboardingAddress) => {
    setAddress(next);
    if (next.city || next.state || next.zipCode) setShowAddressDetails(true);
  };

  const recoverCommittedProperty = async (submitted: OnboardingAddress): Promise<string | null> => {
    try {
      const response = await api.getProperties({ force: true });
      if (!response.success) return null;
      const match = response.data?.properties?.find((property) => sameOnboardingAddress(property, submitted));
      return match?.id ?? null;
    } catch {
      return null;
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;

    const normalized = normalizeOnboardingAddress(address);
    const validationError = onboardingAddressError(normalized);
    if (validationError) {
      setShowAddressDetails(true);
      setError(validationError);
      return;
    }

    setError('');
    setSubmitting(true);
    try {
      const response = await api.createProperty({
        ...normalized,
        ...(hasExistingProperty ? { isPrimary: makePrimary } : {}),
      });
      if (!response.success || !response.data?.id) {
        setError(response.message || 'Unable to add this home.');
        return;
      }

      localStorage.removeItem(PROPERTY_SETUP_SKIPPED_KEY);
      toast({ title: 'Home added', description: 'You can add more details whenever they become useful.' });
      router.push(`/dashboard/properties/${response.data.id}`);
    } catch (caught) {
      const committedPropertyId = isAmbiguousNetworkError(caught)
        ? await recoverCommittedProperty(normalized)
        : null;
      if (committedPropertyId) {
        localStorage.removeItem(PROPERTY_SETUP_SKIPPED_KEY);
        toast({ title: 'Home added', description: 'We found the saved home and continued without creating a duplicate.' });
        router.push(`/dashboard/properties/${committedPropertyId}`);
        return;
      }
      setError(caught instanceof Error ? caught.message : 'Unable to add this home. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
      <Link href="/dashboard/properties" className="mb-6 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-950">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to properties
      </Link>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-gradient-to-br from-teal-50 via-white to-amber-50 px-5 py-7 sm:px-8">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-700 text-white shadow-sm">
            <Home className="h-6 w-6" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">Add a home</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600 sm:text-base">
            Start with the address. Home details, systems, photos, and records can be added later when they help you make a decision.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 px-5 py-6 sm:px-8 sm:py-8" noValidate>
          <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5">
            <div className="mb-4 flex items-start gap-3">
              <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-teal-700" aria-hidden="true" />
              <div>
                <h2 className="font-semibold text-slate-950">Property address</h2>
                <p className="mt-1 text-sm text-slate-600">Choose a suggestion when available, or enter the address manually.</p>
              </div>
            </div>

            <AddressAutocomplete
              value={address}
              onChange={updateAddress}
              onResolved={(resolved) => { setAddress(resolved); setShowAddressDetails(true); }}
              inputClassName={INPUT_CLASS}
              autoFocus
            />

            {!showAddressDetails ? (
              <button
                type="button"
                onClick={() => setShowAddressDetails(true)}
                className="mt-3 min-h-11 text-sm font-semibold text-teal-800 underline-offset-4 hover:underline"
              >
                Enter address manually
              </button>
            ) : (
              <div className="mt-4 grid gap-4 sm:grid-cols-2" aria-label="Confirm address details">
                <label className="space-y-1.5 text-sm font-medium text-slate-700">
                  City <span className="text-red-500">*</span>
                  <input value={address.city} onChange={(event) => setAddress((current) => ({ ...current, city: event.target.value }))} className={INPUT_CLASS} autoComplete="address-level2" />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="space-y-1.5 text-sm font-medium text-slate-700">
                    State <span className="text-red-500">*</span>
                    <input value={address.state} onChange={(event) => setAddress((current) => ({ ...current, state: event.target.value.replace(/[^A-Za-z]/g, '').slice(0, 2) }))} className={INPUT_CLASS} autoComplete="address-level1" aria-label="Two-letter state" />
                  </label>
                  <label className="space-y-1.5 text-sm font-medium text-slate-700">
                    ZIP <span className="text-red-500">*</span>
                    <input value={address.zipCode} onChange={(event) => setAddress((current) => ({ ...current, zipCode: event.target.value.replace(/\D/g, '').slice(0, 5) }))} className={INPUT_CLASS} autoComplete="postal-code" inputMode="numeric" />
                  </label>
                </div>
              </div>
            )}
          </div>

          {hasExistingProperty && (
            <label className="flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3">
              <input type="checkbox" checked={makePrimary} onChange={(event) => setMakePrimary(event.target.checked)} className="h-5 w-5 rounded border-slate-300 text-teal-700 focus:ring-teal-600" />
              <span>
                <span className="block text-sm font-semibold text-slate-900">Make this my primary home</span>
                <span className="block text-xs text-slate-500">Your current primary home will remain unchanged unless you select this.</span>
              </span>
            </label>
          )}

          {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Sparkles className="h-4 w-4 text-amber-600" aria-hidden="true" />
              Guidance stays limited to facts you have confirmed.
            </div>
            <Button type="submit" disabled={submitting} className="min-h-12 rounded-xl bg-teal-700 px-6 font-semibold text-white hover:bg-teal-800">
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              {submitting ? 'Adding home…' : 'Add home'}
            </Button>
          </div>
          <p className="sr-only" role="status" aria-live="polite">{submitting ? 'Adding your home' : ''}</p>
        </form>
      </section>
    </main>
  );
}
