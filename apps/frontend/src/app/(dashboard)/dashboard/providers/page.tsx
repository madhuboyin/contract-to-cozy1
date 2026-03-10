// apps/frontend/src/app/(dashboard)/dashboard/providers/page.tsx
'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/AuthContext';
import { api } from '@/lib/api/client';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Info, Loader2, MapPin, Search, Star } from 'lucide-react';
import { Provider } from '@/types';
import { cn } from '@/lib/utils';
import { ServiceCategoryIcon } from '@/components/ServiceCategoryIcon';
import { formatEnumLabel } from '@/lib/utils/formatters';
import {
  normalizeProviderCategoryForSearch,
  PROVIDER_SEARCH_CATEGORY_OPTIONS,
} from '@/lib/config/serviceCategoryMapping';
import {
  ActionPriorityRow,
  BottomSafeAreaReserve,
  EmptyStateCard,
  MobileCard,
  MobileFilterStack,
  MobileKpiStrip,
  MobileKpiTile,
  MobilePageIntro,
  MobileSection,
  MobileSectionHeader,
  MobileToolWorkspace,
  ReadOnlySummaryBlock,
  StatusChip,
} from '@/components/mobile/dashboard/MobilePrimitives';

const DEFAULT_RADIUS = 25;

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
        return PROVIDER_SEARCH_CATEGORY_OPTIONS.filter((category) =>
          ['INSPECTION', 'HANDYMAN', 'CLEANING'].includes(category.value)
        );
      }
      return PROVIDER_SEARCH_CATEGORY_OPTIONS;
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
      <form onSubmit={handleSearch}>
        <MobileFilterStack
          search={
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-[0.1em] text-slate-500">Service category</label>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="h-11 w-full text-sm">
                  <SelectValue placeholder={isHomeBuyer ? 'Inspection (recommended)' : 'Select a category'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All categories</SelectItem>
                  {displayCategories.map((category) => (
                    <SelectItem key={category.value} value={category.value}>
                      <div className="flex items-center gap-2">
                        <ServiceCategoryIcon icon={category.value} className="h-4 w-4" />
                        {category.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          }
          primaryFilters={
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-[0.1em] text-slate-500">ZIP code</label>
              <Input
                type="text"
                placeholder="e.g., 78701"
                value={zipCode}
                onChange={(e) => setZipCode(e.target.value)}
                className="h-11 w-full text-sm"
              />
            </div>
          }
          chips={
            <div className="flex gap-1.5 pb-1">
              {displayCategories.slice(0, 6).map((category) => (
                <button
                  key={category.value}
                  type="button"
                  onClick={() => {
                    setSelectedCategory(category.value);
                    onFilterChange({ zipCode: zipCode.trim(), category: category.value });
                  }}
                  className={cn(
                    'inline-flex min-h-[32px] items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium transition-colors',
                    selectedCategory === category.value
                      ? 'border-brand-primary bg-brand-primary text-white'
                      : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-white'
                  )}
                >
                  <ServiceCategoryIcon icon={category.value} className="h-3 w-3" />
                  {category.label}
                </button>
              ))}
            </div>
          }
          actions={
            <>
              <button
                type="submit"
                disabled={isSearching}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-brand-primary px-3 text-xs font-semibold text-white hover:bg-brand-primary/90 disabled:opacity-60"
              >
                {isSearching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                {isSearching ? 'Searching' : 'Search'}
              </button>

              {(zipCode || selectedCategory !== 'ALL') ? (
                <button
                  type="button"
                  onClick={() => {
                    setZipCode('');
                    setSelectedCategory('ALL');
                    onFilterChange({ zipCode: '', category: undefined });
                  }}
                  className="inline-flex min-h-[36px] items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Clear
                </button>
              ) : null}
            </>
          }
        />
      </form>
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
    <div className="space-y-2.5">
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
          <MobileCard key={provider.id} variant="compact" className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="mb-0 truncate text-sm font-semibold text-slate-900">{provider.businessName}</p>
                <p className="mb-0 mt-0.5 text-xs text-slate-500">
                  {provider.totalReviews} {provider.totalReviews === 1 ? 'review' : 'reviews'}
                  {provider.totalCompletedJobs > 0 ? ` • ${provider.totalCompletedJobs} jobs completed` : ''}
                </p>
              </div>
              <StatusChip tone={provider.averageRating >= 4.5 ? 'good' : provider.averageRating >= 4 ? 'elevated' : 'info'}>
                <span className="inline-flex items-center gap-1">
                  <Star className="h-3 w-3 fill-current" />
                  {provider.averageRating.toFixed(1)}
                </span>
              </StatusChip>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {provider.serviceCategories.slice(0, 2).map((cat) => (
                <StatusChip key={cat} tone="protected" className="text-[10px]">
                  <span className="inline-flex items-center gap-1">
                    <ServiceCategoryIcon icon={cat} className="h-3 w-3" />
                    {formatEnumLabel(cat)}
                  </span>
                </StatusChip>
              ))}
              {provider.serviceCategories.length > 2 ? <StatusChip tone="info">+{provider.serviceCategories.length - 2} more</StatusChip> : null}
            </div>

            <ReadOnlySummaryBlock
              columns={2}
              items={[
                {
                  label: 'Service radius',
                  value: (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" />
                      {provider.serviceRadius ?? 'N/A'} miles
                    </span>
                  ),
                },
                {
                  label: 'Completed jobs',
                  value: provider.totalCompletedJobs,
                  emphasize: true,
                },
              ]}
            />

            <ActionPriorityRow
              primaryAction={
                <Link
                  href={profileLink}
                  className="inline-flex min-h-[40px] w-full items-center justify-center rounded-lg bg-brand-primary px-4 text-sm font-semibold text-white hover:bg-brand-primary/90"
                >
                  View profile
                </Link>
              }
            />
          </MobileCard>
        );
      })}
    </div>
  );
};

export default function ProvidersPage() {
  const { user, loading } = useAuth();
  const searchParams = useSearchParams();

  const defaultCategory = normalizeProviderCategoryForSearch(searchParams.get('category') || searchParams.get('service'));
  const insightContext = searchParams.get('insightFactor') || undefined;
  const targetPropertyId = searchParams.get('propertyId') || undefined;
  const predictionId = searchParams.get('predictionId') || undefined;
  const inventoryItemId = searchParams.get('itemId') || undefined;
  const fromSource = searchParams.get('from') || undefined;

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
          const itemRes = await api.get<{ item: { name: string } }>(`/api/properties/${targetPropertyId}/inventory/items/${inventoryItemId}`);
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
    <MobileToolWorkspace className="lg:max-w-7xl lg:px-8 lg:pb-10"
      intro={<MobilePageIntro title="Provider Search" subtitle="Find trusted local professionals by service and location." />}
      summary={
        <MobileKpiStrip className="sm:grid-cols-3">
          <MobileKpiTile
            label="Matches"
            value={dataLoading ? '...' : providers.length}
            hint={dataLoading ? 'Searching now' : providers.length === 1 ? 'Provider found' : 'Providers found'}
            tone={providers.length > 0 ? 'positive' : 'neutral'}
          />
          <MobileKpiTile label="ZIP" value={filters.zipCode || 'Any'} hint="Location filter" />
          <MobileKpiTile
            label="Category"
            value={filters.category === 'ALL' ? 'All' : formatEnumLabel(filters.category)}
            hint="Primary service"
          />
        </MobileKpiStrip>
      }
      filters={
        <ServiceFilter
          onFilterChange={handleFilterChange}
          defaultCategory={defaultCategory}
          defaultZipCode={propertyZipCode}
          isHomeBuyer={isHomeBuyer}
          isSearching={dataLoading}
        />
      }
    >
      {insightContext ? (
        <MobileCard variant="compact" className="border-sky-200 bg-sky-50">
          <div className="flex items-start gap-2.5">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" />
            <div>
              <p className="mb-0 text-sm font-semibold text-sky-900">
                Finding providers for <span className="font-bold">{formatEnumLabel(insightContext)}</span>
              </p>
              {targetPropertyId ? <p className="mb-0 mt-0.5 text-xs text-sky-700">Pre-filtered to your selected property.</p> : null}
            </div>
          </div>
        </MobileCard>
      ) : null}

      {contextItemName ? (
        <MobileCard variant="compact" className="border-emerald-200 bg-emerald-50">
          <div className="flex items-start gap-2.5">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
            <div>
              <p className="mb-0 text-sm font-semibold text-emerald-900">Showing pros for {contextItemName} maintenance</p>
              {propertyZipCode ? <p className="mb-0 mt-0.5 text-xs text-emerald-700">Radius filter uses property ZIP {propertyZipCode}.</p> : null}
            </div>
          </div>
        </MobileCard>
      ) : null}

      <MobileSection>
        <MobileSectionHeader
          title={dataLoading ? 'Searching providers...' : `${providers.length} provider${providers.length !== 1 ? 's' : ''} found`}
          subtitle={
            insightContext
              ? `Showing specialists for ${formatEnumLabel(insightContext)}`
              : 'Tap a provider to review profile details and ratings.'
          }
        />
      </MobileSection>

      {dataLoading ? (
        <MobileCard variant="compact" className="py-10 text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-brand-primary" />
          <p className="mt-2 text-sm text-slate-600">Searching providers...</p>
        </MobileCard>
      ) : error ? (
        <MobileCard variant="compact" className="border-rose-200 bg-rose-50 text-center">
          <p className="mb-0 text-sm font-medium text-rose-700">{error}</p>
          <p className="mb-0 mt-1 text-xs text-rose-600">Try broadening filters and searching again.</p>
        </MobileCard>
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
        <EmptyStateCard
          title="No providers found"
          description="Try widening the service category or removing the ZIP filter."
        />
      )}

      <BottomSafeAreaReserve size="chatAware" />
    </MobileToolWorkspace>
  );
}
