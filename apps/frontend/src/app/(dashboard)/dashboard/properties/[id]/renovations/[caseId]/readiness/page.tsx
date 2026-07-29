'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { AlertTriangle, CheckCircle2, ClipboardCheck, Loader2, ShieldAlert } from 'lucide-react';
import { api } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MobilePageIntro, StatusChip } from '@/components/mobile/dashboard/MobilePrimitives';

type ReadinessState =
  | 'NOT_EVALUATED'
  | 'NOT_READY'
  | 'READY_WITH_ACKNOWLEDGED_OPEN_ITEMS'
  | 'READY';

type ReadinessItem = {
  id: string;
  category: string;
  title: string;
  reason: string;
  exactNextAction: string;
  status: 'OPEN' | 'SATISFIED';
  isBlocking: boolean;
  overrideAllowed: boolean;
  manualSatisfactionAllowed: boolean;
  ownerUserId: string;
  dueAt: string;
  evidenceRequired: string;
  evidenceDocumentId?: string | null;
  evidenceReference: string;
  overrideAcknowledgedAt?: string | null;
  overrideReason?: string | null;
};

type Readiness = {
  summary: {
    state: ReadinessState;
    scopeVersionId: string;
    fulfillmentMode?: 'PROVIDER' | 'DIY';
    totalItems?: number;
    openItems?: number;
    blockingItems?: number;
    acknowledgedOpenItems?: number;
    disclaimer: string;
  };
  items: ReadinessItem[];
  project?: { id: string; name: string; status: string } | null;
};

const PROJECT_TYPES = [
  'ROOF_REPLACEMENT', 'HVAC_REPLACEMENT', 'HVAC_REPAIR', 'KITCHEN_REMODEL',
  'BATHROOM_REMODEL', 'ELECTRICAL_PANEL', 'PLUMBING_REPIPING', 'WATER_HEATER',
  'FOUNDATION_WORK', 'WINDOW_REPLACEMENT', 'FLOORING', 'PAINTING_INTERIOR',
  'PAINTING_EXTERIOR', 'DECK_PATIO', 'ADDITION', 'SEWER_LINE',
  'SOLAR_INSTALLATION', 'LANDSCAPING_MAJOR', 'GENERAL_REPAIR', 'CUSTOM',
] as const;

function label(value: string) {
  return value.replace(/_/g, ' ').toLowerCase();
}

function stateTone(state: ReadinessState) {
  if (state === 'READY') return 'good' as const;
  if (state === 'READY_WITH_ACKNOWLEDGED_OPEN_ITEMS') return 'elevated' as const;
  if (state === 'NOT_READY') return 'needsAction' as const;
  return 'info' as const;
}

export default function RenovationReadinessPage() {
  const { id: propertyId, caseId } = useParams<{ id: string; caseId: string }>();
  const [renovationCase, setRenovationCase] = useState<any>(null);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [fulfillmentMode, setFulfillmentMode] = useState<'PROVIDER' | 'DIY'>('PROVIDER');
  const [evidence, setEvidence] = useState<Record<string, string>>({});
  const [overrideReasons, setOverrideReasons] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [handoff, setHandoff] = useState({
    projectType: 'CUSTOM',
    contractorName: '',
    contractorLicense: '',
    contractAmount: '',
    startDate: new Date().toISOString().slice(0, 10),
    expectedEndDate: '',
    intakeMode: 'PLANNED',
    historicalReason: '',
    idempotencyKey: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [caseResponse, readinessResponse] = await Promise.all([
        api.getRenovationCase(propertyId, caseId),
        api.getRenovationReadiness(propertyId, caseId),
      ]);
      if (!caseResponse.success || !caseResponse.data) {
        throw new Error(caseResponse.message || 'Renovation case not found');
      }
      if (!readinessResponse.success || !readinessResponse.data) {
        throw new Error(readinessResponse.message || 'Readiness could not be loaded');
      }
      setRenovationCase(caseResponse.data);
      setReadiness(readinessResponse.data as Readiness);
      const evaluatedMode = (readinessResponse.data as Readiness).summary.fulfillmentMode;
      if (evaluatedMode) setFulfillmentMode(evaluatedMode);
      setHandoff(current => ({
        ...current,
        startDate: caseResponse.data.targetStartDate?.slice(0, 10) || current.startDate,
        expectedEndDate: caseResponse.data.targetEndDate?.slice(0, 10) || current.expectedEndDate,
      }));
    } catch (err: any) {
      setError(err.message || 'Failed to load readiness');
    } finally {
      setLoading(false);
    }
  }, [caseId, propertyId]);

  useEffect(() => { void load(); }, [load]);

  async function evaluate() {
    setWorking(true);
    setError('');
    try {
      const response = await api.evaluateRenovationReadiness(propertyId, caseId, fulfillmentMode);
      if (!response.success) throw new Error(response.message || 'Readiness evaluation failed');
      await load();
    } catch (err: any) {
      setError(err.message || 'Readiness evaluation failed');
    } finally {
      setWorking(false);
    }
  }

  async function satisfy(item: ReadinessItem) {
    const evidenceDocumentId = evidence[item.id]?.trim();
    if (!evidenceDocumentId) return;
    setWorking(true);
    setError('');
    try {
      const response = await api.updateRenovationReadinessItem(propertyId, caseId, item.id, {
        status: 'SATISFIED',
        evidenceDocumentId,
        satisfactionNotes: 'Homeowner verified this readiness item against the attached property document.',
      });
      if (!response.success) throw new Error(response.message || 'Readiness item update failed');
      await load();
    } catch (err: any) {
      setError(err.message || 'Readiness item update failed');
    } finally {
      setWorking(false);
    }
  }

  async function override(item: ReadinessItem, action: 'ACKNOWLEDGE' | 'REVOKE') {
    const reason = overrideReasons[item.id]?.trim() || item.overrideReason || '';
    if ((action === 'ACKNOWLEDGE' && reason.length < 20) || (action === 'REVOKE' && reason.length < 10)) return;
    setWorking(true);
    setError('');
    try {
      const response = await api.governRenovationReadinessOverride(propertyId, caseId, item.id, {
        action,
        reason,
        ...(action === 'ACKNOWLEDGE' && { riskAcknowledged: true }),
      });
      if (!response.success) throw new Error(response.message || 'Override update failed');
      await load();
    } catch (err: any) {
      setError(err.message || 'Override update failed');
    } finally {
      setWorking(false);
    }
  }

  async function createProject() {
    setWorking(true);
    setError('');
    try {
      const idempotencyKey = handoff.idempotencyKey || crypto.randomUUID();
      const response = await api.handoffRenovationProject(propertyId, caseId, {
        projectType: handoff.projectType,
        fulfillmentMode,
        fundingMode: 'SELF_PAID',
        ...(fulfillmentMode === 'PROVIDER' && {
          contractorName: handoff.contractorName,
          ...(handoff.contractorLicense && { contractorLicense: handoff.contractorLicense }),
        }),
        ...(handoff.contractAmount && { contractAmountCents: Math.round(Number(handoff.contractAmount) * 100) }),
        startDate: handoff.startDate,
        ...(handoff.expectedEndDate && { expectedEndDate: handoff.expectedEndDate }),
        intakeMode: handoff.intakeMode,
        ...(handoff.intakeMode !== 'PLANNED' && { historicalReason: handoff.historicalReason }),
        idempotencyKey,
      });
      if (!response.success) throw new Error(response.message || 'Project handoff failed');
      setHandoff(current => ({ ...current, idempotencyKey }));
      await load();
    } catch (err: any) {
      setError(err.message || 'Project handoff failed');
    } finally {
      setWorking(false);
    }
  }

  const state = readiness?.summary.state ?? 'NOT_EVALUATED';
  const plannedHandoffAllowed = ['READY', 'READY_WITH_ACKNOWLEDGED_OPEN_ITEMS'].includes(state);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 pb-28 sm:p-6">
      <MobilePageIntro
        title={renovationCase?.name ? `${renovationCase.name}: Start readiness` : 'Start readiness'}
        subtitle="See exactly what blocks execution, who owns it, what evidence is expected, and when it is due."
        action={<StatusChip tone={stateTone(state)}>{state}</StatusChip>}
      />

      <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-900">
        <p className="font-medium">Decision-support boundary</p>
        <p>{readiness?.summary.disclaimer || 'This readiness assessment organizes project records and does not establish legal compliance.'}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline">
          <Link href={`/dashboard/properties/${propertyId}/renovations/${caseId}/compliance`}>
            Review permit and HOA workflow
          </Link>
        </Button>
      </div>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}
      {loading ? <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div> : null}

      {!loading ? (
        <>
          <Card>
            <CardContent className="space-y-4 p-5">
              <div>
                <h2 className="font-semibold">Evaluate the current scope</h2>
                <p className="text-sm text-slate-600">Changing execution mode requires a fresh evaluation.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <div>
                  <Label>Execution mode</Label>
                  <select
                    className="h-10 w-full rounded-md border px-3"
                    value={fulfillmentMode}
                    onChange={event => setFulfillmentMode(event.target.value as 'PROVIDER' | 'DIY')}
                  >
                    <option value="PROVIDER">Contractor/provider</option>
                    <option value="DIY">DIY</option>
                  </select>
                </div>
                <Button disabled={working} onClick={evaluate}>
                  {working ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ClipboardCheck className="mr-2 h-4 w-4" />}
                  {state === 'NOT_EVALUATED' ? 'Evaluate readiness' : 'Re-evaluate'}
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-3">
            {readiness?.items.map(item => {
              const acknowledged = Boolean(item.overrideAcknowledgedAt);
              const satisfied = item.status === 'SATISFIED';
              return (
                <Card key={item.id} className={satisfied ? 'border-emerald-200' : acknowledged ? 'border-blue-200' : item.isBlocking ? 'border-amber-200' : ''}>
                  <CardContent className="space-y-3 p-5">
                    <div className="flex items-start gap-3">
                      {satisfied
                        ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" />
                        : item.isBlocking
                          ? <ShieldAlert className="mt-0.5 h-5 w-5 text-amber-600" />
                          : <AlertTriangle className="mt-0.5 h-5 w-5 text-slate-500" />}
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold">{item.title}</p>
                          <StatusChip tone={satisfied ? 'good' : acknowledged ? 'info' : item.isBlocking ? 'needsAction' : 'info'}>
                            {satisfied ? 'Satisfied' : acknowledged ? 'Open · acknowledged' : item.isBlocking ? 'Blocking' : 'Open'}
                          </StatusChip>
                        </div>
                        <p className="mt-1 text-sm text-slate-700">{item.reason}</p>
                        {!satisfied ? <p className="mt-2 text-sm font-medium text-slate-900">Next: {item.exactNextAction}</p> : null}
                      </div>
                    </div>
                    <div className="grid gap-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-600 sm:grid-cols-2">
                      <p>Owner: {item.ownerUserId}</p>
                      <p>Due: {new Date(item.dueAt).toLocaleDateString()}</p>
                      <p className="sm:col-span-2">Evidence expected: {item.evidenceRequired}</p>
                      <p className="sm:col-span-2">Current source: {item.evidenceReference}</p>
                    </div>
                    {!satisfied && item.manualSatisfactionAllowed ? (
                      <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                        <div>
                          <Label>Verification document ID</Label>
                          <Input
                            value={evidence[item.id] || ''}
                            onChange={event => setEvidence(current => ({ ...current, [item.id]: event.target.value }))}
                          />
                        </div>
                        <Button variant="outline" disabled={working || !evidence[item.id]?.trim()} onClick={() => satisfy(item)}>
                          Verify satisfied
                        </Button>
                      </div>
                    ) : null}
                    {!satisfied && item.overrideAllowed ? (
                      <div className="space-y-2 rounded-lg border border-blue-200 p-3">
                        <p className="text-xs text-slate-600">Owner acknowledgment is audited and does not change the source record or claim compliance.</p>
                        <Input
                          value={overrideReasons[item.id] ?? item.overrideReason ?? ''}
                          onChange={event => setOverrideReasons(current => ({ ...current, [item.id]: event.target.value }))}
                          placeholder="Explain why proceeding with this item open is acceptable"
                        />
                        <Button
                          variant="outline"
                          disabled={working}
                          onClick={() => override(item, acknowledged ? 'REVOKE' : 'ACKNOWLEDGE')}
                        >
                          {acknowledged ? 'Revoke acknowledgment' : 'Acknowledge open item'}
                        </Button>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {readiness?.project ? (
            <Card className="border-emerald-200">
              <CardContent className="space-y-3 p-5">
                <h2 className="font-semibold">Project linked</h2>
                <p className="text-sm text-slate-600">{readiness.project.name} · {label(readiness.project.status)}</p>
                <Button asChild>
                  <Link href={`/dashboard/properties/${propertyId}/projects/${readiness.project.id}`}>Open Project</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="space-y-4 p-5">
                <div>
                  <h2 className="font-semibold">Create the execution Project</h2>
                  <p className="text-sm text-slate-600">The approved scope version, open dependencies, conditions, and evidence requirements will be snapshotted into one Project.</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label>Project type</Label>
                    <select className="h-10 w-full rounded-md border px-3" value={handoff.projectType} onChange={event => setHandoff(current => ({ ...current, projectType: event.target.value }))}>
                      {PROJECT_TYPES.map(type => <option key={type} value={type}>{label(type)}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label>Intake mode</Label>
                    <select className="h-10 w-full rounded-md border px-3" value={handoff.intakeMode} onChange={event => setHandoff(current => ({ ...current, intakeMode: event.target.value }))}>
                      <option value="PLANNED">Planned start</option>
                      <option value="ALREADY_STARTED">Already started</option>
                      <option value="HISTORICAL">Historical record</option>
                    </select>
                  </div>
                  {fulfillmentMode === 'PROVIDER' ? (
                    <>
                      <div><Label>Contractor/company</Label><Input value={handoff.contractorName} onChange={event => setHandoff(current => ({ ...current, contractorName: event.target.value }))} /></div>
                      <div><Label>Contractor license</Label><Input value={handoff.contractorLicense} onChange={event => setHandoff(current => ({ ...current, contractorLicense: event.target.value }))} /></div>
                    </>
                  ) : null}
                  <div><Label>Contract amount (USD)</Label><Input type="number" min="0" step="0.01" value={handoff.contractAmount} onChange={event => setHandoff(current => ({ ...current, contractAmount: event.target.value }))} /></div>
                  <div><Label>Start date</Label><Input type="date" value={handoff.startDate} onChange={event => setHandoff(current => ({ ...current, startDate: event.target.value }))} /></div>
                  <div><Label>Expected end date</Label><Input type="date" value={handoff.expectedEndDate} onChange={event => setHandoff(current => ({ ...current, expectedEndDate: event.target.value }))} /></div>
                  {handoff.intakeMode !== 'PLANNED' ? (
                    <div className="sm:col-span-2"><Label>Already-started/historical context</Label><Input value={handoff.historicalReason} onChange={event => setHandoff(current => ({ ...current, historicalReason: event.target.value }))} /></div>
                  ) : null}
                </div>
                {!plannedHandoffAllowed && handoff.intakeMode === 'PLANNED' ? (
                  <p className="text-sm text-amber-800">Resolve or acknowledge permitted blockers before a planned handoff.</p>
                ) : null}
                <Button
                  disabled={
                    working
                    || !handoff.startDate
                    || (fulfillmentMode === 'PROVIDER' && !handoff.contractorName)
                    || (handoff.intakeMode === 'PLANNED' && !plannedHandoffAllowed)
                    || (handoff.intakeMode !== 'PLANNED' && handoff.historicalReason.trim().length < 20)
                  }
                  onClick={createProject}
                >
                  Create and link Project
                </Button>
              </CardContent>
            </Card>
          )}
        </>
      ) : null}
    </div>
  );
}
