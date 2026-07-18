'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api/client';
import type { FeatureContextCapture } from './featureContextTypes';

export type PropertyContextDecision = {
  status: 'APPLICABLE' | 'NOT_APPLICABLE' | 'UNKNOWN';
  reasonCodes: string[];
  usedFactKeys: string[];
  missingFactKeys: string[];
  conflictedFactKeys: string[];
  validUntil: string | null;
  correctionPaths?: string[];
};

export type PropertyContextEnvelope = {
  propertyId?: string;
  contextVersion: string;
  generatedContextVersion?: string | null;
  isStale?: boolean;
  decision: PropertyContextDecision;
  reconciliation?: {
    status: 'CURRENT' | 'REVIEW_REQUIRED';
    requiresReview: boolean;
    contextVersion?: string;
    reasonCodes: string[];
    affectedOutputs?: Array<{ factKey: string; outputType: string; count: number }>;
  };
};

const label = (value: string) => value.toLowerCase().replace(/_/g, ' ').replace(/^./, (character) => character.toUpperCase());

export function PropertyContextNotice({
  context,
  propertyId: explicitPropertyId,
  title = 'Property context',
  onContextChanged,
}: {
  context?: PropertyContextEnvelope | null;
  propertyId?: string;
  title?: string;
  onContextChanged?: (contextVersion: string, factKey: string) => void | Promise<void>;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [definition, setDefinition] = useState<FeatureContextCapture | null>(null);
  const [capturedFactKeys, setCapturedFactKeys] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const propertyId = explicitPropertyId ?? context?.propertyId;
  const captureFactKey = useMemo(() => context?.decision.missingFactKeys.find((key) => !capturedFactKeys.includes(key)), [capturedFactKeys, context?.decision.missingFactKeys]);

  useEffect(() => {
    let active = true;
    setDefinition(null);
    setDraft('');
    setSelected([]);
    if (!propertyId || !captureFactKey) return () => { active = false; };
    void api.getPropertyContextCaptureDefinition(propertyId, captureFactKey)
      .then((response) => { if (active && response.success) setDefinition(response.data); })
      .catch(() => { /* Unsupported legacy facts remain correction-only. */ });
    return () => { active = false; };
  }, [captureFactKey, propertyId]);

  if (!context) return null;
  const needsAttention = context.isStale || context.decision.status !== 'APPLICABLE';
  const paths = context.decision.correctionPaths ?? [];

  const capture = async (value: unknown) => {
    if (!propertyId || !captureFactKey) return;
    setSaving(true);
    setCaptureError(null);
    try {
      const response = await api.capturePropertyContextFact(propertyId, captureFactKey, value);
      if (!response.success) throw new Error(response.message || 'Could not save this detail.');
      setCapturedFactKeys((current) => [...current, captureFactKey]);
      setDefinition(null);
      window.dispatchEvent(new CustomEvent('property-context:updated', {
        detail: { propertyId, contextVersion: response.data.contextVersion, updatedFactKeys: [captureFactKey] },
      }));
      await onContextChanged?.(response.data.contextVersion, captureFactKey);
      router.refresh();
    } catch (error) {
      setCaptureError(error instanceof Error ? error.message : 'Could not save this detail.');
    } finally {
      setSaving(false);
    }
  };

  const schema = definition?.inputSchema;
  return (
    <div className={`rounded-2xl border p-4 text-sm ${needsAttention ? 'border-amber-200 bg-amber-50 text-amber-950' : 'border-slate-200 bg-slate-50 text-slate-800'}`}>
      <p className="font-semibold">{context.isStale ? `${title} changed` : title}</p>
      <p className="mt-1">{context.isStale ? 'This result was generated from an older property context. Refresh or rerun it before acting.' : context.decision.reasonCodes.map(label).join(' · ')}</p>
      {(context.decision.missingFactKeys.length > 0 || context.decision.conflictedFactKeys.length > 0) ? <p className="mt-1 text-xs opacity-80">{[...context.decision.missingFactKeys, ...context.decision.conflictedFactKeys].map(label).join(' · ')}</p> : null}
      {definition && captureFactKey ? <div className="mt-3 rounded-xl border border-amber-200/80 bg-white/70 p-3" aria-live="polite">
        <p className="font-medium">{definition.question}</p>
        {definition.helpText ? <p className="mt-1 text-xs opacity-80">{definition.helpText}</p> : null}
        <div className="mt-2 flex flex-wrap gap-2">
          {schema?.type === 'BOOLEAN' ? [[schema.trueLabel, true], [schema.falseLabel, false]].map(([optionLabel, value]) => <button key={String(value)} type="button" disabled={saving} onClick={() => void capture(value)} className="rounded-full border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-amber-100 disabled:opacity-50">{String(optionLabel)}</button>) : null}
          {schema?.type === 'SINGLE_SELECT' ? schema.options.map((option) => <button key={option.value} type="button" disabled={saving} onClick={() => void capture(option.value)} className="rounded-full border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-amber-100 disabled:opacity-50">{option.label}</button>) : null}
          {schema?.type === 'MULTI_SELECT' ? <div className="w-full space-y-2"><div className="flex flex-wrap gap-2">{schema.options.map((option) => { const active = selected.includes(option.value); return <button key={option.value} type="button" aria-pressed={active} disabled={saving} onClick={() => setSelected((current) => active ? current.filter((value) => value !== option.value) : [...current, option.value].slice(0, schema.maxItems))} className={`rounded-full border px-3 py-1.5 text-xs font-medium ${active ? 'border-amber-700 bg-amber-700 text-white' : 'border-amber-300 bg-white'}`}>{option.label}</button>; })}</div><button type="button" disabled={saving} onClick={() => void capture(selected)} className="rounded-lg bg-amber-900 px-3 py-2 text-xs font-medium text-white">Save</button></div> : null}
          {schema?.type === 'INTEGER' || schema?.type === 'DECIMAL' ? <form className="flex items-end gap-2" onSubmit={(event) => { event.preventDefault(); const value = Number(draft); if (draft !== '' && Number.isFinite(value)) void capture(value); }}><label className="text-xs font-medium">Answer{schema.unit ? ` (${schema.unit})` : ''}<input type="number" step={schema.type === 'INTEGER' ? 1 : 'any'} min={schema.min} max={schema.max} value={draft} onChange={(event) => setDraft(event.target.value)} className="mt-1 block rounded-lg border bg-white px-3 py-2" /></label><button type="submit" disabled={saving || draft === ''} className="rounded-lg bg-amber-900 px-3 py-2 text-xs font-medium text-white">Save</button></form> : null}
          {schema?.type === 'SHORT_TEXT' ? <form className="flex items-end gap-2" onSubmit={(event) => { event.preventDefault(); if (draft.trim()) void capture(draft.trim()); }}><label className="text-xs font-medium">Answer<input value={draft} maxLength={schema.maxLength} onChange={(event) => setDraft(event.target.value)} className="mt-1 block rounded-lg border bg-white px-3 py-2" /></label><button type="submit" disabled={saving || !draft.trim()} className="rounded-lg bg-amber-900 px-3 py-2 text-xs font-medium text-white">Save</button></form> : null}
          {definition.allowNotSure ? <button type="button" disabled={saving} onClick={() => void capture(null)} className="px-2 py-1.5 text-xs font-medium underline">Not sure</button> : null}
        </div>
        {captureError ? <p className="mt-2 text-xs text-red-700" role="alert">{captureError}</p> : null}
      </div> : null}
      {paths.length > 0 ? <div className="mt-2 flex flex-wrap gap-3">{paths.map((path, index) => <Link key={`${path}-${index}`} href={path} className="font-medium underline underline-offset-2">View all property details{paths.length > 1 ? ` ${index + 1}` : ''}</Link>)}</div> : null}
    </div>
  );
}
