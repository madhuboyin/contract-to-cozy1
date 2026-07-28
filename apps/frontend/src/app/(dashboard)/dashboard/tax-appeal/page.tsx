'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';

import { api } from '@/lib/api/client';
import { useDashboardPropertySelection } from '@/lib/property/useDashboardPropertySelection';
import { EmptyStateCard } from '@/components/mobile/dashboard/MobilePrimitives';

function TaxAppealRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const propertyIdFromUrl = searchParams.get('propertyId');
  const { selectedPropertyId, setSelectedPropertyId } = useDashboardPropertySelection(propertyIdFromUrl);
  const [loading, setLoading] = useState(true);
  const [hasProperties, setHasProperties] = useState(true);

  const loadProperties = useCallback(async () => {
    try {
      const response = await api.getProperties();
      const properties = response.success && response.data
        ? response.data.properties || response.data
        : [];
      setHasProperties(properties.length > 0);
      if (!selectedPropertyId && properties.length > 0) {
        setSelectedPropertyId(properties[0].id);
      }
    } catch {
      setHasProperties(false);
    } finally {
      setLoading(false);
    }
  }, [selectedPropertyId, setSelectedPropertyId]);

  useEffect(() => {
    void loadProperties();
  }, [loadProperties]);

  useEffect(() => {
    if (!selectedPropertyId) return;
    const next = new URLSearchParams(searchParams.toString());
    next.delete('propertyId');
    next.set('mode', 'appeal');
    router.replace(
      `/dashboard/properties/${encodeURIComponent(selectedPropertyId)}/tools/property-tax?${next.toString()}`,
    );
  }, [router, searchParams, selectedPropertyId]);

  if (loading || selectedPropertyId) {
    return (
      <div className="flex min-h-48 items-center justify-center" aria-live="polite">
        <Loader2 className="h-8 w-8 animate-spin text-slate-600" aria-hidden="true" />
        <span className="sr-only">Opening the Property Tax Center</span>
      </div>
    );
  }

  if (!hasProperties) {
    return (
      <div className="mx-auto max-w-xl p-6">
        <EmptyStateCard
          title="Add a property first"
          description="Tax review is property-specific. Add a property to open the Property Tax Center."
        />
      </div>
    );
  }

  return null;
}

export default function TaxAppealPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-600">Opening the Property Tax Center…</div>}>
      <TaxAppealRedirect />
    </Suspense>
  );
}
