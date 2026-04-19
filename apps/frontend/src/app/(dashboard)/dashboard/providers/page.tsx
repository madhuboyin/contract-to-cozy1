// apps/frontend/src/app/(dashboard)/dashboard/providers/page.tsx
'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/AuthContext';
import { usePropertyContext } from '@/lib/property/PropertyContext';
import { api } from '@/lib/api/client';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Info, Loader2, MapPin, Search, Star, Zap } from 'lucide-react';
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
  MobileSection,
  MobileSectionHeader,
  ReadOnlySummaryBlock,
  StatusChip,
} from '@/components/mobile/dashboard/MobilePrimitives';
import ProviderShellTemplate from '@/components/providers/ProviderShellTemplate';
import { useExecutionGuard } from '@/features/guidance/hooks/useExecutionGuard';
import { useGuidance } from '@/features/guidance/hooks/useGuidance';
import { GuidanceWarningBanner } from '@/components/guidance/GuidanceWarningBanner';

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
  homeAssetId,
  guidanceJourneyId,
  guidanceStepKey,
  guidanceSignalIntentFamily,
  priceFinalizationId,
  finalPrice,
  vendorName,
  executionBlocked,
  blockedActionHref,
}: {
  providers: Provider[];
  targetPropertyId?: string;
  insightContext?: string;
  category?: string;
  fromSource?: string;
  predictionId?: string;
  inventoryItemId?: string;
  homeAssetId?: string;
  guidanceJourneyId?: string;
  guidanceStepKey?: string;
  guidanceSignalIntentFamily?: string;
  priceFinalizationId?: string;
  finalPrice?: string;
  vendorName?: string;
  executionBlocked?: boolean;
  blockedActionHref?: string;
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
        if (homeAssetId) queryParams.append('homeAssetId', homeAssetId);
        if (guidanceJourneyId) queryParams.append('guidanceJourneyId', guidanceJourneyId);
        if (guidanceStepKey) queryParams.append('guidanceStepKey', guidanceStepKey);
        if (guidanceSignalIntentFamily) {
          queryParams.append('guidanceSignalIntentFamily', guidanceSignalIntentFamily);
        }
        if (priceFinalizationId) queryParams.append('priceFinalizationId', priceFinalizationId);
        if (finalPrice) queryParams.append('finalPrice', finalPrice);
        if (vendorName) queryParams.append('vendorName', vendorName);

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
                  {provider.totalCompletedJobs > 0 ? ` • ${provider.totalCompletedJobs} jobs` : ''}
                  {provider.responseTime ? ` • ${provider.responseTime}` : ''}
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
                executionBlocked ? (
                  <button
                    type="button"
                    disabled
                    className="inline-flex min-h-[40px] w-full items-center justify-center rounded-lg bg-slate-300 px-4 text-sm font-semibold text-slate-600"
                  >
                    View profile (blocked)
                  </button>
                ) : (
                  <Link
                    href={profileLink}
                    className="inline-flex min-h-[40px] w-full items-center justify-center rounded-lg bg-brand-primary px-4 text-sm font-semibold text-white hover:bg-brand-primary/90"
                  >
                    View profile
                  </Link>
                )
              }
              secondaryActions={
                executionBlocked && blockedActionHref ? (
                  <Link
                    href={blockedActionHref}
                    className="inline-flex min-h-[40px] w-full items-center justify-center rounded-lg border border-amber-200 bg-amber-50 px-4 text-sm font-semibold text-amber-800 hover:bg-amber-100"
                  >
                    Resolve required step
                  </Link>
                ) : undefined
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
  const { selectedPropertyId: dashboardSelectedPropertyId } = usePropertyContext();

  const defaultCategory = normalizeProviderCategoryForSearch(searchParams.get('category') || searchParams.get('service'));
  const insightContext = searchParams.get('insightFactor') || undefined;
  const targetPropertyId = searchParams.get('propertyId') || dashboardSelectedPropertyId || undefined;
  const predictionId = searchParams.get('predictionId') || undefined;
  const inventoryItemId = searchParams.get('itemId') || undefined;
  const homeAssetId = searchParams.get('homeAssetId') || undefined;
  const fromSource = searchParams.get('from') || undefined;
  const guidanceJourneyId = searchParams.get('guidanceJourneyId') || undefined;
  const guidanceStepKey = searchParams.get('guidanceStepKey') || undefined;
  const guidanceSignalIntentFamily = searchParams.get('guidanceSignalIntentFamily') || undefined;
  const priceFinalizationId = searchParams.get('priceFinalizationId') || undefined;
  const finalPrice = searchParams.get('finalPrice') || undefined;
  const vendorName = searchParams.get('vendorName') || undefined;
  const hasGuardScopeContext = Boolean(
    guidanceJourneyId ||
      guidanceStepKey ||
      guidanceSignalIntentFamily ||
      inventoryItemId ||
      homeAssetId
  );
  const providerGuardQuery = useExecutionGuard(targetPropertyId, 'BOOKING', {
    enabled: Boolean(targetPropertyId) && hasGuardScopeContext,
    journeyId: guidanceJourneyId,
    inventoryItemId,
    homeAssetId,
  });
  const providerGuidanceQuery = useGuidance(targetPropertyId, {
    enabled: Boolean(targetPropertyId) && hasGuardScopeContext,
    limit: 3,
  });

  const [providers, setProviders] = useState<Provider[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contextItemName, setContextItemName] = useState<string | null>(null);
  const [propertyZipCode, setPropertyZipCode] = useState<string>('');
  const isExecutionBlocked = hasGuardScopeContext && Boolean(providerGuardQuery.data?.blocked);
  const blockedReason =
    providerGuardQuery.data?.blockedReason ?? providerGuardQuery.data?.reasons?.[0] ?? null;
  const blockedJourneyIds = new Set(
    providerGuardQuery.data?.missingPrerequisites.map((item) => item.journeyId) ?? []
  );
  const blockedAction =
    providerGuidanceQuery.actions.find((action) => blockedJourneyIds.has(action.journeyId)) ?? null;
  const blockedActionHref =
    blockedAction?.href ??
    (targetPropertyId
      ? `/dashboard/properties/${targetPropertyId}/risk-assessment`
      : '/dashboard/maintenance');

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
      <ProviderShellTemplate
        title="Provider Search"
        subtitle="Find trusted local professionals by service and location."
        eyebrow="Provider Marketplace"
        primaryAction={{
          title: 'Find a trusted provider for your next step.',
          description: 'Use service and location filters to narrow options before booking.',
          primaryAction: (
            <button
              type="button"
              disabled
              className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-slate-300 px-4 py-2 text-sm font-semibold text-slate-600"
            >
              Preparing search workspace...
            </button>
          ),
          confidenceLabel: 'Loading account and property context',
        }}
        routeState={{
          state: 'loading',
          title: 'Loading provider marketplace',
          description: 'Preparing provider filters and homeowner context.',
        }}
        hideContentWhenState
      >
        <></>
      </ProviderShellTemplate>
    );
  }

  const runSearch = () => {
    handleFilterChange({
      zipCode: filters.zipCode,
      category: filters.category === 'ALL' ? undefined : filters.category,
    });
  };

  return (
    <ProviderShellTemplate
      title="Provider Search"
      subtitle="Find trusted local professionals by service and location."
      eyebrow="Provider Marketplace"
      primaryAction={{
        title: providers.length > 0 ? 'Compare best-fit providers before booking.' : 'Start with one clear provider search.',
        description:
          providers.length > 0
            ? 'Review profile quality, reviews, and service fit so your booking decision is confident and fast.'
            : 'Use service category and ZIP to generate a focused, trustworthy shortlist.',
        primaryAction: (
          <button
            type="button"
            onClick={runSearch}
            disabled={dataLoading}
            className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-brand-primary px-4 py-2 text-sm font-semibold text-white hover:bg-brand-primary/90 disabled:opacity-60"
          >
            {dataLoading ? 'Searching providers...' : 'Run provider search'}
          </button>
        ),
        supportingAction: (
          <button
            type="button"
            onClick={() => handleFilterChange({ zipCode: '', category: undefined })}
            className="inline-flex min-h-[40px] w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Reset filters
          </button>
        ),
        impactLabel: providers.length > 0 ? `${providers.length} matched providers` : 'Search required',
        confidenceLabel: targetPropertyId ? 'Property context applied' : 'General marketplace search',
      }}
      trust={{
        confidenceLabel: 'Match quality combines category fit, location radius, and provider profile quality signals.',
        freshnessLabel: dataLoading ? 'Updating matches now' : 'Results refresh after every search run',
        sourceLabel: 'Provider profiles, service categories, booking history, and property ZIP context.',
        rationale: 'Transparent ranking and fit signals reduce homeowner anxiety before booking.',
      }}
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
      {fromSource === 'replace-repair' && (
        <MobileCard variant="compact" className="border-brand-200 bg-brand-50 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-full bg-brand-100 p-1">
              <Zap className="h-4 w-4 text-brand-600" />
            </div>
            <div>
              <p className="mb-0 text-sm font-bold text-brand-900">
                Optimized for your {contextItemName || 'Item'} decision
              </p>
              <p className="mb-0 mt-0.5 text-xs text-brand-700 leading-relaxed">
                We've filtered for providers who specialize in {filters.category !== 'ALL' ? formatEnumLabel(filters.category) : 'this category'} 
                to help you execute your Replace or Repair verdict quickly.
              </p>
            </div>
          </div>
        </MobileCard>
      )}

      {insightContext && fromSource !== 'replace-repair' ? (
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

      {isExecutionBlocked ? (
        <GuidanceWarningBanner
          title="Provider search is blocked until required guidance steps are complete"
          message={
            blockedReason ??
            'Complete decision, coverage, or pricing steps before choosing a provider.'
          }
          actionLabel="Go to required step"
          actionHref={blockedActionHref}
        />
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
          homeAssetId={homeAssetId}
          guidanceJourneyId={guidanceJourneyId}
          guidanceStepKey={guidanceStepKey}
          guidanceSignalIntentFamily={guidanceSignalIntentFamily}
          priceFinalizationId={priceFinalizationId}
          finalPrice={finalPrice}
          vendorName={vendorName}
          executionBlocked={isExecutionBlocked}
          blockedActionHref={blockedActionHref}
        />
      ) : (
        <EmptyStateCard
          title="No providers found"
          description="Try widening the service category or removing the ZIP filter."
        />
      )}

      <BottomSafeAreaReserve size="chatAware" />
    </ProviderShellTemplate>
  );
}
