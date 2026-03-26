'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { ArrowLeft, CheckCircle } from 'lucide-react';

import type { RecallMatchDTO, RecallResolutionType } from '@/types/recalls.types';
import {
  confirmRecallMatch,
  dismissRecallMatch,
  listPropertyRecalls,
  resolveRecallMatch,
} from './recallsApi';

import RecallMatchCard from '@/app/(dashboard)/dashboard/components/recalls/RecallMatchCard';
import { Button } from '@/components/ui/button';
import {
  EmptyStateCard,
  MobileActionRow,
  MobileFilterSurface,
  MobilePageContainer,
  MobilePageIntro,
  ScenarioInputCard,
  StatusChip,
} from '@/components/mobile/dashboard/MobilePrimitives';
import { GuidanceInlinePanel } from '@/components/guidance/GuidanceInlinePanel';
import { recordGuidanceToolCompletion } from '@/lib/api/guidanceApi';

// Step-specific copy for guidance-driven visits
const RECALL_STEP_CONTENT: Record<
  string,
  { title: string; instruction: string; cta: string }
> = {
  safety_alert: {
    title: 'Step 1 — Acknowledge Safety Alert',
    instruction:
      'Review all open recall matches below. Acknowledge each affected item to proceed to the next step.',
    cta: 'Mark alert acknowledged',
  },
  review_remedy_instructions: {
    title: 'Step 3 — Review Remedy Instructions',
    instruction:
      'Read the remedy details for each matched recall. Note whether the remedy requires a technician visit or a self-service fix.',
    cta: 'Mark remedy instructions reviewed',
  },
  recall_resolution: {
    title: 'Step 4 — Confirm Recall Outcome',
    instruction:
      'Confirm the recall outcome for each matched item. Use the "Resolve" action on each card to record the result.',
    cta: 'Mark recall outcome confirmed',
  },
};

export default function RecallAlertsClient() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;

  const searchParams = useSearchParams();
  const highlightId = searchParams.get('matchId');
  const guidanceJourneyId = searchParams.get('guidanceJourneyId') ?? undefined;
  const guidanceStepKey = searchParams.get('guidanceStepKey') ?? undefined;

  const stepContent = guidanceStepKey ? RECALL_STEP_CONTENT[guidanceStepKey] : undefined;

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<RecallMatchDTO[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [guidanceCompleting, setGuidanceCompleting] = useState(false);
  const [guidanceCompleted, setGuidanceCompleted] = useState(false);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await listPropertyRecalls(propertyId);
      if (res) {
        setRows(res.matches || []);
      } else {
        setRows([]);
      }
    } catch (e: any) {
      console.error('Recall Load Error:', e);
      setError(e?.message || 'Failed to load recall alerts');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  const counts = useMemo(() => {
    const c = { open: 0, confirm: 0, resolved: 0, dismissed: 0 };
    for (const row of rows) {
      if (row.status === 'OPEN') c.open++;
      if (row.status === 'NEEDS_CONFIRMATION') c.confirm++;
      if (row.status === 'RESOLVED') c.resolved++;
      if (row.status === 'DISMISSED') c.dismissed++;
    }
    return c;
  }, [rows]);

  async function onConfirm(matchId: string) {
    await confirmRecallMatch(propertyId, matchId);
    await refresh();
  }

  async function onDismiss(matchId: string) {
    await dismissRecallMatch(propertyId, matchId);
    await refresh();
  }

  async function onResolve(matchId: string, payload: { resolutionType: RecallResolutionType; resolutionNotes?: string }) {
    await resolveRecallMatch({ propertyId, matchId, ...payload });
    await refresh();
  }

  async function handleGuidanceComplete() {
    if (!propertyId || !guidanceStepKey) return;
    setGuidanceCompleting(true);
    try {
      await recordGuidanceToolCompletion(propertyId, {
        stepKey: guidanceStepKey,
        journeyId: guidanceJourneyId,
        producedData: { completedAt: new Date().toISOString() },
      });
      setGuidanceCompleted(true);
    } catch (e) {
      console.error('[RecallAlertsClient] failed to record guidance completion', e);
    } finally {
      setGuidanceCompleting(false);
    }
  }

  // Subtitle changes based on which guidance step this page is serving
  const pageSubtitle = stepContent
    ? stepContent.instruction
    : 'Inventory-linked recall matches and guided resolution actions.';

  return (
    <MobilePageContainer className="space-y-4 pb-[calc(8rem+env(safe-area-inset-bottom))] lg:max-w-7xl lg:px-8 lg:pb-10">
      <Button variant="ghost" className="min-h-[44px] w-fit px-0 text-muted-foreground" asChild>
        <Link href={`/dashboard/properties/${propertyId}`}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to property
        </Link>
      </Button>

      <MobilePageIntro
        eyebrow={stepContent ? 'Guidance Step' : 'Safety'}
        title={stepContent?.title ?? 'Recall & Safety Alerts'}
        subtitle={pageSubtitle}
      />

      <GuidanceInlinePanel
        propertyId={propertyId}
        title="Urgent Safety Journey"
        subtitle="Complete the required safety steps in order."
        issueDomains={['SAFETY', 'WEATHER'] as const}
        limit={1}
      />

      {/* Guidance step completion button — shown only when arriving from a guidance journey */}
      {guidanceStepKey && (
        <ScenarioInputCard
          title={stepContent?.title ?? 'Guidance Step'}
          subtitle={
            guidanceCompleted
              ? 'Step recorded. Return to your guidance journey to continue.'
              : (stepContent?.instruction ?? 'Complete the actions below, then mark this step done.')
          }
        >
          {guidanceCompleted ? (
            <div className="flex items-center gap-2 text-sm text-green-700">
              <CheckCircle className="h-4 w-4" />
              Step marked complete.
            </div>
          ) : (
            <Button
              className="min-h-[44px] w-full"
              onClick={handleGuidanceComplete}
              disabled={guidanceCompleting}
            >
              {guidanceCompleting ? 'Saving...' : (stepContent?.cta ?? 'Mark step complete')}
            </Button>
          )}
        </ScenarioInputCard>
      )}

      <MobileFilterSurface>
        <MobileActionRow>
          <StatusChip tone={counts.open > 0 ? 'danger' : 'good'}>Open: {counts.open}</StatusChip>
          <StatusChip tone={counts.confirm > 0 ? 'elevated' : 'info'}>Needs confirmation: {counts.confirm}</StatusChip>
          <StatusChip tone="good">Resolved: {counts.resolved}</StatusChip>
          <StatusChip tone="info">Dismissed: {counts.dismissed}</StatusChip>
        </MobileActionRow>

        <Button variant="outline" className="min-h-[44px]" onClick={refresh} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </Button>
      </MobileFilterSurface>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      ) : null}

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">Loading...</div>
      ) : rows.length === 0 ? (
        <EmptyStateCard
          title="No recall alerts"
          description="No open recall matches were found for this property inventory."
        />
      ) : (
        <div className="space-y-3">
          {rows.map((match) => (
            <RecallMatchCard
              key={match.id}
              match={match}
              highlighted={highlightId === match.id}
              onConfirm={onConfirm}
              onDismiss={onDismiss}
              onResolve={onResolve}
            />
          ))}
        </div>
      )}
    </MobilePageContainer>
  );
}
