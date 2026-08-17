'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { api } from '@/lib/api/client';
import type {
  BuyerInsuranceProofStatus,
  BuyerInsuranceQuoteInput,
  BuyerInsuranceRequirementCategory,
  BuyerInsuranceRequirementStatus,
  BuyerInsuranceWorkspaceResponse,
} from '@/types';

const dateInput = (value: string | null | undefined) => value?.slice(0, 10) ?? '';
const dateIso = (value: FormDataEntryValue | null) => {
  const text = String(value ?? '');
  return text ? new Date(`${text}T12:00:00.000Z`).toISOString() : null;
};
const cents = (value: FormDataEntryValue | null) => {
  const text = String(value ?? '').trim();
  return text === '' ? null : Math.round(Number(text) * 100);
};
const money = (value: number | null | undefined) => value == null ? 'Not recorded' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value / 100);

export function BuyerInsuranceCenter({ propertyId, readOnly }: { propertyId: string; readOnly: boolean }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const queryKey = ['buyer-insurance', propertyId];
  const [quoteFile, setQuoteFile] = useState<File | null>(null);
  const [binderFile, setBinderFile] = useState<File | null>(null);
  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const response = await api.getBuyerInsurance(propertyId);
      if (!response.success) throw new Error(response.message || 'Unable to load buyer insurance preparation.');
      return response.data;
    },
  });
  const apply = (data: BuyerInsuranceWorkspaceResponse) => {
    queryClient.setQueryData(queryKey, data);
    void queryClient.invalidateQueries({ queryKey: ['buyer-plan-overview', propertyId] });
  };
  const upload = async (file: File, name: string) => {
    const response = await api.uploadDocument(file, { propertyId, type: 'INSURANCE_CERTIFICATE', name, description: 'Buyer insurance preparation evidence; status remains user recorded.' });
    if (!response.success || !response.data?.id) throw new Error(`Unable to upload ${name}.`);
    return response.data.id;
  };
  const workspaceMutation = useMutation({
    mutationFn: async (input: Parameters<typeof api.updateBuyerInsurance>[1]) => {
      const binderDocumentId = binderFile ? await upload(binderFile, 'Insurance binder or proof') : query.data?.workspace?.binderDocumentId ?? null;
      const response = await api.updateBuyerInsurance(propertyId, { ...input, binderDocumentId });
      if (!response.success) throw new Error(response.message || 'Unable to update insurance preparation.');
      return response.data;
    },
    onSuccess: (data) => { setBinderFile(null); apply(data); toast({ title: 'Insurance preparation updated', description: 'The Buyer Plan task and insurance-effective milestone were reconciled.' }); },
    onError: (error) => toast({ title: 'Unable to update insurance', description: error instanceof Error ? error.message : 'Try again.', variant: 'destructive' }),
  });
  const quoteMutation = useMutation({
    mutationFn: async (input: BuyerInsuranceQuoteInput) => {
      const sourceDocumentId = quoteFile ? await upload(quoteFile, `${input.carrierName} quote`) : null;
      const response = await api.createBuyerInsuranceQuote(propertyId, { ...input, sourceDocumentId });
      if (!response.success) throw new Error(response.message || 'Unable to add insurance quote.');
      return response.data;
    },
    onSuccess: (data) => { setQuoteFile(null); apply(data); toast({ title: 'Quote recorded', description: 'Compare the assumptions and exclusions with a licensed insurer or agent.' }); },
    onError: (error) => toast({ title: 'Unable to add quote', description: error instanceof Error ? error.message : 'Try again.', variant: 'destructive' }),
  });
  const selectMutation = useMutation({
    mutationFn: async (quoteId: string) => {
      const response = await api.selectBuyerInsuranceQuote(propertyId, quoteId);
      if (!response.success) throw new Error(response.message || 'Unable to select quote.');
      return response.data;
    },
    onSuccess: (data) => { apply(data); toast({ title: 'Buyer selection recorded', description: 'This does not mean the quote is bound coverage.' }); },
  });
  const bindMutation = useMutation({
    mutationFn: async (input: { quoteId: string; policyNumber: string; effectiveAt: string; expiresAt: string }) => {
      const response = await api.bindBuyerInsurance(propertyId, input);
      if (!response.success) throw new Error(response.message || 'Unable to record binding.');
      return response.data;
    },
    onSuccess: (data) => { apply(data); toast({ title: 'Bound policy recorded', description: 'The selected quote was promoted into the canonical Coverage policy record.' }); },
    onError: (error) => toast({ title: 'Unable to record binding', description: error instanceof Error ? error.message : 'Confirm the policy details with the insurer or agent.', variant: 'destructive' }),
  });
  const requirementMutation = useMutation({
    mutationFn: async (input: { category: BuyerInsuranceRequirementCategory; title: string; notes: string | null; dueAt: string | null; blocking: boolean }) => {
      const response = await api.createBuyerInsuranceRequirement(propertyId, input);
      if (!response.success) throw new Error(response.message || 'Unable to add requirement.');
      return response.data;
    },
    onSuccess: apply,
  });
  const requirementStatusMutation = useMutation({
    mutationFn: async ({ requirementId, status }: { requirementId: string; status: BuyerInsuranceRequirementStatus }) => {
      const response = await api.updateBuyerInsuranceRequirement(propertyId, requirementId, { status });
      if (!response.success) throw new Error(response.message || 'Unable to update requirement.');
      return response.data;
    },
    onSuccess: apply,
  });

  const data = query.data;
  const workspace = data?.workspace;
  const selectedQuote = workspace?.quotes.find((quote) => quote.id === workspace.selectedQuoteId);
  const currentBinder = data?.documents.find((document) => document.id === workspace?.binderDocumentId)?.name;

  return <Card className="border-indigo-200 bg-indigo-50/20">
    <CardHeader><CardTitle className="text-lg">Buyer Coverage preparation</CardTitle></CardHeader>
    <CardContent className="space-y-5">
      <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-950"><p className="font-medium">Decision support—not insurance advice or binding.</p><p className="mt-1 text-xs">ContractToCozy records the facts you provide. It does not recommend coverage, determine adequacy, quote premiums, or bind a policy. Confirm limits, exclusions, effective dates, and binding directly with a licensed insurer or agent.</p></div>

      <form key={workspace?.updatedAt ?? 'buyer-insurance'} className="grid gap-3 md:grid-cols-3" onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const name = String(form.get('contactName') ?? '').trim();
        workspaceMutation.mutate({
          contact: name ? { name, company: String(form.get('contactCompany') ?? '').trim() || null, email: String(form.get('contactEmail') ?? '').trim() || null, phone: String(form.get('contactPhone') ?? '').trim() || null } : null,
          requiredEffectiveAt: dateIso(form.get('requiredEffectiveAt')),
          lenderProofStatus: String(form.get('lenderProofStatus')) as BuyerInsuranceProofStatus,
          closingProofStatus: String(form.get('closingProofStatus')) as BuyerInsuranceProofStatus,
          riskAndEligibilityNotes: String(form.get('riskAndEligibilityNotes') ?? '').trim() || null,
        });
      }}>
        <label className="space-y-1 text-sm"><span>Insurance agent or contact</span><Input name="contactName" defaultValue={data?.contact?.name ?? ''} disabled={readOnly} /></label>
        <label className="space-y-1 text-sm"><span>Agency / company</span><Input name="contactCompany" defaultValue={data?.contact?.company ?? ''} disabled={readOnly} /></label>
        <label className="space-y-1 text-sm"><span>Email</span><Input name="contactEmail" type="email" defaultValue={data?.contact?.email ?? ''} disabled={readOnly} /></label>
        <label className="space-y-1 text-sm"><span>Phone</span><Input name="contactPhone" defaultValue={data?.contact?.phone ?? ''} disabled={readOnly} /></label>
        <label className="space-y-1 text-sm"><span>Required effective date</span><Input name="requiredEffectiveAt" type="date" defaultValue={dateInput(workspace?.requiredEffectiveAt)} disabled={readOnly} /></label>
        <label className="space-y-1 text-sm"><span>Binder / declarations / proof</span><Input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" disabled={readOnly} onChange={(event) => setBinderFile(event.target.files?.[0] ?? null)} />{currentBinder && <span className="block text-xs text-muted-foreground">Current: {currentBinder}</span>}</label>
        <label className="space-y-1 text-sm"><span>Lender proof delivery</span><select name="lenderProofStatus" defaultValue={workspace?.lenderProofStatus ?? 'PENDING'} disabled={readOnly} className="h-10 w-full rounded-md border bg-background px-3"><option value="PENDING">Pending</option><option value="DELIVERED">Delivered</option><option value="NOT_REQUIRED">Not required</option></select></label>
        <label className="space-y-1 text-sm"><span>Closing professional delivery</span><select name="closingProofStatus" defaultValue={workspace?.closingProofStatus ?? 'PENDING'} disabled={readOnly} className="h-10 w-full rounded-md border bg-background px-3"><option value="PENDING">Pending</option><option value="DELIVERED">Delivered</option><option value="NOT_REQUIRED">Not required</option></select></label>
        <label className="space-y-1 text-sm"><span>Risk / eligibility questions</span><Input name="riskAndEligibilityNotes" defaultValue={workspace?.riskAndEligibilityNotes ?? ''} disabled={readOnly} placeholder="Roof, electrical, plumbing, prior loss…" /></label>
        <div className="flex items-end"><Button type="submit" disabled={readOnly || workspaceMutation.isPending}>{workspaceMutation.isPending ? 'Saving…' : 'Save preparation'}</Button></div>
      </form>

      <form className="grid gap-3 border-t pt-4 md:grid-cols-4" onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        quoteMutation.mutate({
          carrierName: String(form.get('carrierName') ?? '').trim(), annualPremiumCents: cents(form.get('annualPremium')), deductibleCents: cents(form.get('deductible')),
          dwellingLimitCents: cents(form.get('dwellingLimit')), personalPropertyLimitCents: cents(form.get('personalPropertyLimit')), liabilityLimitCents: cents(form.get('liabilityLimit')), lossOfUseLimitCents: cents(form.get('lossOfUseLimit')),
          replacementCostBasis: form.get('replacementCostBasis') === 'UNKNOWN' ? null : form.get('replacementCostBasis') === 'YES',
          exclusionsNotes: String(form.get('exclusionsNotes') ?? '').trim() || null, endorsementsNotes: String(form.get('endorsementsNotes') ?? '').trim() || null,
          catastropheOptionsNotes: String(form.get('catastropheOptionsNotes') ?? '').trim() || null, validUntil: dateIso(form.get('validUntil')),
        });
        event.currentTarget.reset();
      }}>
        <label className="space-y-1 text-sm"><span>Carrier</span><Input name="carrierName" required maxLength={200} disabled={readOnly} /></label>
        <label className="space-y-1 text-sm"><span>Annual premium ($)</span><Input name="annualPremium" type="number" min="0" step="0.01" disabled={readOnly} /></label>
        <label className="space-y-1 text-sm"><span>Deductible ($)</span><Input name="deductible" type="number" min="0" step="0.01" disabled={readOnly} /></label>
        <label className="space-y-1 text-sm"><span>Dwelling limit ($)</span><Input name="dwellingLimit" type="number" min="0" step="0.01" disabled={readOnly} /></label>
        <label className="space-y-1 text-sm"><span>Personal property ($)</span><Input name="personalPropertyLimit" type="number" min="0" step="0.01" disabled={readOnly} /></label>
        <label className="space-y-1 text-sm"><span>Liability limit ($)</span><Input name="liabilityLimit" type="number" min="0" step="0.01" disabled={readOnly} /></label>
        <label className="space-y-1 text-sm"><span>Loss of use ($)</span><Input name="lossOfUseLimit" type="number" min="0" step="0.01" disabled={readOnly} /></label>
        <label className="space-y-1 text-sm"><span>Replacement-cost basis</span><select name="replacementCostBasis" defaultValue="UNKNOWN" disabled={readOnly} className="h-10 w-full rounded-md border bg-background px-3"><option value="UNKNOWN">Not confirmed</option><option value="YES">Yes</option><option value="NO">No</option></select></label>
        <label className="space-y-1 text-sm"><span>Exclusions</span><Input name="exclusionsNotes" disabled={readOnly} /></label>
        <label className="space-y-1 text-sm"><span>Endorsements</span><Input name="endorsementsNotes" disabled={readOnly} /></label>
        <label className="space-y-1 text-sm"><span>Flood / wind / earthquake options</span><Input name="catastropheOptionsNotes" disabled={readOnly} /></label>
        <label className="space-y-1 text-sm"><span>Quote valid through</span><Input name="validUntil" type="date" disabled={readOnly} /></label>
        <label className="space-y-1 text-sm md:col-span-2"><span>Quote document</span><Input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" disabled={readOnly} onChange={(event) => setQuoteFile(event.target.files?.[0] ?? null)} /></label>
        <div className="flex items-end"><Button type="submit" variant="outline" disabled={readOnly || quoteMutation.isPending}>Add quote</Button></div>
      </form>

      <div className="grid gap-3 lg:grid-cols-2">{workspace?.quotes.map((quote) => <div key={quote.id} className="rounded-lg border bg-background p-3 text-sm"><div className="flex items-center justify-between gap-2"><p className="font-medium">{quote.carrierName}</p><Badge variant={quote.status === 'SELECTED' ? 'default' : 'secondary'}>{quote.status}</Badge></div><div className="mt-2 grid grid-cols-2 gap-1 text-xs text-muted-foreground"><span>Annual: {money(quote.annualPremiumCents)}</span><span>Deductible: {money(quote.deductibleCents)}</span><span>Dwelling: {money(quote.dwellingLimitCents)}</span><span>Liability: {money(quote.liabilityLimitCents)}</span></div>{quote.status !== 'SELECTED' && <Button size="sm" className="mt-3" variant="outline" disabled={readOnly || selectMutation.isPending} onClick={() => selectMutation.mutate(quote.id)}>Record buyer selection</Button>}</div>)}</div>
      {!workspace?.quotes.length && <p className="text-sm text-muted-foreground">No purchase insurance quotes recorded yet.</p>}

      {selectedQuote && !data?.policy && <form className="grid gap-3 rounded-lg border border-amber-200 bg-amber-50/50 p-4 md:grid-cols-4" onSubmit={(event) => {
        event.preventDefault(); const form = new FormData(event.currentTarget); const effectiveAt = dateIso(form.get('effectiveAt')); const expiresAt = dateIso(form.get('expiresAt'));
        if (effectiveAt && expiresAt) bindMutation.mutate({ quoteId: selectedQuote.id, policyNumber: String(form.get('policyNumber') ?? '').trim(), effectiveAt, expiresAt });
      }}><div className="md:col-span-4"><p className="font-medium">Record binding confirmed by the insurer or agent</p><p className="text-xs text-muted-foreground">Selected quote: {selectedQuote.carrierName}. This action creates the canonical Coverage policy.</p></div><label className="space-y-1 text-sm"><span>Policy number</span><Input name="policyNumber" required disabled={readOnly} /></label><label className="space-y-1 text-sm"><span>Effective date</span><Input name="effectiveAt" type="date" required defaultValue={dateInput(workspace?.requiredEffectiveAt)} disabled={readOnly} /></label><label className="space-y-1 text-sm"><span>Expiration date</span><Input name="expiresAt" type="date" required disabled={readOnly} /></label><div className="flex items-end"><Button type="submit" disabled={readOnly || bindMutation.isPending}>{bindMutation.isPending ? 'Recording…' : 'I confirmed binding'}</Button></div></form>}
      {data?.policy && <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-4 text-sm"><p className="font-medium">Canonical policy recorded: {data.policy.carrierName}</p><p className="mt-1 text-xs text-muted-foreground">Policy {data.policy.policyNumber} · effective {dateInput(data.policy.startDate)} through {dateInput(data.policy.expiryDate)} · annual premium {data.policy.premiumAmount ? `$${Number(data.policy.premiumAmount).toLocaleString()}` : 'not recorded'}</p></div>}

      <form className="grid gap-3 border-t pt-4 md:grid-cols-3" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); requirementMutation.mutate({ category: String(form.get('category')) as BuyerInsuranceRequirementCategory, title: String(form.get('title') ?? '').trim(), notes: String(form.get('notes') ?? '').trim() || null, dueAt: dateIso(form.get('dueAt')), blocking: form.has('blocking') }); event.currentTarget.reset(); }}>
        <label className="space-y-1 text-sm"><span>Insurer / lender requirement</span><select name="category" defaultValue="PROPERTY_CONDITION" disabled={readOnly} className="h-10 w-full rounded-md border bg-background px-3"><option value="PROPERTY_CONDITION">Property condition</option><option value="ROOF">Roof</option><option value="ELECTRICAL">Electrical</option><option value="PLUMBING">Plumbing</option><option value="PRIOR_LOSS">Prior loss</option><option value="LENDER">Lender</option><option value="OTHER">Other</option></select></label><label className="space-y-1 text-sm"><span>Requested item</span><Input name="title" required disabled={readOnly} /></label><label className="space-y-1 text-sm"><span>Due date</span><Input name="dueAt" type="date" disabled={readOnly} /></label><label className="space-y-1 text-sm md:col-span-2"><span>Notes</span><Input name="notes" disabled={readOnly} /></label><div className="flex items-end justify-between gap-2"><label className="flex items-center gap-2 text-sm"><input name="blocking" type="checkbox" disabled={readOnly} />Blocks binding</label><Button type="submit" variant="outline" disabled={readOnly || requirementMutation.isPending}>Add requirement</Button></div>
      </form>
      <div className="space-y-2">{workspace?.requirements.map((item) => { const open = ['OPEN', 'SUBMITTED'].includes(item.status); return <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-background p-3 text-sm"><div><p className="font-medium">{item.title}</p><p className="text-xs text-muted-foreground">{item.category.replace(/_/g, ' ').toLowerCase()}{item.dueAt ? ` · due ${dateInput(item.dueAt)}` : ''}</p></div><div className="flex gap-2"><Badge variant={item.blocking && open ? 'destructive' : 'secondary'}>{item.status}</Badge>{open && <><Button size="sm" variant="outline" disabled={readOnly} onClick={() => requirementStatusMutation.mutate({ requirementId: item.id, status: 'SUBMITTED' })}>Submitted</Button><Button size="sm" disabled={readOnly} onClick={() => requirementStatusMutation.mutate({ requirementId: item.id, status: 'RESOLVED' })}>Resolved</Button><Button size="sm" variant="ghost" disabled={readOnly} onClick={() => requirementStatusMutation.mutate({ requirementId: item.id, status: 'WAIVED' })}>Waived</Button></>}</div></div>; })}{!workspace?.requirements.length && <p className="text-sm text-muted-foreground">No insurer or lender requirements recorded.</p>}</div>
    </CardContent>
  </Card>;
}
