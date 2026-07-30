'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ArrowRight, Hammer, Lightbulb, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { MobilePageIntro, StatusChip } from '@/components/mobile/dashboard/MobilePrimitives';
import { api } from '@/lib/api/client';
import { track } from '@/lib/analytics/events';
import {
  getRenovationNextAction,
  renovationLifecycleLabel,
  type RenovationWorkspaceCase,
} from '@/features/renovations/renovationWorkspace';

export default function RenovationWorkspacePage() {
  const { id: propertyId } = useParams<{ id: string }>();
  const [cases, setCases] = useState<RenovationWorkspaceCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.listRenovationCases(propertyId);
      if (!response.success || !response.data) {
        throw new Error(response.message || 'Renovations could not be loaded');
      }
      setCases(response.data as RenovationWorkspaceCase[]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Renovations could not be loaded');
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    track('workflow_started', {
      tool: 'home-renovation-risk-advisor',
      propertyId,
      entryPoint: 'renovation_workspace',
    });
  }, [propertyId]);

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 pb-28 sm:p-6">
      <MobilePageIntro
        title="Renovations"
        subtitle="Explore, plan, approve, execute, and close out each renovation in one property record."
        action={
          <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-2.5 text-indigo-700">
            <Hammer className="h-5 w-5" aria-hidden="true" />
          </div>
        }
      />

      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <Link href={`/dashboard/properties/${propertyId}/renovations/explore`}>
            <Lightbulb className="mr-2 h-4 w-4" aria-hidden="true" />
            Explore a renovation
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={`/dashboard/properties/${propertyId}/projects`}>Projects</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={`/dashboard/properties/${propertyId}/materials`}>Materials</Link>
        </Button>
      </div>

      {error ? (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p>{error}</p>
          <Button variant="link" className="mt-1 h-auto p-0 text-red-800" onClick={() => void load()}>
            Try again
          </Button>
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center justify-center py-14" aria-live="polite">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />
          Loading renovation plans…
        </div>
      ) : null}

      {!loading && !error && cases.length === 0 ? (
        <Card>
          <CardContent className="space-y-3 p-6 text-center">
            <h2 className="font-semibold">No renovation plans yet</h2>
            <p className="text-sm text-slate-600">
              Start with an idea. Comparing options does not create a plan until you explicitly select one.
            </p>
            <Button asChild>
              <Link href={`/dashboard/properties/${propertyId}/renovations/explore`}>Explore options</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {!loading && cases.length > 0 ? (
        <section aria-labelledby="renovation-plans-heading" className="space-y-3">
          <h2 id="renovation-plans-heading" className="text-lg font-semibold">Renovation plans</h2>
          <div className="grid gap-4 lg:grid-cols-2">
            {cases.map(renovationCase => {
              const nextAction = getRenovationNextAction(renovationCase, propertyId);
              return (
                <Card key={renovationCase.id}>
                  <CardContent className="space-y-4 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold">{renovationCase.name}</h3>
                        {renovationCase.objective ? (
                          <p className="mt-1 line-clamp-2 text-sm text-slate-600">{renovationCase.objective}</p>
                        ) : null}
                      </div>
                      <StatusChip tone="info">{renovationLifecycleLabel(renovationCase.lifecycle)}</StatusChip>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Next question</p>
                      <p className="mt-1 text-sm font-medium text-slate-900">{nextAction.question}</p>
                    </div>
                    <Button asChild className="w-full sm:w-auto">
                      <Link href={`/dashboard/properties/${propertyId}/renovations/${renovationCase.id}`}>
                        Open plan
                        <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      ) : null}
    </main>
  );
}
