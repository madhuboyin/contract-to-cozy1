//apps/frontend/src/app/(dashboard)/dashboard/components/FavoriteProvidersCard.tsx
'use client'; // MUST be a client component to use hooks like useQuery

import React from 'react';
import Link from 'next/link';
// FIX: Added Calendar for Book button
import { Star, Phone, Loader2, Calendar, Search } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar'; 
import { cn } from '@/lib/utils';

// PHASE 2 FIX: Import for data fetching
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';

// Define a structural type for the data returned by listFavorites API 
interface FavoriteProviderData {
  id: string; // ProviderProfile ID
  businessName: string | null | undefined; // FIX: Ensure businessName is robustly typed
  // FIX: Make averageRating explicitly allow null/undefined
  averageRating: number | null | undefined;
  // FIX: Make totalReviews explicitly allow null/undefined
  totalReviews: number | null | undefined;
  // FIX: Allow user property itself to be null/undefined
  user: {
    firstName: string;
    lastName: string;
    phone: string | null; // Added phone based on expected use
  } | null | undefined; 
}

const FAVORITES_QUERY_KEY = ['favorites'];

// Helper to create initials for the AvatarFallback
const getInitials = (name: string | null | undefined): string => {
    if (!name) return '?'; // Return '?' if name is null, undefined, or empty
    
    const parts = name.split(' ');
    if (parts.length > 1) {
        return (parts[0][0] || '') + (parts[1][0] || '');
    }
    return name[0] || '?';
};

export const FavoriteProvidersCard = ({ className }: { className?: string }) => {
  
  // PHASE 2 FIX: Implement data fetching using useQuery
  const { data, isLoading, error } = useQuery({
    queryKey: FAVORITES_QUERY_KEY,
    queryFn: async () => {
      const response = await api.listFavorites();
      if (response.success) {
        // Cast the result to the expected shape (favorites: ProviderProfile[])
        return response.data.favorites as FavoriteProviderData[];
      }
      throw new Error(response.message || 'Failed to fetch favorites.');
    },
    staleTime: 5 * 60_000,
  });

  // Replace placeholder data with fetched data
  const favorites = data || []; 

  if (isLoading) {
    return (
      <Card className={cn("h-full flex flex-col items-center justify-center min-h-[150px]", className)}>
        <Loader2 className="h-6 w-6 animate-spin text-brand-primary" />
        <p className="mt-2 font-body text-sm text-muted-foreground">Loading favorites...</p>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={cn("h-full flex flex-col overflow-hidden", className)}>
         <CardHeader>
            <CardTitle className="font-heading text-xl flex items-center gap-2">
                <Star className="h-5 w-5 text-yellow-500 fill-yellow-500" />
                My Pros
            </CardTitle>
            <CardDescription className="font-body text-sm">
                Quick access to trusted providers
            </CardDescription>
        </CardHeader>
        <CardContent className="flex-1 text-center py-6 text-destructive">
          <p className="font-body text-sm">Error loading favorites: {error instanceof Error ? error.message : 'Unknown error'}</p>
        </CardContent>
        {/* Persistent footer with the link, even on error */}
        <div className="p-4 border-t border-gray-200">
            <Button variant="outline" className="w-full" asChild>
                <Link href="/dashboard/providers">
                    <Search className="h-4 w-4 mr-2" />
                    Search for Providers
                </Link>
            </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className={cn("h-full flex flex-col overflow-hidden", className)}>
      <CardHeader>
        <CardTitle className="font-heading text-xl flex items-center gap-2">
          <Star className="h-5 w-5 text-yellow-500 fill-yellow-500" />
          My Pros
          {/* PHASE 2 FIX: Display the actual count */}
          {favorites.length > 0 && (
            <span className="text-base font-body text-gray-500 ml-2">({favorites.length})</span>
          )}
        </CardTitle>
        <CardDescription className="font-body text-sm">
          Quick access to trusted providers
        </CardDescription>
      </CardHeader>
      {/* Added max-h-72 and overflow-y-auto to allow scrolling if many favorites exist */}
      <CardContent className="flex-1 overflow-y-auto max-h-64 sm:max-h-72">
        {favorites.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <p className="font-body text-sm mb-3">Save providers you love here.</p>
            {/* The button is now moved to the persistent footer below */}
          </div>
        ) : (
          // PHASE 3 FIX: Render the list of favorite providers
          <div className="space-y-4">
             {favorites.map((provider) => {
                const displayName = provider.businessName || 'Unnamed Provider';
                const totalReviews = provider.totalReviews ?? 0;
                
                return (
                <div 
                    key={provider.id} 
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 transition-colors"
                >
                    <div className="flex items-center space-x-3 min-w-0">
                        <Avatar className="h-10 w-10 shrink-0">
                            <AvatarFallback className="bg-teal-500 text-white text-base font-semibold">
                                {getInitials(displayName)}
                            </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                            <Link 
                                href={`/dashboard/providers/${provider.id}`} 
                                className="font-medium text-gray-900 hover:text-brand-primary truncate block"
                                title={displayName}
                            >
                                {/* FIX: Use the safely derived display name */}
                                {displayName}
                            </Link>
                            <div className="flex items-center text-sm text-gray-500">
                                <Star className="h-3 w-3 fill-yellow-500 text-yellow-500 mr-1" />
                                <span>
                                    {/* FIX 2: Safely check for rating and use the calculated total reviews */}
                                    {(provider.averageRating ?? 0).toFixed(1)} 
                                    ({totalReviews})
                                </span>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                        {/* FIX 1: Use optional chaining to safely access provider.user.phone */}
                        {provider.user?.phone && (
                            <Button variant="ghost" size="icon" asChild>
                                <a href={`tel:${provider.user.phone}`} title={`Call ${displayName}`}>
                                    <Phone className="h-4 w-4 text-gray-500 hover:text-brand-primary" />
                                </a>
                            </Button>
                        )}
                        <Button variant="outline" size="sm" asChild>
                            <Link href={`/dashboard/providers/${provider.id}/book`}>
                                <Calendar className="h-4 w-4 sm:mr-1" />
                                <span className="hidden sm:inline">Book</span>
                            </Link>
                        </Button>
                    </div>
                </div>
            )})}
          </div>
        )}
      </CardContent>
      {/* FIX: New Persistent Card Footer for Search Link */}
      <div className="p-4 border-t border-gray-200">
          <Button variant="outline" className="w-full" asChild>
              <Link href="/dashboard/providers">
                  <Search className="h-4 w-4 mr-2" />
                  Search for Providers
              </Link>
          </Button>
      </div>
    </Card>
  );
};