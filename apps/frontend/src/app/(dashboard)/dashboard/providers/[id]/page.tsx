'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api/client';
import { Provider, Service } from '@/types';

export default function ProviderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const providerId = params.id as string;

  const [provider, setProvider] = useState<Provider | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'services' | 'about' | 'reviews'>('services');

  useEffect(() => {
    loadProvider();
    loadServices();
  }, [providerId]);

  const loadProvider = async () => {
    try {
      const response = await api.getProvider(providerId);
      if (response.success) {
        setProvider(response.data);
      }
    } catch (error) {
      console.error('Failed to load provider:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadServices = async () => {
    try {
      const response = await api.getProviderServices(providerId);
      if (response.success) {
        setServices(response.data.services);
      }
    } catch (error) {
      console.error('Failed to load services:', error);
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
          <Link href="/dashboard/providers" className="text-blue-600 hover:text-blue-700 mt-4 inline-block">
            ← Back to search
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8">
      {/* Back Button */}
      <div className="mb-4">
        <button
          onClick={() => router.back()}
          className="text-sm text-gray-600 hover:text-gray-900 flex items-center"
        >
          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to search
        </button>
      </div>

      {/* Provider Header */}
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-gray-900">{provider.businessName}</h1>
            <p className="mt-1 text-lg text-gray-600">
              {provider.firstName} {provider.lastName}
            </p>
            
            <div className="mt-4 flex items-center space-x-6">
              {provider.averageRating > 0 && (
                <div className="flex items-center">
                  <span className="text-yellow-400 text-xl">★</span>
                  <span className="ml-2 text-lg font-medium text-gray-900">
                    {provider.averageRating.toFixed(1)}
                  </span>
                  <span className="ml-1 text-sm text-gray-500">
                    ({provider.totalReviews} review{provider.totalReviews !== 1 ? 's' : ''})
                  </span>
                </div>
              )}
              
              {provider.totalCompletedJobs > 0 && (
                <div className="text-sm text-gray-600">
                  <span className="font-medium">{provider.totalCompletedJobs}</span> job{provider.totalCompletedJobs !== 1 ? 's' : ''} completed
                </div>
              )}
            </div>

            <div className="mt-4 space-y-2">
              <div className="flex items-center text-sm text-gray-600">
                <svg className="w-5 h-5 mr-2 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                  <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                </svg>
                {provider.email}
              </div>

              {provider.phone && (
                <div className="flex items-center text-sm text-gray-600">
                  <svg className="w-5 h-5 mr-2 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                  </svg>
                  {provider.phone}
                </div>
              )}

              <div className="flex items-center text-sm text-gray-600">
                <svg className="w-5 h-5 mr-2 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                </svg>
                Service radius: {provider.serviceRadius} miles
              </div>
            </div>
          </div>

          <div className="ml-6">
            <Link
              href={`/dashboard/providers/${provider.id}/book`}
              className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
            >
              Book Now
            </Link>
          </div>
        </div>

        {/* Service Categories */}
        {provider.serviceCategories.length > 0 && (
          <div className="mt-6 pt-6 border-t border-gray-200">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Service Categories</h3>
            <div className="flex flex-wrap gap-2">
              {provider.serviceCategories.map((category) => (
                <span
                  key={category}
                  className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800"
                >
                  {category.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('services')}
            className={`${
              activeTab === 'services'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
          >
            Services ({services.length})
          </button>
          <button
            onClick={() => setActiveTab('about')}
            className={`${
              activeTab === 'about'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
          >
            About
          </button>
          <button
            onClick={() => setActiveTab('reviews')}
            className={`${
              activeTab === 'reviews'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
          >
            Reviews ({provider.totalReviews})
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      <div className="mt-6">
        {activeTab === 'services' && (
          <div className="space-y-4">
            {services.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
                <p className="text-gray-500">No services listed</p>
              </div>
            ) : (
              services.map((service) => (
                <div key={service.id} className="bg-white shadow rounded-lg p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="text-lg font-medium text-gray-900">{service.name}</h3>
                      <p className="mt-1 text-sm text-gray-500">{service.category.replace('_', ' ')}</p>
                      {service.description && (
                        <p className="mt-2 text-sm text-gray-600">{service.description}</p>
                      )}
                      {service.estimatedDuration && (
                        <p className="mt-2 text-sm text-gray-500">
                          Estimated duration: {service.estimatedDuration} minutes
                        </p>
                      )}
                    </div>
                    <div className="ml-6 text-right">
                      <p className="text-2xl font-bold text-gray-900">${service.basePrice}</p>
                      <p className="text-sm text-gray-500">per {service.priceUnit}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'about' && (
          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">About {provider.businessName}</h3>
            <div className="space-y-4 text-sm text-gray-600">
              <p>Professional service provider serving the local community.</p>
              <p>Contact us for reliable and quality service.</p>
            </div>
          </div>
        )}

        {activeTab === 'reviews' && (
          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Customer Reviews</h3>
            {provider.totalReviews === 0 ? (
              <p className="text-sm text-gray-500">No reviews yet</p>
            ) : (
              <p className="text-sm text-gray-500">Reviews feature coming soon</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}