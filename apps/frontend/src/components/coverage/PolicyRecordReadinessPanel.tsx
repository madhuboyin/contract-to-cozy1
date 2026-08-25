'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api/client';
import type { InsurancePolicyFact, InsurancePolicyRecord } from '@/types';

const FACT_LABELS: Record<string, string> = {
  ANNUAL_PREMIUM: 'Annual premium',
  ALL_PERIL_DEDUCTIBLE: 'All-peril deductible',
  DWELLING_LIMIT: 'Dwelling limit',
  LIABILITY_LIMIT: 'Liability limit',
  POLICY_FORM: 'Policy form',
  COVERAGE_LIMITS_RAW: 'Coverage limits from document',
};

function formatFactValue(fact: InsurancePolicyFact) {
  if (fact.valueType === 'AMOUNT' && fact.amountValue != null) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: fact.currency ?? 'USD',
      maximumFractionDigits: 0,
    }).format(Number(fact.amountValue));
  }
  if (fact.valueType === 'BOOLEAN') return fact.booleanValue ? 'Yes' : 'No';
  if (fact.valueType === 'JSON') return 'Structured policy detail';
  return fact.textValue ?? 'Unknown';
}

function comparableFactValue(fact: InsurancePolicyFact): string | null {
  if (fact.valueType === 'AMOUNT') return fact.amountValue == null ? null : String(fact.amountValue);
  if (fact.valueType === 'BOOLEAN') return fact.booleanValue == null ? null : String(fact.booleanValue);
  if (fact.valueType === 'JSON') return fact.jsonValue == null ? null : JSON.stringify(fact.jsonValue);
  return fact.textValue ?? null;
}

function formatDate(value: string | null) {
  if (!value) return 'unknown';
  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function PolicyRecordReadinessPanel({ propertyId, policyId }: { propertyId: string; policyId?: string | null }) {
  const [record, setRecord] = useState<InsurancePolicyRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingFactId, setSavingFactId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const policiesResponse = await api.listInsurancePolicies(propertyId);
    if (!policiesResponse.success) {
      setError(policiesResponse.error?.message ?? policiesResponse.message);
      setLoading(false);
      return;
    }
    const policy =
      (policyId ? policiesResponse.data.policies.find((candidate) => candidate.id === policyId) : undefined) ??
      policiesResponse.data.policies.find(
        (candidate) => candidate.applicability?.status === 'APPLICABLE'
      ) ??
      [...policiesResponse.data.policies].sort((left, right) =>
        (right.expiryDate ?? '').localeCompare(left.expiryDate ?? '')
      )[0];
    if (!policy) {
      setRecord(null);
      setLoading(false);
      return;
    }
    const recordResponse = await api.getInsurancePolicyRecord(policy.id);
    if (!recordResponse.success) {
      setError(recordResponse.error?.message ?? recordResponse.message);
      setLoading(false);
      return;
    }
    setRecord(recordResponse.data);
    setLoading(false);
  }, [policyId, propertyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const currentTerm = record?.terms[0] ?? null;
  const pendingFacts = useMemo(
    () => record?.terms.flatMap((term) => term.facts.filter((fact) => fact.confirmationStatus === 'PENDING')) ?? [],
    [record]
  );
  const confirmedFacts = useMemo(
    () => currentTerm?.facts.filter((fact) => fact.confirmationStatus === 'CONFIRMED') ?? [],
    [currentTerm]
  );
  const confirmedByKey = useMemo(() => {
    const result = new Map<string, InsurancePolicyFact>();
    for (const term of record?.terms ?? []) {
      for (const fact of term.facts) {
        if (fact.confirmationStatus === 'CONFIRMED' && !result.has(fact.factKey)) {
          result.set(fact.factKey, fact);
        }
      }
    }
    return result;
  }, [record]);
  const conflictedFactIds = useMemo(() => new Set(
    pendingFacts
      .filter((fact) => {
        const confirmed = confirmedByKey.get(fact.factKey);
        return confirmed && comparableFactValue(confirmed) !== comparableFactValue(fact);
      })
      .map((fact) => fact.id),
  ), [confirmedByKey, pendingFacts]);

  async function setFactStatus(fact: InsurancePolicyFact, status: 'CONFIRMED' | 'REJECTED') {
    if (!record) return;
    setSavingFactId(fact.id);
    setError(null);
    const response = await api.confirmInsurancePolicyFact(record.id, fact.id, status);
    if (!response.success) {
      setError(response.error?.message ?? response.message);
      setSavingFactId(null);
      return;
    }
    await load();
    setSavingFactId(null);
  }

  if (loading) {
    return (
      <section className="rounded-xl border border-border bg-card p-4" aria-busy="true">
        <p className="text-sm text-muted-foreground">Loading policy record…</p>
      </section>
    );
  }

  if (!record) {
    return (
      <section className="rounded-xl border border-dashed border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Policy facts are unknown</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Add a declarations document or policy record to review a real policy term. No missing
          record is treated as proof of coverage.
        </p>
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      </section>
    );
  }

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Canonical policy record
        </p>
        <h2 className="mt-1 text-base font-semibold">
          {record.carrierName} · {record.policyNumber}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {record.readiness.state === 'CONFIRMED'
            ? 'The displayed term facts have been reviewed.'
            : record.readiness.state === 'NEEDS_CONFIRMATION'
              ? `${record.readiness.pendingFactCount} extracted fact${record.readiness.pendingFactCount === 1 ? '' : 's'} need confirmation.`
              : 'No confirmed policy term is available yet.'}
        </p>
        {currentTerm && (
          <p className="mt-1 text-xs text-muted-foreground">
            Effective {formatDate(currentTerm.termStart)}–{formatDate(currentTerm.termEnd)}
            {currentTerm.sourceDocument?.name
              ? ` · source ${currentTerm.sourceDocument.name}`
              : ' · source not linked'}
          </p>
        )}
      </div>

      {pendingFacts.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Resolve extracted policy facts</h3>
          {pendingFacts.map((fact) => (
            <div key={fact.id} className={`rounded-lg border p-3 ${conflictedFactIds.has(fact.id) ? 'border-amber-300 bg-amber-50/70' : 'border-border'}`}>
              {conflictedFactIds.has(fact.id) && (
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-800">Conflicting values — choose one</p>
              )}
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{FACT_LABELS[fact.factKey] ?? fact.factKey}</p>
                  <p className="text-sm"><span className="text-muted-foreground">New document:</span> {formatFactValue(fact)}</p>
                  {conflictedFactIds.has(fact.id) && confirmedByKey.get(fact.factKey) && (
                    <p className="text-sm"><span className="text-muted-foreground">Existing confirmed record:</span> {formatFactValue(confirmedByKey.get(fact.factKey)!)}</p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    Source: {fact.sourceDocument?.name ?? 'Policy document'}
                    {fact.sourcePage ? `, page ${fact.sourcePage}` : ', page not captured'}
                    {fact.confidence != null
                      ? ` · extraction confidence ${Math.round(fact.confidence * 100)}%`
                      : ''}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={savingFactId === fact.id}
                    onClick={() => void setFactStatus(fact, 'REJECTED')}
                    className="rounded-md border border-border px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                  >
                    {conflictedFactIds.has(fact.id) ? 'Keep existing' : 'Not correct'}
                  </button>
                  <button
                    type="button"
                    disabled={savingFactId === fact.id}
                    onClick={() => void setFactStatus(fact, 'CONFIRMED')}
                    className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
                  >
                    {conflictedFactIds.has(fact.id) ? 'Use extracted value' : 'Confirm'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {confirmedFacts.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Confirmed facts</h3>
          <dl className="divide-y divide-border rounded-lg border border-border">
            {confirmedFacts.map((fact) => (
              <div key={fact.id} className="grid gap-1 p-3 sm:grid-cols-[1fr_auto]">
                <dt className="text-sm font-medium">
                  {FACT_LABELS[fact.factKey] ?? fact.factKey}
                </dt>
                <dd className="text-sm sm:text-right">{formatFactValue(fact)}</dd>
                <dd className="text-xs text-muted-foreground sm:col-span-2 sm:text-right">
                  Confirmed
                  {fact.sourceDocument?.name ? ` from ${fact.sourceDocument.name}` : ''}
                  {fact.sourcePage ? `, page ${fact.sourcePage}` : ''}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold">Still unknown</h3>
        {record.readiness.unknownFactKeys.length > 0 ? (
          <ul className="mt-1 list-disc pl-5 text-sm text-muted-foreground">
            {record.readiness.unknownFactKeys.map((key) => (
              <li key={key}>{FACT_LABELS[key] ?? key}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">
            All fields in this limited readiness set are present.
          </p>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        This record organizes policy evidence; it is not a coverage determination or licensed
        insurance advice.
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </section>
  );
}
