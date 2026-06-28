'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { BadgeCheck, Home, Shield, Zap, Droplets, Wrench, Flame, Building2, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import RouteStateCard from '@/components/system/RouteStateCard';
import type {
  HomeScoreReportMeta,
  HomeScoreExecutiveSummary,
  HomeScoreRadar,
  HomeScoreSystemHealthRow,
  HomeScoreTrustAndVerification,
  HomeScoreMethodology,
  HomeScoreTimelineEvent,
} from '@/types';

type BuyerReport = {
  reportMeta: HomeScoreReportMeta;
  executiveSummary: HomeScoreExecutiveSummary;
  radar: HomeScoreRadar;
  systemHealth: HomeScoreSystemHealthRow[];
  timeline: { events: HomeScoreTimelineEvent[]; emptyState: { title: string; detail: string } | null };
  trustAndVerification: HomeScoreTrustAndVerification;
  methodology: HomeScoreMethodology;
  generatedAt: string;
  confidence: string;
};

function formatDate(iso?: string | null) {
  if (!iso) return 'Unknown';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'Unknown';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatConstant(v: string) {
  return v.replace(/_/g, ' ').toLowerCase().replace(/(^|\s)\S/g, (l) => l.toUpperCase());
}

function gradeBg(grade: string) {
  if (grade === 'A' || grade === 'B') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
  if (grade === 'C') return 'bg-amber-100 text-amber-700 border-amber-200';
  return 'bg-rose-100 text-rose-700 border-rose-200';
}

function provenanceBg(p: string) {
  if (p === 'VERIFIED' || p === 'DOCUMENT_BACKED' || p === 'PUBLIC_RECORD')
    return 'bg-emerald-100 text-emerald-700 border-emerald-200';
  if (p === 'INFERRED') return 'bg-sky-100 text-sky-700 border-sky-200';
  return 'bg-slate-100 text-slate-700 border-slate-200';
}

function confidenceBg(c: string) {
  if (c === 'HIGH') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
  if (c === 'MEDIUM') return 'bg-amber-100 text-amber-700 border-amber-200';
  return 'bg-rose-100 text-rose-700 border-rose-200';
}

function systemIcon(key: HomeScoreSystemHealthRow['key']) {
  const map: Record<string, React.ReactNode> = {
    ROOF: <Home className="h-4 w-4" />,
    HVAC: <Zap className="h-4 w-4" />,
    WATER_HEATER: <Droplets className="h-4 w-4" />,
    PLUMBING: <Droplets className="h-4 w-4" />,
    ELECTRICAL: <Zap className="h-4 w-4" />,
    SAFETY_SYSTEMS: <Shield className="h-4 w-4" />,
    EXTERIOR_ENVELOPE: <Building2 className="h-4 w-4" />,
    FOUNDATION_STRUCTURE: <Wrench className="h-4 w-4" />,
  };
  return map[key] ?? <Flame className="h-4 w-4" />;
}

function ScoreRing({ score, grade }: { score: number; grade: string }) {
  const color =
    grade === 'A' || grade === 'B' ? '#10b981' : grade === 'C' ? '#f59e0b' : '#ef4444';
  const r = 44;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width="112" height="112" viewBox="0 0 112 112">
        <circle cx="56" cy="56" r={r} fill="none" stroke="#e2e8f0" strokeWidth="10" />
        <circle
          cx="56"
          cy="56"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          transform="rotate(-90 56 56)"
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-2xl font-bold text-slate-900">{score}</span>
        <span className="text-xs text-slate-500">/ 100</span>
      </div>
    </div>
  );
}

export default function BuyerReportClient() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [report, setReport] = useState<BuyerReport | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [error, setError] = useState<{ title: string; description: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`/api/home-score/share/${token}`, {
          headers: { 'Content-Type': 'application/json' },
        });
        const json = await res.json();

        if (cancelled) return;

        if (!res.ok || !json.success) {
          if (res.status === 410) {
            const msg = json.message || '';
            if (msg.toLowerCase().includes('revoked')) {
              setError({ title: 'Report removed', description: 'The owner has removed this share link.' });
            } else {
              setError({ title: 'Link expired', description: 'This buyer report link has expired.' });
            }
          } else if (res.status === 404) {
            setError({ title: 'Not found', description: 'This share link is invalid or no longer exists.' });
          } else {
            setError({ title: 'Unable to load report', description: json.message || 'An unexpected error occurred.' });
          }
          return;
        }

        setReport(json.data.report);
        setExpiresAt(json.data.expiresAt);
      } catch {
        if (!cancelled) {
          setError({ title: 'Unable to load report', description: 'Check your connection and try again.' });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [token]);

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <RouteStateCard state="loading" title="Loading report…" description="Fetching home details." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <RouteStateCard
          state="error"
          title={error.title}
          description={error.description}
          action={
            <Button asChild variant="outline">
              <Link href="/signup?source=buyer-report">Create your own home report</Link>
            </Button>
          }
        />
      </div>
    );
  }

  if (!report) return null;

  const { reportMeta, executiveSummary: exec, radar, systemHealth, timeline, trustAndVerification: trust, methodology } = report;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header bar */}
      <div className="border-b border-slate-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <span className="text-sm font-semibold text-slate-800">Contract to Cozy</span>
          <Button asChild size="sm">
            <Link href="/signup?source=buyer-report">Track your new home →</Link>
          </Button>
        </div>
      </div>

      <div className="mx-auto max-w-3xl space-y-5 px-4 py-6">

        {/* ── Section 1: Property Header ── */}
        <Card>
          <CardContent className="pt-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Home Report</p>
                <h1 className="mt-1 text-xl font-bold text-slate-900">{reportMeta.propertyAddress}</h1>
                <div className="mt-1 flex flex-wrap gap-1 text-xs text-slate-500">
                  {reportMeta.propertyType && <span>{formatConstant(reportMeta.propertyType)}</span>}
                  {reportMeta.yearBuilt && <span>· Built {reportMeta.yearBuilt}</span>}
                  <span>· Report date: {formatDate(reportMeta.generatedDate || report.generatedAt)}</span>
                </div>
                {expiresAt && (
                  <p className="mt-1 text-xs text-slate-400">Link expires {formatDate(expiresAt)}</p>
                )}
              </div>

              <div className="flex flex-col items-center gap-2">
                <ScoreRing score={exec?.homeScore ?? 0} grade={exec?.grade ?? 'F'} />
                <div className="flex flex-col items-center gap-1">
                  <Badge variant="outline" className={gradeBg(exec?.grade ?? 'F')}>
                    Grade {exec?.grade ?? '–'}
                  </Badge>
                  <Badge variant="outline" className={confidenceBg(trust?.confidenceLevel ?? report.confidence)}>
                    {formatConstant(exec?.ratingTier ?? 'UNKNOWN')}
                  </Badge>
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              <BadgeCheck className="h-4 w-4 shrink-0" />
              <span>
                Verified by Contract to Cozy · {trust?.dataCoveragePct ?? 0}% data coverage ·{' '}
                {formatConstant(trust?.confidenceLevel ?? report.confidence)} confidence
              </span>
            </div>
          </CardContent>
        </Card>

        {/* ── Section 2: Home Radar ── */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Protection Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(radar?.axes ?? []).map((axis) => (
                <div key={axis.key} className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-900">{axis.label}</p>
                    <Badge variant="outline" className={confidenceBg(axis.confidence)}>
                      {axis.confidence}
                    </Badge>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-emerald-500"
                        style={{ width: `${axis.score}%` }}
                      />
                    </div>
                    <span className="text-sm font-semibold text-slate-700">{axis.score}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* ── Section 3: System Health ── */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">System Health</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              {(systemHealth ?? []).map((row) => (
                <div key={row.key} className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3">
                  <div className="mt-0.5 text-slate-400">{systemIcon(row.key)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-slate-900">{row.label}</p>
                      <Badge variant="outline" className={`shrink-0 ${gradeBg(row.grade)}`}>
                        {row.grade}
                      </Badge>
                    </div>
                    {row.ageYears != null && (
                      <p className="mt-0.5 text-xs text-slate-500">Age: {row.ageYears} yr</p>
                    )}
                    {row.serviceWindow && (
                      <p className="mt-0.5 text-xs text-slate-500">{row.serviceWindow}</p>
                    )}
                    <Badge variant="outline" className={`mt-1.5 ${provenanceBg(row.verification)}`}>
                      {formatConstant(row.verification)}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* ── Section 4: Home Timeline ── */}
        {(timeline?.events ?? []).length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Home History</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-3">
                {(timeline.events ?? []).map((event) => (
                  <li key={event.id} className="flex gap-3">
                    <div className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-emerald-400 bg-emerald-50">
                      <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="text-sm font-medium text-slate-900">{event.title}</p>
                        <Badge variant="outline" className={provenanceBg(event.provenance)}>
                          {formatConstant(event.provenance)}
                        </Badge>
                      </div>
                      {event.summary && (
                        <p className="mt-0.5 text-xs text-slate-500">{event.summary}</p>
                      )}
                      <p className="mt-0.5 text-xs text-slate-400">
                        {event.occurredAt ? formatDate(event.occurredAt) : event.year ?? ''}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        )}

        {/* ── Section 5: Trust & Verification ── */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Data & Verification</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { label: 'Data coverage', value: `${trust?.dataCoveragePct ?? 0}%` },
                { label: 'Verified records', value: `${trust?.verifiedPct ?? 0}%` },
                { label: 'Document-backed', value: `${trust?.documentBackedPct ?? 0}%` },
                { label: 'Public records', value: `${trust?.publicRecordPct ?? 0}%` },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">{label}</p>
                  <p className="mt-0.5 text-lg font-bold text-slate-900">{value}</p>
                </div>
              ))}
            </div>
            {trust?.explanation && (
              <p className="mt-3 text-sm text-slate-600">{trust.explanation}</p>
            )}
          </CardContent>
        </Card>

        {/* ── Disclosure ── */}
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-xs text-slate-500">
          <p className="font-medium text-slate-700">About this report</p>
          <p className="mt-1">{methodology?.summary}</p>
          {(methodology?.disclosures ?? []).length > 0 && (
            <ul className="mt-2 list-inside list-disc space-y-0.5">
              {methodology.disclosures.map((d, i) => <li key={i}>{d}</li>)}
            </ul>
          )}
        </div>

        {/* ── CTA ── */}
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-center">
          <p className="text-base font-semibold text-slate-900">Track your new home with Contract to Cozy</p>
          <p className="mt-1 text-sm text-slate-600">
            Get your own Home Report, maintenance reminders, warranty tracking, and more — free for homeowners.
          </p>
          <Button asChild className="mt-4">
            <Link href="/signup?source=buyer-report">Get started free →</Link>
          </Button>
        </div>

      </div>
    </div>
  );
}
