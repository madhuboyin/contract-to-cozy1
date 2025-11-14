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
import { useAuth } from '@/lib/auth/AuthContext';

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
  const { user } = useAuth();

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

      {/* NEW: Service Category Selector - Shows when NO category selected */}
      {!serviceCategory && (
        <Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-white">
          <CardHeader>
            <CardTitle className="text-xl">Select a Service Category</CardTitle>
            <CardDescription>
              Choose the type of service you need to see available providers
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Button
                asChild
                size="lg"
                variant="default"
                className="h-24 flex flex-col items-center justify-center space-y-2"
              >
                <Link href="/dashboard/providers?service=INSPECTION">
                  <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  <span className="text-lg font-semibold">Home Inspection</span>
                </Link>
              </Button>

              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-24 flex flex-col items-center justify-center space-y-2"
              >
                <Link href="/dashboard/providers?service=HANDYMAN">
                  <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span className="text-lg font-semibold">Handyman Services</span>
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Current Category Badge - Shows when category IS selected */}
      {serviceCategory && (
        <div className="flex items-center justify-between">
          <div>
            <p className="text-gray-600">
              Showing results for:
              <Badge variant="default" className="ml-2 text-base">
                {formatServiceCategory(serviceCategory)}
              </Badge>
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/providers">
              View All Categories
            </Link>
          </Button>
        </div>
      )}

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

      {/* --- Empty State (when category selected but no providers) --- */}
      {!loading && !error && serviceCategory && providers.length === 0 && (
        <div className="flex h-64 w-full flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 p-8 text-center">
          <Search className="h-8 w-8 text-gray-400" />
          <h2 className="mt-4 text-xl font-semibold">No Providers Found</h2>
          <p className="mt-2 text-muted-foreground">
            We couldn't find any providers matching your criteria. Try a
            different category.
          </p>
          <Button asChild variant="outline" className="mt-4">
            <Link href="/dashboard/providers">
              View All Categories
            </Link>
          </Button>
        </div>
      )}

      {/* --- Results List --- */}
      {!loading && !error && providers.length > 0 && (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {providers.map((provider) => (
            <ProviderCard key={provider.id} provider={provider} serviceCategory={serviceCategory} />
          ))}
        </div>
      )}
    </div>
  );
}

// --- Individual Provider Card Component ---
function ProviderCard({ provider, serviceCategory }: { provider: Provider, serviceCategory: string | null }) {
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
          {/* Pass the serviceCategory to the book page */}
          <Link href={`/dashboard/providers/${provider.id}${serviceCategory ? `?service=${serviceCategory}` : ''}`}>
            View Profile & Book
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

// --- Page Wrapper ---
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