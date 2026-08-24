'use client';

import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { api } from '@/lib/api/client';
import { Badge } from '@/components/ui/badge';

const CONSUMER_LABELS: Record<string, string> = {
  'property-context': 'Home record',
  orchestration: 'Home orchestration',
  'home-actions': 'Home actions',
  'resolution-center': 'Resolution Center',
  'compound-radar': 'Event insights',
  'risk-assessment': 'Risk assessment',
  'maintenance-prediction': 'Maintenance forecast',
  personalization: 'Personalized recommendations',
  coverage: 'Coverage analysis',
  'sale-readiness': 'Sale readiness',
  'ownership-cost-refinance': 'Ownership and refinance',
  'home-briefing': 'Home briefing',
  'capability-suggestions': 'Suggested tools',
  'recommendation-snapshots': 'Decision recommendations',
};

export function IntelligenceRefreshStatus({ propertyId }: { propertyId: string }) {
  const query = useQuery({
    queryKey: ['intelligence-refresh-state', propertyId],
    queryFn: () => api.getPropertyIntelligenceRefreshDetails(propertyId),
    enabled: Boolean(propertyId),
    staleTime: 60 * 1000,
    retry: false,
    refetchInterval: (result) => {
      const state = result.state.data?.state;
      return state === 'REFRESHING' || state === 'PARTIALLY_REFRESHED' ? 10 * 1000 : false;
    },
  });
  const data = query.data;
  if (query.isError || !data || data.state === 'CURRENT' || data.state === 'UNKNOWN') return null;

  const copy = {
    REFRESHING: { label: 'Refreshing…', className: 'border-teal-200 bg-teal-50 text-teal-700' },
    PARTIALLY_REFRESHED: { label: 'Partially refreshed', className: 'border-amber-200 bg-amber-50 text-amber-700' },
    DEGRADED: { label: 'Some updates delayed', className: 'border-rose-200 bg-rose-50 text-rose-700' },
  } as const;
  const presentation = copy[data.state];
  const affected = data.capabilities.filter((item) => item.status !== 'CURRENT');

  return (
    <details className="relative z-20">
      <summary className="list-none cursor-pointer" aria-label={`${presentation.label}. Show affected capabilities.`}>
        <Badge variant="outline" className={`rounded-full ${presentation.className}`}>
          {data.state === 'REFRESHING' && <RefreshCw className="mr-1 h-3 w-3 animate-spin" />}
          {presentation.label}
        </Badge>
      </summary>
      {affected.length > 0 && (
        <div className="absolute right-0 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-3 text-left text-xs text-slate-700 shadow-lg">
          <p className="font-semibold text-slate-900">Affected capabilities</p>
          <ul className="mt-2 space-y-1.5">
            {affected.map((item) => (
              <li key={`${item.consumerKey}:${item.targetKey}`}>
                <span className="font-medium">{CONSUMER_LABELS[item.consumerKey] ?? item.consumerKey}</span>
                <span className="text-slate-500"> · {item.status.toLowerCase()}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </details>
  );
}
