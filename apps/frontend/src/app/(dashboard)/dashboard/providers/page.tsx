// apps/frontend/src/app/(dashboard)/dashboard/providers/page.tsx
'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/AuthContext';
import { usePropertyContext } from '@/lib/property/PropertyContext';
import { api } from '@/lib/api/client';
import { Input } from '@/components/ui/input';
import { Info, Loader2, MapPin, Search, Star, Zap } from 'lucide-react';
import { Provider } from '@/types';
import { cn } from '@/lib/utils';
import { ServiceCategoryIcon } from '@/components/ServiceCategoryIcon';
import { formatEnumLabel } from '@/lib/utils/formatters';
import {
  normalizeProviderCategoryForSearch,
  PROVIDER_SEARCH_CATEGORY_OPTIONS,
} from '@/lib/config/serviceCategoryMapping';
import { track } from '@/lib/analytics/events';
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
import { VerifiedProBadge } from '@/components/features/providerTrust/VerifiedProBadge';
import { useExecutionGuard } from '@/features/guidance/hooks/useExecutionGuard';
import { useGuidance } from '@/features/guidance/hooks/useGuidance';
import { GuidanceWarningBanner } from '@/components/guidance/GuidanceWarningBanner';
import { buildGuidanceOverviewHref } from '@/lib/navigation/guidanceOverviewHref';
import {
  buildExecutionGuardDetails,
  buildExecutionGuardMessage,
} from '@/features/guidance/utils/executionGuardMessaging';
import { extractGuidanceContinuityContext, hasGuidanceContinuityContext } from '@/features/guidance/utils/guidanceContinuity';
import type { PropertyContextEnvelope } from '@/components/property-context/propertyContextTypes';
import {
  getProviderResponsibilityConfig,
  isResponsibilityAssignedElsewhere,
  isResponsibilityUnknown,
  responsibilityPartyLabel,
  type ProviderResponsibilityParty,
} from '@/lib/providers/providerResponsibility';

const DEFAULT_RADIUS = 25;

const RESPONSIBILITY_OPTIONS: Array<{ value: ProviderResponsibilityParty; label: string }> = [
  { value: 'OWNER', label: 'I do / the homeowner' },
  { value: 'LANDLORD', label: 'Landlord or property manager' },
  { value: 'ASSOCIATION', label: 'HOA or condo association' },
  { value: 'SHARED', label: 'Shared responsibility' },
  { value: 'UNKNOWN', label: 'I’m not sure' },
];

interface ServiceFilterProps {
  onFilterChange: (filters: { zipCode: string; category: string | undefined }) => void;
  defaultCategory?: string;
  defaultZipCode?: string;
  isSearching: boolean;
  lockZipToProperty?: boolean;
}

const ServiceFilter = React.memo(
  ({ onFilterChange, defaultCategory, defaultZipCode, isSearching, lockZipToProperty }: ServiceFilterProps) => {
    const [zipCode, setZipCode] = useState(defaultZipCode || '');
    const [selectedCategory, setSelectedCategory] = useState<string>(defaultCategory || 'ALL');

    const displayCategories = useMemo(() => PROVIDER_SEARCH_CATEGORY_OPTIONS, []);

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
              <label className="mb-1 block text-xs font-medium tracking-normal text-slate-500">Service category</label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="flex h-11 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                aria-label="Service category"
              >
                <option value="ALL">
                  All categories
                </option>
                {displayCategories.map((category) => (
                  <option key={category.value} value={category.value}>
                    {category.label}
                  </option>
                ))}
              </select>
            </div>
          }
          primaryFilters={
            <div>
              <label className="mb-1 block text-xs font-medium tracking-normal text-slate-500">ZIP code</label>
              <Input
                type="text"
                placeholder="e.g., 78701"
                value={zipCode}
                onChange={(e) => setZipCode(e.target.value)}
                disabled={lockZipToProperty}
                inputMode="numeric"
                autoComplete="postal-code"
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
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-brand-primary px-3 text-xs font-semibold text-white hover:bg-brand-primary/90 disabled:opacity-60"
              >
                {isSearching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                {isSearching ? 'Searching' : 'Search'}
              </button>

              {((!lockZipToProperty && zipCode) || selectedCategory !== 'ALL') ? (
                <button
                  type="button"
                  onClick={() => {
                    const resetZip = lockZipToProperty ? (defaultZipCode || '') : '';
                    setZipCode(resetZip);
                    setSelectedCategory('ALL');
                    onFilterChange({ zipCode: resetZip, category: undefined });
                  }}
                  className="inline-flex min-h-[44px] items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
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
  serviceLabel,
  fromSource,
  returnTo,
  intent,
  actionKey,
  predictionId,
  inventoryItemId,
  guidanceJourneyId,
  guidanceStepKey,
  guidanceSignalIntentFamily,
  priceFinalizationId,
  finalPrice,
  vendorName,
  executionBlocked,
  executionGuardLoading,
  blockedActionHref,
}: {
  providers: Provider[];
  targetPropertyId?: string;
  insightContext?: string;
  category?: string;
  serviceLabel?: string;
  fromSource?: string;
  returnTo?: string;
  intent?: string;
  actionKey?: string;
  predictionId?: string;
  inventoryItemId?: string;
  guidanceJourneyId?: string;
  guidanceStepKey?: string;
  guidanceSignalIntentFamily?: string;
  priceFinalizationId?: string;
  finalPrice?: string;
  vendorName?: string;
  executionBlocked?: boolean;
  executionGuardLoading?: boolean;
  blockedActionHref?: string;
}) => {
  return (
    <div className="space-y-2.5">
      {providers.map((provider) => {
        const providerCategories = Array.isArray(provider.serviceCategories)
          ? provider.serviceCategories
          : [];
        const providerTotalReviews =
          typeof provider.totalReviews === 'number' && Number.isFinite(provider.totalReviews)
            ? provider.totalReviews
            : 0;
        const providerCompletedJobs =
          typeof provider.totalCompletedJobs === 'number' && Number.isFinite(provider.totalCompletedJobs)
            ? provider.totalCompletedJobs
            : 0;
        const providerAverageRating =
          typeof provider.averageRating === 'number' && Number.isFinite(provider.averageRating)
            ? provider.averageRating
            : 0;
        const verifiedCategories = Array.isArray(provider.verifiedCategories) ? provider.verifiedCategories : [];
        const isVerifiedForContext = category
          ? verifiedCategories.includes(category as any)
          : verifiedCategories.length > 0;
        const queryParams = new URLSearchParams();
        if (targetPropertyId) queryParams.append('propertyId', targetPropertyId);
        if (insightContext) queryParams.append('insightFactor', insightContext);
        if (category) queryParams.append('category', category);
        if (serviceLabel) queryParams.append('serviceLabel', serviceLabel);
        if (fromSource) queryParams.append('from', fromSource);
        if (returnTo) queryParams.append('returnTo', returnTo);
        if (intent) queryParams.append('intent', intent);
        if (actionKey) queryParams.append('actionKey', actionKey);
        if (predictionId) queryParams.append('predictionId', predictionId);
        if (inventoryItemId) queryParams.append('itemId', inventoryItemId);
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
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="mb-0 text-xs text-slate-500">
                    {providerTotalReviews} {providerTotalReviews === 1 ? 'review' : 'reviews'}
                    {providerCompletedJobs > 0 ? ` • ${providerCompletedJobs} jobs` : ''}
                  </p>
                  {(inventoryItemId || insightContext) && providerCategories.includes((category || insightContext) as any) && (
                    <StatusChip tone="good" className="text-[11px] py-0 px-1.5 h-4">Best Match</StatusChip>
                  )}
                  <VerifiedProBadge isVerified={isVerifiedForContext} showWhenUnverified={false} />
                </div>
              </div>
              <StatusChip tone={providerAverageRating >= 4.5 ? 'good' : providerAverageRating >= 4 ? 'elevated' : 'info'}>
                <span className="inline-flex items-center gap-1">
                  <Star className="h-3 w-3 fill-current" />
                  {providerAverageRating.toFixed(1)}
                </span>
              </StatusChip>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {providerCategories.slice(0, 2).map((cat) => (
                <StatusChip key={cat} tone="protected" className="text-[11px]">
                  <span className="inline-flex items-center gap-1">
                    <ServiceCategoryIcon icon={cat} className="h-3 w-3" />
                    {formatEnumLabel(cat)}
                  </span>
                </StatusChip>
              ))}
              {providerCategories.length > 2 ? <StatusChip tone="info">+{providerCategories.length - 2} more</StatusChip> : null}
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
                  value: providerCompletedJobs,
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
                ) : executionGuardLoading ? (
                  <button
                    type="button"
                    disabled
                    className="inline-flex min-h-[40px] w-full items-center justify-center rounded-lg bg-slate-200 px-4 text-sm font-semibold text-slate-600"
                  >
                    Checking requirements...
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

  const defaultCategory = normalizeProviderCategoryForSearch(
    searchParams.get('category') ||
      searchParams.get('service') ||
      searchParams.get('serviceLabel')
  );
  const insightContext = searchParams.get('insightFactor') || undefined;
  const targetPropertyId = searchParams.get('propertyId') || dashboardSelectedPropertyId || undefined;
  const predictionId = searchParams.get('predictionId') || undefined;
  const inventoryItemId = searchParams.get('itemId') || undefined;
  const fromSource = searchParams.get('from') || undefined;
  const returnTo = searchParams.get('returnTo') || undefined;
  const intent = searchParams.get('intent') || undefined;
  const actionKey = searchParams.get('actionKey') || undefined;
  const guidanceJourneyId = searchParams.get('guidanceJourneyId') || undefined;
  const guidanceStepKey = searchParams.get('guidanceStepKey') || undefined;
  const guidanceSignalIntentFamily = searchParams.get('guidanceSignalIntentFamily') || undefined;
  const priceFinalizationId = searchParams.get('priceFinalizationId') || undefined;
  const finalPrice = searchParams.get('finalPrice') || undefined;
  const vendorName = searchParams.get('vendorName') || undefined;
  const serviceLabel = searchParams.get('serviceLabel') || undefined;
  const hasGuardScopeContext = Boolean(
    guidanceJourneyId ||
      guidanceStepKey ||
      guidanceSignalIntentFamily ||
      inventoryItemId
  );
  const guidanceContext = extractGuidanceContinuityContext(searchParams);
  const derivedReturnTo =
    !returnTo && targetPropertyId && hasGuidanceContinuityContext(guidanceContext)
      ? buildGuidanceOverviewHref({
          propertyId: targetPropertyId,
          journeyId: guidanceContext.guidanceJourneyId,
          stepKey: guidanceContext.guidanceStepKey,
          inventoryItemId: guidanceContext.itemId ?? inventoryItemId ?? null,
        })
      : null;
  const effectiveReturnTo = returnTo || derivedReturnTo || undefined;
  const providerGuardQuery = useExecutionGuard(targetPropertyId, 'BOOKING', {
    enabled: Boolean(targetPropertyId) && hasGuardScopeContext,
    journeyId: guidanceJourneyId,
    inventoryItemId,
  });
  const providerGuidanceQuery = useGuidance(targetPropertyId, {
    enabled: Boolean(targetPropertyId) && hasGuardScopeContext,
  });

  const [providers, setProviders] = useState<Provider[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contextItemName, setContextItemName] = useState<string | null>(null);
  const [propertyZipCode, setPropertyZipCode] = useState<string>('');
  const [propertyContext, setPropertyContext] = useState<PropertyContextEnvelope | null>(null);
  const [responsibilityParties, setResponsibilityParties] = useState<Record<string, ProviderResponsibilityParty>>({});
  const [responsibilitySaving, setResponsibilitySaving] = useState(false);
  const [responsibilityError, setResponsibilityError] = useState<string | null>(null);
  const [notSureResponsibilityScopes, setNotSureResponsibilityScopes] = useState<Set<string>>(() => new Set());
  const initialZipCode = '';
  const initialCategory = defaultCategory || '';
  const hasInitialFetchedRef = useRef(false);
  const [filters, setFilters] = useState({
    zipCode: initialZipCode,
    category: initialCategory,
  });
  const isGuidanceExecutionBlocked = hasGuardScopeContext && Boolean(providerGuardQuery.data?.blocked);
  const propertyContextNeedsAttention = Boolean(
    targetPropertyId && propertyContext && propertyContext.decision.status !== 'APPLICABLE',
  );
  const responsibilityConfig = getProviderResponsibilityConfig(filters.category);
  const responsibilityParty = responsibilityConfig ? responsibilityParties[responsibilityConfig.scope] ?? null : null;
  const responsibilityNotSure = Boolean(
    responsibilityConfig && notSureResponsibilityScopes.has(responsibilityConfig.scope),
  );
  const responsibilityAssignedElsewhere = isResponsibilityAssignedElsewhere(propertyContext);
  const responsibilityUnknown = isResponsibilityUnknown(propertyContext, responsibilityConfig);
  const isPropertyContextBlocked = Boolean(
    targetPropertyId && propertyContext?.decision.status === 'NOT_APPLICABLE',
  );
  const isExecutionBlocked = isGuidanceExecutionBlocked || isPropertyContextBlocked;
  const requiresServiceCategory = Boolean(
    propertyContextNeedsAttention &&
    filters.category === 'ALL' &&
    propertyContext?.decision.reasonCodes.includes('WORK_SCOPE_RESPONSIBILITY_MAPPING_UNKNOWN'),
  );
  const isGuardLoading =
    hasGuardScopeContext &&
    !providerGuardQuery.data &&
    (providerGuardQuery.isLoading || providerGuardQuery.isFetching);
  const blockedReason = buildExecutionGuardMessage(
    providerGuardQuery.data ?? null,
    'provider booking'
  );
  const blockedStepLabel = providerGuardQuery.data?.safeNextStep?.stepLabel?.trim() || null;
  const blockedDetails = buildExecutionGuardDetails(providerGuardQuery.data ?? null);
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
  const effectiveBlockedActionHref = isPropertyContextBlocked
    ? requiresServiceCategory
      ? undefined
      : propertyContext?.decision.correctionPaths?.[0] ?? `/dashboard/properties/${targetPropertyId}/edit`
    : blockedActionHref;

  const fetchProviders = useCallback(
    async (currentFilters: typeof filters) => {
      if (dataLoading) return;

      if (!currentFilters.zipCode && !currentFilters.category) return;

      setDataLoading(true);
      setError(null);
      try {
        const params: { propertyId?: string; category?: string; radius: number; zipCode?: string } = {
          propertyId: targetPropertyId,
          category: currentFilters.category === 'ALL' || !currentFilters.category ? undefined : currentFilters.category,
          radius: DEFAULT_RADIUS,
        };

        if (currentFilters.zipCode) {
          params.zipCode = currentFilters.zipCode;
        }

        const response = await api.searchProviders(params);

        if (response.success && response.data) {
          setProviders(response.data.providers);
          setPropertyContext(response.data.propertyContext ?? null);
          track('provider_searched', {
            category: currentFilters.category === 'ALL' ? 'ALL' : (currentFilters.category || 'ALL'),
            location: currentFilters.zipCode || 'any',
            resultCount: response.data.providers.length,
          });
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
    [dataLoading, targetPropertyId]
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
            const responsibilities = (propertyRes.data as typeof propertyRes.data & {
              responsibilities?: Array<{ scope: string; party: ProviderResponsibilityParty }>;
            }).responsibilities;
            setResponsibilityParties(Object.fromEntries(
              (responsibilities ?? []).map((entry) => [entry.scope, entry.party]),
            ));
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

  const saveResponsibility = async (party: ProviderResponsibilityParty) => {
    if (!targetPropertyId || !responsibilityConfig || responsibilitySaving) return;
    setResponsibilitySaving(true);
    setResponsibilityError(null);
    try {
      await api.patch(`/api/properties/${targetPropertyId}/context/${encodeURIComponent(responsibilityConfig.factKey)}`, {
        value: party,
        sourceType: 'USER_REPORTED',
        confidence: party === 'UNKNOWN' ? null : 0.9,
      });
      setResponsibilityParties((current) => ({ ...current, [responsibilityConfig.scope]: party }));
      setNotSureResponsibilityScopes((current) => {
        const next = new Set(current);
        if (party === 'UNKNOWN') next.add(responsibilityConfig.scope);
        else next.delete(responsibilityConfig.scope);
        return next;
      });
      track('provider_responsibility_answered', {
        category: filters.category,
        party,
      });
      await fetchProviders(filters);
    } catch (caught) {
      setResponsibilityError(caught instanceof Error ? caught.message : 'Could not save your answer. Please try again.');
    } finally {
      setResponsibilitySaving(false);
    }
  };

  const responsibilityCorrectionHref = propertyContext?.decision.correctionPaths?.[0] ??
    (targetPropertyId ? `/dashboard/properties/${targetPropertyId}/edit#responsibility` : undefined);
  const showResponsibilityQuestion = responsibilityUnknown && !responsibilityNotSure;
  const delegatedParty = responsibilityPartyLabel(responsibilityParty);

  const primaryAction = responsibilityAssignedElsewhere
    ? {
        title: `Check who should arrange ${responsibilityConfig?.subject ?? 'this service'}.`,
        description: `Your Home Record currently says ${delegatedParty} handles this work. Review that answer if it is not correct.`,
        primaryAction: responsibilityCorrectionHref ? (
          <Link
            href={responsibilityCorrectionHref}
            className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-brand-primary px-4 py-2 text-sm font-semibold text-white hover:bg-brand-primary/90"
          >
            Review responsibility
          </Link>
        ) : <span />,
        impactLabel: 'Provider search paused',
        confidenceLabel: 'Based on your Home Record',
      }
    : showResponsibilityQuestion
      ? {
          title: `Who handles ${responsibilityConfig?.subject ?? 'this service'} for this home?`,
          description: 'Choose the best match so we can show the right next step. We will not assume this from the home type.',
          primaryAction: (
            <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
              {RESPONSIBILITY_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => void saveResponsibility(option.value)}
                  disabled={responsibilitySaving}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:border-brand-primary hover:bg-brand-50 disabled:opacity-60"
                >
                  {responsibilitySaving ? 'Saving...' : option.label}
                </button>
              ))}
              {responsibilityError ? <p className="mb-0 text-sm text-rose-700 sm:col-span-2">{responsibilityError}</p> : null}
            </div>
          ),
          impactLabel: 'One quick question',
          confidenceLabel: 'No responsibility assumed',
        }
      : {
          title: providers.length > 0 ? 'Compare best-fit providers before booking.' : 'Start with one clear provider search.',
          description: responsibilityNotSure
            ? 'You can browse providers now. Confirm who handles the work before completing a booking.'
            : providers.length > 0
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
              onClick={() => handleFilterChange({
                zipCode: targetPropertyId ? propertyZipCode : '',
                category: undefined,
              })}
              className="inline-flex min-h-[40px] w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Reset filters
            </button>
          ),
          impactLabel: providers.length > 0 ? `${providers.length} matched providers` : 'Search required',
          confidenceLabel: responsibilityNotSure
            ? 'Responsibility still to be confirmed'
            : targetPropertyId ? 'Property context applied' : 'General marketplace search',
        };

  return (
    <ProviderShellTemplate
      title="Provider Search"
      subtitle="Find trusted local professionals by service and location."
      eyebrow="Provider Marketplace"
      primaryAction={primaryAction}
      trust={{
        confidenceLabel: 'Match quality combines category fit, location radius, and provider profile quality signals.',
        freshnessLabel: dataLoading ? 'Updating matches now' : 'Results refresh after every search run',
        sourceLabel: 'Provider profiles, service categories, booking history, and property ZIP context.',
        rationale: 'Transparent ranking and fit signals reduce homeowner anxiety before booking.',
      }}
      summary={
        <div className="space-y-3">
          <MobileKpiStrip className="sm:grid-cols-3">
            <MobileKpiTile
              label="Matches"
              value={responsibilityAssignedElsewhere ? 'Paused' : dataLoading ? '...' : providers.length}
              hint={responsibilityAssignedElsewhere
                ? 'Responsibility check'
                : dataLoading ? 'Searching now' : providers.length === 1 ? 'Provider found' : 'Providers found'}
              tone={providers.length > 0 ? 'positive' : 'neutral'}
            />
            <MobileKpiTile label="ZIP" value={filters.zipCode || 'Any'} hint="Location filter" />
            <MobileKpiTile
              label="Category"
              value={filters.category === 'ALL' ? 'All' : formatEnumLabel(filters.category)}
              hint="Primary service"
            />
          </MobileKpiStrip>
        </div>
      }
      filters={
        responsibilityAssignedElsewhere ? undefined : (
          <ServiceFilter
            onFilterChange={handleFilterChange}
            defaultCategory={defaultCategory}
            defaultZipCode={propertyZipCode}
            isSearching={dataLoading}
            lockZipToProperty={Boolean(targetPropertyId)}
          />
        )
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
                We&apos;ve filtered for providers who specialize in {filters.category !== 'ALL' ? formatEnumLabel(filters.category) : 'this category'}
                to help you execute your Replace or Repair verdict quickly.
              </p>
            </div>
          </div>
        </MobileCard>
      )}

      {fromSource === 'resolution-center' && (
        <MobileCard variant="compact" className="border-violet-200 bg-violet-50 shadow-sm space-y-3">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-full bg-violet-100 p-1">
              <Zap className="h-4 w-4 text-violet-600" />
            </div>
            <div className="min-w-0">
              <p className="mb-0 text-sm font-bold text-violet-900">
                Booking from Resolution Center
              </p>
              <p className="mb-0 mt-0.5 text-xs text-violet-700 leading-relaxed">
                {serviceLabel
                  ? `Finding providers for "${serviceLabel}"${filters.category !== 'ALL' ? ` · ${formatEnumLabel(filters.category)}` : ''}.`
                  : `Filtered for ${filters.category !== 'ALL' ? formatEnumLabel(filters.category) : 'your service category'}. Select a provider to book.`}
              </p>
            </div>
          </div>
          {targetPropertyId && serviceLabel && (
            <Link
              href={`/dashboard/quote-comparison?propertyId=${targetPropertyId}&category=${filters.category}&serviceLabel=${encodeURIComponent(serviceLabel)}`}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-violet-700 underline underline-offset-2 hover:text-violet-900"
            >
              Compare multiple quotes first
            </Link>
          )}
        </MobileCard>
      )}

      {returnTo ? (
        <MobileCard variant="compact" className="border-slate-200 bg-slate-50 shadow-sm">
          <Link
            href={returnTo}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-700 underline underline-offset-2 hover:text-slate-900"
          >
            {guidanceJourneyId ? 'Back to guidance' : 'Back to previous step'}
          </Link>
        </MobileCard>
      ) : null}

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

      {requiresServiceCategory ? (
        <GuidanceWarningBanner
          title="Select a service category"
          message="Choose the type of work first so we can ask only the responsibility question that applies."
        />
      ) : propertyContextNeedsAttention && !responsibilityUnknown && !responsibilityAssignedElsewhere ? (
        <GuidanceWarningBanner
          title="Review one property detail before booking"
          message="The property information needed for this service is incomplete or needs review. You can continue after confirming it."
          actionLabel="Review property details"
          actionHref={responsibilityCorrectionHref}
        />
      ) : null}

      {isGuidanceExecutionBlocked ? (
        <GuidanceWarningBanner
          title={
            blockedStepLabel
              ? `Finish ${blockedStepLabel} before booking`
              : 'Provider booking is blocked until the required guidance step is complete'
          }
          message={blockedReason}
          details={blockedDetails}
          actionLabel="Go to required step"
          actionHref={blockedActionHref}
        />
      ) : null}

      {!responsibilityAssignedElsewhere ? <>
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
          serviceLabel={serviceLabel}
          fromSource={fromSource}
          returnTo={effectiveReturnTo}
          intent={intent}
          actionKey={actionKey}
          predictionId={predictionId}
          inventoryItemId={inventoryItemId}
          guidanceJourneyId={guidanceJourneyId}
          guidanceStepKey={guidanceStepKey}
          guidanceSignalIntentFamily={guidanceSignalIntentFamily}
          priceFinalizationId={priceFinalizationId}
          finalPrice={finalPrice}
          vendorName={vendorName}
          executionBlocked={isExecutionBlocked}
          executionGuardLoading={isGuardLoading}
          blockedActionHref={effectiveBlockedActionHref}
        />
      ) : (
        <EmptyStateCard
          title="No providers found"
          description={responsibilityUnknown
            ? 'No matching providers were found. You can adjust the service category and search again while responsibility remains unconfirmed.'
            : 'Try broadening your service category or removing the ZIP filter, then run search again.'}
          action={
            <button
              type="button"
              onClick={() => runSearch()}
              className="inline-flex min-h-[44px] items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Retry search
            </button>
          }
        />
      )}
      </> : null}

      <BottomSafeAreaReserve size="chatAware" />
    </ProviderShellTemplate>
  );
}
