'use client';

// Inline recall check for recall-related guidance steps.
// Fetches open recall matches for the item (or property), allows
// confirm / dismiss / resolve actions on each card, then completes
// the step without navigating to the full recalls page.
//
// Covers stepKeys: safety_alert, check_recall_coverage,
//                  review_remedy_instructions, recall_resolution
// Rendered by renderStepCta when step.toolKey === 'recalls'.

import React from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  confirmRecallMatch,
  dismissRecallMatch,
  listInventoryItemRecalls,
  listPropertyRecalls,
  resolveRecallMatch,
} from '@/app/(dashboard)/dashboard/properties/[id]/recalls/recallsApi';
import RecallMatchCard from '@/app/(dashboard)/dashboard/components/recalls/RecallMatchCard';
import { completeGuidanceStep } from '@/lib/api/guidanceApi';
import type { RecallMatchDTO, RecallResolutionType } from '@/types/recalls.types';

// ---------------------------------------------------------------------------
// Step-specific copy (mirrors RecallAlertsClient, extended for inline)
// ---------------------------------------------------------------------------

const STEP_COPY: Record<string, { instruction: string; cta: string }> = {
  safety_alert: {
    instruction:
      'Review all open recall matches below. Acknowledge each affected item before proceeding.',
    cta: 'Mark safety alert acknowledged',
  },
  check_recall_coverage: {
    instruction:
      'Check whether any open recalls affect this item and whether existing coverage applies.',
    cta: 'Mark recall coverage checked',
  },
  review_remedy_instructions: {
    instruction:
      'Read the remedy details for each matched recall. Note whether the fix requires a technician or is a self-service action.',
    cta: 'Mark remedy instructions reviewed',
  },
  recall_resolution: {
    instruction:
      'Confirm the recall outcome for each matched item using the "Mark resolved" action on each card.',
    cta: 'Mark recall outcome confirmed',
  },
};

const DEFAULT_COPY = {
  instruction: 'Review open recall matches for this item before proceeding.',
  cta: 'Mark recall check complete',
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RecallCheckInlineProps = {
  propertyId: string;
  journeyId: string;
  stepId: string;
  stepKey: string;
  inventoryItemId: string | null;
  assetName?: string;
  onComplete: () => void;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RecallCheckInline({
  propertyId,
  journeyId,
  stepId,
  stepKey,
  inventoryItemId,
  assetName = 'this item',
  onComplete,
}: RecallCheckInlineProps) {
  const queryClient = useQueryClient();
  const [completing, setCompleting] = React.useState(false);
  const [completeDone, setCompleteDone] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);

  const copy = STEP_COPY[stepKey] ?? DEFAULT_COPY;
  const isItemScoped = Boolean(inventoryItemId);

  // ---- Fetch recalls ----
  const recallsQuery = useQuery({
    queryKey: isItemScoped
      ? ['recalls', 'item', propertyId, inventoryItemId]
      : ['recalls', 'property', propertyId],
    queryFn: () =>
      isItemScoped
        ? listInventoryItemRecalls(propertyId, inventoryItemId!)
        : listPropertyRecalls(propertyId),
    staleTime: 2 * 60_000,
  });

  const allMatches: RecallMatchDTO[] = React.useMemo(() => {
    if (!recallsQuery.data) return [];
    // Both response shapes expose `matches`
    return (recallsQuery.data as { matches?: RecallMatchDTO[] }).matches ?? [];
  }, [recallsQuery.data]);

  // Only surface actionable recalls — resolved/dismissed are noise here
  const activeMatches = allMatches.filter(
    (m) => m.status === 'OPEN' || m.status === 'NEEDS_CONFIRMATION'
  );

  function invalidateRecalls() {
    queryClient.invalidateQueries({
      queryKey: isItemScoped
        ? ['recalls', 'item', propertyId, inventoryItemId]
        : ['recalls', 'property', propertyId],
    });
  }

  // ---- Recall actions ----
  async function handleConfirm(matchId: string) {
    setActionError(null);
    try {
      await confirmRecallMatch(propertyId, matchId);
      invalidateRecalls();
    } catch {
      setActionError('Failed to confirm match. Please try again.');
    }
  }

  async function handleDismiss(matchId: string) {
    setActionError(null);
    try {
      await dismissRecallMatch(propertyId, matchId);
      invalidateRecalls();
    } catch {
      setActionError('Failed to dismiss match. Please try again.');
    }
  }

  async function handleResolve(
    matchId: string,
    payload: { resolutionType: RecallResolutionType; resolutionNotes?: string }
  ) {
    setActionError(null);
    try {
      await resolveRecallMatch({ propertyId, matchId, ...payload });
      invalidateRecalls();
    } catch {
      setActionError('Failed to resolve match. Please try again.');
    }
  }

  // ---- Complete step ----
  async function handleComplete() {
    setCompleting(true);
    try {
      await completeGuidanceStep(propertyId, stepId, {
        openRecallCount: activeMatches.length,
        totalRecallCount: allMatches.length,
        sourceToolKey: 'recalls',
      });
      queryClient.invalidateQueries({ queryKey: ['guidance', 'property', propertyId] });
      queryClient.invalidateQueries({ queryKey: ['guidance', 'journey', propertyId] });
      setCompleteDone(true);
      onComplete();
    } catch (err) {
      console.error('[RecallCheckInline] complete failed', err);
    } finally {
      setCompleting(false);
    }
  }

  const fullRecallsHref = `/dashboard/properties/${propertyId}/recalls?guidanceJourneyId=${journeyId}&guidanceStepKey=${stepKey}${inventoryItemId ? `&itemId=${inventoryItemId}` : ''}`;

  // ---- Done ----
  if (completeDone) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
        <CheckCircle className="h-4 w-4 shrink-0" />
        Recall check recorded. Moving to next step.
      </div>
    );
  }

  // ---- Loading ----
  if (recallsQuery.isLoading) {
    return (
      <div className="rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-white p-3 text-sm text-[hsl(var(--mobile-text-secondary))]">
        Checking for open recalls…
      </div>
    );
  }

  // ---- Error loading recalls ----
  if (recallsQuery.isError) {
    return (
      <div className="space-y-3">
        <p className="text-xs text-rose-700">Failed to load recalls. You can still complete this step or open the full recalls page.</p>
        <div className="flex flex-col gap-2">
          <Button className="min-h-[44px] w-full" disabled={completing} onClick={handleComplete}>
            {completing ? 'Saving…' : copy.cta}
          </Button>
          <Link
            href={fullRecallsHref}
            className="inline-flex min-h-[40px] w-full items-center justify-center rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 text-sm font-medium text-[hsl(var(--mobile-text-primary))] hover:bg-[hsl(var(--mobile-bg-muted))]"
          >
            Open full recalls page
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Instruction banner */}
      <div className="rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] px-3 py-2.5">
        <p className="text-xs text-[hsl(var(--mobile-text-secondary))]">{copy.instruction}</p>
      </div>

      {/* No open recalls */}
      {activeMatches.length === 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5">
          <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />
          <p className="text-sm text-emerald-800">
            No open recalls found for {isItemScoped ? assetName : 'this property'}.
          </p>
        </div>
      )}

      {/* Active recall cards */}
      {activeMatches.length > 0 && (
        <div className="space-y-2">
          {activeMatches.map((match) => (
            <RecallMatchCard
              key={match.id}
              match={match}
              onConfirm={handleConfirm}
              onDismiss={handleDismiss}
              onResolve={handleResolve}
            />
          ))}
        </div>
      )}

      {actionError && (
        <p className="text-xs text-rose-700">{actionError}</p>
      )}

      {/* Always-present completion actions */}
      <div className="flex flex-col gap-2">
        <Button className="min-h-[44px] w-full" disabled={completing} onClick={handleComplete}>
          {completing ? 'Saving…' : copy.cta}
        </Button>
        <Link
          href={fullRecallsHref}
          className="inline-flex min-h-[40px] w-full items-center justify-center rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 text-sm font-medium text-[hsl(var(--mobile-text-primary))] hover:bg-[hsl(var(--mobile-bg-muted))]"
        >
          Open full recalls page
        </Link>
      </div>
    </div>
  );
}
