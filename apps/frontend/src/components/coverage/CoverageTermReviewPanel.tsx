'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import { Button } from '@/components/ui/button';

type TermState = { kind: 'POLICY' | 'WARRANTY'; count: number; fingerprint: string; labels: string[]; latestReviewedAt: string | null };

const NOUN = { POLICY: 'insurance polic', WARRANTY: 'warrant' } as const;

/**
 * "Mark as reviewed" for the current policy or warranty terms: the same shared operation Ask uses. The review is recorded against the exact terms shown (their fingerprint); if
 * the terms changed since they were loaded the server refuses it and the page reloads them.
 */
function KindReview({ propertyId, kind, guidanceJourneyId, guidanceStepKey }: { propertyId: string; kind: 'POLICY' | 'WARRANTY'; guidanceJourneyId?: string | null; guidanceStepKey?: string | null }) {
  const [state, setState] = useState<TermState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/api/properties/${propertyId}/coverage-term-reviews?kind=${kind}`);
      setState((res.data as TermState) ?? null);
    } catch {
      setState(null);
    }
  }, [propertyId, kind]);
  useEffect(() => { void load(); }, [load]);

  if (!state || state.count === 0) return null;
  const plural = state.count === 1 ? 'y' : 'ies';
  const noun = `${NOUN[kind]}${plural}`;

  async function review() {
    if (!state) return;
    setSaving(true);
    setError(null);
    try {
      await api.post(`/api/properties/${propertyId}/coverage-term-reviews`, {
        kind,
        expectedFingerprint: state.fingerprint,
        ...(guidanceJourneyId && guidanceStepKey ? { guidanceJourneyId, guidanceStepKey } : {}),
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not record the review');
    } finally {
      setSaving(false);
      await load();
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 text-sm">
      <p className="font-medium">Your current {noun}</p>
      <ul className="mt-1 list-disc pl-5 text-muted-foreground">
        {state.labels.map((label) => <li key={label}>{label}</li>)}
      </ul>
      {state.latestReviewedAt ? (
        <p className="mt-2 text-xs text-muted-foreground">You reviewed these terms on {new Date(state.latestReviewedAt).toLocaleDateString()}. If they change, they will need a new review.</p>
      ) : (
        <Button className="mt-3 min-h-[44px]" variant="outline" disabled={saving} onClick={review}>
          {saving ? 'Saving…' : 'Mark as reviewed'}
        </Button>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export default function CoverageTermReviewPanel({ propertyId, guidanceJourneyId, guidanceStepKey }: { propertyId: string; guidanceJourneyId?: string | null; guidanceStepKey?: string | null }) {
  return (
    <div className="space-y-3">
      <KindReview propertyId={propertyId} kind="POLICY" guidanceJourneyId={guidanceJourneyId} guidanceStepKey={guidanceStepKey} />
      <KindReview propertyId={propertyId} kind="WARRANTY" guidanceJourneyId={guidanceJourneyId} guidanceStepKey={guidanceStepKey} />
    </div>
  );
}
