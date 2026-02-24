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

  const propertyId = searchParams.get('propertyId');
  const insightFactor = searchParams.get('insightFactor');
  const category = searchParams.get('category');
  const predictionId = searchParams.get('predictionId');
  const itemId = searchParams.get('itemId');

  const [provider, setProvider] = useState<CompleteProvider | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');

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
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-primary" />
        <p className="ml-3 text-base text-gray-600 sm:text-lg">Loading provider...</p>
      </div>
    );
  }

  if (error || !provider) {
    return (
      <div className="py-12 text-center">
        <h1 className="text-2xl font-bold text-red-600">Error</h1>
        <p className="mt-2 text-gray-600">{error || 'Provider data could not be loaded.'}</p>
        <Button onClick={() => router.back()} variant="link" className="mt-4">
          ← Go back
        </Button>
      </div>
    );
  }

  const bookingUrl = (() => {
    const queryParams = new URLSearchParams();
    if (propertyId) queryParams.append('propertyId', propertyId);
    if (insightFactor) queryParams.append('insightFactor', insightFactor);
    if (category) queryParams.append('category', category);
    if (predictionId) queryParams.append('predictionId', predictionId);
    if (itemId) queryParams.append('itemId', itemId);

    const fromParam = searchParams.get('from');
    if (fromParam) queryParams.append('from', fromParam);

    const baseUrl = `/dashboard/providers/${providerId}/book`;
    return queryParams.toString() ? `${baseUrl}?${queryParams.toString()}` : baseUrl;
  })();

  const showPhone = Boolean(provider.user.phone && provider.user.phone !== 'N/A');
  const showEmail = Boolean(provider.user.email && provider.user.email !== 'N/A');

  return (
    <div className="mx-auto max-w-5xl">
      <button
        onClick={() => router.back()}
        className="mb-4 min-h-[44px] text-sm text-gray-600 transition-colors hover:text-gray-900"
      >
        ← Back
      </button>

      <div className="mb-6 rounded-2xl bg-gradient-to-r from-[#0d4f47] to-[#1a7a6e] p-6 text-white shadow-md">
        <div className="flex items-start gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-white/20 text-xl font-bold text-white backdrop-blur-sm">
            {getInitials(provider.user.firstName, provider.user.lastName)}
          </div>

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-bold">{provider.businessName}</h1>
            <p className="mt-0.5 text-sm text-teal-200">
              {provider.user.firstName} {provider.user.lastName}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1 text-sm font-medium text-yellow-300">
                <Star className="h-4 w-4 fill-yellow-300" />
                {provider.averageRating?.toFixed(1)}
                <span className="font-normal text-white/60">({provider.totalReviews} reviews)</span>
              </div>
              {provider.totalCompletedJobs > 0 && (
                <span className="text-sm text-white/70">· {provider.totalCompletedJobs} jobs completed</span>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {provider.serviceCategories.map((cat) => (
                <span
                  key={cat}
                  className="inline-flex items-center rounded-md border border-white/20 bg-white/10 px-2 py-0.5 text-xs font-medium text-teal-50"
                >
                  {formatEnumLabel(cat)}
                </span>
              ))}
            </div>
          </div>

          <div className="shrink-0">
            {favoritesQuery.isError ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                Favorite unavailable
              </div>
            ) : (
              <button
                onClick={handleFavoriteToggle}
                disabled={isToggling}
                className={cn(
                  'flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium transition-all disabled:opacity-70',
                  isFavorited
                    ? 'bg-red-500 text-white hover:bg-red-600'
                    : 'bg-white/20 text-white backdrop-blur-sm hover:bg-white/30'
                )}
              >
                {isToggling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Heart className={cn('h-4 w-4', isFavorited && 'fill-white')} />}
                {isFavorited ? 'My Pro' : 'Save Pro'}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5 lg:gap-6">
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm lg:col-span-2">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-400">Contact & Location</h2>

          <div className="space-y-3">
            {showPhone ? (
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <Phone className="h-4 w-4 shrink-0 text-brand-primary" />
                <span>{provider.user.phone}</span>
              </div>
            ) : null}

            {showEmail ? (
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <Mail className="h-4 w-4 shrink-0 text-brand-primary" />
                <a href={`mailto:${provider.user.email}`} className="hover:text-brand-primary hover:underline">
                  {provider.user.email}
                </a>
              </div>
            ) : null}

            {!showPhone && !showEmail && (
              <p className="text-sm italic text-gray-400">Full contact details available after booking is confirmed.</p>
            )}

            {provider.website ? (
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <ExternalLink className="h-4 w-4 shrink-0 text-brand-primary" />
                <a href={provider.website} target="_blank" rel="noopener noreferrer" className="hover:text-brand-primary hover:underline">
                  Visit Website
                </a>
              </div>
            ) : null}

            <div className="flex items-center gap-2 text-sm text-gray-700">
              <MapPin className="h-4 w-4 shrink-0 text-brand-primary" />
              <span>Serves within {provider.serviceRadius} miles</span>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm lg:col-span-3">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">About {provider.businessName}</h2>
          <p className="mb-5 text-sm leading-relaxed text-gray-700">{provider.description ?? 'No description provided.'}</p>

          <h3 className="mb-2 text-sm font-medium text-gray-700">Available Services ({services.length})</h3>
          <div className="mb-5 space-y-2">
            {services.map((service) => (
              <div key={service.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-teal-100 bg-teal-50 px-3 py-2">
                <span className="text-sm font-medium text-teal-700">{service.name}</span>
                <span className="text-xs text-teal-600">• {formatEnumLabel(service.category)}</span>
              </div>
            ))}
            {services.length === 0 && <p className="text-sm text-gray-500">No services available yet.</p>}
          </div>

          <Link
            href={bookingUrl}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-primary px-6 py-3 text-base font-semibold text-white shadow-sm transition-colors hover:bg-brand-primary/90"
          >
            <Calendar className="h-4 w-4" />
            Book Now
          </Link>
        </div>
      </div>
    </div>
  );
}
