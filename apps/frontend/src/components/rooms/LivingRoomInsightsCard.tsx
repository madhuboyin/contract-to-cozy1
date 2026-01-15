// apps/frontend/src/components/rooms/LivingRoomInsightsCard.tsx
'use client';

import React, { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';

interface Props {
  profile: any;
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-black/10 bg-black/[0.02] px-2 py-0.5 text-xs font-medium text-black/70">
      {children}
    </span>
  );
}

function Divider() {
  return <div className="h-px bg-black/10" />;
}

function Row({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="text-sm text-black/70">{label}</div>
      <div className="text-sm font-medium text-black truncate max-w-[55%] text-right">{value}</div>
    </div>
  );
}

function BulletRow({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div className="mt-1.5 h-2 w-2 rounded-full bg-black/40" />
      <div className="text-sm text-black/80 leading-snug">{text}</div>
    </div>
  );
}

export default function LivingRoomInsightsCard({ profile }: Props) {
  const highlights = useMemo(() => {
    const chips: string[] = [];
    if (profile?.primaryUse) chips.push(`Use: ${profile.primaryUse}`);
    if (profile?.windowsCount) chips.push(`${profile.windowsCount} windows`);
    if (profile?.wallColor) chips.push(`Walls: ${profile.wallColor}`);
    if (profile?.tvMount) chips.push(`TV: ${profile.tvMount}`);
    return chips.slice(0, 4);
  }, [profile]);

  const quickNudges = useMemo(() => {
    const nudges: string[] = [];
    nudges.push('Vacuum under sofas & along edges monthly');
    if (profile?.windowsCount) nudges.push('Check window seals before winter');
    nudges.push('Dust vents / fan blades every 2–3 months');
    return nudges.slice(0, 3);
  }, [profile]);

  const hasSnapshot =
    Boolean(profile?.primaryUse) || Boolean(profile?.wallColor) || Boolean(profile?.windowsCount);

  return (
    <Card className="rounded-2xl border border-black/10 bg-white shadow-sm">
      <CardContent className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">Living Room</div>
            <div className="text-xs text-black/50 mt-0.5">Comfort + upkeep snapshot</div>
          </div>
          <div className="text-xs text-black/40">Rule-based</div>
        </div>

        {/* Chips */}
        {highlights.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {highlights.map((c) => (
              <Chip key={c}>{c}</Chip>
            ))}
          </div>
        )}

        {/* Grouped list */}
        <div className="mt-4 rounded-xl border border-black/10 bg-black/[0.02] overflow-hidden">
          {/* Snapshot */}
          <div className="px-4 pt-3 pb-2">
            <div className="text-[11px] font-semibold text-black/50 uppercase tracking-wide">Snapshot</div>
          </div>

          {hasSnapshot ? (
            <>
              <Row label="Primary use" value={profile?.primaryUse} />
              <Divider />
              <Row label="Wall color" value={profile?.wallColor} />
              <Divider />
              <Row
                label="Natural light"
                value={profile?.windowsCount ? `${profile.windowsCount} windows` : null}
              />
            </>
          ) : (
            <div className="px-4 pb-3 text-sm text-black/60">
              Add a couple of answers in the questionnaire to generate a snapshot.
            </div>
          )}

          {/* Quick wins */}
          <Divider />
          <div className="px-4 pt-3 pb-2">
            <div className="text-[11px] font-semibold text-black/50 uppercase tracking-wide">Quick wins</div>
          </div>

          {quickNudges.length === 0 ? (
            <div className="px-4 pb-3 text-sm text-black/60">No quick wins yet.</div>
          ) : (
            quickNudges.map((t, idx) => (
              <React.Fragment key={t}>
                <BulletRow text={t} />
                {idx !== quickNudges.length - 1 && <Divider />}
              </React.Fragment>
            ))
          )}
        </div>

        <div className="mt-4 text-xs text-black/50">
          Add a micro-checklist item to keep this room “alive” over time.
        </div>
      </CardContent>
    </Card>
  );
}
