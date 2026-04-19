'use client';

import { useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { api } from '@/lib/api/client';
import { usePropertyContext } from '@/lib/property/PropertyContext';

type PropertyScopedToolRedirectPageProps = {
  toolKey: string;
  navTarget: string;
};

function buildForwardQuery(serializedSearchParams: string): string {
  const query = new URLSearchParams(serializedSearchParams);
  query.delete('propertyId');
  const next = query.toString();
  return next ? `?${next}` : '';
}

function buildToolHref(propertyId: string, toolKey: string, forwardQuery: string): string {
  return `/dashboard/properties/${encodeURIComponent(propertyId)}/tools/${toolKey}${forwardQuery}`;
}

function buildPropertiesFallbackHref(navTarget: string, forwardQuery: string): string {
  const query = new URLSearchParams(forwardQuery.startsWith('?') ? forwardQuery.slice(1) : forwardQuery);
  if (!query.has('navTarget')) {
    query.set('navTarget', navTarget);
  }
  const suffix = query.toString();
  return suffix ? `/dashboard/properties?${suffix}` : '/dashboard/properties';
}

export default function PropertyScopedToolRedirectPage({
  toolKey,
  navTarget,
}: PropertyScopedToolRedirectPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { selectedPropertyId, setSelectedPropertyId } = usePropertyContext();

  const serializedSearchParams = searchParams.toString();
  const propertyIdFromQuery = searchParams.get('propertyId') || undefined;
  const forwardQuery = useMemo(
    () => buildForwardQuery(serializedSearchParams),
    [serializedSearchParams]
  );

  useEffect(() => {
    let active = true;

    const resolveAndRedirect = async () => {
      const directPropertyId = propertyIdFromQuery || selectedPropertyId;

      if (directPropertyId) {
        if (propertyIdFromQuery && propertyIdFromQuery !== selectedPropertyId) {
          setSelectedPropertyId(propertyIdFromQuery);
        }
        router.replace(buildToolHref(directPropertyId, toolKey, forwardQuery));
        return;
      }

      try {
        const propertiesRes = await api.getProperties();
        const properties =
          propertiesRes.success && propertiesRes.data
            ? propertiesRes.data.properties || []
            : [];

        if (!active) return;

        if (properties.length > 0) {
          const fallbackPropertyId = properties[0].id;
          setSelectedPropertyId(fallbackPropertyId);
          router.replace(buildToolHref(fallbackPropertyId, toolKey, forwardQuery));
          return;
        }
      } catch (error) {
        console.error(`[PropertyScopedToolRedirectPage] Failed to resolve property for ${toolKey}:`, error);
      }

      if (active) {
        router.replace(buildPropertiesFallbackHref(navTarget, forwardQuery));
      }
    };

    resolveAndRedirect();

    return () => {
      active = false;
    };
  }, [
    forwardQuery,
    navTarget,
    propertyIdFromQuery,
    router,
    selectedPropertyId,
    setSelectedPropertyId,
    toolKey,
  ]);

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-2">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        <p className="text-sm text-gray-500">Opening tool...</p>
      </div>
    </div>
  );
}
