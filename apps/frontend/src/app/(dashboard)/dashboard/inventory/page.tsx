// apps/frontend/src/app/(dashboard)/dashboard/inventory/page.tsx
'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter } from 'next/navigation';
import { usePropertyContext } from '@/lib/property/PropertyContext';
import { Loader2 } from 'lucide-react';
import { api } from '@/lib/api/client';

function buildForwardQuery(serializedParams: string): string {
  const query = new URLSearchParams(serializedParams);
  query.delete('propertyId');
  const next = query.toString();
  return next ? `?${next}` : '';
}

/**
 * This page handles the top-level /dashboard/inventory route by 
 * redirecting the user to their specific property's inventory.
 */
export default function InventoryRedirectPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { selectedPropertyId, setSelectedPropertyId } = usePropertyContext();
  const serializedSearchParams = searchParams.toString();
  const propertyIdFromQuery = searchParams.get('propertyId') || undefined;

  useEffect(() => {
    let isActive = true;
    const forwardQuery = buildForwardQuery(serializedSearchParams);

    const resolveAndRedirect = async () => {
      const directPropertyId = propertyIdFromQuery || selectedPropertyId;

      if (directPropertyId) {
        if (propertyIdFromQuery && propertyIdFromQuery !== selectedPropertyId) {
          setSelectedPropertyId(propertyIdFromQuery);
        }
        router.replace(`/dashboard/properties/${directPropertyId}/inventory${forwardQuery}`);
        return;
      }

      try {
        const propertiesRes = await api.getProperties();
        const properties = propertiesRes.success ? propertiesRes.data.properties || [] : [];

        if (!isActive) return;

        if (properties.length > 0) {
          const fallbackPropertyId = properties[0].id;
          setSelectedPropertyId(fallbackPropertyId);
          router.replace(`/dashboard/properties/${fallbackPropertyId}/inventory${forwardQuery}`);
          return;
        }
      } catch (error) {
        console.error('Failed to resolve property for inventory redirect:', error);
      }

      if (isActive) {
        router.replace('/dashboard/properties?navTarget=inventory');
      }
    };

    resolveAndRedirect();

    return () => {
      isActive = false;
    };
  }, [propertyIdFromQuery, router, selectedPropertyId, serializedSearchParams, setSelectedPropertyId]);

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-2">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        <p className="text-sm text-gray-500">Loading your inventory...</p>
      </div>
    </div>
  );
}
