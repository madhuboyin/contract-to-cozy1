'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Printer } from 'lucide-react';
import { api } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import RouteStateCard from '@/components/system/RouteStateCard';
import { BuyerInspectionGuide } from '../../BuyerInspectionGuide';

export default function BuyerInspectionChecklistPrintPage() {
  const params = useParams();
  const propertyId = (Array.isArray(params.id) ? params.id[0] : params.id) as string;

  const overviewQuery = useQuery({
    queryKey: ['buyer-plan-overview', propertyId],
    queryFn: async () => {
      const response = await api.getBuyerPlanOverview(propertyId);
      if (!response.success) throw new Error(response.message || 'Unable to load this property.');
      return response.data;
    },
    enabled: Boolean(propertyId),
  });
  const inspectionQuery = useQuery({
    queryKey: ['buyer-inspection-plan', propertyId],
    queryFn: async () => {
      const response = await api.getBuyerInspectionPlan(propertyId);
      if (!response.success) throw new Error(response.message || 'Unable to load the inspection checklist.');
      return response.data;
    },
    enabled: Boolean(propertyId),
  });

  if (overviewQuery.isLoading || inspectionQuery.isLoading) {
    return <main className="mx-auto max-w-4xl p-8"><RouteStateCard state="loading" title="Preparing your inspection checklist" description="We’re combining whole-home essentials with the details you shared about this property." /></main>;
  }
  if (!overviewQuery.data || !inspectionQuery.data || overviewQuery.isError || inspectionQuery.isError) {
    return <main className="mx-auto max-w-4xl p-8"><RouteStateCard state="error" title="The checklist couldn’t load" description="Return to your closing guide and try again." /></main>;
  }

  const property = overviewQuery.data.property;
  const plan = inspectionQuery.data.plan;
  const modules = inspectionQuery.data.recommendations.modules;

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 print:bg-white print:p-0 sm:px-8">
      <style>{`
        @page { size: portrait; margin: 14mm; }
        @media print {
          .inspection-print-controls { display: none !important; }
          .buyer-inspection-print-section { break-inside: avoid; }
          .buyer-inspection-print { font-size: 11pt; }
        }
      `}</style>
      <div className="inspection-print-controls mx-auto mb-5 flex max-w-4xl flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <Button asChild variant="ghost"><Link href={`/dashboard/properties/${propertyId}/buyer-plan`}><ArrowLeft className="mr-2 h-4 w-4" />Back to closing guide</Link></Button>
        <div className="flex items-center gap-2">
          <p className="hidden text-sm text-slate-500 sm:block">Print this checklist or save it as a PDF.</p>
          <Button type="button" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" />Print or save PDF</Button>
        </div>
      </div>
      <article className="mx-auto max-w-4xl bg-white p-6 shadow-sm print:max-w-none print:p-0 print:shadow-none sm:p-9">
        <BuyerInspectionGuide
          address={`${property.address}, ${property.city}, ${property.state} ${property.zipCode}`}
          scheduledAt={plan?.scheduledAt}
          decisionDeadline={plan?.contingencyDueAt}
          modules={modules.filter((module) => module.status === 'APPLICABLE')}
          unresolvedModules={modules.filter((module) => module.status === 'UNKNOWN')}
          presentation="print"
        />
      </article>
    </main>
  );
}
