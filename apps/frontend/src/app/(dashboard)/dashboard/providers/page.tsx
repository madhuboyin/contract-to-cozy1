// apps/frontend/src/app/(dashboard)/dashboard/providers/page.tsx
'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthContext';
import { api } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge'; 
import { MapPin, Search, Star, Loader2, ListChecks, Info } from 'lucide-react'; // Add Info icon
import { Provider, ServiceCategory } from '@/types';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { ServiceCategoryIcon } from '@/components/ServiceCategoryIcon';

// --- Constants ---
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

// --- Components ---

interface ServiceFilterProps {
  onFilterChange: (filters: { zipCode: string; category: string | undefined }) => void;
  defaultCategory?: string;
  defaultZipCode?: string;
  isHomeBuyer: boolean;
}

const ServiceFilter = React.memo(({ onFilterChange, defaultCategory, defaultZipCode, isHomeBuyer }: ServiceFilterProps) => {
  const [zipCode, setZipCode] = useState(defaultZipCode || '');
  // FIX 1: Use 'ALL' as the placeholder value instead of ''.
  const [selectedCategory, setSelectedCategory] = useState<string>(defaultCategory || 'ALL');

  const displayCategories = useMemo(() => {
    if (isHomeBuyer) {
      return CATEGORIES.filter(c => ['INSPECTION', 'HANDYMAN', 'CLEANING'].includes(c.value));
    }
    return CATEGORIES;
  }, [isHomeBuyer]);

  const handleSearch = useCallback((e?: React.FormEvent) => {
    e?.preventDefault();
    
    // FIX 2: Convert 'ALL' back to 'undefined' when passing to the API
    const categoryValue = selectedCategory === 'ALL' ? undefined : selectedCategory;
    
    onFilterChange({
      zipCode: zipCode.trim(),
      category: categoryValue,
    });
  }, [zipCode, selectedCategory, onFilterChange]);

  // Set default category on mount
  useEffect(() => {
    if (defaultCategory && defaultCategory !== selectedCategory) {
      setSelectedCategory(defaultCategory);
      handleSearch();
    }
  }, [defaultCategory, handleSearch, selectedCategory]);

  useEffect(() => {
    if (typeof defaultZipCode === 'string' && defaultZipCode !== zipCode) {
      setZipCode(defaultZipCode);
    }
  }, [defaultZipCode, zipCode]);

  return (
    <Card className="shadow-lg">
      <CardHeader className="p-4 sm:p-6">
        <CardTitle className="text-lg sm:text-xl flex items-center gap-2">
          <Search className="h-5 w-5 text-blue-600" />
          Find Local Providers
        </CardTitle>
        <CardDescription>
          Search for trusted professionals based on service and location.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
        <form onSubmit={handleSearch} className="space-y-4 sm:space-y-0 sm:grid sm:grid-cols-4 sm:gap-4">
          <div className="sm:col-span-2">
            <label className="text-sm font-medium mb-1.5 block">Service Category</label>
            <Select 
              value={selectedCategory} 
              onValueChange={setSelectedCategory}
            >
              <SelectTrigger className="w-full text-base min-h-[44px]">
                <SelectValue placeholder={isHomeBuyer ? "Inspection (Required)" : "Select a Category"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL" className="text-gray-500 min-h-[44px]">All Categories</SelectItem>
                {displayCategories.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value} className="min-h-[44px]">
                    <div className="flex items-center">
                      <ServiceCategoryIcon icon={cat.value} className="h-4 w-4 mr-2" />
                      {cat.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">Zip Code</label>
            <Input
              type="text"
              placeholder="e.g., 78701"
              value={zipCode}
              onChange={(e) => setZipCode(e.target.value)}
              className="w-full text-base min-h-[44px]"
            />
          </div>
          
          <div className="flex items-end">
            <Button type="submit" className="w-full min-h-[44px]">
              <Search className="h-4 w-4 mr-2" />
              Search
            </Button>
          </div>
        </form>

        {isHomeBuyer && (
          <div className="mt-4 p-3 border-l-4 border-blue-500 bg-blue-50 text-sm text-blue-700">
            <ListChecks className="inline h-4 w-4 mr-1" /> 
            We recommend starting with a **Home Inspection**.
          </div>
        )}
      </CardContent>
    </Card>
  );
});
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
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
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
          <Card 
            key={provider.id} 
            className="group relative flex flex-col hover:shadow-xl transition-shadow duration-300"
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-lg sm:text-xl font-bold truncate pr-2">
                {provider.businessName}
              </CardTitle>
              <div className="flex items-center text-yellow-500 text-sm shrink-0">
                <Star className="h-4 w-4 fill-yellow-500 mr-1" />
                {provider.averageRating.toFixed(1)}
              </div>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col">
              <p className="text-sm text-muted-foreground mb-3">
                {provider.totalReviews} reviews • {provider.totalCompletedJobs} jobs completed
              </p>
              <div className="flex flex-wrap gap-2 mb-4">
                {provider.serviceCategories.slice(0, 3).map(category => (
                  <Badge key={category} variant="secondary" className="text-xs">
                    <ServiceCategoryIcon icon={category} className="h-3 w-3 mr-1" />
                    {category}
                  </Badge>
                ))}
              </div>

              <div className="flex items-center text-sm text-gray-600 mb-3">
                <MapPin className="h-4 w-4 mr-2 text-red-500 shrink-0" />
                Serves up to {provider.serviceRadius} miles
              </div>

              {/* Spacer pushes button to bottom for equal-height cards */}
              <div className="flex-1" />

              <Button 
                asChild
                variant="default" 
                size="sm" 
                className="w-full sm:w-auto self-end min-h-[44px] mt-2"
              >
                <Link href={profileLink}>View Profile</Link>
              </Button>

              {/* Full-card clickable overlay */}
              <Link href={profileLink} className="absolute inset-0">
                <span className="sr-only">View Provider Profile: {provider.businessName}</span>
              </Link>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};


// --- Main Page Component ---
export default function ProvidersPage() {
  const { user, loading } = useAuth();
  const searchParams = useSearchParams();
  
  // Extract parameters from URL using useSearchParams hook
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
  
  // Track if initial fetch has been done to prevent infinite loop
  const hasInitialFetchedRef = useRef(false);

  const [filters, setFilters] = useState({
    zipCode: initialZipCode,
    category: initialCategory,
  });

  const fetchProviders = useCallback(async (currentFilters: typeof filters) => {
    if (dataLoading) return;

    if (!currentFilters.zipCode && !currentFilters.category) {
      if (!isHomeBuyer) return; 
    }

    setDataLoading(true);
    setError(null);
    try {
      const params: { category?: string; radius: number; zipCode?: string } = {
        // Ensure category is undefined if it's 'ALL' or empty
        category: (currentFilters.category === 'ALL' || !currentFilters.category) ? undefined : currentFilters.category,
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
    } catch (err) {
      setError('An unexpected error occurred during search.');
      setProviders([]);
    } finally {
      setDataLoading(false);
    }
  }, [isHomeBuyer]); // REMOVED dataLoading from deps to prevent recreation

  const handleFilterChange = useCallback((newFilters: { zipCode: string; category: string | undefined }) => {
    const updatedFilters = {
      zipCode: newFilters.zipCode,
      category: newFilters.category || 'ALL', // Ensure state is set to 'ALL' if category is undefined
    };
    setFilters(updatedFilters);
    fetchProviders(updatedFilters);
  }, [fetchProviders]);

  // 🔑 Extract 'from' parameter from URL (if any)
  const fromSource = searchParams.get('from') || undefined;

  // Fetch providers on initial load only (not on every filter change)
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
        } catch (error) {
          console.error('Failed to load target property context:', error);
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
        } catch (error) {
          console.error('Failed to load inventory context:', error);
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
      <div className="flex justify-center items-center h-48">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  // --- Render ---
  return (
    <div className="space-y-6 sm:space-y-8">
      <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">Provider Search</h1>
  
      {/* Context Banner - Show when arriving from Health Insights */}
      {insightContext && (
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-3">
              <Info className="h-5 w-5 text-blue-600 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-blue-900">
                  Finding providers for: <span className="font-bold">{insightContext}</span>
                </p>
                {targetPropertyId && (
                  <p className="text-xs text-blue-700 mt-1">
                    Pre-filtered for your selected property
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {contextItemName && (
        <Card className="bg-emerald-50 border-emerald-200">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-3">
              <Info className="h-5 w-5 text-emerald-600 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-emerald-900">
                  Showing pros for your {contextItemName} Maintenance.
                </p>
                {propertyZipCode && (
                  <p className="text-xs text-emerald-700 mt-1">
                    Local radius filter applied using property ZIP {propertyZipCode}.
                  </p>
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
      />

      <h2 className="text-xl sm:text-2xl font-bold tracking-tight border-b pb-2">
        {dataLoading 
          ? 'Searching...' 
          : providers.length > 0
            ? `${providers.length} Providers Found`
            : error 
              ? 'Search Results'
              : 'Start Your Search'
        }
      </h2>

      {dataLoading ? (
        <div className="flex justify-center items-center h-48">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        </div>
      ) : error ? (
        <div className="text-center p-6 sm:p-8 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-600 font-medium">Error: {error}</p>
          <p className="text-sm text-red-500 mt-1">Please refine your search criteria.</p>
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
        <div className="text-center p-6 sm:p-8 bg-gray-50 border rounded-lg">
          <p className="text-base sm:text-lg font-medium text-gray-700">No providers found matching your criteria.</p>
          <p className="text-sm text-gray-500 mt-2">Try widening the service category or removing the zip code.</p>
        </div>
      )}
    </div>
  );
}
