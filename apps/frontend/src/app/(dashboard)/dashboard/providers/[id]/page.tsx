// apps/frontend/src/app/(dashboard)/dashboard/providers/[id]/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api/client';
import { Provider, Service, User } from '@/types';
import { Star, Phone, Mail, MapPin, ExternalLink, Calendar, Heart, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatEnumLabel } from '@/lib/utils/formatters';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/use-toast';
import { usePropertyContext } from '@/lib/property/PropertyContext';
import {
  ActionPriorityRow,
  BottomSafeAreaReserve,
  CompactEntityRow,
  MobilePageIntro,
  MobileToolWorkspace,
  ReadOnlySummaryBlock,
  ResultHeroCard,
  ScenarioInputCard,
  StatusChip,
} from '@/components/mobile/dashboard/MobilePrimitives';
import { useExecutionGuard } from '@/features/guidance/hooks/useExecutionGuard';
import { useGuidance } from '@/features/guidance/hooks/useGuidance';
import { GuidanceWarningBanner } from '@/components/guidance/GuidanceWarningBanner';

interface CompleteUser extends User {
  phone: string | null;
  email: string;
}

interface CompleteProvider extends Provider {
  website: string | null;
  user: CompleteUser;
  description: string | null | undefined;
}

function getInitials(firstName: string, lastName: string) {
  return (firstName?.[0] || '') + (lastName?.[0] || '');
}

export default function ProviderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const providerId = params.id as string;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { selectedPropertyId: dashboardSelectedPropertyId } = usePropertyContext();

  const propertyId = searchParams.get('propertyId') || dashboardSelectedPropertyId || null;
  const insightFactor = searchParams.get('insightFactor');
  const category = searchParams.get('category');
  const predictionId = searchParams.get('predictionId');
  const itemId = searchParams.get('itemId');
  const homeAssetId = searchParams.get('homeAssetId');
  const guidanceJourneyId = searchParams.get('guidanceJourneyId');
  const guidanceStepKey = searchParams.get('guidanceStepKey');
  const guidanceSignalIntentFamily = searchParams.get('guidanceSignalIntentFamily');
  const priceFinalizationId = searchParams.get('priceFinalizationId');
  const finalPrice = searchParams.get('finalPrice');
  const vendorName = searchParams.get('vendorName');
  const bookingGuardQuery = useExecutionGuard(propertyId, 'BOOKING', {
    enabled: Boolean(propertyId),
    journeyId: guidanceJourneyId ?? undefined,
    inventoryItemId: itemId ?? undefined,
    homeAssetId: homeAssetId ?? undefined,
  });
  const bookingGuidanceQuery = useGuidance(propertyId, {
    enabled: Boolean(propertyId),
    limit: 3,
  });

  const [provider, setProvider] = useState<CompleteProvider | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const isExecutionBlocked = Boolean(bookingGuardQuery.data?.blocked);
  const blockedReason =
    bookingGuardQuery.data?.blockedReason ?? bookingGuardQuery.data?.reasons?.[0] ?? null;
  const blockedJourneyIds = new Set(
    bookingGuardQuery.data?.missingPrerequisites.map((item) => item.journeyId) ?? []
  );
  const blockedAction =
    bookingGuidanceQuery.actions.find((action) => blockedJourneyIds.has(action.journeyId)) ?? null;
  const blockedActionHref =
    blockedAction?.href ??
    (propertyId ? `/dashboard/properties/${propertyId}/risk-assessment` : '/dashboard/maintenance');

  const FAVORITES_QUERY_KEY = ['favorites'];

  const favoritesQuery = useQuery({
    queryKey: FAVORITES_QUERY_KEY,
    queryFn: async () => {
      const response = await api.listFavorites();
      if (response.success) {
        return response.data.favorites.map((f) => f.id);
      }
      console.error('Failed to fetch favorites status:', response.message);
      throw new Error(response.message);
    },
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    enabled: !!providerId,
  });

  const isFavorited = favoritesQuery.data?.includes(providerId) ?? false;

  const addFavoriteMutation = useMutation({
    mutationFn: (id: string) => api.addFavorite(id),
    onSuccess: () => {
      queryClient.refetchQueries({ queryKey: ['provider', providerId] });
      queryClient.refetchQueries({ queryKey: FAVORITES_QUERY_KEY });

      toast({
        title: 'Added to My Pros',
        description: `${provider?.businessName || 'Provider'} is now in your favorites.`,
        variant: 'default',
      });
    },
    onError: (err: any) => {
      toast({
        title: 'Failed to Add Favorite',
        description: err.message || 'Could not add provider to My Pros.',
        variant: 'destructive',
      });
    },
  });

  const removeFavoriteMutation = useMutation({
    mutationFn: (id: string) => api.removeFavorite(id),
    onSuccess: () => {
      queryClient.refetchQueries({ queryKey: ['provider', providerId] });
      queryClient.refetchQueries({ queryKey: FAVORITES_QUERY_KEY });

      toast({
        title: 'Removed from My Pros',
        description: `${provider?.businessName || 'Provider'} has been removed from your favorites.`,
        variant: 'destructive',
      });
    },
    onError: (err: any) => {
      toast({
        title: 'Failed to Remove Favorite',
        description: err.message || 'Could not remove provider from My Pros.',
        variant: 'destructive',
      });
    },
  });

  const handleFavoriteToggle = () => {
    if (!providerId) return;

    if (isFavorited) {
      removeFavoriteMutation.mutate(providerId);
    } else {
      addFavoriteMutation.mutate(providerId);
    }
  };

  const isToggling = addFavoriteMutation.isPending || removeFavoriteMutation.isPending;

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerId]);

  const loadData = async () => {
    try {
      const [providerRes, servicesRes] = await Promise.all([api.getProvider(providerId), api.getProviderServices(providerId)]);

      if (providerRes.success) {
        setProvider(providerRes.data as CompleteProvider);
      } else {
        setError(providerRes.message || 'Provider not found');
      }

      if (servicesRes.success) {
        setServices(servicesRes.data.services);
      }
    } catch (loadError) {
      console.error('Failed to load provider data:', loadError);
      setError('Failed to load provider data.');
    } finally {
      setLoading(false);
    }
  };

  if (loading || favoritesQuery.isLoading) {
    return (
      <MobileToolWorkspace className="lg:max-w-7xl lg:px-8 lg:pb-10" intro={<MobilePageIntro title="Provider Profile" subtitle="Loading provider..." />}>
        <div className="flex items-center justify-center rounded-2xl border border-[hsl(var(--mobile-border-subtle))] bg-white py-12">
          <Loader2 className="h-8 w-8 animate-spin text-brand-primary" />
          <p className="ml-3 text-sm text-[hsl(var(--mobile-text-secondary))]">Loading provider...</p>
        </div>
      </MobileToolWorkspace>
    );
  }

  if (error || !provider) {
    return (
      <MobileToolWorkspace className="lg:max-w-7xl lg:px-8 lg:pb-10" intro={<MobilePageIntro title="Provider Profile" subtitle="Unable to load provider." />}>
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-center">
          <p className="text-sm font-medium text-rose-700">Provider data could not be loaded.</p>
          <p className="mt-1 text-xs text-rose-600">{error || 'Please try again.'}</p>
          <Button onClick={() => router.back()} variant="outline" className="mt-3">
            Go back
          </Button>
        </div>
      </MobileToolWorkspace>
    );
  }

  const bookingUrl = (() => {
    const queryParams = new URLSearchParams();
    if (propertyId) queryParams.append('propertyId', propertyId);
    if (insightFactor) queryParams.append('insightFactor', insightFactor);
    if (category) queryParams.append('category', category);
    if (predictionId) queryParams.append('predictionId', predictionId);
    if (itemId) queryParams.append('itemId', itemId);
    if (homeAssetId) queryParams.append('homeAssetId', homeAssetId);
    if (guidanceJourneyId) queryParams.append('guidanceJourneyId', guidanceJourneyId);
    if (guidanceStepKey) queryParams.append('guidanceStepKey', guidanceStepKey);
    if (guidanceSignalIntentFamily) {
      queryParams.append('guidanceSignalIntentFamily', guidanceSignalIntentFamily);
    }
    if (priceFinalizationId) queryParams.append('priceFinalizationId', priceFinalizationId);
    if (finalPrice) queryParams.append('finalPrice', finalPrice);
    if (vendorName) queryParams.append('vendorName', vendorName);

    const fromParam = searchParams.get('from');
    if (fromParam) queryParams.append('from', fromParam);

    const baseUrl = `/dashboard/providers/${providerId}/book`;
    return queryParams.toString() ? `${baseUrl}?${queryParams.toString()}` : baseUrl;
  })();

  const showPhone = Boolean(provider.user.phone && provider.user.phone !== 'N/A');
  const showEmail = Boolean(provider.user.email && provider.user.email !== 'N/A');
  const ratingValue =
    typeof provider.averageRating === 'number' ? provider.averageRating.toFixed(1) : 'No rating';
  const categoryHighlights = provider.serviceCategories
    .slice(0, 3)
    .map((cat) => formatEnumLabel(cat));

  return (
    <MobileToolWorkspace className="lg:max-w-7xl lg:px-8 lg:pb-10"
      intro={
        <div className="space-y-3">
          <button
            onClick={() => router.back()}
            className="min-h-[44px] text-sm text-[hsl(var(--mobile-text-secondary))] transition-colors hover:text-[hsl(var(--mobile-text-primary))]"
          >
            ← Back
          </button>
          <MobilePageIntro
            title="Provider Profile"
            subtitle="Review provider details, services, and fit before booking."
          />
        </div>
      }
      summary={
        <ResultHeroCard
          eyebrow="Service Pro"
          title={provider.businessName}
          value={ratingValue}
          status={<StatusChip tone={isFavorited ? 'danger' : 'info'}>{isFavorited ? 'My Pro' : 'Not saved'}</StatusChip>}
          summary={`${provider.user.firstName} ${provider.user.lastName} • ${provider.totalReviews} reviews`}
          highlights={[
            `${provider.totalCompletedJobs} completed jobs`,
            `Serves ${provider.serviceRadius} miles`,
            ...categoryHighlights,
          ]}
          actions={
            <ActionPriorityRow
              primaryAction={
                isExecutionBlocked ? (
                  <button
                    type="button"
                    disabled
                    className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-600"
                  >
                    <Calendar className="h-4 w-4" />
                    Book now (blocked)
                  </button>
                ) : (
                  <Link
                    href={bookingUrl}
                    className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-brand-primary px-4 py-2.5 text-sm font-semibold text-white"
                  >
                    <Calendar className="h-4 w-4" />
                    Book now
                  </Link>
                )
              }
              secondaryActions={
                favoritesQuery.isError ? (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                    Favorite unavailable
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleFavoriteToggle}
                    disabled={isToggling}
                    className={cn(
                      'inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-all disabled:opacity-70',
                      isFavorited
                        ? 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
                        : 'border-[hsl(var(--mobile-border-subtle))] bg-white text-[hsl(var(--mobile-text-primary))] hover:bg-[hsl(var(--mobile-bg-muted))]'
                    )}
                  >
                    {isToggling ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Heart className={cn('h-4 w-4', isFavorited && 'fill-current')} />
                    )}
                    {isFavorited ? 'Saved to My Pros' : 'Save to My Pros'}
                  </button>
                )
              }
            />
          }
        />
      }
    >
      {isExecutionBlocked ? (
        <GuidanceWarningBanner
          title="Booking is blocked until prerequisite steps are complete"
          message={
            blockedReason ||
            'Finish required guidance steps before proceeding to provider booking.'
          }
          actionLabel="Go to required step"
          actionHref={blockedActionHref}
        />
      ) : null}

      <ScenarioInputCard title="Provider Snapshot" subtitle="Rating, service area, and specialties.">
        <ReadOnlySummaryBlock
          columns={2}
          items={[
            {
              label: 'Rating',
              value: (
                <span className="inline-flex items-center gap-1">
                  <Star className="h-3.5 w-3.5 text-amber-500" />
                  {ratingValue}
                </span>
              ),
              emphasize: true,
            },
            { label: 'Reviews', value: provider.totalReviews || 0 },
            { label: 'Completed Jobs', value: provider.totalCompletedJobs || 0 },
            { label: 'Service Radius', value: `${provider.serviceRadius} miles` },
          ]}
        />
        <div className="flex flex-wrap gap-2">
          {provider.serviceCategories.map((cat) => (
            <StatusChip key={cat} tone="info">
              {formatEnumLabel(cat)}
            </StatusChip>
          ))}
        </div>
      </ScenarioInputCard>

      <ScenarioInputCard title="Contact & Location" subtitle="How to reach this provider.">
        <ReadOnlySummaryBlock
          columns={2}
          items={[
            {
              label: 'Contact',
              value: `${provider.user.firstName} ${provider.user.lastName}`,
              emphasize: true,
            },
            { label: 'Phone', value: showPhone ? provider.user.phone : 'Shared after booking' },
            { label: 'Email', value: showEmail ? provider.user.email : 'Shared after booking' },
            { label: 'Website', value: provider.website ? 'Available' : 'Not listed' },
          ]}
        />
        <div className="space-y-2">
          {showPhone ? (
            <CompactEntityRow
              title={provider.user.phone || ''}
              subtitle="Phone"
              leading={<Phone className="h-4 w-4 text-brand-primary" />}
            />
          ) : null}
          {showEmail ? (
            <CompactEntityRow
              title={provider.user.email}
              subtitle="Email"
              leading={<Mail className="h-4 w-4 text-brand-primary" />}
              trailing={
                <a href={`mailto:${provider.user.email}`} className="text-xs font-medium text-brand-primary hover:underline">
                  Email
                </a>
              }
            />
          ) : null}
          {provider.website ? (
            <CompactEntityRow
              title="Visit website"
              subtitle={provider.website}
              leading={<ExternalLink className="h-4 w-4 text-brand-primary" />}
              trailing={
                <a
                  href={provider.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-brand-primary hover:underline"
                >
                  Open
                </a>
              }
            />
          ) : null}
          <CompactEntityRow
            title={`Serves within ${provider.serviceRadius} miles`}
            subtitle="Service area"
            leading={<MapPin className="h-4 w-4 text-brand-primary" />}
          />
        </div>
      </ScenarioInputCard>

      <ScenarioInputCard
        title={`Services (${services.length})`}
        subtitle={provider.description ?? 'No description provided.'}
      >
        <div className="space-y-2">
          {services.length === 0 ? (
            <div className="rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] px-3 py-2.5 text-sm text-[hsl(var(--mobile-text-secondary))]">
              No services available yet.
            </div>
          ) : (
            services.map((service) => (
              <CompactEntityRow
                key={service.id}
                title={service.name}
                subtitle={formatEnumLabel(service.category)}
                meta={`$${Number(service.basePrice).toFixed(2)} / ${service.priceUnit}`}
              />
            ))
          )}
        </div>
      </ScenarioInputCard>
      <BottomSafeAreaReserve size="chatAware" />
    </MobileToolWorkspace>
  );
}
