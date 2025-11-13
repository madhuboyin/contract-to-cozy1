// apps/frontend/src/app/(dashboard)/dashboard/providers/page.tsx
'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Loader2, AlertCircle, Search, Star } from 'lucide-react';
import { useAuth } from '@/lib/auth/AuthContext'; // <-- 1. IMPORT useAuth

// --- Define the Provider type ---
interface Provider {
  id: string;
  businessName: string;
  averageRating: number;
  totalReviews: number;
  services: {
    id: string;
    name: string;
    basePrice: number;
    priceUnit: string;
  }[];
}

// --- Helper Function ---
function formatServiceCategory(category: string | null): string {
  if (!category) return 'All';
  return category
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

// --- Main Search Component ---
function ProviderSearch() {
  const searchParams = useSearchParams();
  const serviceCategory = searchParams.get('service');
  const { user } = useAuth(); // <-- 2. GET THE USER

  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchProviders = async () => {
      try {
        setLoading(true);
        const token = localStorage.getItem('accessToken');
        const apiUrl = new URL(
          `${process.env.NEXT_PUBLIC_API_URL}/api/providers/search`
        );
        if (serviceCategory) {
          apiUrl.searchParams.append('category', serviceCategory);
        }
        // TODO: Add zipCode from user's profile for better results
        // apiUrl.searchParams.append('zipCode', 'YOUR_ZIP_CODE');

        const response = await fetch(apiUrl.toString(), {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error('Failed to fetch providers.');
        }

        const data = await response.json();
        setProviders(data.data || []);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchProviders();
  }, [serviceCategory]);

  // 3. DETERMINE THE CORRECT "BACK" LINK
  const isHomeBuyer = user?.segment === 'HOME_BUYER';
  const backLink = isHomeBuyer ? '/dashboard/checklist' : '/dashboard';
  const backLinkText = isHomeBuyer ? 'Back to Checklist' : 'Back to Dashboard';

  return (
    <div className="flex-1 space-y-4 pt-6">
      <Button asChild variant="link" className="pl-0 text-blue-600">
        <Link href={backLink}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          {backLinkText}
        </Link>
      </Button>

      <h2 className="text-3xl font-bold tracking-tight">Find Providers</h2>
      <p className="text-gray-600">
        Showing results for:
        <Badge variant="default" className="ml-2 text-base">
          {formatServiceCategory(serviceCategory)}
        </Badge>
      </p>

      {/* --- Loading State --- */}
      {loading && (
        <div className="flex h-64 w-full items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      )}

      {/* --- Error State --- */}
      {!loading && error && (
        <div className="flex h-64 w-full flex-col items-center justify-center rounded-lg border-2 border-dashed border-red-300 bg-red-50 p-8 text-center">
          <AlertCircle className="h-8 w-8 text-red-600" />
          <h2 className="mt-4 text-xl font-semibold text-red-700">
            Oops, something went wrong.
          </h2>
          <p className="mt-2 text-muted-foreground">{error}</p>
        </div>
      )}

      {/* --- Empty State --- */}
      {!loading && !error && providers.length === 0 && (
        <div className="flex h-64 w-full flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 p-8 text-center">
          <Search className="h-8 w-8 text-gray-400" />
          <h2 className="mt-4 text-xl font-semibold">No Providers Found</h2>
          <p className="mt-2 text-muted-foreground">
            We couldn't find any providers matching your criteria. Try a
            different search.
          </p>
        </div>
      )}

      {/* --- Results List --- */}
      {!loading && !error && providers.length > 0 && (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {providers.map((provider) => (
            <ProviderCard key={provider.id} provider={provider} />
          ))}
        </div>
      )}
    </div>
  );
}

// --- Individual Provider Card Component ---
function ProviderCard({ provider }: { provider: Provider }) {
  const previewService = provider.services?.sort(
    (a, b) => a.basePrice - b.basePrice
  )[0];

  return (
    <Card className="flex flex-col justify-between transition-all hover:shadow-lg">
      <CardHeader>
        <CardTitle className="text-xl">{provider.businessName}</CardTitle>
        <div className="flex items-center gap-1 pt-1">
          <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
          <span className="font-medium">{provider.averageRating.toFixed(1)}</span>
          <span className="text-sm text-muted-foreground">
            ({provider.totalReviews} reviews)
          </span>
        </div>
      </CardHeader>
      <CardContent>
        {previewService ? (
          <div>
            <p className="text-sm text-muted-foreground">Services starting at</p>
            <p className="text-2xl font-bold">
              ${previewService.basePrice.toString()}
              <span className="text-sm font-normal text-muted-foreground">
                /{previewService.priceUnit}
              </span>
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No pricing available.</p>
        )}
      </CardContent>
      <CardFooter className="bg-gray-50/50 p-4">
        <Button asChild className="w-full">
          {/* This links to a page that doesn't exist yet, but matches your design */}
          <Link href={`/dashboard/providers/${provider.id}`}>
            View Profile & Book
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

// --- Page Wrapper ---
// We must wrap the component in <Suspense> for `useSearchParams` to work.
export default function ProvidersPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <ProviderSearch />
    </Suspense>
  );
}

function PageLoader() {
  return (
    <div className="flex h-full w-full items-center justify-center p-8">
      <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
    </div>
  );
}