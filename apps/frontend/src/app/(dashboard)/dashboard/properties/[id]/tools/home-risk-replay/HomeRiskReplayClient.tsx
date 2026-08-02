'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarRange,
  CheckCircle2,
  ExternalLink,
  FileCheck2,
  MapPin,
  ShieldAlert,
} from 'lucide-react';
import {
  EmptyStateCard,
  MobileCard,
  MobileFilterSurface,
  MobileSection,
  MobileSectionHeader,
  StatusChip,
} from '@/components/mobile/dashboard/MobilePrimitives';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  MissingFactPrompt,
  PropertyIntelligenceJourneyLinks,
  SourceCoverageSummary,
  TruthStateBadge,
  WhyThisMatters,
} from '@/components/property-intelligence/PropertyIntelligencePrimitives';
import {
  getPastHazardExposure,
  linkPastHazardEvidence,
  type PastHazardExposureItem,
  type PropertyHazardEffectStatus,
  type PropertyHazardEvidenceKind,
  recordPastHazardOutcome,
} from './homeRiskReplayApi';
import HomeToolsRail from '../../components/HomeToolsRail';
import ToolWorkspaceTemplate from '../../components/route-templates/ToolWorkspaceTemplate';

const EVIDENCE_KINDS: PropertyHazardEvidenceKind[] = [
  'CLAIM',
  'INSPECTION',
  'REPAIR',
  'PHOTO',
  'DOCUMENT',
  'USER_ATTESTATION',
];

function humanize(value: string) {
  return value.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value: string | null) {
  if (!value) return 'Date not provided';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

function HazardCard({
  item,
  propertyId,
}: {
  item: PastHazardExposureItem;
  propertyId: string;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = React.useState(false);
  const [status, setStatus] = React.useState<PropertyHazardEffectStatus>(item.propertyEffect.status);
  const [note, setNote] = React.useState(item.propertyEffect.note ?? '');
  const [effectObservedAt, setEffectObservedAt] = React.useState(
    item.propertyEffect.effectObservedAt?.slice(0, 10) ?? '',
  );
  const [evidenceKind, setEvidenceKind] = React.useState<PropertyHazardEvidenceKind>('DOCUMENT');
  const [evidenceId, setEvidenceId] = React.useState('');
  const [evidenceNote, setEvidenceNote] = React.useState('');

  const outcomeMutation = useMutation({
    mutationFn: () => recordPastHazardOutcome(propertyId, item.propertyMatchId, {
      status,
      effectObservedAt: effectObservedAt
        ? new Date(`${effectObservedAt}T12:00:00Z`).toISOString()
        : null,
      note,
    }),
    onSuccess: async () => {
      setEditing(false);
      await queryClient.invalidateQueries({ queryKey: ['past-hazard-exposure', propertyId] });
    },
  });

  const evidenceMutation = useMutation({
    mutationFn: () => {
      if (!item.propertyEffect.outcomeId) throw new Error('Record an outcome first.');
      const common = { kind: evidenceKind, note: evidenceNote || null };
      if (evidenceKind === 'CLAIM') {
        return linkPastHazardEvidence(propertyId, item.propertyEffect.outcomeId, {
          ...common,
          claimId: evidenceId,
        });
      }
      if (evidenceKind === 'INSPECTION' || evidenceKind === 'REPAIR') {
        return linkPastHazardEvidence(propertyId, item.propertyEffect.outcomeId, {
          ...common,
          homeEventId: evidenceId,
        });
      }
      if (evidenceKind === 'PHOTO' || evidenceKind === 'DOCUMENT') {
        return linkPastHazardEvidence(propertyId, item.propertyEffect.outcomeId, {
          ...common,
          documentId: evidenceId,
        });
      }
      return linkPastHazardEvidence(propertyId, item.propertyEffect.outcomeId, {
        ...common,
        entityType: 'PropertyHazardOutcome',
        entityId: item.propertyEffect.outcomeId,
      });
    },
    onSuccess: async () => {
      setEvidenceId('');
      setEvidenceNote('');
      await queryClient.invalidateQueries({ queryKey: ['past-hazard-exposure', propertyId] });
    },
  });

  return (
    <MobileCard className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-base font-semibold text-slate-950">{item.title}</p>
          <p className="mt-1 text-sm text-slate-600">
            {item.hazardLabel} · {formatDate(item.observedAt ?? item.effectiveFrom)}
          </p>
        </div>
        <TruthStateBadge state={item.propertyEffect.status} />
      </div>

      {item.factualSummary ? <p className="text-sm text-slate-700">{item.factualSummary}</p> : null}

      {item.interpretation.safetyTier === 'SAFETY_EMERGENCY' && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm leading-6 text-rose-950">
          <p className="font-semibold">Possible structural or safety consequence</p>
          <p>Do not rely on this history view to assess current safety. If danger may be active, leave the area, contact emergency services when appropriate, and use a qualified professional before re-entry or repair.</p>
        </div>
      )}

      <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm md:grid-cols-2">
        <div>
          <p className="font-medium text-slate-900">Source observation and match</p>
          <p className="mt-1 text-slate-600">
            <MapPin className="mr-1 inline h-3.5 w-3.5" />
            {item.geography.matchedGeography} · {humanize(item.geography.precision)}
          </p>
          {item.geography.distanceMiles != null ? (
            <p className="mt-1 text-slate-600">
              {item.geography.distanceMiles.toFixed(1)} miles from the sourced point
            </p>
          ) : null}
        </div>
        <div>
          <p className="font-medium text-slate-900">{item.source.provider}</p>
          <p className="mt-1 text-slate-600">
            Checked {formatDate(item.source.lastVerifiedAt)} · revision {item.source.revision}
          </p>
          {item.source.url ? (
            <a
              href={item.source.url}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex items-center text-primary underline"
            >
              Open source <ExternalLink className="ml-1 h-3.5 w-3.5" />
            </a>
          ) : null}
        </div>
      </div>

      <WhyThisMatters boundary={item.interpretation.boundedExplanation}>
        {item.propertyEffect.explanation}
      </WhyThisMatters>

      <MissingFactPrompt
        propertyId={propertyId}
        facts={item.interpretation.missingFacts}
        benefit="Adding these facts can improve relevance, but it will never turn a nearby event into evidence of property damage."
      />

      {item.propertyEffect.note ? (
        <div className="rounded-xl border border-slate-200 p-3 text-sm">
          <p className="font-medium text-slate-900">Household record</p>
          <p className="mt-1 text-slate-700">{item.propertyEffect.note}</p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => setEditing((value) => !value)}>
          {editing ? 'Cancel' : 'Confirm or update outcome'}
        </Button>
        {item.propertyEffect.canonicalActionId ? (
          <Button asChild variant="outline">
            <Link href="/dashboard/actions">
              Open Home Action
            </Link>
          </Button>
        ) : null}
      </div>

      {editing ? (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <div>
            <Label htmlFor={`status-${item.propertyMatchId}`}>What is known about this home?</Label>
            <select
              id={`status-${item.propertyMatchId}`}
              value={status}
              onChange={(event) => setStatus(event.target.value as PropertyHazardEffectStatus)}
              className="mt-1 min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
            >
              <option value="UNKNOWN">Effect is unknown</option>
              <option value="NO_OBSERVED_EFFECT">No observed effect was found or reported</option>
              <option value="OBSERVED_EFFECT_CONFIRMED">An effect was observed</option>
            </select>
          </div>
          <div>
            <Label htmlFor={`effect-date-${item.propertyMatchId}`}>Observed date, if known</Label>
            <Input
              id={`effect-date-${item.propertyMatchId}`}
              type="date"
              value={effectObservedAt}
              onChange={(event) => setEffectObservedAt(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor={`note-${item.propertyMatchId}`}>
              What was checked or observed? Do not infer the cause.
            </Label>
            <textarea
              id={`note-${item.propertyMatchId}`}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className="mt-1 min-h-24 w-full rounded-md border border-slate-300 p-3 text-sm"
              maxLength={1200}
            />
          </div>
          {outcomeMutation.isError ? (
            <p className="text-sm text-red-700">
              {outcomeMutation.error instanceof Error
                ? outcomeMutation.error.message
                : 'Unable to save this outcome.'}
            </p>
          ) : null}
          <Button
            type="button"
            disabled={note.trim().length < 3 || outcomeMutation.isPending}
            onClick={() => outcomeMutation.mutate()}
          >
            {outcomeMutation.isPending ? 'Saving…' : 'Save household outcome'}
          </Button>
        </div>
      ) : null}

      {item.propertyEffect.outcomeId ? (
        <div className="space-y-3 border-t pt-4">
          <div>
            <p className="font-medium text-slate-900">Linked evidence</p>
            <p className="text-sm text-slate-600">
              Link a claim, inspection, repair, photo, or document. Evidence describes what is
              documented; it does not make the external event the proven cause.
            </p>
          </div>
          {item.propertyEffect.evidence.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {item.propertyEffect.evidence.map((evidence) => (
                <StatusChip key={evidence.id} tone="good">
                  <FileCheck2 className="mr-1 h-3.5 w-3.5" />
                  {humanize(evidence.kind)}
                </StatusChip>
              ))}
            </div>
          ) : null}
          <div className="grid gap-2 md:grid-cols-[180px_1fr_1fr_auto]">
            <select
              value={evidenceKind}
              onChange={(event) => setEvidenceKind(event.target.value as PropertyHazardEvidenceKind)}
              className="min-h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
            >
              {EVIDENCE_KINDS.map((kind) => (
                <option key={kind} value={kind}>{humanize(kind)}</option>
              ))}
            </select>
            {evidenceKind !== 'USER_ATTESTATION' ? (
              <Input
                value={evidenceId}
                onChange={(event) => setEvidenceId(event.target.value)}
                placeholder={
                  evidenceKind === 'CLAIM'
                    ? 'Claim ID'
                    : evidenceKind === 'INSPECTION' || evidenceKind === 'REPAIR'
                      ? 'Timeline event ID'
                      : 'Document ID'
                }
              />
            ) : <div />}
            <Input
              value={evidenceNote}
              onChange={(event) => setEvidenceNote(event.target.value)}
              placeholder="Evidence note (optional)"
            />
            <Button
              type="button"
              variant="outline"
              disabled={
                evidenceMutation.isPending
                || (evidenceKind !== 'USER_ATTESTATION' && !evidenceId)
              }
              onClick={() => evidenceMutation.mutate()}
            >
              Link
            </Button>
          </div>
          {evidenceMutation.isError ? (
            <p className="text-sm text-red-700">
              {evidenceMutation.error instanceof Error
                ? evidenceMutation.error.message
                : 'Unable to link this evidence.'}
            </p>
          ) : null}
        </div>
      ) : null}
    </MobileCard>
  );
}

export default function HomeRiskReplayClient() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const propertyId = params.id;
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');
  const [hazardType, setHazardType] = React.useState(searchParams.get('focus') ?? '');

  const exposureQuery = useQuery({
    queryKey: ['past-hazard-exposure', propertyId, from, to, hazardType],
    queryFn: () => getPastHazardExposure(propertyId, {
      from: from || undefined,
      to: to || undefined,
      hazardType: hazardType || undefined,
    }),
    enabled: Boolean(propertyId),
  });

  const exposure = exposureQuery.data;
  const hazardTypes = React.useMemo(
    () => [...new Set([
      ...(exposure?.pastEvents ?? []),
      ...(exposure?.longTermContext ?? []),
    ].map((item) => item.hazardType))].sort(),
    [exposure],
  );

  return (
    <ToolWorkspaceTemplate
      backHref={`/dashboard/properties/${propertyId}`}
      backLabel="Back to property"
      eyebrow="Home tool"
      title="Past Hazard Exposure"
      subtitle="Review sourced historical hazards matched to this property geography, then record what is actually known about the home."
      rail={<HomeToolsRail propertyId={propertyId} currentToolId="home-risk-replay" />}
    >

      <MobileCard className="border-amber-200 bg-amber-50/50">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 text-amber-700" />
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Interpretation boundary</h2>
            <p className="mt-1 text-sm leading-relaxed text-slate-700">
              A nearby event or geographic match does not prove damage, causation, insurance coverage,
              or a change in property value.
            </p>
          </div>
        </div>
      </MobileCard>

      <MobileFilterSurface>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-sm font-medium text-slate-800">
            From
            <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </label>
          <label className="text-sm font-medium text-slate-800">
            To
            <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </label>
          <label className="text-sm font-medium text-slate-800">
            Hazard type
            <select
              value={hazardType}
              onChange={(event) => setHazardType(event.target.value)}
              className="mt-1 min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
            >
              <option value="">All reviewed hazard types</option>
              {hazardTypes.map((type) => <option key={type} value={type}>{humanize(type)}</option>)}
            </select>
          </label>
        </div>
      </MobileFilterSurface>

      {exposureQuery.isLoading ? (
        <EmptyStateCard title="Loading reviewed source records" description="Checking hazard observations and source coverage." />
      ) : exposureQuery.isError || !exposure ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Past hazard exposure is unavailable</AlertTitle>
          <AlertDescription>
            Reviewed source coverage could not be loaded. This is not an all-clear.
            <Button className="ml-2" size="sm" variant="outline" onClick={() => exposureQuery.refetch()}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <MobileSection>
            <MobileSectionHeader
              title="Source coverage"
              subtitle="The providers, geography, and checked-through dates that bound this view."
            />
            <SourceCoverageSummary
              state={exposure.coverage.state}
              checkedThrough={exposure.coverage.checkedThrough}
              comprehensive={exposure.coverage.comprehensive}
              sources={exposure.coverage.sources}
              limitations={exposure.coverage.limitations}
            />
          </MobileSection>

          <MobileSection>
            <MobileSectionHeader
              title="Past event records"
              subtitle="External observations first; household outcomes and evidence are shown separately."
            />
            {exposure.pastEvents.length > 0 ? (
              <div className="space-y-4">
                {exposure.pastEvents.map((item) => (
                  <HazardCard key={item.propertyMatchId} item={item} propertyId={propertyId} />
                ))}
              </div>
            ) : (
              <EmptyStateCard
                title="No matched records to show"
                description={exposure.emptyState
                  ?? 'No records matched the selected filters within reviewed source coverage.'}
              />
            )}
          </MobileSection>

          <MobileSection>
            <MobileSectionHeader
              title="Long-term context belongs in Environment Report"
              subtitle="Long-term exposure is kept separate from historical event records and current conditions."
            />
            <MobileCard>
              <Button asChild variant="outline">
                <Link href={`/dashboard/properties/${propertyId}/environment-report`}>
                  <CalendarRange className="mr-2 h-4 w-4" />
                  Open Environment Report
                </Link>
              </Button>
            </MobileCard>
          </MobileSection>
        </>
      )}

      <PropertyIntelligenceJourneyLinks propertyId={propertyId} current="SOURCE_VIEW" />

      <Link
        href={`/dashboard/properties/${propertyId}`}
        className="inline-flex items-center text-sm text-slate-600 underline"
      >
        <ArrowLeft className="mr-1 h-4 w-4" /> Return to property
      </Link>
    </ToolWorkspaceTemplate>
  );
}
