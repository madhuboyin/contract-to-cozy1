'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, FileCheck2 } from 'lucide-react';
import { api } from '@/lib/api/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import type { BuyerContractContingencyType, BuyerContractFieldKey, BuyerContractRevision, BuyerContractRevisionInput } from '@/types';

const CONTINGENCIES: Array<{ type: BuyerContractContingencyType; label: string; help: string; party: string }> = [
  { type: 'EARNEST_MONEY', label: 'Deposit due', help: 'The date your contract deposit must be received.', party: 'Ask your agent or attorney' },
  { type: 'INSPECTION', label: 'Last day for inspection decisions', help: 'The date by which you may need to raise inspection concerns.', party: 'Ask your agent or attorney' },
  { type: 'ATTORNEY_REVIEW', label: 'Attorney review ends', help: 'A contract review period used in some locations.', party: 'Ask your attorney' },
  { type: 'FINANCING', label: 'Financing decision deadline', help: 'The date tied to the loan protection in your contract.', party: 'Ask your lender and agent' },
  { type: 'APPRAISAL', label: 'Appraisal decision deadline', help: 'The date tied to an appraisal protection, if your contract has one.', party: 'Ask your lender or agent' },
  { type: 'TITLE', label: 'Title questions due', help: 'The date for resolving title-related questions, if listed.', party: 'Ask your attorney or closing professional' },
  { type: 'HOA_DOCUMENTS', label: 'Association document review ends', help: 'The date to review condo or homeowners association documents, if applicable.', party: 'Ask your agent or attorney' },
  { type: 'SALE_OF_HOME', label: 'Current-home sale deadline', help: 'Only applies if this purchase depends on selling another home.', party: 'Ask your agent or attorney' },
];

const FIELD_KEY: Array<[BuyerContractFieldKey, keyof BuyerContractRevision]> = [
  ['PROPERTY_ADDRESS', 'propertyAddress'], ['BUYER_NAMES', 'buyerNames'], ['SELLER_NAMES', 'sellerNames'],
  ['ACCEPTANCE_DATE', 'acceptedAt'], ['TARGET_CLOSING_DATE', 'targetClosingDate'], ['POSSESSION_DATE', 'possessionAt'],
  ['POSSESSION_TERMS', 'possessionTerms'], ['EARNEST_MONEY_AMOUNT', 'earnestMoneyAmountCents'],
  ['EARNEST_MONEY_RECIPIENT', 'earnestMoneyRecipient'], ['EARNEST_MONEY_METHOD', 'earnestMoneyMethod'],
  ['SELLER_CREDITS', 'sellerCreditsCents'], ['INCLUDED_ITEMS', 'includedItems'], ['EXCLUDED_ITEMS', 'excludedItems'],
  ['AGREED_REPAIRS', 'agreedRepairs'], ['SPECIAL_CONDITIONS', 'specialConditions'],
];

const lines = (value: FormDataEntryValue | null) => String(value ?? '').split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
const nullable = (value: FormDataEntryValue | null) => String(value ?? '').trim() || null;
const cents = (value: FormDataEntryValue | null) => {
  const text = String(value ?? '').trim();
  return text ? Math.round(Number(text) * 100) : null;
};
const dollars = (value: number | null | undefined) => value == null ? '' : String(value / 100);
const dateOnly = (value: string | null | undefined) => value?.slice(0, 10) ?? '';
const datetimeLocal = (value: string | null | undefined) => value ? value.slice(0, 16) : '';

function guidanceConfirmationKeys(revision: BuyerContractRevision) {
  const primaryKeys = new Set<BuyerContractFieldKey>(['PROPERTY_ADDRESS', 'ACCEPTANCE_DATE', 'TARGET_CLOSING_DATE', 'POSSESSION_DATE']);
  return FIELD_KEY.filter(([fieldKey, key]) => primaryKeys.has(fieldKey) && (() => {
    const value = revision[key];
    return Array.isArray(value) ? value.length > 0 : value !== null && value !== undefined && value !== '';
  })()).map(([fieldKey]) => fieldKey);
}

export function BuyerContractContingencyCenter({ propertyId, readOnly, onChanged }: { propertyId: string; readOnly: boolean; onChanged?: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [reviewChoices, setReviewChoices] = useState<Record<string, 'CONFIRMED' | 'CORRECT' | 'NOT_SURE' | 'ASK'>>({});
  const [sourcePage, setSourcePage] = useState('');
  const [addedContingencies, setAddedContingencies] = useState<BuyerContractContingencyType[]>([]);
  const query = useQuery({
    queryKey: ['buyer-contract-contingencies', propertyId],
    queryFn: async () => {
      const response = await api.getBuyerContract(propertyId);
      if (!response.success) throw new Error(response.message || 'Unable to load contract details.');
      return response.data;
    },
  });
  const revisions = query.data?.workspace?.revisions ?? [];
  const draft = revisions.find((item) => item.status === 'DRAFT') ?? null;
  const current = revisions.find((item) => item.id === query.data?.workspace?.currentRevisionId) ?? revisions.find((item) => item.status === 'CONFIRMED') ?? null;
  const editing = draft ?? current;
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['buyer-contract-contingencies', propertyId] });
    onChanged?.();
  };

  const saveMutation = useMutation({
    mutationFn: async (input: BuyerContractRevisionInput) => draft
      ? api.updateBuyerContractDraft(propertyId, draft.id, input)
      : api.createBuyerContractRevision(propertyId, input),
    onSuccess: async () => { setReviewChoices({}); await refresh(); toast({ title: draft ? 'Contract dates saved' : 'Contract review created', description: 'Nothing updates the closing timeline until the important dates are explicitly confirmed.' }); },
    onError: (error) => toast({ title: 'Unable to save contract revision', description: error instanceof Error ? error.message : 'Review the fields and try again.', variant: 'destructive' }),
  });
  const confirmMutation = useMutation({
    mutationFn: () => {
      if (!draft) throw new Error('Save a contract draft before confirming it.');
      return api.confirmBuyerContractRevision(propertyId, draft.id, guidanceConfirmationKeys(draft).map((fieldKey) => ({
        fieldKey,
        sourceDocumentId: draft.sourceDocumentId,
        sourcePage: sourcePage ? Number(sourcePage) : null,
        sourceLabel: draft.sourceDocumentId ? 'Buyer reviewed this field against the linked signed contract revision.' : 'Buyer confirmed this manually recorded field against the current signed source.',
        confidence: 1,
      })));
    },
    onSuccess: async () => { setReviewChoices({}); await refresh(); toast({ title: 'Contract dates confirmed', description: 'Eligible Buyer Plan deadlines were updated from the confirmed dates.' }); },
    onError: (error) => toast({ title: 'Unable to confirm contract revision', description: error instanceof Error ? error.message : 'Confirm every displayed field and try again.', variant: 'destructive' }),
  });

  const existingContingencies = useMemo(() => new Map((editing?.contingencies ?? []).map((item) => [item.type, item])), [editing]);
  const displayedContingencies = CONTINGENCIES.filter(({ type }) => existingContingencies.has(type) || addedContingencies.includes(type));
  const reviewItems = draft ? [
    { id: 'PROPERTY_ADDRESS', label: 'Property address', value: draft.propertyAddress },
    { id: 'ACCEPTANCE_DATE', label: 'Contract accepted', value: dateOnly(draft.acceptedAt) },
    { id: 'TARGET_CLOSING_DATE', label: 'Planned closing', value: dateOnly(draft.targetClosingDate) },
    { id: 'POSSESSION_DATE', label: 'Expected key handoff', value: draft.possessionAt ? new Date(draft.possessionAt).toLocaleString() : '' },
    ...draft.contingencies.filter((item) => item.dueAt).map((item) => ({ id: `CONTINGENCY_${item.type}`, label: CONTINGENCIES.find((candidate) => candidate.type === item.type)?.label ?? item.label, value: dateOnly(item.dueAt) })),
  ].filter((item) => Boolean(item.value)) : [];
  const allReviewItemsConfirmed = reviewItems.length > 0 && reviewItems.every((item) => reviewChoices[item.id] === 'CONFIRMED');
  if (query.isLoading) return <Card><CardContent className="py-6 text-sm text-muted-foreground">Loading contract and contingency tracker…</CardContent></Card>;
  if (query.isError) return <Card className="border-destructive/40"><CardContent className="py-6 text-sm">Contract tracker could not load. <Button variant="link" onClick={() => query.refetch()}>Try again</Button></CardContent></Card>;

  return <Card className="border-cyan-200 bg-gradient-to-br from-white to-cyan-50/50">
    <CardHeader><CardTitle className="flex items-center gap-2 text-xl"><FileCheck2 className="h-5 w-5 text-teal-700" />Contract dates that guide your plan</CardTitle></CardHeader>
    <CardContent className="space-y-5">
      <p className="max-w-3xl text-sm leading-6 text-muted-foreground">Upload or select the signed contract, then review only the dates that change what you should do next. Nothing updates your plan until you confirm it.</p>
      {query.data?.conflicts.map((conflict) => <div key={conflict} className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{conflict}</div>)}
      <form key={`${editing?.id ?? 'new'}:${editing?.updatedAt ?? ''}`} className="grid gap-4 md:grid-cols-2" onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const sourceDocumentId = nullable(form.get('sourceDocumentId'));
        const contingencies = displayedContingencies.flatMap(({ type, label }) => {
          const due = nullable(form.get(`contingency_${type}`));
          const existing = existingContingencies.get(type);
          if (!due && !existing) return [];
          return [{ contingencyKey: `contract:${type.toLowerCase()}`, type, label, status: (form.get(`status_${type}`) || existing?.status || 'ACTIVE') as 'ACTIVE' | 'SATISFIED' | 'WAIVED' | 'EXPIRED', dueAt: due ? new Date(`${due}T12:00:00.000Z`).toISOString() : null, sourceDocumentId }];
        });
        saveMutation.mutate({
          sourceType: 'MANUAL', sourceDocumentId,
          propertyAddress: nullable(form.get('propertyAddress')), buyerNames: lines(form.get('buyerNames')), sellerNames: lines(form.get('sellerNames')),
          acceptedAt: nullable(form.get('acceptedAt')), targetClosingDate: nullable(form.get('targetClosingDate')),
          possessionAt: nullable(form.get('possessionAt')) ? new Date(String(form.get('possessionAt'))).toISOString() : null,
          possessionTerms: nullable(form.get('possessionTerms')), earnestMoneyAmountCents: cents(form.get('earnestMoneyAmount')),
          earnestMoneyRecipient: nullable(form.get('earnestMoneyRecipient')), earnestMoneyMethod: nullable(form.get('earnestMoneyMethod')),
          sellerCreditsCents: cents(form.get('sellerCredits')), includedItems: lines(form.get('includedItems')), excludedItems: lines(form.get('excludedItems')),
          agreedRepairs: lines(form.get('agreedRepairs')), specialConditions: nullable(form.get('specialConditions')), contingencies,
        });
      }}>
        <section className="rounded-2xl border border-teal-100 bg-white p-4 md:col-span-2">
          <div className="flex flex-wrap items-end justify-between gap-3"><label className="min-w-64 flex-1 space-y-1 text-sm"><span className="font-medium">Signed contract</span><select name="sourceDocumentId" defaultValue={editing?.sourceDocumentId ?? ''} disabled={readOnly} className="h-10 w-full rounded-md border bg-background px-3"><option value="">I will enter the important dates</option>{query.data?.documents.map((document) => <option key={document.id} value={document.id}>{document.name} · {document.verificationStatus.toLowerCase()}</option>)}</select></label><Button asChild type="button" variant="outline"><Link href={`/dashboard/properties/${propertyId}/documents`}>Upload or photograph contract</Link></Button></div>
          <p className="mt-2 text-xs text-slate-500">We organize dates for you; this is not legal review. Ask your agent or attorney about anything uncertain.</p>
        </section>

        <label className="space-y-1 text-sm md:col-span-2"><span className="font-medium">Property</span><Input name="propertyAddress" required defaultValue={editing?.propertyAddress ?? query.data?.propertyAddress ?? ''} disabled={readOnly} /></label>
        <label className="space-y-1 text-sm"><span className="font-medium">When was the contract accepted?</span><Input name="acceptedAt" type="date" defaultValue={dateOnly(editing?.acceptedAt)} disabled={readOnly} /><span className="block text-xs text-slate-500">This often starts time-sensitive contract periods.</span></label>
        <label className="space-y-1 text-sm"><span className="font-medium">When is the planned closing?</span><Input name="targetClosingDate" type="date" defaultValue={dateOnly(editing?.targetClosingDate)} disabled={readOnly} /><span className="block text-xs text-slate-500">Confirmed here, this becomes the closing date used by your plan.</span></label>
        <label className="space-y-1 text-sm md:col-span-2"><span className="font-medium">When do you expect to get the keys?</span><Input name="possessionAt" type="datetime-local" defaultValue={datetimeLocal(editing?.possessionAt)} disabled={readOnly} /><span className="block text-xs text-slate-500">This may be different from closing. Leave it blank if you are not sure.</span></label>

        <fieldset className="space-y-3 md:col-span-2"><div className="flex flex-wrap items-end justify-between gap-3"><div><legend className="font-medium">Other dates that affect your choices</legend><p className="mt-1 text-xs text-slate-500">Only add a date when it appears in your signed contract or a professional confirms it.</p></div><select aria-label="Add another contract deadline" value="" disabled={readOnly} onChange={(event) => { const type = event.target.value as BuyerContractContingencyType; if (type) setAddedContingencies((items) => items.includes(type) ? items : [...items, type]); }} className="h-10 rounded-md border bg-background px-3 text-sm"><option value="">Add another date…</option>{CONTINGENCIES.filter(({ type }) => !displayedContingencies.some((item) => item.type === type)).map(({ type, label }) => <option key={type} value={type}>{label}</option>)}</select></div>{displayedContingencies.map(({ type, label, help, party }) => { const existing = existingContingencies.get(type); return <div key={type} className="grid gap-3 rounded-2xl border bg-background p-4 sm:grid-cols-[1fr_12rem_9rem]"><div><label className="text-sm font-medium">{label}</label><p className="mt-1 text-xs leading-5 text-slate-500">{help} {party} if you are unsure.</p></div><Input aria-label={`${label} due date`} name={`contingency_${type}`} type="date" defaultValue={dateOnly(existing?.dueAt)} disabled={readOnly} /><select aria-label={`${label} status`} name={`status_${type}`} defaultValue={existing?.status ?? 'ACTIVE'} disabled={readOnly} className="h-10 rounded-md border bg-background px-2 text-sm"><option value="ACTIVE">Still applies</option><option value="SATISFIED">Completed</option><option value="WAIVED">Does not apply</option><option value="EXPIRED">Date passed</option></select></div>; })}{displayedContingencies.length === 0 && <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">No additional contract dates added. That is okay—unknown dates do not become active tasks.</p>}</fieldset>

        <details className="rounded-2xl border border-slate-200 bg-white md:col-span-2"><summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-800">View extracted contract details</summary><div className="grid gap-4 border-t border-slate-100 p-4 md:grid-cols-2">
          <label className="space-y-1 text-sm"><span>Buyer name(s)</span><Textarea name="buyerNames" defaultValue={editing?.buyerNames.join('\n') ?? ''} disabled={readOnly} placeholder="One per line" /></label>
          <label className="space-y-1 text-sm"><span>Seller name(s)</span><Textarea name="sellerNames" defaultValue={editing?.sellerNames.join('\n') ?? ''} disabled={readOnly} placeholder="One per line" /></label>
          <label className="space-y-1 text-sm"><span>Possession notes</span><Input name="possessionTerms" defaultValue={editing?.possessionTerms ?? ''} disabled={readOnly} placeholder="At closing, post-closing occupancy…" /></label>
          <label className="space-y-1 text-sm"><span>Deposit amount ($)</span><Input name="earnestMoneyAmount" type="number" min="0" step="0.01" defaultValue={dollars(editing?.earnestMoneyAmountCents)} disabled={readOnly} /></label>
          <label className="space-y-1 text-sm"><span>Deposit recipient</span><Input name="earnestMoneyRecipient" defaultValue={editing?.earnestMoneyRecipient ?? ''} disabled={readOnly} /></label>
          <label className="space-y-1 text-sm"><span>Recorded delivery method</span><Input name="earnestMoneyMethod" defaultValue={editing?.earnestMoneyMethod ?? ''} disabled={readOnly} placeholder="Record only; no payment instructions" /></label>
          <label className="space-y-1 text-sm"><span>Seller credits ($)</span><Input name="sellerCredits" type="number" min="0" step="0.01" defaultValue={dollars(editing?.sellerCreditsCents)} disabled={readOnly} /></label>
          <label className="space-y-1 text-sm"><span>Included items</span><Textarea name="includedItems" defaultValue={editing?.includedItems.join('\n') ?? ''} disabled={readOnly} /></label>
          <label className="space-y-1 text-sm"><span>Excluded items</span><Textarea name="excludedItems" defaultValue={editing?.excludedItems.join('\n') ?? ''} disabled={readOnly} /></label>
          <label className="space-y-1 text-sm"><span>Agreed repairs</span><Textarea name="agreedRepairs" defaultValue={editing?.agreedRepairs.join('\n') ?? ''} disabled={readOnly} /></label>
          <label className="space-y-1 text-sm"><span>Special conditions</span><Textarea name="specialConditions" defaultValue={editing?.specialConditions ?? ''} disabled={readOnly} /></label>
        </div></details>
        <div className="md:col-span-2"><Button type="submit" disabled={readOnly || saveMutation.isPending}>{saveMutation.isPending ? 'Saving…' : draft ? 'Save reviewed dates' : current ? 'Save as a new review' : 'Save dates for review'}</Button></div>
      </form>
      {draft && <div className="space-y-4 rounded-2xl border border-cyan-300 bg-background p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-medium">Review only what changes your plan</p><p className="text-xs text-muted-foreground">Confirm a date, correct it above, leave it uncertain, or flag it for a professional.</p></div><Badge variant="secondary">Saved review</Badge></div><div className="space-y-3">{reviewItems.map((item) => <div key={item.id} className="rounded-xl border border-slate-200 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-medium text-slate-900">{item.label}</p><p className="text-sm text-slate-600">{item.value}</p></div><div className="flex flex-wrap gap-1">{([['CONFIRMED', 'Confirm'], ['CORRECT', 'Correct'], ['NOT_SURE', 'Not sure'], ['ASK', 'Ask a professional']] as const).map(([choice, label]) => <Button key={choice} type="button" size="sm" variant={reviewChoices[item.id] === choice ? 'default' : 'outline'} disabled={readOnly} onClick={() => setReviewChoices((choices) => ({ ...choices, [item.id]: choice }))}>{label}</Button>)}</div></div>{reviewChoices[item.id] === 'CORRECT' && <p className="mt-2 text-xs text-amber-700">Edit this date above and save the review again.</p>}{reviewChoices[item.id] === 'ASK' && <p className="mt-2 text-xs text-teal-700">Keep this unconfirmed and ask the professional named in the guidance for this date.</p>}</div>)}</div><details><summary className="cursor-pointer text-sm text-slate-600">Add source page (optional)</summary><Input type="number" min="1" value={sourcePage} onChange={(event) => setSourcePage(event.target.value)} className="mt-2 max-w-40" /></details><Button disabled={readOnly || !allReviewItemsConfirmed || confirmMutation.isPending} onClick={() => confirmMutation.mutate()}>{confirmMutation.isPending ? 'Confirming…' : 'Confirm dates and update my plan'}</Button>{!allReviewItemsConfirmed && <p className="text-xs text-slate-500">Your timeline stays unchanged until every displayed date is confirmed. Uncertain items can remain saved for later.</p>}</div>}
      {current && !draft && <p className="text-sm text-muted-foreground">Current confirmed revision: <strong>#{current.revisionNumber}</strong> · confirmed {current.confirmedAt ? new Date(current.confirmedAt).toLocaleDateString() : 'date unavailable'}. Edit the form and save to start a new revision; the current timeline remains unchanged until confirmation.</p>}
      <p className="text-xs text-muted-foreground">{query.data?.disclaimer}</p>
    </CardContent>
  </Card>;
}
