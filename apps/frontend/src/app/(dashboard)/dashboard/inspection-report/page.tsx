// apps/frontend/src/app/(dashboard)/dashboard/inspection-report/page.tsx
'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import InspectionReportAnalyzer from '@/components/InspectionReportAnalyzer';
import { ArrowLeft, FileText, Loader2, Home as HomeIcon } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { api } from '@/lib/api/client';
import { useDashboardPropertySelection } from '@/lib/property/useDashboardPropertySelection';
import { Property } from '@/types';
import { MobileFilterSurface, MobilePageIntro } from '@/components/mobile/dashboard/MobilePrimitives';
import { buildGuidanceOverviewHref } from '@/lib/navigation/guidanceOverviewHref';
import { extractGuidanceContinuityContext, hasGuidanceContinuityContext } from '@/features/guidance/utils/guidanceContinuity';

function InspectionReportContent() {
  const searchParams = useSearchParams();
  const propertyIdFromUrl = searchParams.get('propertyId');
  const guidanceContext = extractGuidanceContinuityContext(searchParams);
  const guidanceStepKey = guidanceContext.guidanceStepKey ?? null;
  const guidanceJourneyId = guidanceContext.guidanceJourneyId ?? null;
  const guidanceSignalIntentFamily = searchParams.get('guidanceSignalIntentFamily');
  const returnTo = searchParams.get('returnTo');

  const [properties, setProperties] = useState<Property[]>([]);
  const { selectedPropertyId, setSelectedPropertyId } = useDashboardPropertySelection(propertyIdFromUrl);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const contextualBackHref =
    returnTo ||
    (selectedPropertyId && hasGuidanceContinuityContext(guidanceContext)
      ? buildGuidanceOverviewHref({
          propertyId: selectedPropertyId,
          journeyId: guidanceJourneyId,
          stepKey: guidanceStepKey,
          inventoryItemId: guidanceContext.itemId ?? null,
          homeAssetId: guidanceContext.homeAssetId ?? null,
        })
      : null);

  const loadData = useCallback(async () => {
    try {
      // Load properties
      const response = await api.getProperties();
      console.log('🔍 Properties Response:', response); // ADD
      if (response.success && response.data) {
        const props = response.data.properties || response.data;
        console.log('🔍 Parsed Properties:', props); // ADD
        setProperties(props);
        if (!selectedPropertyId && props.length > 0) {
          console.log('🔍 Setting propertyId to:', props[0].id); // ADD
          setSelectedPropertyId(props[0].id);
        }
      } else {
        console.error('Failed to load properties:', response.message || 'Unknown error'); // ADD
      }
    } catch (error) {
      console.error('Failed to load data:', error); // ADD
      setError('Failed to load properties');
    } finally {
      setLoading(false);
    }
  }, [selectedPropertyId, setSelectedPropertyId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-4xl p-4 pb-[calc(8rem+env(safe-area-inset-bottom))] sm:p-6 lg:pb-8">
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 pb-[calc(8rem+env(safe-area-inset-bottom))] sm:p-6 lg:pb-8">
      {contextualBackHref ? (
        <Link
          href={contextualBackHref}
          className="inline-flex min-h-[44px] items-center gap-1.5 text-sm text-gray-600 transition-colors hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          {guidanceJourneyId ? 'Back to guidance' : 'Back to previous step'}
        </Link>
      ) : null}

      <MobilePageIntro
        title="Inspection Report Intelligence"
        subtitle="AI-powered analysis of your home inspection report."
        action={
          <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-2.5 text-indigo-700">
            <FileText className="h-5 w-5" />
          </div>
        }
      />

      {/* Property Selector */}
      {properties.length > 0 && (
        <MobileFilterSurface className="border border-slate-200/80 bg-white">
          <Label className="text-sm font-medium text-gray-700 mb-2 block">
            Select Property
          </Label>
          <Select value={selectedPropertyId} onValueChange={setSelectedPropertyId}>
            <SelectTrigger className="w-full max-w-md">
              <SelectValue placeholder="Choose a property" />
            </SelectTrigger>
            <SelectContent>
              {properties.map(property => (
                <SelectItem key={property.id} value={property.id}>
                  <div className="flex items-center gap-2">
                    <HomeIcon className="w-4 h-4" />
                    {property.name || property.address}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </MobileFilterSurface>
      )}

      {/* Inspection Analyzer Component */}
      {selectedPropertyId ? (
        <InspectionReportAnalyzer
          propertyId={selectedPropertyId}
          guidanceJourneyId={guidanceJourneyId}
          guidanceStepKey={guidanceStepKey}
          guidanceSignalIntentFamily={guidanceSignalIntentFamily}
        />
      ) : (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">Select a property to analyze inspection report</p>
        </div>
      )}

      {guidanceJourneyId ? (
        <Alert>
          <AlertDescription>
            Uploading and analyzing an inspection report completes this guidance step automatically.
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

export default function InspectionReportPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>}>
      <InspectionReportContent />
    </Suspense>
  );
}
