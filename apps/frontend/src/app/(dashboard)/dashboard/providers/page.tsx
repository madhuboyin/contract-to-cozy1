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
import { ArrowLeft, Loader2, AlertCircle, Search, Star } from 'lucide-react';
import { useAuth } from '@/lib/auth/AuthContext';
import { api } from '@/lib/api/client';
import { ServiceCategoryIcon } from '@/components/ServiceCategoryIcon';

// --- Define the Provider type ---
interface Provider {
  id: string;
  businessName: string;
  averageRating: number;
  totalReviews: number;
  services: {
    id: string;
    name: string;
    basePrice: string;
    priceUnit: string;
  }[];
}

interface ServiceCategoryConfig {
  category: string;
  displayName: string;
  description: string;
  icon: string;
}

// --- Main Search Component ---
function ProviderSearch() {
  const searchParams = useSearchParams();
  const serviceCategory = searchParams.get('service');
  const { user } = useAuth();

  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true); // Default to true for initial load
  const [error, setError] = useState<string | null>(null);

  // NEW: Service categories state
  const [serviceCategories, setServiceCategories] = useState<ServiceCategoryConfig[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);

  // Fetch service categories
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        setCategoriesLoading(true);
        const response = await api.getServiceCategories();
        if (response.success) {
          setServiceCategories(response.data.categories);
        }
      } catch (error) {
        console.error('Failed to fetch service categories:', error);
      } finally {
        setCategoriesLoading(false);
      }
    };

    fetchCategories();
  }, []);

  // --- FIX: This hook is updated to always fetch ---
  // Fetch providers based on selected category (or all if none selected)
  useEffect(() => {
    const fetchProviders = async () => {
      try {
        setLoading(true);
        setError(null); // Clear previous errors

        // Always fetch. Pass 'category: undefined' if serviceCategory is null.
        const response = await api.searchProviders({
          category: serviceCategory || undefined,
        });

        if (response.success) {
          // Use double assertion 'as unknown as Provider[]'
          setProviders((response.data.providers as unknown as Provider[]) || []);
        } else {
          throw new Error(response.message || 'Failed to fetch providers.');
        }
      } catch (err: any) {
        console.error('Failed to fetch providers:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    // We no longer check if serviceCategory exists. We always fetch.
    fetchProviders();
    
  }, [serviceCategory]); // This effect re-runs when serviceCategory changes
  // --- END FIX ---

  const isHomeBuyer = user?.segment === 'HOME_BUYER';
  const backLink = isHomeBuyer ? '/dashboard/checklist' : '/dashboard';
  const backLinkText = isHomeBuyer ? 'Back to Checklist' : 'Back to Dashboard';

  // --- CHANGE: Added logic for dynamic page title ---
  let pageTitle = 'Find Providers';
  if (serviceCategory && !categoriesLoading) {
    const selectedCategoryName = serviceCategories.find(
      (c) => c.category === serviceCategory
    )?.displayName;

    if (selectedCategoryName) {
      pageTitle = `${selectedCategoryName} Providers`;
    }
  }
  // --- END CHANGE ---

  return (
    <div className="flex-1 space-y-4 pt-6">
      <Button asChild variant="link" className="pl-0 text-blue-600">
        <Link href={backLink}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          {backLinkText}
        </Link>
      </Button>

      {/* --- CHANGE: Dynamic title and "View All" link --- */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <h2 className="text-3xl font-bold tracking-tight">{pageTitle}</h2>
        {serviceCategory && !loading && (
          <Button
            asChild
            variant="link"
            className="p-0 h-auto text-blue-600 self-start sm:self-center"
          >
            <Link href="/dashboard/providers">View All Categories</Link>
          </Button>
        )}
      </div>
      {/* --- END CHANGE --- */}

      {/* NEW: Dynamic Service Category Selector */}
      {/* --- FIX: Only show category picker if NOT loading and no category is selected --- */}
      {!serviceCategory && !loading && (
        <Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-white">
          <CardHeader>
            <CardTitle className="text-xl">Select a Service Category</CardTitle>
            <CardDescription>
              Choose the type of service you need to see available providers or
              browse all providers below.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {categoriesLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                <p className="ml-3 text-gray-600">Loading categories...</p>
              </div>
            ) : serviceCategories.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {serviceCategories.map((category) => (
                  <Button
                    key={category.category}
                    asChild
                    size="lg"
                    variant="outline"
                    className="h-auto py-6 flex flex-col items-start justify-start space-y-2 text-left hover:bg-blue-50 hover:border-blue-300 transition-all"
                  >
                    <Link
                      href={`/dashboard/providers?service=${category.category}`}
                    >
                      <div className="flex items-center space-x-3 w-full">
                        <div className="flex-shrink-0 w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                          <ServiceCategoryIcon
                            icon={category.icon}
                            className="h-5 w-5 text-blue-600"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-base text-gray-900">
                            {category.displayName}
                          </div>
                          {category.description && (
                            <div className="text-xs text-gray-500 mt-1 line-clamp-2">
                              {category.description}
                            </div>
                          )}
                        </div>
                      </div>
                    </Link>
                  </Button>
                ))}
              </div>
            ) : (
              // Fallback: Static categories if API fails
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Button
                  asChild
                  size="lg"
                  variant="default"
                  className="h-24 flex flex-col items-center justify-center space-y-2"
                >
                  <Link href="/dashboard/providers?service=INSPECTION">
                    <svg
                      className="h-8 w-8"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
                      />
                    </svg>
                    <span className="text-lg font-semibold">
                      Home Inspection
                    </span>
                  </Link>
                </Button>

                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="h-24 flex flex-col items-center justify-center space-y-2"
                >
                  <Link href="/dashboard/providers?service=HANDYMAN">
                    <svg
                      className="h-8 w-8"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0 3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826 3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                    </svg>
                    <span className="text-lg font-semibold">Handyman</span>
                  </Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex h-64 w-full flex-col items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <p className="mt-4 text-muted-foreground">Finding providers...</p>
        </div>
      )}

      {/* Error State */}
      {!loading && error && (
        <div className="flex h-64 w-full flex-col items-center justify-center rounded-lg border-2 border-red-200 bg-red-50 p-8 text-center">
          <AlertCircle className="h-8 w-8 text-red-600" />
          <h2 className="mt-4 text-xl font-semibold text-red-900">
            Error Loading Providers
          </h2>
          <p className="mt-2 text-muted-foreground">{error}</p>
        </div>
      )}

      {/* Empty State */}
      {/* --- FIX: Updated empty state logic --- */}
      {!loading && !error && providers.length === 0 && (
        <div className="flex h-64 w-full flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 p-8 text-center">
          <Search className="h-8 w-8 text-gray-400" />
          <h2 className="mt-4 text-xl font-semibold">No Providers Found</h2>
          {serviceCategory ? (
            <p className="mt-2 text-muted-foreground">
              We couldn't find any providers for this category. Try a different
              service.
            </p>
          ) : (
            <p className="mt-2 text-muted-foreground">
              We couldn't find any providers for your segment at this time.
            </p>
          )}
          <Button asChild variant="outline" className="mt-4">
            <Link href="/dashboard/providers">View All Categories</Link>
          </Button>
        </div>
      )}
      {/* --- END FIX --- */}


      {/* Results List */}
      {!loading && !error && providers.length > 0 && (
        // --- START: MODIFIED GRID LAYOUT ---
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {/* --- END: MODIFIED GRID LAYOUT --- */}
          {providers.map((provider) => (
            <ProviderCard
              key={provider.id}
              provider={provider}
              serviceCategory={serviceCategory}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// --- START: MODIFIED ProviderCard Component ---
function ProviderCard({
  provider,
  serviceCategory,
}: {
  provider: Provider;
  serviceCategory: string | null;
}) {
  const previewService = provider.services?.sort(
    (a, b) => parseFloat(a.basePrice) - parseFloat(b.basePrice)
  )[0];

  const basePriceValue = previewService?.basePrice
    ? parseFloat(previewService.basePrice)
    : null;

  return (
    <Card className="flex flex-col justify-between transition-all hover:shadow-lg">
      <CardHeader className="pb-4">
        {/* Title font size changed from text-lg to text-base */}
        <CardTitle className="text-base truncate">
          {provider.businessName}
        </CardTitle>
        <div className="flex items-center gap-1 pt-1">
          <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
          <span className="font-medium">
            {provider.averageRating.toFixed(1)}
          </span>
          <span className="text-sm text-muted-foreground">
            ({provider.totalReviews} reviews)
          </span>
        </div>
      </CardHeader>

      {/* CardContent has been removed */}

      {/* CardFooter is now the primary info/action area */}
      <CardFooter className="flex justify-between items-center bg-gray-50/50 p-4">
        <div>
          {previewService && basePriceValue !== null && !isNaN(basePriceValue) ? (
            <>
              <p className="text-xs text-muted-foreground">
                Services starting at
              </p>
              {/* Price font size changed from text-base to text-sm */}
              <p className="text-sm font-semibold">
                ${basePriceValue.toFixed(2)}
                <span className="text-xs font-normal text-muted-foreground">
                  /{previewService.priceUnit}
                </span>
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              No pricing available.
            </p>
          )}
        </div>
        <Button asChild size="sm">
          <Link
            href={`/dashboard/providers/${provider.id}${
              serviceCategory ? `?service=${serviceCategory}` : ''
            }`}
          >
            {/* Button text changed from "View Profile" to "View" */}
            View
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
// --- END: MODIFIED ProviderCard Component ---

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