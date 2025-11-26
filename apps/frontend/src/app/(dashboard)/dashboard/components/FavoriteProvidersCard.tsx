//apps/frontend/src/app/(dashboard)/dashboard/components/FavoriteProvidersCard.tsx
'use client'; // MUST be a client component to use hooks like useQuery

import React from 'react';
import Link from 'next/link';
// FIX: Added Loader2 for loading state
import { Star, Phone, Loader2 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar'; 
import { cn } from '@/lib/utils';

// PHASE 2 FIX: Import for data fetching
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';

// Define a structural type for the data returned by listFavorites API 
// (based on the backend controller response structure)
interface FavoriteProviderData {
  id: string; // ProviderProfile ID
  businessName: string;
  averageRating: number;
  totalReviews: number;
  // Minimal user info from the nested user object
  user: {
    firstName: string;
    lastName: string;
  };
}

const FAVORITES_QUERY_KEY = ['favorites'];

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
    // Set a short staleTime (e.g., 5 minutes)
    staleTime: 5 * 60 * 1000, 
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
      <Card className={cn("h-full flex flex-col", className)}>
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
          <p className="font-body text-sm">Error loading favorites: {(error as Error).message}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("h-full flex flex-col", className)}>
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
      <CardContent className="flex-1">
        {favorites.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <p className="font-body text-sm mb-3">Save providers you love here.</p>
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard/providers">Find Providers</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
             {/* List logic for displaying providers will go here in Phase 3 */}
             <p className="text-muted-foreground text-sm text-center py-6">
                Showing {favorites.length} providers. List display coming in Phase 3...
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};