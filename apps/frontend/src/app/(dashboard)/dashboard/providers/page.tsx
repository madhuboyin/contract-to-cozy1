'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api/client';
import { Provider, ServiceCategory } from '@/types';

export default function ProvidersPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [zipCode, setZipCode] = useState('');
  const [category, setCategory] = useState<string>('');
  const [radius, setRadius] = useState<number>(25);

  const categories: ServiceCategory[] = [
    'INSPECTION',
    'HANDYMAN',
    'PLUMBING',
    'ELECTRICAL',
    'HVAC',
    'CARPENTRY',
    'PAINTING',
    'ROOFING',
    'LANDSCAPING',
    'CLEANING',
    'OTHER',
  ];

  const searchProviders = async () => {
    if (!zipCode) {
      alert('Please enter a ZIP code');
      return;
    }

    setLoading(true);
    setHasSearched(true);
    try {
      const params: any = {
        zipCode,
        radius,
      };
      
      if (category) {
        params.category = category;
      }

      const response = await api.searchProviders(params);
      if (response.success) {
        setProviders(response.data.providers);
      }
    } catch (error) {
      console.error('Failed to search providers:', error);
      alert('Failed to search providers. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      searchProviders();
    }
  };

  return (
    <div className="px-4 sm:px-6 lg:px-8">
      <div className="sm:flex sm:items-center">
        <div className="sm:flex-auto">
          <h1 className="text-2xl font-semibold text-gray-900">Find Providers</h1>
          <p className="mt-2 text-sm text-gray-700">
            Search for trusted service providers in your area
          </p>
        </div>
      </div>

      {/* Search Form */}
      <div className="mt-6 bg-white shadow rounded-lg p-6">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              ZIP Code *
            </label>
            <input
              type="text"
              value={zipCode}
              onChange={(e) => setZipCode(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="e.g. 08536"
              maxLength={5}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Service Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Categories</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Search Radius
            </label>
            <select
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value={10}>10 miles</option>
              <option value={25}>25 miles</option>
              <option value={50}>50 miles</option>
              <option value={100}>100 miles</option>
            </select>
          </div>
        </div>

        <div className="mt-6">
          <button
            onClick={searchProviders}
            disabled={loading}
            className="w-full sm:w-auto px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
          >
            {loading ? (
              <span className="flex items-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Searching...
              </span>
            ) : (
              'Search Providers'
            )}
          </button>
        </div>
      </div>

      {/* Results */}
      <div className="mt-8">
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Searching for providers...</p>
          </div>
        ) : !hasSearched ? (
          <div className="text-center py-12 bg-white rounded-lg border-2 border-dashed border-gray-300">
            <svg
              className="mx-auto h-12 w-12 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900">Start Your Search</h3>
            <p className="mt-1 text-sm text-gray-500">
              Enter your ZIP code above to find service providers near you
            </p>
          </div>
        ) : providers.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
            <svg
              className="mx-auto h-12 w-12 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900">No providers found</h3>
            <p className="mt-1 text-sm text-gray-500">
              Try adjusting your search radius or selecting a different category
            </p>
          </div>
        ) : (
          <>
            <div className="mb-4 text-sm text-gray-600">
              Found {providers.length} provider{providers.length !== 1 ? 's' : ''}
            </div>
            
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {providers.map((provider) => (
                <Link
                  key={provider.id}
                  href={`/dashboard/providers/${provider.id}`}
                  className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow p-6 border border-gray-200"
                >
                  <div className="flex items-start justify-between">
                    <h3 className="text-lg font-medium text-gray-900 flex-1">
                      {provider.businessName}
                    </h3>
                    {provider.averageRating > 0 && (
                      <div className="flex items-center ml-2">
                        <span className="text-yellow-400">★</span>
                        <span className="ml-1 text-sm font-medium text-gray-700">
                          {provider.averageRating.toFixed(1)}
                        </span>
                      </div>
                    )}
                  </div>

                  <p className="mt-1 text-sm text-gray-500">
                    {provider.firstName} {provider.lastName}
                  </p>

                  <div className="mt-4 space-y-2">
                    {provider.phone && (
                      <div className="flex items-center text-sm text-gray-600">
                        <svg className="w-4 h-4 mr-2 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                        </svg>
                        {provider.phone}
                      </div>
                    )}

                    <div className="flex items-center text-sm text-gray-600">
                      <svg className="w-4 h-4 mr-2 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                      </svg>
                      Service radius: {provider.serviceRadius} miles
                    </div>

                    {provider.totalReviews > 0 && (
                      <div className="text-sm text-gray-500">
                        {provider.totalReviews} review{provider.totalReviews !== 1 ? 's' : ''}
                        {provider.totalCompletedJobs > 0 && (
                          <> • {provider.totalCompletedJobs} job{provider.totalCompletedJobs !== 1 ? 's' : ''} completed</>
                        )}
                      </div>
                    )}
                  </div>

                  {provider.serviceCategories.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-1">
                      {provider.serviceCategories.slice(0, 3).map((cat) => (
                        <span
                          key={cat}
                          className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-50 text-blue-700"
                        >
                          {cat.replace('_', ' ')}
                        </span>
                      ))}
                      {provider.serviceCategories.length > 3 && (
                        <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-gray-50 text-gray-700">
                          +{provider.serviceCategories.length - 3} more
                        </span>
                      )}
                    </div>
                  )}

                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <span className="text-sm font-medium text-blue-600">View Profile →</span>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}