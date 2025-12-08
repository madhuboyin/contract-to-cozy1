// apps/frontend/src/app/(dashboard)/dashboard/providers/[id]/book/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api/client';
import { Provider, Service, Property, CreateBookingInput } from '@/types';
// FIX: Import useQueryClient for cache invalidation
import { useQueryClient } from '@tanstack/react-query'; 

// --- Helper Function ---
function formatServiceCategory(category: string | null): string {
  if (!category) return '';
  return category
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}
// ---

export default function BookProviderPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  
  const searchParams = useSearchParams();
  const serviceCategory = searchParams.get('service');
  const preSelectedPropertyId = searchParams.get('propertyId');
  // NEW: Extract health insight tracking from URL
  const insightFactor = searchParams.get('insightFactor');
  const insightContext = searchParams.get('insightContext');
  //const preSelectedServiceId = searchParams.get('service');
  const providerId = params.id as string;

  const [provider, setProvider] = useState<Provider | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>('');

  // Form state
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [selectedPropertyId, setSelectedPropertyId] = useState(preSelectedPropertyId || ''); // MODIFIED
  const [scheduledDate, setScheduledDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [description, setDescription] = useState('');
  const [specialRequests, setSpecialRequests] = useState('');
  const [estimatedPrice, setEstimatedPrice] = useState<number>(0);

  useEffect(() => {
    // Added serviceCategory to dependency array
    loadData();
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
          
          // Logic to pre-select service based on URL category hint
          if (serviceCategory) {
            const targetCategory = formatServiceCategory(serviceCategory).toLowerCase();

            // Try to find a service where the name contains the target category word (e.g., 'inspection')
            const matchedService = servicesList.find(s => 
              s.name.toLowerCase().includes(targetCategory.split(' ')[0].toLowerCase())
            );

            if (matchedService) {
                defaultService = matchedService;
            }
          }
          // ---

          setSelectedServiceId(defaultService.id);
          setEstimatedPrice(parseFloat(defaultService.basePrice));
        }
      }

      if (propertiesRes.success && propertiesRes.data.properties.length > 0) {
        setProperties(propertiesRes.data.properties);
        const primaryProperty = propertiesRes.data.properties.find(p => p.isPrimary);
        setSelectedPropertyId(primaryProperty?.id || propertiesRes.data.properties[0].id);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleServiceChange = (serviceId: string) => {
    setSelectedServiceId(serviceId);
    const service = services.find(s => s.id === serviceId);
    if (service) {
      setEstimatedPrice(parseFloat(service.basePrice));
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
      providerId: provider.user.id,
      serviceId: selectedServiceId,
      propertyId: selectedPropertyId,
      scheduledDate: scheduledDateTime,
      startTime: startDateTime,
      endTime: endDateTime,
      description: description.trim(),
      specialRequests: specialRequests.trim() || undefined,
      estimatedPrice,
      // NEW: Include health insight tracking fields
      ...(insightFactor && { insightFactor }),
      ...(insightContext && { insightContext }),
    };

    console.log('Submitting booking:', bookingData);

    setSubmitting(true);
    try {
      const response = await api.createBooking(bookingData);
      console.log('Booking response:', response);
      
      if (response.success) {
        // Invalidate caches to force re-fetch of updated data
        await Promise.all([
          // Invalidate bookings cache (for Upcoming Bookings card)
          queryClient.invalidateQueries({ queryKey: ['bookings'] }),
          // Invalidate properties cache (for health scores and insights)
          queryClient.invalidateQueries({ queryKey: ['properties'] }),
          // Invalidate specific property if we know the ID
          queryClient.invalidateQueries({ queryKey: ['property', selectedPropertyId] }),
        ]);
      
        alert('Booking created successfully!');
        router.push('/dashboard/bookings');
      } else {
        setError(response.message || 'Failed to create booking');
        console.error('Booking error:', response);
      }
    } catch (error) {
      console.error('Failed to create booking:', error);
      setError('An error occurred. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (!provider) {
    return (
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="text-center py-12">
          <p className="text-gray-600">Provider not found</p>
          <button onClick={() => router.back()} className="text-blue-600 hover:text-blue-700 mt-4">
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
    <div className="px-4 sm:px-6 lg:px-8 max-w-3xl mx-auto">
      <div className="mb-6">
        <button
          onClick={() => router.back()}
          className="text-sm text-gray-600 hover:text-gray-900 flex items-center mb-4"
        >
          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        
        <h1 className="text-2xl font-bold text-gray-900">Book a Service</h1>
        <p className="mt-1 text-sm text-gray-600">
          Booking with <span className="font-medium">{provider.businessName}</span>
        </p>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex">
            <svg className="h-5 w-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <div className="ml-3">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white shadow rounded-lg p-6 space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Service *
          </label>
          {services.length === 0 ? (
            <p className="text-sm text-gray-500">No services available</p>
          ) : (
            <select
              value={selectedServiceId}
              onChange={(e) => handleServiceChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              {services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name} - ${service.basePrice}/{service.priceUnit}
                </option>
              ))}
            </select>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Property *
          </label>
          {properties.length === 0 ? (
            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
              <p className="text-sm text-yellow-800 mb-2">
                ⚠️ No properties found. Please add a property first.
              </p>
              <Link
                href="/dashboard/properties/new"
                className="inline-flex items-center text-sm font-medium text-blue-600 hover:text-blue-700"
              >
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Property
              </Link>
            </div>
          ) : (
            <select
              value={selectedPropertyId}
              onChange={(e) => setSelectedPropertyId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Date *
            </label>
            <input
              type="date"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
              min={getTomorrowDate()}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Start Time *
            </label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              End Time (Optional)
            </label>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Description * <span className="text-gray-500 font-normal">(minimum 10 characters)</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            placeholder="Please describe the work needed in detail (at least 10 characters)..."
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
            minLength={10}
          />
          <p className="mt-1 text-sm text-gray-500">
            {description.length}/10 characters minimum
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Special Requests (Optional)
          </label>
          <textarea
            value={specialRequests}
            onChange={(e) => setSpecialRequests(e.target.value)}
            rows={3}
            placeholder="Any special requirements or preferences..."
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Estimated Price *
          </label>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500">$</span>
            <input
              type="number"
              value={estimatedPrice}
              onChange={(e) => setEstimatedPrice(parseFloat(e.target.value) || 0)}
              min="0"
              step="0.01"
              className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <p className="mt-1 text-sm text-gray-500">
            This is an estimate. The final price may be adjusted by the provider.
          </p>
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-gray-200">
          <button
            type="button"
            onClick={() => router.back()}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Cancel
          </button>
          
          <button
            type="submit"
            disabled={submitting || services.length === 0 || properties.length === 0}
            className="px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {submitting ? 'Creating Booking...' : 'Create Booking'}
          </button>
        </div>
      </form>
    </div>
  );
}