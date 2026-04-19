// apps/frontend/src/app/(dashboard)/dashboard/providers/[id]/book/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api/client';
import { Provider, Service, Property, CreateBookingInput } from '@/types';
import { useToast } from '@/components/ui/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Calendar, Clock3, Loader2 } from 'lucide-react';
import { formatEnumLabel } from '@/lib/utils/formatters';
import DateField from '@/components/shared/DateField';
import { useDashboardPropertySelection } from '@/lib/property/useDashboardPropertySelection';
import { getPriceFinalization } from '@/lib/api/priceFinalizationApi';
import {
  ActionPriorityRow,
  BottomSafeAreaReserve,
  ReadOnlySummaryBlock,
  ResultHeroCard,
  ScenarioInputCard,
  StatusChip,
} from '@/components/mobile/dashboard/MobilePrimitives';
import ProviderShellTemplate from '@/components/providers/ProviderShellTemplate';
import { useExecutionGuard } from '@/features/guidance/hooks/useExecutionGuard';
import { useGuidance } from '@/features/guidance/hooks/useGuidance';
import { GuidanceWarningBanner } from '@/components/guidance/GuidanceWarningBanner';

function getInitials(firstName: string, lastName: string) {
  return (firstName?.[0] || '') + (lastName?.[0] || '');
}

export default function BookProviderPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const searchParams = useSearchParams();
  const serviceCategory = searchParams.get('service') || searchParams.get('category');
  const preSelectedPropertyId = searchParams.get('propertyId');
  const insightFactor = searchParams.get('insightFactor');
  const insightContext = searchParams.get('insightContext');
  const maintenancePredictionId = searchParams.get('predictionId');
  const inventoryItemId = searchParams.get('itemId');
  const homeAssetId = searchParams.get('homeAssetId');
  const guidanceJourneyId = searchParams.get('guidanceJourneyId');
  const guidanceStepKey = searchParams.get('guidanceStepKey');
  const guidanceSignalIntentFamily = searchParams.get('guidanceSignalIntentFamily');
  const priceFinalizationId = searchParams.get('priceFinalizationId');
  const finalPrice = searchParams.get('finalPrice');
  const vendorName = searchParams.get('vendorName');
  // FRD-FR-10: Guidance pre-population fields from book_service step
  const guidanceAssetName = searchParams.get('assetName');
  const guidanceIssueDescription = searchParams.get('issueDescription');
  const hasGuardScopeContext = Boolean(
    guidanceJourneyId ||
      guidanceStepKey ||
      guidanceSignalIntentFamily ||
      inventoryItemId ||
      homeAssetId
  );
  const providerId = params.id as string;

  const [provider, setProvider] = useState<Provider | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string>('');
  const [contextItemName, setContextItemName] = useState<string | null>(null);

  const [selectedServiceId, setSelectedServiceId] = useState('');
  const { selectedPropertyId, setSelectedPropertyId } = useDashboardPropertySelection(preSelectedPropertyId);
  const [scheduledDate, setScheduledDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [description, setDescription] = useState('');
  const [specialRequests, setSpecialRequests] = useState('');
  const [estimatedPrice, setEstimatedPrice] = useState<number>(0);
  const [descriptionTouched, setDescriptionTouched] = useState(false);
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);

  const bookingGuardQuery = useExecutionGuard(selectedPropertyId, 'BOOKING', {
    enabled: Boolean(selectedPropertyId) && hasGuardScopeContext,
    journeyId: guidanceJourneyId ?? undefined,
    inventoryItemId: inventoryItemId ?? undefined,
    homeAssetId: homeAssetId ?? undefined,
  });
  const bookingGuidanceQuery = useGuidance(selectedPropertyId, {
    enabled: Boolean(selectedPropertyId) && hasGuardScopeContext,
    limit: 3,
  });

  const isExecutionBlocked = hasGuardScopeContext && Boolean(bookingGuardQuery.data?.blocked);
  const blockedReason =
    bookingGuardQuery.data?.blockedReason ?? bookingGuardQuery.data?.reasons?.[0] ?? null;
  const blockedJourneyIds = new Set(bookingGuardQuery.data?.missingPrerequisites.map((item) => item.journeyId) ?? []);
  const blockedAction = bookingGuidanceQuery.actions.find((action) => blockedJourneyIds.has(action.journeyId)) ?? null;
  const blockedActionHref =
    blockedAction?.href ??
    (selectedPropertyId ? `/dashboard/properties/${selectedPropertyId}/risk-assessment` : '/dashboard/maintenance');

  useEffect(() => {
    if (!finalPrice) return;
    const parsed = Number(finalPrice);
    if (Number.isFinite(parsed) && parsed > 0) {
      setEstimatedPrice(parsed);
    }
  }, [finalPrice]);

  // FRD-FR-10: Pre-populate description from guidance booking step context or item context
  useEffect(() => {
    setDescription((prev) => {
      if (prev.trim().length > 0) return prev;
      
      const fromParam = searchParams.get('from');
      const itemParam = searchParams.get('itemName'); // We can pass this from ProvidersPage or fetch it
      
      if (fromParam === 'replace-repair') {
        const itemPrefix = contextItemName ? `${contextItemName}: ` : '';
        return `${itemPrefix}I've decided to proceed with the recommended resolution based on my Replace or Repair analysis. Please provide an estimate for this job.`;
      }

      if (!guidanceJourneyId) return prev;
      const parts: string[] = [];
      if (guidanceAssetName) parts.push(guidanceAssetName);
      if (guidanceIssueDescription) parts.push(guidanceIssueDescription);
      if (parts.length === 0) return prev;
      return parts.join(' — ');
    });
  }, [guidanceJourneyId, guidanceAssetName, guidanceIssueDescription, searchParams, contextItemName]);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerId, serviceCategory]);

  useEffect(() => {
    const targetItemId = inventoryItemId || homeAssetId;
    if (selectedPropertyId && targetItemId) {
      api.get<{ item: { name: string } }>(`/api/properties/${selectedPropertyId}/inventory/items/${targetItemId}`)
        .then(res => {
          if (res.success && res.data?.item?.name) {
            setContextItemName(res.data.item.name);
          }
        })
        .catch(err => console.warn('[BOOKING] Failed to load context item name:', err));
    }
  }, [selectedPropertyId, inventoryItemId, homeAssetId]);

  const loadData = async () => {
    try {
      const [providerRes, servicesRes, propertiesRes] = await Promise.all([
        api.getProvider(providerId),
        api.getProviderServices(providerId),
        api.getProperties(),
      ]);

      if (providerRes.success) {
        setProvider(providerRes.data);
      }

      if (servicesRes.success) {
        setServices(servicesRes.data.services);
        if (servicesRes.data.services.length > 0) {
          const servicesList = servicesRes.data.services;
          let defaultService = servicesList[0];

          if (serviceCategory) {
            const targetCategory = formatEnumLabel(serviceCategory).toLowerCase();
            const matchedService = servicesList.find((s) =>
              s.name.toLowerCase().includes(targetCategory.split(' ')[0].toLowerCase())
            );

            if (matchedService) {
              defaultService = matchedService;
            }
          }

          setSelectedServiceId(defaultService.id);
          setEstimatedPrice(Number(defaultService.basePrice));
        }
      }

      if (propertiesRes.success && propertiesRes.data.properties.length > 0) {
        setProperties(propertiesRes.data.properties);

        const hasValidSelection =
          !!selectedPropertyId && propertiesRes.data.properties.some((property) => property.id === selectedPropertyId);

        if (!hasValidSelection) {
          const primaryProperty = propertiesRes.data.properties.find((p) => p.isPrimary);
          setSelectedPropertyId(primaryProperty?.id || propertiesRes.data.properties[0].id);
        }
      }
    } catch (loadError) {
      console.error('Failed to load data:', loadError);
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleServiceChange = (serviceId: string) => {
    setSelectedServiceId(serviceId);
    const service = services.find((s) => s.id === serviceId);
    if (service) {
      setEstimatedPrice(Number(service.basePrice));
    }
  };

  useEffect(() => {
    let cancelled = false;
    if (!selectedPropertyId || !priceFinalizationId) return;

    (async () => {
      try {
        const detail = await getPriceFinalization(selectedPropertyId, priceFinalizationId);
        if (cancelled) return;

        if (typeof detail.acceptedPrice === 'number' && Number.isFinite(detail.acceptedPrice) && detail.acceptedPrice > 0) {
          setEstimatedPrice(detail.acceptedPrice);
        }

        if (detail.notes) {
          setSpecialRequests((prev) => {
            if (prev.trim().length > 0) return prev;
            return detail.notes ?? '';
          });
        } else if (vendorName) {
          setSpecialRequests((prev) => {
            if (prev.trim().length > 0) return prev;
            return `Finalized with vendor: ${vendorName}`;
          });
        }

        setDescription((prev) => {
          if (prev.trim().length > 0) return prev;
          const categoryLabel = detail.serviceCategory ? formatEnumLabel(detail.serviceCategory) : 'service';
          const vendorLabel = detail.vendorName ? ` with ${detail.vendorName}` : '';
          const priceLabel =
            typeof detail.acceptedPrice === 'number' && Number.isFinite(detail.acceptedPrice)
              ? `$${detail.acceptedPrice.toFixed(2)}`
              : finalPrice && Number.isFinite(Number(finalPrice))
                ? `$${Number(finalPrice).toFixed(2)}`
                : 'agreed price';
          return `Please complete ${categoryLabel} work${vendorLabel} at ${priceLabel}.`;
        });
      } catch (error) {
        console.warn('[BOOKING] unable to prefill from price finalization', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedPropertyId, priceFinalizationId, finalPrice, vendorName]);

  const toISODateTime = (date: string, time: string): string => {
    return `${date}T${time}:00Z`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setHasAttemptedSubmit(true);
    setError('');

    if (!provider) {
      setError('Provider information not loaded');
      return;
    }

    if (!selectedServiceId) {
      setError('Please select a service');
      return;
    }

    if (!selectedPropertyId) {
      setError('Please select a property');
      return;
    }

    if (!scheduledDate || !startTime) {
      setError('Please select a date and time');
      return;
    }

    if (description.trim().length < 10) {
      setError('Description must be at least 10 characters');
      return;
    }

    if (isExecutionBlocked) {
      setError(blockedReason || 'Complete prerequisite guidance steps before booking.');
      return;
    }

    const scheduledDateTime = toISODateTime(scheduledDate, startTime);
    const startDateTime = toISODateTime(scheduledDate, startTime);
    const endDateTime = endTime ? toISODateTime(scheduledDate, endTime) : undefined;

    const bookingData: CreateBookingInput = {
      providerId,
      serviceId: selectedServiceId,
      propertyId: selectedPropertyId,
      scheduledDate: scheduledDateTime,
      startTime: startDateTime,
      endTime: endDateTime,
      description: description.trim(),
      specialRequests: specialRequests.trim() || undefined,
      estimatedPrice,
      ...(insightFactor && { insightFactor }),
      ...(insightContext && { insightContext }),
      ...(maintenancePredictionId && { maintenancePredictionId }),
      ...(inventoryItemId && { inventoryItemId }),
      ...(homeAssetId && { homeAssetId }),
      ...(priceFinalizationId && { priceFinalizationId }),
      ...(guidanceJourneyId && { guidanceJourneyId }),
      ...(guidanceJourneyId && guidanceStepKey && { guidanceStepKey }),
      ...(guidanceSignalIntentFamily && { guidanceSignalIntentFamily }),
      ...(hasGuardScopeContext && { guidanceEnforceGuard: true }),
    };

    setIsSubmitting(true);
    try {
      const response = await api.createBooking(bookingData);

      if (response.success) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['bookings'] }),
          queryClient.invalidateQueries({ queryKey: ['properties'] }),
          queryClient.invalidateQueries({ queryKey: ['property', selectedPropertyId] }),
        ]);

        toast({ title: 'Booking created successfully!' });

        const fromParam = searchParams.get('from');

        if (fromParam === 'risk-assessment' && selectedPropertyId) {
          router.push(`/dashboard/properties/${selectedPropertyId}/risk-assessment?refreshed=true`);
        } else {
          router.push('/dashboard/bookings');
        }
      } else {
        setError(response.message || 'Failed to create booking');
      }
    } catch (submitError: any) {
      console.error('Failed to create booking:', submitError);
      setError(submitError?.message || 'An error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <ProviderShellTemplate
        title="Book a Service"
        subtitle="Loading booking workspace and service details."
        eyebrow="Provider Booking"
        primaryAction={{
          title: 'Preparing booking form',
          description: 'Loading provider services, property options, and context for your request.',
          primaryAction: (
            <button
              type="button"
              disabled
              className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-slate-300 px-4 py-2 text-sm font-semibold text-slate-600"
            >
              Loading booking form...
            </button>
          ),
        }}
        routeState={{
          state: 'loading',
          title: 'Loading booking data',
          description: 'Fetching provider services and property context.',
        }}
        hideContentWhenState
      >
        <></>
      </ProviderShellTemplate>
    );
  }

  if (!provider) {
    return (
      <ProviderShellTemplate
        title="Book a Service"
        subtitle="Provider details are unavailable."
        eyebrow="Provider Booking"
        primaryAction={{
          title: 'Provider data unavailable for booking.',
          description: 'Return to provider profile and choose another pro or retry shortly.',
          primaryAction: (
            <button
              type="button"
              onClick={() => router.back()}
              className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-brand-primary px-4 py-2 text-sm font-semibold text-white hover:bg-brand-primary/90"
            >
              Go back
            </button>
          ),
        }}
        routeState={{
          state: 'error',
          title: 'Provider not found',
          description: 'This provider could not be loaded for booking.',
        }}
        hideContentWhenState
      >
        <></>
      </ProviderShellTemplate>
    );
  }

  const getTomorrowDate = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  };

  const selectedService = services.find((service) => service.id === selectedServiceId);
  const descriptionLength = description.trim().length;
  const showDescriptionError = (descriptionTouched || hasAttemptedSubmit) && descriptionLength < 10;
  const scrollToSubmit = () => {
    const submitAnchor = document.getElementById('provider-booking-submit');
    submitAnchor?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return (
    <ProviderShellTemplate
      title="Book a Service"
      subtitle="Choose a service, property, schedule, and request details."
      eyebrow="Provider Booking"
      primaryAction={{
        title: isExecutionBlocked ? 'Complete prerequisite steps before booking.' : 'Finish details and create this booking.',
        description: isExecutionBlocked
          ? blockedReason || 'Required guidance steps are incomplete for this property.'
          : 'Complete service, schedule, and request details, then submit from the sticky action footer.',
        primaryAction: (
          <button
            type="button"
            onClick={scrollToSubmit}
            disabled={isExecutionBlocked}
            className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-brand-primary px-4 py-2 text-sm font-semibold text-white hover:bg-brand-primary/90 disabled:opacity-60"
          >
            {isExecutionBlocked ? 'Booking blocked' : 'Review submit section'}
          </button>
        ),
        supportingAction: (
          <button
            type="button"
            onClick={() => router.back()}
            className="inline-flex min-h-[40px] w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Back to provider profile
          </button>
        ),
        impactLabel: selectedService ? 'Booking-ready setup' : 'Service selection required',
        confidenceLabel: selectedPropertyId ? 'Property context selected' : 'Property selection required',
      }}
      trust={{
        confidenceLabel: 'Booking confidence reflects service fit, provider availability, and required guidance completion.',
        freshnessLabel: 'Context updates when provider, pricing, or property data changes.',
        sourceLabel: 'Provider services, selected property details, guidance guardrails, and booking timeline fields.',
        rationale: 'Showing booking prerequisites and context early prevents failed submissions and surprise delays.',
      }}
      summary={
        <ResultHeroCard
          eyebrow="Booking Setup"
          title={provider.businessName}
          value={estimatedPrice > 0 ? `$${estimatedPrice.toFixed(2)}` : '$0.00'}
          status={
            <StatusChip tone={selectedService ? 'protected' : 'info'}>
              {selectedService ? formatEnumLabel(selectedService.category) : 'Select a service'}
            </StatusChip>
          }
          summary={`${provider.user?.firstName ?? ''} ${provider.user?.lastName ?? ''}`}
          highlights={[
            selectedService ? selectedService.name : 'Choose service and property',
            selectedPropertyId ? 'Property selected' : 'Select a property',
            'Final price confirmed by provider',
          ]}
        />
      }
    >
      <button
        onClick={() => router.back()}
        className="flex min-h-[44px] items-center text-sm text-[hsl(var(--mobile-text-secondary))] hover:text-[hsl(var(--mobile-text-primary))]"
      >
        <svg className="mr-1 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </button>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3">
          <p className="text-sm text-rose-800">{error}</p>
        </div>
      ) : null}

      {isExecutionBlocked ? (
        <GuidanceWarningBanner
          title="Booking blocked until prerequisite steps are complete"
          message={
            blockedReason ||
            'Coverage, decision, or pricing validation steps are still incomplete for this property.'
          }
          actionLabel={blockedAction?.nextStep ? `Go to Step ${blockedAction.nextStep.stepOrder}` : 'Open required step'}
          actionHref={blockedActionHref}
        />
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-4 pb-2">
        <ScenarioInputCard title="Service & Property" subtitle="Select what you need and where the work should happen.">
          <ReadOnlySummaryBlock
            items={[
              {
                label: 'Booking with',
                value: provider.businessName,
                hint: `${provider.user?.firstName ?? ''} ${provider.user?.lastName ?? ''}`,
                emphasize: true,
              },
            ]}
          />

          <div>
            <label className="mb-1.5 block text-sm font-medium text-[hsl(var(--mobile-text-primary))]">Service *</label>
            {services.length === 0 ? (
              <p className="text-sm text-[hsl(var(--mobile-text-secondary))]">No services available</p>
            ) : (
              <select
                value={selectedServiceId}
                onChange={(e) => handleServiceChange(e.target.value)}
                className="min-h-[44px] w-full rounded-lg border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
                required
              >
                {services.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.name}
                  </option>
                ))}
              </select>
            )}
            {estimatedPrice > 0 ? (
              <p className="mt-1 text-xs text-[hsl(var(--mobile-text-muted))]">
                Estimated: ${estimatedPrice.toFixed(2)} ({selectedService ? formatEnumLabel(selectedService.priceUnit) : 'Service'}).
                Final price is set by the provider.
              </p>
            ) : null}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-[hsl(var(--mobile-text-primary))]">Property *</label>
            {properties.length === 0 ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="text-sm text-amber-800">No properties found. Add a property first.</p>
                <Link
                  href="/dashboard/properties/new"
                  className="mt-2 inline-flex min-h-[40px] items-center rounded-lg border border-amber-200 bg-white px-3 text-sm font-medium text-amber-700"
                >
                  Add Property
                </Link>
              </div>
            ) : (
              <select
                value={selectedPropertyId}
                onChange={(e) => setSelectedPropertyId(e.target.value)}
                className="min-h-[44px] w-full rounded-lg border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
                required
              >
                {properties.map((property) => (
                  <option key={property.id} value={property.id}>
                    {property.isPrimary && '⭐ '}
                    {property.name || property.address} - {property.city}, {property.state}
                  </option>
                ))}
              </select>
            )}
            {properties.length > 0 ? (
              <p className="mt-1 text-xs text-[hsl(var(--mobile-text-muted))]">
                <Link href="/dashboard/properties" className="text-brand-primary hover:underline">
                  Manage properties
                </Link>
              </p>
            ) : null}
          </div>
        </ScenarioInputCard>

        <ScenarioInputCard title="Schedule" subtitle="Pick a date and preferred service window.">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            <div className="min-w-0">
              <DateField
                id="scheduledDate"
                label="Date *"
                value={scheduledDate}
                onChange={setScheduledDate}
                min={getTomorrowDate()}
                required
                inputClassName="min-h-[44px]"
              />
            </div>

            <div className="min-w-0">
              <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-[hsl(var(--mobile-text-primary))]">
                <Clock3 className="h-4 w-4 text-[hsl(var(--mobile-text-muted))]" /> Start Time *
              </label>
              <div className="relative min-w-0">
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="min-h-[44px] min-w-0 w-full appearance-none rounded-lg border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
                  required
                  aria-label="Select start time"
                />
              </div>
              <p className="mt-1 text-xs text-[hsl(var(--mobile-text-muted))]">Select a preferred start time.</p>
            </div>

            <div className="min-w-0">
              <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-[hsl(var(--mobile-text-primary))]">
                <Clock3 className="h-4 w-4 text-[hsl(var(--mobile-text-muted))]" /> End Time (Optional)
              </label>
              <div className="relative min-w-0">
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="min-h-[44px] min-w-0 w-full appearance-none rounded-lg border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
                  aria-label="Select optional end time"
                />
              </div>
              <p className="mt-1 text-xs text-[hsl(var(--mobile-text-muted))]">Add an end time if you have a hard stop.</p>
            </div>
          </div>
        </ScenarioInputCard>

        <ScenarioInputCard title="Request Details" subtitle="Describe the work and any special requests.">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[hsl(var(--mobile-text-primary))]">
              Description * <span className="font-normal text-[hsl(var(--mobile-text-muted))]">(minimum 10 characters)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => setDescriptionTouched(true)}
              rows={4}
              placeholder="Please describe the work needed in detail (at least 10 characters)..."
              className={`min-h-[44px] w-full rounded-lg border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary ${
                showDescriptionError ? 'border-rose-300 focus:ring-rose-200' : 'border-[hsl(var(--mobile-border-subtle))]'
              }`}
              required
              minLength={10}
            />
            <p
              className={`mt-1 flex items-center gap-1 text-xs ${
                showDescriptionError ? 'text-rose-700' : 'text-[hsl(var(--mobile-text-muted))]'
              }`}
            >
              {showDescriptionError ? <AlertCircle className="h-3.5 w-3.5" /> : null}
              {showDescriptionError ? 'Please enter at least 10 characters.' : `Minimum 10 characters (${descriptionLength}/10)`}
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-[hsl(var(--mobile-text-primary))]">Special Requests (Optional)</label>
            <textarea
              value={specialRequests}
              onChange={(e) => setSpecialRequests(e.target.value)}
              rows={3}
              placeholder="Any special requirements or preferences..."
              className="min-h-[44px] w-full rounded-lg border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
            />
          </div>
        </ScenarioInputCard>

        <div
          id="provider-booking-submit"
          data-chat-collision-zone="true"
          className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 -mx-1 rounded-2xl border border-[hsl(var(--mobile-border-subtle))] bg-white/95 p-2 backdrop-blur supports-[backdrop-filter]:bg-white/85"
        >
          <ActionPriorityRow
            primaryAction={
              <button
                type="submit"
                disabled={isSubmitting || services.length === 0 || properties.length === 0 || isExecutionBlocked}
                className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-brand-primary py-3 text-base font-semibold text-white transition-opacity disabled:opacity-60"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Creating Booking...
                  </>
                ) : isExecutionBlocked ? (
                  <>
                    <AlertCircle className="h-4 w-4" /> Complete prior step first
                  </>
                ) : (
                  <>
                    <Calendar className="h-4 w-4" /> Create Booking
                  </>
                )}
              </button>
            }
            secondaryActions={
              <button
                type="button"
                onClick={() => router.back()}
                className="min-h-[44px] w-full rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 text-sm font-medium text-[hsl(var(--mobile-text-primary))]"
              >
                Cancel
              </button>
            }
          />
        </div>
      </form>
      <BottomSafeAreaReserve size="floatingAction" />
    </ProviderShellTemplate>
  );
}
