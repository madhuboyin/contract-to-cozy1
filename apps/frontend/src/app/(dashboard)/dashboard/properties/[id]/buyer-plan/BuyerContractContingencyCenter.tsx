'use client';

import { useMemo, useState } from 'react';
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

const CONTINGENCIES: Array<{ type: BuyerContractContingencyType; label: string }> = [
  { type: 'EARNEST_MONEY', label: 'Earnest money due' },
  { type: 'INSPECTION', label: 'Inspection contingency' },
  { type: 'ATTORNEY_REVIEW', label: 'Attorney review' },
  { type: 'FINANCING', label: 'Financing contingency' },
  { type: 'APPRAISAL', label: 'Appraisal contingency' },
  { type: 'TITLE', label: 'Title contingency' },
  { type: 'HOA_DOCUMENTS', label: 'HOA / association documents' },
  { type: 'SALE_OF_HOME', label: 'Sale-of-home contingency' },
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

function populatedConfirmationKeys(revision: BuyerContractRevision) {
  return FIELD_KEY.filter(([, key]) => {
    const value = revision[key];
    return Array.isArray(value) ? value.length > 0 : value !== null && value !== undefined && value !== '';
  }).map(([fieldKey]) => fieldKey);
}

export function BuyerContractContingencyCenter({ propertyId, readOnly, onChanged }: { propertyId: string; readOnly: boolean; onChanged?: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [sourcePage, setSourcePage] = useState('');
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
    onSuccess: async () => { await refresh(); toast({ title: draft ? 'Contract draft saved' : 'Contract revision created', description: 'Nothing updates the closing timeline until every recorded field is explicitly confirmed.' }); },
    onError: (error) => toast({ title: 'Unable to save contract revision', description: error instanceof Error ? error.message : 'Review the fields and try again.', variant: 'destructive' }),
  });
  const confirmMutation = useMutation({
    mutationFn: () => {
      if (!draft) throw new Error('Save a contract draft before confirming it.');
      return api.confirmBuyerContractRevision(propertyId, draft.id, populatedConfirmationKeys(draft).map((fieldKey) => ({
        fieldKey,
        sourceDocumentId: draft.sourceDocumentId,
        sourcePage: sourcePage ? Number(sourcePage) : null,
        sourceLabel: draft.sourceDocumentId ? 'Buyer reviewed this field against the linked signed contract revision.' : 'Buyer confirmed this manually recorded field against the current signed source.',
        confidence: 1,
      })));
    },
    onSuccess: async () => { setReviewConfirmed(false); await refresh(); toast({ title: 'Contract revision confirmed', description: 'Eligible Buyer Plan anchors, milestones, and contingency work were reconciled from the confirmed revision.' }); },
    onError: (error) => toast({ title: 'Unable to confirm contract revision', description: error instanceof Error ? error.message : 'Confirm every displayed field and try again.', variant: 'destructive' }),
  });

  const existingContingencies = useMemo(() => new Map((editing?.contingencies ?? []).map((item) => [item.type, item])), [editing]);
  if (query.isLoading) return <Card><CardContent className="py-6 text-sm text-muted-foreground">Loading contract and contingency tracker…</CardContent></Card>;
  if (query.isError) return <Card className="border-destructive/40"><CardContent className="py-6 text-sm">Contract tracker could not load. <Button variant="link" onClick={() => query.refetch()}>Try again</Button></CardContent></Card>;

  return <Card className="border-cyan-200 bg-cyan-50/30">
    <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><FileCheck2 className="h-5 w-5" />Contract & Contingency Tracker</CardTitle></CardHeader>
    <CardContent className="space-y-5">
      <p className="text-sm text-muted-foreground">Record the current accepted contract manually or link a source document. Drafts never change deadlines; only an explicitly confirmed revision can reconcile eligible Buyer Plan milestones.</p>
      {query.data?.conflicts.map((conflict) => <div key={conflict} className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{conflict}</div>)}
      <form key={`${editing?.id ?? 'new'}:${editing?.updatedAt ?? ''}`} className="grid gap-4 md:grid-cols-2" onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const sourceDocumentId = nullable(form.get('sourceDocumentId'));
        const contingencies = CONTINGENCIES.flatMap(({ type, label }) => {
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
        <label className="space-y-1 text-sm md:col-span-2"><span>Current signed source</span><select name="sourceDocumentId" defaultValue={editing?.sourceDocumentId ?? ''} disabled={readOnly} className="h-10 w-full rounded-md border bg-background px-3"><option value="">Manual record — no linked document yet</option>{query.data?.documents.map((document) => <option key={document.id} value={document.id}>{document.name} · {document.verificationStatus.toLowerCase()}</option>)}</select></label>
        <label className="space-y-1 text-sm md:col-span-2"><span>Property address</span><Input name="propertyAddress" required defaultValue={editing?.propertyAddress ?? query.data?.propertyAddress ?? ''} disabled={readOnly} /></label>
        <label className="space-y-1 text-sm"><span>Buyer name(s)</span><Textarea name="buyerNames" required defaultValue={editing?.buyerNames.join('\n') ?? ''} disabled={readOnly} placeholder="One per line" /></label>
        <label className="space-y-1 text-sm"><span>Seller name(s)</span><Textarea name="sellerNames" required defaultValue={editing?.sellerNames.join('\n') ?? ''} disabled={readOnly} placeholder="One per line" /></label>
        <label className="space-y-1 text-sm"><span>Contract acceptance date</span><Input name="acceptedAt" type="date" required defaultValue={dateOnly(editing?.acceptedAt)} disabled={readOnly} /></label>
        <label className="space-y-1 text-sm"><span>Target closing date</span><Input name="targetClosingDate" type="date" required defaultValue={dateOnly(editing?.targetClosingDate)} disabled={readOnly} /></label>
        <label className="space-y-1 text-sm"><span>Possession date/time</span><Input name="possessionAt" type="datetime-local" defaultValue={datetimeLocal(editing?.possessionAt)} disabled={readOnly} /></label>
        <label className="space-y-1 text-sm"><span>Possession terms</span><Input name="possessionTerms" required defaultValue={editing?.possessionTerms ?? ''} disabled={readOnly} placeholder="At closing, post-closing occupancy…" /></label>
        <label className="space-y-1 text-sm"><span>Earnest money ($)</span><Input name="earnestMoneyAmount" type="number" min="0" step="0.01" defaultValue={dollars(editing?.earnestMoneyAmountCents)} disabled={readOnly} /></label>
        <label className="space-y-1 text-sm"><span>Recipient</span><Input name="earnestMoneyRecipient" defaultValue={editing?.earnestMoneyRecipient ?? ''} disabled={readOnly} /></label>
        <label className="space-y-1 text-sm"><span>Recorded delivery method</span><Input name="earnestMoneyMethod" defaultValue={editing?.earnestMoneyMethod ?? ''} disabled={readOnly} placeholder="Record only; no payment instructions" /></label>
        <label className="space-y-1 text-sm"><span>Seller credits ($)</span><Input name="sellerCredits" type="number" min="0" step="0.01" defaultValue={dollars(editing?.sellerCreditsCents)} disabled={readOnly} /></label>
        <label className="space-y-1 text-sm"><span>Included items</span><Textarea name="includedItems" defaultValue={editing?.includedItems.join('\n') ?? ''} disabled={readOnly} /></label>
        <label className="space-y-1 text-sm"><span>Excluded items</span><Textarea name="excludedItems" defaultValue={editing?.excludedItems.join('\n') ?? ''} disabled={readOnly} /></label>
        <label className="space-y-1 text-sm"><span>Agreed repairs</span><Textarea name="agreedRepairs" defaultValue={editing?.agreedRepairs.join('\n') ?? ''} disabled={readOnly} /></label>
        <label className="space-y-1 text-sm"><span>Special conditions</span><Textarea name="specialConditions" defaultValue={editing?.specialConditions ?? ''} disabled={readOnly} /></label>
        <fieldset className="space-y-3 md:col-span-2"><legend className="font-medium">Confirmed contingency deadlines</legend>{CONTINGENCIES.map(({ type, label }) => { const existing = existingContingencies.get(type); return <div key={type} className="grid gap-2 rounded-lg border bg-background p-3 sm:grid-cols-[1fr_12rem_10rem]"><label className="self-center text-sm font-medium">{label}</label><Input aria-label={`${label} due date`} name={`contingency_${type}`} type="date" defaultValue={dateOnly(existing?.dueAt)} disabled={readOnly} /><select aria-label={`${label} status`} name={`status_${type}`} defaultValue={existing?.status ?? 'ACTIVE'} disabled={readOnly} className="h-10 rounded-md border bg-background px-2 text-sm"><option value="ACTIVE">Active</option><option value="SATISFIED">Satisfied</option><option value="WAIVED">Waived</option><option value="EXPIRED">Expired</option></select></div>; })}</fieldset>
        <div className="md:col-span-2"><Button type="submit" disabled={readOnly || saveMutation.isPending}>{saveMutation.isPending ? 'Saving…' : draft ? 'Save contract draft' : current ? 'Save as new revision' : 'Create contract draft'}</Button></div>
      </form>
      {draft && <div className="space-y-3 rounded-lg border border-cyan-300 bg-background p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-medium">Confirm revision {draft.revisionNumber}</p><p className="text-xs text-muted-foreground">Confirmation creates a separate source record for every populated field and writes only eligible deadlines to the Buyer Plan.</p></div><Badge variant="secondary">Draft</Badge></div><label className="space-y-1 text-sm"><span>Source page for these reviewed fields (optional)</span><Input type="number" min="1" value={sourcePage} onChange={(event) => setSourcePage(event.target.value)} className="max-w-40" /></label><label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={reviewConfirmed} onChange={(event) => setReviewConfirmed(event.target.checked)} disabled={readOnly} className="mt-1" /><span>I reviewed every populated field and deadline against the current signed source. I understand this records my confirmation and is not legal review.</span></label><Button disabled={readOnly || !reviewConfirmed || confirmMutation.isPending} onClick={() => confirmMutation.mutate()}>{confirmMutation.isPending ? 'Confirming…' : 'Confirm revision and update timeline'}</Button></div>}
      {current && !draft && <p className="text-sm text-muted-foreground">Current confirmed revision: <strong>#{current.revisionNumber}</strong> · confirmed {current.confirmedAt ? new Date(current.confirmedAt).toLocaleDateString() : 'date unavailable'}. Edit the form and save to start a new revision; the current timeline remains unchanged until confirmation.</p>}
      <p className="text-xs text-muted-foreground">{query.data?.disclaimer}</p>
    </CardContent>
  </Card>;
}
