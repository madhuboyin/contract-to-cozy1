// apps/frontend/src/app/(dashboard)/dashboard/inventory/page.tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { usePropertyContext } from '@/lib/property/PropertyContext';
import { Loader2 } from 'lucide-react';

/**
 * This page handles the top-level /dashboard/inventory route by 
 * redirecting the user to their specific property's inventory.
 */
export default function InventoryRedirectPage() {
  const router = useRouter();
  const { selectedPropertyId } = usePropertyContext();

  useEffect(() => {
    if (selectedPropertyId) {
      router.replace(`/dashboard/properties/${selectedPropertyId}/inventory`);
    } else {
      // Fallback to main dashboard if no property is selected/found
      router.replace('/dashboard');
    }
  }, [selectedPropertyId, router]);

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-2">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        <p className="text-sm text-gray-500">Loading your inventory...</p>
      </div>
    </div>
  );
}