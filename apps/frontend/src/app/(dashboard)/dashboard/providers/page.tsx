// apps/frontend/src/app/(dashboard)/dashboard/providers/page.tsx
'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/AuthContext';
import { api } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MapPin, Search, Star, Loader2, ListChecks, Info } from 'lucide-react';
import { Provider, ServiceCategory } from '@/types';
import { cn } from '@/lib/utils';
import { ServiceCategoryIcon } from '@/components/ServiceCategoryIcon';
import { formatEnumLabel } from '@/lib/utils/formatters';

const DEFAULT_RADIUS = 25;
const CATEGORIES: { value: ServiceCategory; label: string; icon?: string }[] = [
  { value: 'INSPECTION', label: 'Home Inspection', icon: 'INSPECTION' },
  { value: 'HANDYMAN', label: 'Handyman Services', icon: 'HANDYMAN' },
  { value: 'PLUMBING', label: 'Plumbing', icon: 'PLUMBING' },
  { value: 'ELECTRICAL', label: 'Electrical', icon: 'ELECTRICAL' },
  { value: 'HVAC', label: 'HVAC', icon: 'HVAC' },
  { value: 'CLEANING', label: 'Cleaning', icon: 'CLEANING' },
  { value: 'LANDSCAPING', label: 'Landscaping', icon: 'LANDSCAPING' },
];

interface ServiceFilterProps {
  onFilterChange: (filters: { zipCode: string; category: string | undefined }) => void;
  defaultCategory?: string;
  defaultZipCode?: string;
  isHomeBuyer: boolean;
  isSearching: boolean;
}

const ServiceFilter = React.memo(
  ({ onFilterChange, defaultCategory, defaultZipCode, isHomeBuyer, isSearching }: ServiceFilterProps) => {
    const [zipCode, setZipCode] = useState(defaultZipCode || '');
    const [selectedCategory, setSelectedCategory] = useState<string>(defaultCategory || 'ALL');

    const displayCategories = useMemo(() => {
      if (isHomeBuyer) {
        return CATEGORIES.filter((c) => ['INSPECTION', 'HANDYMAN', 'CLEANING'].includes(c.value));
      }
      return CATEGORIES;
    }, [isHomeBuyer]);

    const handleSearch = useCallback(
      (e?: React.FormEvent) => {
        e?.preventDefault();

        const categoryValue = selectedCategory === 'ALL' ? undefined : selectedCategory;

        onFilterChange({
          zipCode: zipCode.trim(),
          category: categoryValue,
        });
      },
      [zipCode, selectedCategory, onFilterChange]
    );

    useEffect(() => {
      if (defaultCategory && defaultCategory !== selectedCategory) {
        setSelectedCategory(defaultCategory);
        onFilterChange({
          zipCode: zipCode.trim(),
          category: defaultCategory === 'ALL' ? undefined : defaultCategory,
        });
      }
    }, [defaultCategory, selectedCategory, onFilterChange, zipCode]);

    useEffect(() => {
      if (typeof defaultZipCode === 'string' && defaultZipCode !== zipCode) {
        setZipCode(defaultZipCode);
      }
    }, [defaultZipCode, zipCode]);

    return (
      <div className="relative isolate overflow-hidden rounded-2xl border border-teal-100 bg-gradient-to-br from-teal-100 via-white to-emerald-100 p-6 shadow-md">
        <div className="mb-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900 sm:text-xl">
            <Search className="h-5 w-5 text-brand-primary" />
            Find Local Providers
          </h2>
          <p className="mt-1 text-sm text-gray-600">Search for trusted professionals based on service and location.</p>
        </div>

        <form onSubmit={handleSearch} className="space-y-4 sm:grid sm:grid-cols-4 sm:gap-4 sm:space-y-0">
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-sm font-medium">Service Category</label>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="min-h-[44px] w-full text-base">
                <SelectValue placeholder={isHomeBuyer ? 'Inspection (Required)' : 'Select a Category'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL" className="min-h-[44px] text-gray-500">
                  All Categories
                </SelectItem>
                {displayCategories.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value} className="min-h-[44px]">
                    <div className="flex items-center">
                      <ServiceCategoryIcon icon={cat.value} className="mr-2 h-4 w-4" />
                      {cat.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">Zip Code</label>
            <Input
              type="text"
              placeholder="e.g., 78701"
              value={zipCode}
              onChange={(e) => setZipCode(e.target.value)}
              className="min-h-[44px] w-full text-base"
            />
          </div>

          <div className="flex items-end">
            <Button
              type="submit"
              size="lg"
              disabled={isSearching}
              className="min-h-[44px] w-full bg-brand-primary text-white hover:bg-brand-primary/90"
            >
              {isSearching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
              {isSearching ? 'Searching...' : 'Search'}
            </Button>
          </div>
        </form>

        <div className="-mx-1 mt-4 overflow-x-auto px-1">
          <div className="flex gap-2 pb-1">
            {displayCategories.slice(0, 6).map((cat) => (
              <button
                key={cat.value}
                type="button"
                onClick={() => {
                  setSelectedCategory(cat.value);
                  onFilterChange({ zipCode: zipCode.trim(), category: cat.value });
                }}
                className={cn(
                  'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all',
                  selectedCategory === cat.value
                    ? 'border-brand-primary bg-brand-primary text-white shadow-sm'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-teal-300 hover:bg-teal-50'
                )}
              >
                <ServiceCategoryIcon icon={cat.value} className="h-3 w-3" />
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {isHomeBuyer && (
          <div className="mt-4 rounded-lg border-l-4 border-brand-primary bg-teal-50 p-3 text-sm text-teal-700">
            <ListChecks className="mr-1 inline h-4 w-4" />
            We recommend starting with a <span className="font-semibold">Home Inspection</span>.
          </div>
        )}
      </div>
    );
  }
);
ServiceFilter.displayName = 'ServiceFilter';

const ProviderList = ({
  providers,
  targetPropertyId,
  insightContext,
  category,
  fromSource,
  predictionId,
  inventoryItemId,
}: {
  providers: Provider[];
  targetPropertyId?: string;
  insightContext?: string;
  category?: string;
  fromSource?: string;
  predictionId?: string;
  inventoryItemId?: string;
}) => {
  return (
    <div className="animate-fade-in-up grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {providers.map((provider) => {
        const queryParams = new URLSearchParams();
        if (targetPropertyId) queryParams.append('propertyId', targetPropertyId);
        if (insightContext) queryParams.append('insightFactor', insightContext);
        if (category) queryParams.append('category', category);
        if (fromSource) queryParams.append('from', fromSource);
        if (predictionId) queryParams.append('predictionId', predictionId);
        if (inventoryItemId) queryParams.append('itemId', inventoryItemId);

        const profileLink = queryParams.toString()
          ? `/dashboard/providers/${provider.id}?${queryParams.toString()}`
          : `/dashboard/providers/${provider.id}`;

        return (
          <div
            key={provider.id}
            className="group relative flex flex-col rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-teal-100 hover:shadow-lg"
          >
            <div className="mb-1 flex items-start justify-between gap-2">
              <h3 className="line-clamp-2 text-base font-semibold leading-tight text-gray-900">{provider.businessName}</h3>
              <div className="flex shrink-0 items-center gap-1 rounded-full border border-yellow-200 bg-yellow-50 px-2 py-0.5 text-xs font-semibold text-yellow-700">
                <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                {provider.averageRating.toFixed(1)}
              </div>
            </div>

            <p className="mb-3 text-xs text-muted-foreground">
              {provider.totalReviews} {provider.totalReviews === 1 ? 'review' : 'reviews'}
              {provider.totalCompletedJobs > 0 && <> • {provider.totalCompletedJobs} jobs completed</>}
              {provider.totalCompletedJobs === 0 && provider.totalReviews > 0 && <> • New to platform</>}
            </p>

            <div className="mb-3 flex flex-wrap gap-1.5">
              {provider.serviceCategories.slice(0, 2).map((cat) => (
                <span
                  key={cat}
                  className="inline-flex items-center gap-1 rounded-md border border-teal-100 bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-700"
                >
                  <ServiceCategoryIcon icon={cat} className="h-3 w-3" />
                  {formatEnumLabel(cat)}
                </span>
              ))}
              {provider.serviceCategories.length > 2 && (
                <span className="inline-flex items-center rounded-md border border-gray-100 bg-gray-50 px-2 py-0.5 text-xs text-gray-500">
                  +{provider.serviceCategories.length - 2} more
                </span>
              )}
            </div>

            <div className="mb-4 flex items-center gap-1.5 text-xs text-gray-500">
              <MapPin className="h-3 w-3 shrink-0 text-red-400" />
              Serves up to {provider.serviceRadius ?? 'N/A'} miles
            </div>

            <div className="mt-auto border-t border-gray-50 pt-3">
              <Link
                href={profileLink}
                className="block w-full rounded-xl bg-brand-primary px-4 py-2.5 text-center text-sm font-medium text-white transition-colors hover:bg-brand-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2"
              >
                View Profile
              </Link>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default function ProvidersPage() {
  const { user, loading } = useAuth();
  const searchParams = useSearchParams();

  const defaultCategory = searchParams.get('category') || searchParams.get('service') || undefined;
  const insightContext = searchParams.get('insightFactor') || undefined;
  const targetPropertyId = searchParams.get('propertyId') || undefined;
  const predictionId = searchParams.get('predictionId') || undefined;
  const inventoryItemId = searchParams.get('itemId') || undefined;

  const [providers, setProviders] = useState<Provider[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contextItemName, setContextItemName] = useState<string | null>(null);
  const [propertyZipCode, setPropertyZipCode] = useState<string>('');

  const isHomeBuyer = user?.segment === 'HOME_BUYER';
  const initialZipCode = '';
  const initialCategory = defaultCategory || '';

  const hasInitialFetchedRef = useRef(false);

  const [filters, setFilters] = useState({
    zipCode: initialZipCode,
    category: initialCategory,
  });

  const fetchProviders = useCallback(
    async (currentFilters: typeof filters) => {
      if (dataLoading) return;

      if (!currentFilters.zipCode && !currentFilters.category) {
        if (!isHomeBuyer) return;
      }

      setDataLoading(true);
      setError(null);
      try {
        const params: { category?: string; radius: number; zipCode?: string } = {
          category: currentFilters.category === 'ALL' || !currentFilters.category ? undefined : currentFilters.category,
          radius: DEFAULT_RADIUS,
        };

        if (currentFilters.zipCode) {
          params.zipCode = currentFilters.zipCode;
        }

        const response = await api.searchProviders(params);

        if (response.success && response.data) {
          setProviders(response.data.providers);
        } else {
          const errorMessage = 'message' in response ? response.message : 'Failed to search providers.';
          setError(errorMessage || 'Failed to search providers.');
          setProviders([]);
        }
      } catch {
        setError('An unexpected error occurred during search.');
        setProviders([]);
      } finally {
        setDataLoading(false);
      }
    },
    [dataLoading, isHomeBuyer]
  );

  const handleFilterChange = useCallback(
    (newFilters: { zipCode: string; category: string | undefined }) => {
      const updatedFilters = {
        zipCode: newFilters.zipCode,
        category: newFilters.category || 'ALL',
      };
      setFilters(updatedFilters);
      fetchProviders(updatedFilters);
    },
    [fetchProviders]
  );

  const fromSource = searchParams.get('from') || undefined;

  useEffect(() => {
    if (hasInitialFetchedRef.current) return;
    hasInitialFetchedRef.current = true;

    const run = async () => {
      let zipForInitialSearch = '';

      if (targetPropertyId) {
        try {
          const propertyRes = await api.getProperty(targetPropertyId);
          if (propertyRes.success && propertyRes.data?.zipCode) {
            zipForInitialSearch = propertyRes.data.zipCode;
            setPropertyZipCode(propertyRes.data.zipCode);
          }
        } catch (loadError) {
          console.error('Failed to load target property context:', loadError);
        }
      }

      if (targetPropertyId && inventoryItemId) {
        try {
          const itemRes = await api.get<{ item: { name: string } }>(
            `/api/properties/${targetPropertyId}/inventory/items/${inventoryItemId}`
          );
          if (itemRes.data?.item?.name) {
            setContextItemName(itemRes.data.item.name);
          }
        } catch (loadError) {
          console.error('Failed to load inventory context:', loadError);
        }
      }

      const initialFilterState = {
        zipCode: zipForInitialSearch,
        category: initialCategory || 'ALL',
      };
      setFilters(initialFilterState);

      if (initialFilterState.zipCode || initialCategory) {
        fetchProviders({
          zipCode: initialFilterState.zipCode,
          category: initialCategory || 'ALL',
        });
      }
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      <h1 className="text-xl font-bold tracking-tight sm:text-2xl lg:text-3xl">Provider Search</h1>

      {insightContext && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-3">
              <Info className="h-5 w-5 shrink-0 text-blue-600" />
              <div>
                <p className="text-sm font-semibold text-blue-900">
                  Finding providers for: <span className="font-bold">{formatEnumLabel(insightContext)}</span>
                </p>
                {targetPropertyId && <p className="mt-1 text-xs text-blue-700">Pre-filtered for your selected property</p>}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {contextItemName && (
        <Card className="border-emerald-200 bg-emerald-50">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-3">
              <Info className="h-5 w-5 shrink-0 text-emerald-600" />
              <div>
                <p className="text-sm font-semibold text-emerald-900">Showing pros for your {contextItemName} Maintenance.</p>
                {propertyZipCode && (
                  <p className="mt-1 text-xs text-emerald-700">Local radius filter applied using property ZIP {propertyZipCode}.</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <ServiceFilter
        onFilterChange={handleFilterChange}
        defaultCategory={defaultCategory}
        defaultZipCode={propertyZipCode}
        isHomeBuyer={isHomeBuyer}
        isSearching={dataLoading}
      />

      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            {dataLoading ? 'Searching Providers...' : `${providers.length} Provider${providers.length !== 1 ? 's' : ''} Found`}
          </h2>
          {insightContext && (
            <p className="mt-0.5 text-sm text-teal-700">
              Showing specialists for: <span className="font-medium">{formatEnumLabel(insightContext)}</span>
            </p>
          )}
        </div>
        <Select disabled>
          <SelectTrigger className="w-40 text-sm">
            <SelectValue placeholder="Sort: Top Rated" />
          </SelectTrigger>
        </Select>
      </div>

      {dataLoading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-brand-primary" />
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center sm:p-8">
          <p className="font-medium text-red-600">Error: {error}</p>
          <p className="mt-1 text-sm text-red-500">Please refine your search criteria.</p>
        </div>
      ) : providers.length > 0 ? (
        <ProviderList
          providers={providers}
          targetPropertyId={targetPropertyId}
          insightContext={insightContext}
          category={filters.category === 'ALL' ? undefined : filters.category}
          fromSource={fromSource}
          predictionId={predictionId}
          inventoryItemId={inventoryItemId}
        />
      ) : (
        <div className="rounded-lg border bg-gray-50 p-6 text-center sm:p-8">
          <p className="text-base font-medium text-gray-700 sm:text-lg">No providers found matching your criteria.</p>
          <p className="mt-2 text-sm text-gray-500">Try widening the service category or removing the zip code.</p>
        </div>
      )}
    </div>
  );
}
