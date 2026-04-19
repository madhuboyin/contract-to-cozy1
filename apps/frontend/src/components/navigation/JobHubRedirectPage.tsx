'use client';

import { useEffect, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { api } from '@/lib/api/client';
import { usePropertyContext } from '@/lib/property/PropertyContext';

type JobHubRedirectPageProps = {
  jobKey: string;
};

function buildForwardQuery(serializedSearchParams: string): string {
  const query = new URLSearchParams(serializedSearchParams);
  query.delete('propertyId');
  const next = query.toString();
  return next ? `?${next}` : '';
}

function buildHubHref(propertyId: string, jobKey: string, forwardQuery: string): string {
  return `/dashboard/properties/${encodeURIComponent(propertyId)}/${jobKey}${forwardQuery}`;
}

function buildPropertiesFallbackHref(navTarget: string, forwardQuery: string): string {
  const query = new URLSearchParams(forwardQuery.startsWith('?') ? forwardQuery.slice(1) : forwardQuery);
  if (!query.has('navTarget')) {
    query.set('navTarget', navTarget);
  }
  const suffix = query.toString();
  return suffix ? `/dashboard/properties?${suffix}` : '/dashboard/properties';
}

export default function JobHubRedirectPage({
  jobKey,
}: JobHubRedirectPageProps) {
  const router = useRouter();
  const pathname = usePathname();
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
        const canonicalRoute = buildHubHref(directPropertyId, jobKey, forwardQuery);
        void api
          .trackRouteRedirectEvent(directPropertyId, {
            oldRoute: pathname,
            canonicalRoute,
            redirectType: 'client-resolver',
            navTarget: jobKey,
            metadata: {
              source: 'JobHubRedirectPage',
            },
          })
          .catch(() => undefined);
        router.replace(canonicalRoute);
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
          const canonicalRoute = buildHubHref(fallbackPropertyId, jobKey, forwardQuery);
          void api
            .trackRouteRedirectEvent(fallbackPropertyId, {
              oldRoute: pathname,
              canonicalRoute,
              redirectType: 'client-resolver',
              navTarget: jobKey,
              metadata: {
                source: 'JobHubRedirectPage',
                propertyResolution: 'first-property-fallback',
              },
            })
            .catch(() => undefined);
          router.replace(canonicalRoute);
          return;
        }
      } catch (error) {
        console.error(`[JobHubRedirectPage] Failed to resolve property for ${jobKey}:`, error);
      }

      if (active) {
        router.replace(buildPropertiesFallbackHref(jobKey, forwardQuery));
      }
    };

    resolveAndRedirect();

    return () => {
      active = false;
    };
  }, [
    forwardQuery,
    pathname,
    propertyIdFromQuery,
    router,
    selectedPropertyId,
    setSelectedPropertyId,
    jobKey,
  ]);

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-2">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
        <p className="text-sm text-gray-500">Preparing your command center...</p>
      </div>
    </div>
  );
}
