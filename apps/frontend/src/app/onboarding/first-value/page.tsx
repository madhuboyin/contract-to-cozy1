'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, ArrowRight, CheckCircle2, Clock3, FileCheck2, FileUp, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api/client';
import type { ActivationFirstValueDTO } from '@/types';
import { track } from '@/lib/analytics/events';

export default function OnboardingFirstValuePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const propertyId = searchParams.get('propertyId');
  const [data, setData] = useState<ActivationFirstValueDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resolving, setResolving] = useState<string | null>(null);
  const [evidenceKind, setEvidenceKind] = useState<'FREE_TEXT' | 'CONVERSATION' | 'DOCUMENT' | 'QUOTE' | 'INVOICE' | 'PHOTO' | 'EMAIL_PDF'>('FREE_TEXT');
  const [evidenceDetail, setEvidenceDetail] = useState('');
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [addingEvidence, setAddingEvidence] = useState(false);
  const [feedback, setFeedback] = useState<'USEFUL_NEW' | 'USEFUL_KNOWN' | 'NOT_USEFUL' | null>(null);

  useEffect(() => {
    if (!propertyId) {
      setError('A property is required to load your first action.');
      return;
    }
    let active = true;
    api.getActivationFirstValue(propertyId)
      .then((response) => {
        if (!active) return;
        if (!response.success || !response.data) throw new Error(response.message || 'First action is unavailable.');
        setData(response.data);
        track('first_value_viewed', {
          propertyId,
          actionId: response.data.action.id,
          triggerType: response.data.entryContext.activeTrigger.type,
        });
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : 'First action is unavailable.');
      });
    return () => { active = false; };
  }, [propertyId]);

  const resolve = async (
    disposition: 'COMPLETED' | 'INTENTIONALLY_DEFERRED' | 'DELIBERATELY_DISMISSED',
  ) => {
    if (!propertyId || !data) return;
    setResolving(disposition);
    const nextTriggerAt = disposition === 'INTENTIONALLY_DEFERRED'
      ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      : null;
    try {
      const response = await api.recordFirstActionResolution(propertyId, {
        disposition,
        reason: disposition === 'COMPLETED'
          ? 'Homeowner confirmed the starting action is already handled.'
          : disposition === 'INTENTIONALLY_DEFERRED'
            ? 'Homeowner chose to revisit this starting action in seven days.'
            : 'Homeowner marked this starting action not relevant.',
        consequenceAcknowledged: true,
        nextTriggerAt,
      });
      if (!response.success) throw new Error(response.message || 'Unable to record this choice.');
      track('first_action_resolved', { propertyId, actionId: data.action.id, disposition });
      router.push(`/dashboard?propertyId=${encodeURIComponent(propertyId)}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to record this choice.');
    } finally {
      setResolving(null);
    }
  };

  const addEvidence = async () => {
    if (!propertyId || !data) return;
    const requiresFile = !['FREE_TEXT', 'CONVERSATION'].includes(evidenceKind);
    if ((!evidenceDetail.trim() && !evidenceFile) || (requiresFile && !evidenceFile)) {
      setError(requiresFile ? 'Select a file to attach this evidence.' : 'Add a short evidence note.');
      return;
    }
    setAddingEvidence(true);
    setError(null);
    try {
      let documentId: string | null = null;
      if (evidenceFile) {
        const documentType = evidenceKind === 'QUOTE'
          ? 'ESTIMATE'
          : evidenceKind === 'INVOICE'
            ? 'INVOICE'
            : evidenceKind === 'PHOTO'
              ? 'PHOTO'
              : 'OTHER';
        const uploaded = await api.uploadDocument(evidenceFile, {
          type: documentType,
          name: evidenceFile.name,
          description: evidenceDetail.trim() || `Activation ${evidenceKind.toLowerCase()} evidence`,
          propertyId,
        });
        if (!uploaded.success || !uploaded.data?.id) throw new Error(uploaded.message || 'Evidence upload failed.');
        documentId = uploaded.data.id;
      }
      const attached = await api.addActivationTriggerEvidence(propertyId, {
        kind: evidenceKind,
        label: evidenceFile?.name || (evidenceKind === 'CONVERSATION' ? 'Conversation context' : 'Homeowner context'),
        detail: evidenceDetail.trim() || null,
        documentId,
        observedAt: new Date().toISOString(),
        consentContext: 'Homeowner explicitly attached this evidence to the active onboarding trigger.',
      });
      if (!attached.success) throw new Error(attached.message || 'Unable to attach evidence.');
      const refreshed = await api.getActivationFirstValue(propertyId);
      if (refreshed.success && refreshed.data) setData(refreshed.data);
      setEvidenceDetail('');
      setEvidenceFile(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to attach evidence.');
    } finally {
      setAddingEvidence(false);
    }
  };

  const submitFeedback = async (value: 'USEFUL_NEW' | 'USEFUL_KNOWN' | 'NOT_USEFUL') => {
    if (!propertyId) return;
    try {
      const response = await api.recordFirstValueFeedback(propertyId, value);
      if (!response.success) throw new Error(response.message || 'Unable to record feedback.');
      setFeedback(value);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to record feedback.');
    }
  };

  if (error && !data) {
    return (
      <main className="min-h-screen bg-slate-50 px-6 py-16">
        <div className="mx-auto max-w-lg rounded-2xl border border-rose-200 bg-white p-8 text-center shadow-sm">
          <AlertCircle className="mx-auto h-10 w-10 text-rose-600" />
          <h1 className="mt-4 text-2xl font-bold text-slate-900">We couldn’t prepare your first action</h1>
          <p className="mt-2 text-slate-600">{error}</p>
          <Button className="mt-6" onClick={() => router.push('/dashboard')}>Go to Home</Button>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-brand-600" />
          <p className="mt-3 font-medium text-slate-600">Preparing a bounded first action…</p>
        </div>
      </main>
    );
  }

  const { action, baseline } = data;
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="space-y-3 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-100 text-brand-700">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <p className="text-sm font-bold text-brand-700">Your first useful action</p>
          <h1 className="text-3xl font-black text-slate-900 sm:text-4xl">{action.signal}</h1>
          <p className="mx-auto max-w-2xl text-slate-600">{action.whyItMatters}</p>
        </header>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-bold text-rose-700">{action.priority}</span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
              {action.confidence.label} confidence
            </span>
          </div>
          <h2 className="mt-5 text-xl font-bold text-slate-900">Recommended next step</h2>
          <p className="mt-2 text-lg text-slate-700">{action.recommendedAction}</p>
          <div className="mt-5 rounded-2xl bg-emerald-50 p-4">
            <p className="text-sm font-bold text-emerald-900">Expected outcome</p>
            <p className="mt-1 text-sm text-emerald-800">{action.expectedOutcome}</p>
          </div>
          <div className="mt-4 flex items-start gap-3 text-sm text-slate-600">
            <Clock3 className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{action.timing.rationale}</p>
          </div>
          <Button
            className="mt-6 h-12 w-full rounded-xl text-base font-bold"
            onClick={() => {
              track('first_action_started', { propertyId, actionId: action.id });
              router.push(action.primaryCta.href);
            }}
          >
            {action.primaryCta.label}<ArrowRight className="ml-2 h-4 w-4" />
          </Button>
          {action.secondaryCtas.length > 0 && (
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {action.secondaryCtas.map((cta) => (
                <Button
                  key={`${cta.label}:${cta.href}`}
                  variant="ghost"
                  size="sm"
                  onClick={() => router.push(cta.href)}
                >
                  {cta.label}
                </Button>
              ))}
            </div>
          )}
        </section>

        <div className="grid gap-5 md:grid-cols-2">
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="flex items-center gap-2 font-bold text-slate-900">
              <FileCheck2 className="h-5 w-5 text-brand-600" /> Evidence used
            </h2>
            <ul className="mt-4 space-y-3">
              {baseline.supportedFacts.map((fact) => (
                <li key={`${fact.label}:${fact.value}`} className="text-sm">
                  <p className="font-semibold text-slate-800">{fact.label}: {fact.value}</p>
                  <p className="text-slate-500">{fact.source}</p>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <h2 className="flex items-center gap-2 font-bold text-amber-950">
              <RefreshCw className="h-5 w-5" /> Still unknown
            </h2>
            {baseline.unknownFacts.length > 0 ? (
              <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-amber-900">
                {baseline.unknownFacts.map((fact) => <li key={fact}>{fact}</li>)}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-amber-900">No material starting facts are currently missing.</p>
            )}
            <p className="mt-4 text-xs text-amber-800">Unknown information is not treated as false or silently inferred.</p>
          </section>
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="flex items-center gap-2 font-bold text-slate-900">
            <FileUp className="h-5 w-5 text-brand-600" /> Add evidence that changes this decision
          </h2>
          <p className="mt-1 text-sm text-slate-600">Attach a quote, invoice, photo, document, email/PDF, conversation note, or free text. Uploaded evidence stays linked to this home and trigger.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-[180px_1fr]">
            <select
              value={evidenceKind}
              onChange={(event) => {
                setEvidenceKind(event.target.value as typeof evidenceKind);
                setEvidenceFile(null);
              }}
              className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
              aria-label="Evidence type"
            >
              <option value="FREE_TEXT">Free text</option>
              <option value="CONVERSATION">Conversation note</option>
              <option value="DOCUMENT">Document</option>
              <option value="QUOTE">Contractor quote</option>
              <option value="INVOICE">Invoice</option>
              <option value="PHOTO">Photo</option>
              <option value="EMAIL_PDF">Email or PDF</option>
            </select>
            <Input
              value={evidenceDetail}
              onChange={(event) => setEvidenceDetail(event.target.value)}
              placeholder="What should ContractToCozy know from this evidence?"
              maxLength={4000}
            />
          </div>
          {!['FREE_TEXT', 'CONVERSATION'].includes(evidenceKind) && (
            <Input
              className="mt-3"
              type="file"
              accept={evidenceKind === 'PHOTO' ? 'image/*' : '.pdf,.doc,.docx,.txt,image/*'}
              onChange={(event) => setEvidenceFile(event.target.files?.[0] ?? null)}
            />
          )}
          <Button className="mt-4" variant="outline" disabled={addingEvidence} onClick={addEvidence}>
            {addingEvidence ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileUp className="mr-2 h-4 w-4" />}
            Add evidence
          </Button>
        </section>

        {(['NOW', 'SOON', 'PLAN', 'CONSIDER'] as const).some((bucket) => data.plan[bucket].length > 0) && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="font-bold text-slate-900">Evidence-bounded 12-month plan</h2>
            <p className="mt-1 text-sm text-slate-600">Only actions supported by current evidence are included. Empty buckets are intentional.</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {(['NOW', 'SOON', 'PLAN', 'CONSIDER'] as const).map((bucket) => (
                <div key={bucket} className="rounded-xl bg-slate-50 p-4">
                  <p className="text-xs font-bold text-slate-500">{bucket}</p>
                  {data.plan[bucket].length === 0 ? (
                    <p className="mt-2 text-sm text-slate-500">No supported action yet.</p>
                  ) : data.plan[bucket].map((planAction) => (
                    <button
                      key={planAction.id}
                      type="button"
                      className="mt-2 block text-left text-sm font-semibold text-slate-800 hover:text-brand-700"
                      onClick={() => router.push(planAction.primaryCta.href)}
                    >
                      {planAction.signal}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </section>
        )}

        {action.assumptions.length > 0 && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="font-bold text-slate-900">Assumptions to confirm</h2>
            {action.assumptions.map((assumption) => (
              <div key={assumption.key} className="mt-3 rounded-xl bg-slate-50 p-3 text-sm">
                <p className="font-semibold text-slate-800">{assumption.label}</p>
                <p className="text-slate-600">{assumption.value}</p>
              </div>
            ))}
          </section>
        )}

        {error && <p className="text-center text-sm font-medium text-rose-700">{error}</p>}

        <section className="rounded-2xl border border-slate-200 bg-white p-5 text-center">
          <h2 className="font-bold text-slate-900">What would you like to do with this action?</h2>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <Button variant="outline" disabled={Boolean(resolving)} onClick={() => resolve('COMPLETED')}>
              <CheckCircle2 className="mr-2 h-4 w-4" /> Already handled
            </Button>
            <Button variant="outline" disabled={Boolean(resolving)} onClick={() => resolve('INTENTIONALLY_DEFERRED')}>
              <Clock3 className="mr-2 h-4 w-4" /> Remind me later
            </Button>
            <Button variant="ghost" disabled={Boolean(resolving)} onClick={() => resolve('DELIBERATELY_DISMISSED')}>
              Not relevant
            </Button>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 text-center">
          <h2 className="font-bold text-slate-900">Was this first recommendation useful?</h2>
          <p className="mt-1 text-sm text-slate-600">This measures whether activation produced useful or new guidance—not just whether the screen loaded.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {([
              ['USEFUL_NEW', 'Useful and new'],
              ['USEFUL_KNOWN', 'Useful reminder'],
              ['NOT_USEFUL', 'Not useful'],
            ] as const).map(([value, label]) => (
              <Button key={value} variant={feedback === value ? 'default' : 'outline'} onClick={() => submitFeedback(value)}>
                {label}
              </Button>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
