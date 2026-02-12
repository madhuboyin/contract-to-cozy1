// apps/frontend/src/app/(dashboard)/dashboard/inventory/page.tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { usePropertyContext } from '@/lib/property/PropertyContext';
import { Loader2 } from 'lucide-react';
import { api } from '@/lib/api/client';

/**
 * This page handles the top-level /dashboard/inventory route by 
 * redirecting the user to their specific property's inventory.
 */
export default function InventoryRedirectPage() {
  const router = useRouter();
  const { selectedPropertyId, setSelectedPropertyId } = usePropertyContext();

  useEffect(() => {
    let isActive = true;

    const resolveAndRedirect = async () => {
      if (selectedPropertyId) {
        router.replace(`/dashboard/properties/${selectedPropertyId}/inventory`);
        return;
      }

      try {
        const propertiesRes = await api.getProperties();
        const properties = propertiesRes.success ? propertiesRes.data.properties || [] : [];

        if (!isActive) return;

        if (properties.length > 0) {
          const fallbackPropertyId = properties[0].id;
          setSelectedPropertyId(fallbackPropertyId);
          router.replace(`/dashboard/properties/${fallbackPropertyId}/inventory`);
          return;
        }
      } catch (error) {
        console.error('Failed to resolve property for inventory redirect:', error);
      }

      if (isActive) {
        router.replace('/dashboard');
      }
    };

    resolveAndRedirect();

    return () => {
      isActive = false;
    };
  }, [selectedPropertyId, setSelectedPropertyId, router]);

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-2">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        <p className="text-sm text-gray-500">Loading your inventory...</p>
      </div>
    </div>
  );
}
