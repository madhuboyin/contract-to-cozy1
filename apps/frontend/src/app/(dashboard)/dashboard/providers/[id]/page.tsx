// apps/frontend/src/app/(dashboard)/dashboard/providers/[id]/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api/client';
// NOTE: Assuming Provider and User are imported but are structurally incomplete
import { Provider, Service, User } from '@/types'; 
import { Star, Phone, Mail, MapPin, ExternalLink, Calendar, Heart, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/use-toast';

// FIX: Define a structural interface that extends the imported Provider type 
// to include the missing fields used by the component.
interface CompleteUser extends User {
    phone: string | null;
    email: string;
}

interface CompleteProvider extends Provider {
    website: string | null; 
    user: CompleteUser; 
    // FIX: Add missing description property
    description: string | null | undefined;
}


// --- Helper Function ---
function formatServiceCategory(category: string | null): string {
  if (!category) return '';
  return category
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}
// ---

export default function ProviderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const providerId = params.id as string;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // FIX: Use CompleteProvider type for the state
  const [provider, setProvider] = useState<CompleteProvider | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  
  // Helper to create initials for the AvatarFallback
  const getInitials = (firstName: string, lastName: string) => {
    return (firstName?.[0] || '') + (lastName?.[0] || '');
  };
  
  // =========================================================================
  // PHASE 3: FAVORITES LOGIC
  // =========================================================================

  // Use the same query key as the dashboard card for consistency and cache invalidation
  const FAVORITES_QUERY_KEY = ['favorites'];

  // 1. Query to check if the current provider is a favorite
  const favoritesQuery = useQuery({
    queryKey: FAVORITES_QUERY_KEY,
    queryFn: async () => {
      const response = await api.listFavorites();
      if (response.success) {
        // Return only the IDs of favorited providers for easy lookup
        return response.data.favorites.map(f => f.id);
      }
      // Log the error but don't crash the component
      console.error("Failed to fetch favorites status:", response.message);
      return [];
    },
    // Set a moderate staleTime
    staleTime: 5 * 60 * 1000, 
    // Ensure this runs only if we have a providerId to check against
    enabled: !!providerId, 
  });
  
  const isFavorite = favoritesQuery.data?.includes(providerId) ?? false;
  
  // 2. Mutation for adding a favorite
  const addFavoriteMutation = useMutation({
    mutationFn: (id: string) => api.addFavorite(id),
    onSuccess: () => {
      // Invalidate the cache to immediately reflect the change on the dashboard card
      queryClient.invalidateQueries({ queryKey: FAVORITES_QUERY_KEY });
      toast({
        title: "Added to My Pros",
        description: `${provider?.businessName || 'Provider'} is now in your favorites.`,
        variant: "default",
      });
    },
    onError: (err: any) => {
      toast({
        title: "Failed to Add Favorite",
        description: err.message || "Could not add provider to My Pros.",
        variant: "destructive",
      });
    }
  });

  // 3. Mutation for removing a favorite
  const removeFavoriteMutation = useMutation({
    mutationFn: (id: string) => api.removeFavorite(id),
    onSuccess: () => {
      // Invalidate the cache to immediately reflect the change on the dashboard card
      queryClient.invalidateQueries({ queryKey: FAVORITES_QUERY_KEY });
      toast({
        title: "Removed from My Pros",
        description: `${provider?.businessName || 'Provider'} has been removed from your favorites.`,
        variant: "destructive",
      });
    },
    onError: (err: any) => {
      toast({
        title: "Failed to Remove Favorite",
        description: err.message || "Could not remove provider from My Pros.",
        variant: "destructive",
      });
    }
  });

  const handleFavoriteToggle = () => {
    if (!providerId) return;

    if (isFavorite) {
      removeFavoriteMutation.mutate(providerId);
    } else {
      addFavoriteMutation.mutate(providerId);
    }
  };

  const isToggling = addFavoriteMutation.isPending || removeFavoriteMutation.isPending;

  // =========================================================================
  // EXISTING DATA LOADING LOGIC
  // =========================================================================

  useEffect(() => {
    loadData();
  }, [providerId]);

  const loadData = async () => {
    try {
      const [providerRes, servicesRes] = await Promise.all([
        api.getProvider(providerId),
        api.getProviderServices(providerId),
      ]);

      if (providerRes.success) {
        // Cast the API response data to the CompleteProvider type
        setProvider(providerRes.data as CompleteProvider);
      } else {
        setError(providerRes.message || 'Provider not found');
      }

      if (servicesRes.success) {
        setServices(servicesRes.data.services);
      }
    } catch (error) {
      console.error('Failed to load provider data:', error);
      setError('Failed to load provider data.');
    } finally {
      setLoading(false);
    }
  };

  if (loading || favoritesQuery.isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-brand-primary" />
        <p className="ml-3 text-lg text-gray-600">Loading provider...</p>
      </div>
    );
  }

  if (error || !provider) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold text-red-600">Error</h1>
        <p className="text-gray-600 mt-2">{error || 'Provider data could not be loaded.'}</p>
        <Button onClick={() => router.back()} variant="link" className="mt-4">
          ← Go back
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-start justify-between mb-8">
        <div className="flex items-center space-x-4">
          <Avatar className="h-20 w-20">
            {/* Replace with Image if avatar URL is available */}
            <AvatarFallback className="text-2xl bg-brand-primary text-white font-semibold">
              {getInitials(provider.user.firstName, provider.user.lastName)}
            </AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{provider.businessName}</h1>
            <p className="text-lg text-gray-600">
              {provider.user.firstName} {provider.user.lastName}
            </p>
            <div className="flex items-center mt-1">
              <Star className="h-5 w-5 fill-yellow-500 text-yellow-500 mr-1" />
              <span className="font-semibold text-gray-800">
                {provider.averageRating.toFixed(1)}
              </span>
              <span className="text-sm text-gray-500 ml-1">
                ({provider.totalReviews} reviews)
              </span>
            </div>
          </div>
        </div>

        {/* PHASE 3 FIX: Favorite Toggle Button */}
        <Button
            onClick={handleFavoriteToggle}
            variant={isFavorite ? "destructive" : "outline"}
            size="lg"
            disabled={isToggling}
            className="flex items-center space-x-2"
        >
            {isToggling ? (
                <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
                <Heart 
                    className={isFavorite ? "h-5 w-5 fill-white" : "h-5 w-5 text-gray-500"} 
                />
            )}
            <span className="text-base font-semibold">
                {isFavorite ? 'My Pro' : 'Add to My Pros'}
            </span>
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Contact Card */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-xl">Contact & Location</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center text-gray-700">
              {/* FIX: Accessing provider.user.phone */}
              <Phone className="h-5 w-5 mr-3 text-brand-primary" />
              <span>{provider.user.phone || 'N/A'}</span>
            </div>
            <div className="flex items-center text-gray-700">
              {/* FIX: Accessing provider.user.email */}
              <Mail className="h-5 w-5 mr-3 text-brand-primary" />
              <span>{provider.user.email}</span>
            </div>
            {/* FIX: Accessing provider.website */}
            {provider.website && (
              <div className="flex items-center text-gray-700">
                <ExternalLink className="h-5 w-5 mr-3 text-brand-primary" />
                <a 
                  href={provider.website} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-brand-primary hover:underline"
                >
                  Visit Website
                </a>
              </div>
            )}
            <Separator className="my-2" />
            <div className="flex items-center text-gray-700">
              <MapPin className="h-5 w-5 mr-3 text-brand-primary" />
              <span>
                Serves within {provider.serviceRadius} miles
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Services & Description */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-xl">About {provider.businessName}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* FIX: Accessing provider.description */}
            <p className="text-gray-700 leading-relaxed">
              {provider.description || 'No description provided yet.'}
            </p>
            
            <Separator />
            
            <div>
              <h3 className="text-lg font-semibold mb-2">Available Services ({services.length})</h3>
              <div className="flex flex-wrap gap-2">
                {services.map(service => (
                  <Badge 
                    key={service.id} 
                    variant="secondary" 
                    className="bg-teal-50 text-brand-primary border-brand-primary border"
                  >
                    {service.name}
                  </Badge>
                ))}
              </div>
            </div>
            
            <Separator />

            <Button asChild>
                <Link 
                    href={`/dashboard/providers/${providerId}/book`}
                    className="w-full"
                >
                    <Calendar className="h-4 w-4 mr-2" />
                    Book Now
                </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
      
      {/* Provider Details and Reviews (omitted for brevity) */}
    </div>
  );
}