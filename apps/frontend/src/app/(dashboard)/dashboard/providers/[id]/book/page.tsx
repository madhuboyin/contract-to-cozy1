// apps/frontend/src/app/(dashboard)/dashboard/providers/[id]/book/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api/client';
import { Provider, Service, Property, CreateBookingInput } from '@/types';
import { useToast } from '@/components/ui/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { Calendar, Loader2 } from 'lucide-react';
import { formatEnumLabel } from '@/lib/utils/formatters';
import DateField from '@/components/shared/DateField';

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
  const providerId = params.id as string;

  const [provider, setProvider] = useState<Provider | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string>('');

  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [selectedPropertyId, setSelectedPropertyId] = useState(preSelectedPropertyId || '');
  const [scheduledDate, setScheduledDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [description, setDescription] = useState('');
  const [specialRequests, setSpecialRequests] = useState('');
  const [estimatedPrice, setEstimatedPrice] = useState<number>(0);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerId, serviceCategory]);

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

        if (!preSelectedPropertyId) {
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

  const toISODateTime = (date: string, time: string): string => {
    return `${date}T${time}:00Z`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-1/4 rounded bg-gray-200" />
          <div className="h-64 rounded bg-gray-200" />
        </div>
      </div>
    );
  }

  if (!provider) {
    return (
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="py-12 text-center">
          <p className="text-gray-600">Provider not found</p>
          <button onClick={() => router.back()} className="mt-4 text-blue-600 hover:text-blue-700">
            ← Go back
          </button>
        </div>
      </div>
    );
  }

  const getTomorrowDate = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  };

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
      <div className="mb-6">
        <button
          onClick={() => router.back()}
          className="mb-4 flex min-h-[44px] items-center text-sm text-gray-600 hover:text-gray-900"
        >
          <svg className="mr-1 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>

        <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">Book a Service</h1>
      </div>

      {error && (
        <div className="mb-6 rounded-md border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-teal-100 bg-teal-50 p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-primary text-sm font-bold text-white">
            {getInitials(provider.user?.firstName ?? '', provider.user?.lastName ?? '') || '?'}
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Booking with</p>
            <p className="text-base font-semibold text-gray-900">{provider.businessName}</p>
          </div>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">Service *</label>
          {services.length === 0 ? (
            <p className="text-sm text-gray-500">No services available</p>
          ) : (
            <select
              value={selectedServiceId}
              onChange={(e) => handleServiceChange(e.target.value)}
              className="min-h-[44px] w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-primary"
              required
            >
              {services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name} - ${service.basePrice}/{service.priceUnit}
                </option>
              ))}
            </select>
          )}

          {estimatedPrice > 0 && (
            <div className="mt-1.5 flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-3 py-1 text-sm font-semibold text-green-700">
                Estimated: ${estimatedPrice.toFixed(2)}
              </span>
              <span className="text-xs text-gray-400">Final price set by provider</span>
            </div>
          )}
        </div>

        {estimatedPrice > 0 && (
          <p className="mt-1 text-xs text-gray-400">* This estimate updates when you change the selected service.</p>
        )}

        <div className="my-5 flex items-center gap-2">
          <div className="h-px flex-1 bg-gray-100" />
          <span className="text-xs font-medium uppercase tracking-wide text-gray-400">Property</span>
          <div className="h-px flex-1 bg-gray-100" />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">Property *</label>
          {properties.length === 0 ? (
            <div className="rounded-md border border-yellow-200 bg-yellow-50 p-4">
              <p className="mb-2 text-sm text-yellow-800">⚠️ No properties found. Please add a property first.</p>
              <Link
                href="/dashboard/properties/new"
                className="inline-flex items-center text-sm font-medium text-blue-600 hover:text-blue-700"
              >
                <svg className="mr-1 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Property
              </Link>
            </div>
          ) : (
            <select
              value={selectedPropertyId}
              onChange={(e) => setSelectedPropertyId(e.target.value)}
              className="min-h-[44px] w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-primary"
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
          {properties.length > 0 && (
            <p className="mt-1 text-sm text-gray-500">
              <Link href="/dashboard/properties" className="text-blue-600 hover:text-blue-700">
                Manage properties
              </Link>
            </p>
          )}
        </div>

        <div className="my-5 flex items-center gap-2">
          <div className="h-px flex-1 bg-gray-100" />
          <span className="text-xs font-medium uppercase tracking-wide text-gray-400">Scheduling</span>
          <div className="h-px flex-1 bg-gray-100" />
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <DateField
            id="scheduledDate"
            label="Date *"
            value={scheduledDate}
            onChange={setScheduledDate}
            min={getTomorrowDate()}
            required
            inputClassName="min-h-[44px]"
          />

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Start Time *</label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="min-h-[44px] w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-primary"
              required
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">End Time (Optional)</label>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="min-h-[44px] w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-primary"
            />
          </div>
        </div>

        <div className="my-5 flex items-center gap-2">
          <div className="h-px flex-1 bg-gray-100" />
          <span className="text-xs font-medium uppercase tracking-wide text-gray-400">Description</span>
          <div className="h-px flex-1 bg-gray-100" />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">
            Description * <span className="font-normal text-gray-500">(minimum 10 characters)</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            placeholder="Please describe the work needed in detail (at least 10 characters)..."
            className="min-h-[44px] w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-primary"
            required
            minLength={10}
          />
          <p className="mt-1 text-sm text-gray-500">{description.length}/10 characters minimum</p>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">Special Requests (Optional)</label>
          <textarea
            value={specialRequests}
            onChange={(e) => setSpecialRequests(e.target.value)}
            rows={3}
            placeholder="Any special requirements or preferences..."
            className="min-h-[44px] w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-primary"
          />
        </div>

        <div className="border-t border-gray-200 pt-4">
          <button
            type="submit"
            disabled={isSubmitting || services.length === 0 || properties.length === 0}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-primary py-3 text-base font-semibold text-white transition-opacity disabled:opacity-60"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Creating Booking...
              </>
            ) : (
              <>
                <Calendar className="h-4 w-4" /> Create Booking
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
