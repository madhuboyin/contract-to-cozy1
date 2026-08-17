'use client';

import React from 'react';
import Link from 'next/link';
import { HeartHandshake, Share2, UserPlus, X } from 'lucide-react';
import type { BuyerRecentOwnerTransition } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { track } from '@/lib/analytics/events';

const PROMPT_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1_000;
const DISMISSAL_MS = 90 * 24 * 60 * 60 * 1_000;
const MAX_IMPRESSIONS = 3;

type AdvocacyFrequencyRecord = {
  impressions: number;
  lastShownAt: number;
  dismissedUntil: number;
  referralUrl?: string;
};

function storageKey(propertyId: string): string {
  return `buyer-advocacy:${propertyId}:v1`;
}

function readFrequencyRecord(propertyId: string): AdvocacyFrequencyRecord {
  const fallback = { impressions: 0, lastShownAt: 0, dismissedUntil: 0 };
  try {
    const raw = window.localStorage.getItem(storageKey(propertyId));
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<AdvocacyFrequencyRecord>;
    return {
      impressions: Number.isFinite(parsed.impressions) ? Number(parsed.impressions) : 0,
      lastShownAt: Number.isFinite(parsed.lastShownAt) ? Number(parsed.lastShownAt) : 0,
      dismissedUntil: Number.isFinite(parsed.dismissedUntil) ? Number(parsed.dismissedUntil) : 0,
      referralUrl: typeof parsed.referralUrl === 'string' ? parsed.referralUrl : undefined,
    };
  } catch {
    return fallback;
  }
}

function writeFrequencyRecord(propertyId: string, record: AdvocacyFrequencyRecord): void {
  try {
    window.localStorage.setItem(storageKey(propertyId), JSON.stringify(record));
  } catch {
    // Storage can be unavailable in private or constrained browser contexts.
  }
}

export function RecentOwnerAdvocacyPrompt({
  transition,
  suppressedByUrgentWork,
}: {
  transition: BuyerRecentOwnerTransition;
  suppressedByUrgentWork: boolean;
}) {
  const { toast } = useToast();
  const [visible, setVisible] = React.useState(false);
  const { advocacy, property, routes } = transition;

  React.useEffect(() => {
    if (!advocacy.eligible || !advocacy.successMoment || suppressedByUrgentWork) return;
    const now = Date.now();
    const record = readFrequencyRecord(property.id);
    if (
      record.dismissedUntil > now
      || record.impressions >= MAX_IMPRESSIONS
      || record.lastShownAt + PROMPT_COOLDOWN_MS > now
    ) return;

    setVisible(true);
    writeFrequencyRecord(property.id, {
      ...record,
      impressions: record.impressions + 1,
      lastShownAt: now,
    });
    track('buyer_advocacy_prompt_viewed', {
      propertyId: property.id,
      successMoment: advocacy.successMoment,
      inviteAvailable: advocacy.inviteAvailable,
    });
  }, [advocacy.eligible, advocacy.inviteAvailable, advocacy.successMoment, property.id, suppressedByUrgentWork]);

  if (!visible || !advocacy.successMoment) return null;
  const successMoment = advocacy.successMoment;

  const dismiss = () => {
    const record = readFrequencyRecord(property.id);
    writeFrequencyRecord(property.id, { ...record, dismissedUntil: Date.now() + DISMISSAL_MS });
    setVisible(false);
    track('buyer_advocacy_prompt_dismissed', {
      propertyId: property.id,
      successMoment,
    });
  };

  const recommend = async () => {
    const referralUrl = `${window.location.origin}/?utm_source=buyer_advocacy&utm_medium=share&utm_campaign=recent_owner`;
    try {
      let method: 'NATIVE_SHARE' | 'COPY_LINK' = 'COPY_LINK';
      if (navigator.share) {
        await navigator.share({
          title: 'ContractToCozy',
          text: 'ContractToCozy helped me carry closing details into an organized plan for owning my home.',
          url: referralUrl,
        });
        method = 'NATIVE_SHARE';
      } else {
        await navigator.clipboard.writeText(referralUrl);
        toast({ title: 'Recommendation link copied', description: 'You can send it whenever the timing feels right.' });
      }
      const record = readFrequencyRecord(property.id);
      writeFrequencyRecord(property.id, { ...record, referralUrl });
      track('buyer_advocacy_prompt_actioned', {
        propertyId: property.id,
        successMoment,
        action: 'RECOMMEND_BUYER',
        method,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      toast({ title: 'Unable to share right now', description: 'Please try again.', variant: 'destructive' });
    }
  };

  const title = successMoment === 'FIRST_90_DAY_PROGRESS'
    ? 'You’ve built real momentum in your new home.'
    : 'Your closing records are safely carried into homeownership.';

  return (
    <Card className="rounded-[24px] border-indigo-200 bg-gradient-to-br from-white via-indigo-50/60 to-teal-50/60 shadow-sm">
      <CardContent className="relative flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Dismiss advocacy prompt"
          className="absolute right-2 top-2 h-9 w-9 rounded-full text-slate-500"
          onClick={dismiss}
        >
          <X className="h-4 w-4" />
        </Button>
        <div className="flex max-w-2xl items-start gap-3 pr-8">
          <div className="rounded-2xl bg-indigo-100 p-3 text-indigo-700"><HeartHandshake className="h-5 w-5" /></div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-700">A good moment to share</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-950">{title}</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              If someone helped you buy this home, invite them into the shared record—or recommend the same organized handoff to another buyer.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
          {advocacy.inviteAvailable && (
            <Button asChild variant="outline" className="rounded-full bg-white">
              <Link
                href={routes.household}
                onClick={() => track('buyer_advocacy_prompt_actioned', {
                  propertyId: property.id,
                  successMoment,
                  action: 'INVITE_CO_BUYER',
                  method: 'PROPERTY_HOUSEHOLD',
                })}
              >
                <UserPlus className="mr-2 h-4 w-4" />Invite co-buyer
              </Link>
            </Button>
          )}
          <Button type="button" className="rounded-full bg-indigo-700 hover:bg-indigo-800" onClick={() => void recommend()}>
            <Share2 className="mr-2 h-4 w-4" />Recommend to a buyer
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
