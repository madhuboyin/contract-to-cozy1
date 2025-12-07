// apps/frontend/src/app/(dashboard)/dashboard/providers/page.tsx
'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  isHomeBuyer: boolean;
}

const ServiceFilter = React.memo(({ onFilterChange, defaultCategory, isHomeBuyer }: ServiceFilterProps) => {
  const [zipCode, setZipCode] = useState('');
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

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="text-xl flex items-center gap-2">
          <Search className="h-5 w-5 text-blue-600" />
          Find Local Providers
        </CardTitle>
        <CardDescription>
          Search for trusted professionals based on service and location.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSearch} className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="md:col-span-2">
            <label className="text-sm font-medium mb-1 block">Service Category</label>
            <Select 
              value={selectedCategory} 
              onValueChange={setSelectedCategory}
            >
              <SelectTrigger className="w-full">
                {/* When selectedCategory is 'ALL', the value of the corresponding SelectItem ("All Categories") will be shown */}
                <SelectValue placeholder={isHomeBuyer ? "Inspection (Required)" : "Select a Category"} />
              </SelectTrigger>
              <SelectContent>
                {/* FIX 3: Change value="" to value="ALL" */}
                <SelectItem value="ALL" className="text-gray-500">All Categories</SelectItem>
                {displayCategories.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value}>
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
            <label className="text-sm font-medium mb-1 block">Zip Code</label>
            <Input
              type="text"
              placeholder="e.g., 78701"
              value={zipCode}
              onChange={(e) => setZipCode(e.target.value)}
              className="w-full"
            />
          </div>
          
          <div className="flex items-end">
            <Button type="submit" className="w-full">
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


const ProviderList = ({ providers, targetPropertyId }: { providers: Provider[]; targetPropertyId?: string }) => {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      {providers.map((provider) => {
        // Build profile link with optional propertyId parameter
        const profileLink = targetPropertyId 
          ? `/dashboard/providers/${provider.id}?propertyId=${targetPropertyId}`
          : `/dashboard/providers/${provider.id}`;

        return (
          <Card 
            key={provider.id} 
            className="group relative hover:shadow-xl transition-shadow duration-300"
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xl font-bold truncate">
                {provider.businessName}
              </CardTitle>
              <div className="flex items-center text-yellow-500 text-sm">
                <Star className="h-4 w-4 fill-yellow-500 mr-1" />
                {provider.averageRating.toFixed(1)}
              </div>
            </CardHeader>
            <CardContent>
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

              <div className="flex items-center text-sm text-gray-600">
                <MapPin className="h-4 w-4 mr-2 text-red-500" />
                Serves up to {provider.serviceRadius} miles
              </div>

              <Link href={profileLink} className="absolute inset-0">
                <span className="sr-only">View Provider Profile: {provider.businessName}</span>
              </Link>
              
            </CardContent>
            <div className="absolute bottom-4 right-4">
                <Button 
                  asChild
                  variant="default" 
                  size="sm" 
                  className="group-hover:translate-x-0 translate-x-2 transition-transform duration-300"
                >
                  <Link href={profileLink}>View Profile</Link>
                </Button>
              </div>
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
  const defaultCategory = searchParams.get('category') || searchParams.get('service');
  const insightContext = searchParams.get('insightFactor');
  const targetPropertyId = searchParams.get('propertyId');

  // Debug: Log extracted parameters
  console.log('🔍 URL Parameters Extracted:', {
    category: searchParams.get('category'),
    service: searchParams.get('service'),
    insightFactor: searchParams.get('insightFactor'),
    propertyId: searchParams.get('propertyId'),
    defaultCategory,
    insightContext,
    targetPropertyId
  });

  const [providers, setProviders] = useState<Provider[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isHomeBuyer = user?.segment === 'HOME_BUYER';
  const initialZipCode = ''; 
  const initialCategory = defaultCategory || '';

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
      const params: any = {
        // Ensure category is undefined if it's 'ALL' or empty
        category: (currentFilters.category === 'ALL' || !currentFilters.category) ? undefined : currentFilters.category,
        radius: DEFAULT_RADIUS,
      };

      if (currentFilters.zipCode) {
        params.zipCode = currentFilters.zipCode;
      }
      
      console.log('🚀 Calling API with params:', params);
      
      const response = await api.searchProviders(params);

      console.log('📥 API Response:', {
        success: response.success,
        providerCount: response.success ? response.data?.providers?.length || 0 : 0,
        message: response.message
      });

      if (response.success && response.data) {
        setProviders(response.data.providers);
      } else {
        setError(response.message || 'Failed to search providers.');
        setProviders([]);
      }
    } catch (err) {
      console.error(err);
      setError('An unexpected error occurred during search.');
      setProviders([]);
    } finally {
      setDataLoading(false);
    }
  }, [dataLoading, isHomeBuyer]);

  const handleFilterChange = useCallback((newFilters: { zipCode: string; category: string | undefined }) => {
    const updatedFilters = {
      zipCode: newFilters.zipCode,
      category: newFilters.category || 'ALL', // Ensure state is set to 'ALL' if category is undefined
    };
    setFilters(updatedFilters);
    fetchProviders(updatedFilters);
  }, [fetchProviders]);

  // Fetch providers on initial load or filter change
  useEffect(() => {
    console.log('⚡ useEffect triggered:', {
      initialCategory,
      filters,
      willFetch: !!initialCategory
    });
    
    if (initialCategory) {
      fetchProviders(filters);
    }
  }, [fetchProviders, initialCategory]);


  if (loading) {
    return (
      <div className="flex justify-center items-center h-48">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  // --- Render ---
  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold tracking-tight">Provider Search</h1>
  
      {/* Context Banner - Show when arriving from Health Insights */}
      {insightContext && (
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-4">
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
  
      <ServiceFilter 
        onFilterChange={handleFilterChange} 
        defaultCategory={defaultCategory || undefined}
        isHomeBuyer={isHomeBuyer}
      />

      <h2 className="text-2xl font-bold tracking-tight border-b pb-2">
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
        <div className="text-center p-8 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-600 font-medium">Error: {error}</p>
          <p className="text-sm text-red-500 mt-1">Please refine your search criteria.</p>
        </div>
      ) : providers.length > 0 ? (
        <ProviderList providers={providers} targetPropertyId={targetPropertyId || undefined} />
      ) : (
        <div className="text-center p-8 bg-gray-50 border rounded-lg">
          <p className="text-lg font-medium text-gray-700">No providers found matching your criteria.</p>
          <p className="text-sm text-gray-500 mt-2">Try widening the service category or removing the zip code.</p>
        </div>
      )}
    </div>
  );
}