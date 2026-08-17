'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { api } from '@/lib/api/client';
import type { BuyerClosingDisclosureInput, BuyerClosingDisclosureWorkspaceResponse } from '@/types';

const dollars = (value: number | null | undefined) => value == null ? '' : String(value / 100);
const percent = (value: number | null | undefined) => value == null ? '' : String(value / 100);
const money = (value: number | null) => value == null ? '—' : (value / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const numberField = (form: FormData, name: string, multiplier = 100) => {
  const value = String(form.get(name) ?? '').trim();
  return value ? Math.round(Number(value) * multiplier) : null;
};
const lines = (value: FormDataEntryValue | null) => String(value ?? '').split('\n').map((item) => item.trim()).filter(Boolean);

function inputFromForm(form: FormData): BuyerClosingDisclosureInput {
  return {
    sourceType: 'MANUAL',
    issuedDate: String(form.get('issuedDate') || '') || null,
    loanAmountCents: numberField(form, 'loanAmount'),
    noteRateBps: numberField(form, 'noteRate'),
    aprBps: numberField(form, 'apr'),
    estimatedTotalMonthlyPaymentCents: numberField(form, 'totalPayment'),
    loanCostsCents: numberField(form, 'loanCosts'),
    lenderCreditsCents: numberField(form, 'lenderCredits'),
    prepaidAndEscrowCents: numberField(form, 'prepaidAndEscrow'),
    sellerCreditsCents: numberField(form, 'sellerCredits'),
    cashToCloseCents: numberField(form, 'cashToClose'),
    cashToCloseDirection: String(form.get('cashToCloseDirection') || 'UNKNOWN') as 'FROM_BORROWER' | 'TO_BORROWER' | 'UNKNOWN',
    changeExplanation: String(form.get('changeExplanation') ?? '').trim() || null,
  };
}

const labels: Record<string, string> = {
  loanAmountCents: 'Loan amount', noteRateBps: 'Note rate', aprBps: 'APR',
  estimatedTotalMonthlyPaymentCents: 'Estimated total payment', loanCostsCents: 'Loan costs',
  lenderCreditsCents: 'Lender credits', prepaidAndEscrowCents: 'Prepaids & escrow', cashToCloseCents: 'Cash to close',
};

export function BuyerClosingDisclosureCenter({ propertyId, readOnly }: { propertyId: string; readOnly: boolean }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const queryKey = ['buyer-closing-disclosure', propertyId];
  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const response = await api.getBuyerClosingDisclosure(propertyId);
      if (!response.success) throw new Error(response.message || 'Unable to load Closing Disclosure review.');
      return response.data;
    },
  });
  const apply = (data: BuyerClosingDisclosureWorkspaceResponse) => {
    queryClient.setQueryData(queryKey, data);
    void queryClient.invalidateQueries({ queryKey: ['buyer-plan-overview', propertyId] });
  };
  const saveMutation = useMutation({
    mutationFn: async ({ revisionId, input }: { revisionId?: string; input: BuyerClosingDisclosureInput }) => {
      const response = revisionId
        ? await api.updateBuyerClosingDisclosureDraft(propertyId, revisionId, input)
        : await api.createBuyerClosingDisclosureRevision(propertyId, input);
      if (!response.success) throw new Error(response.message || 'Unable to save Closing Disclosure draft.');
      return response.data;
    },
    onSuccess: (data) => { apply(data); toast({ title: 'Closing Disclosure draft saved', description: 'Partial manual entry is saved. Resume it before confirming.' }); },
    onError: (error) => toast({ title: 'Unable to save disclosure', description: error instanceof Error ? error.message : 'Try again.', variant: 'destructive' }),
  });
  const confirmMutation = useMutation({
    mutationFn: async (revisionId: string) => {
      const response = await api.confirmBuyerClosingDisclosure(propertyId, revisionId);
      if (!response.success) throw new Error(response.message || 'Unable to confirm Closing Disclosure.');
      return response.data;
    },
    onSuccess: (data) => { apply(data); toast({ title: 'Current disclosure confirmed', description: 'Recorded figures are now compared with the selected Loan Estimate and contract credits.' }); },
    onError: (error) => toast({ title: 'Disclosure is incomplete', description: error instanceof Error ? error.message : 'Complete required fields.', variant: 'destructive' }),
  });
  const fundsMutation = useMutation({
    mutationFn: async (input: Parameters<typeof api.updateBuyerClosingFundsReadiness>[1]) => {
      const response = await api.updateBuyerClosingFundsReadiness(propertyId, input);
      if (!response.success) throw new Error(response.message || 'Unable to save funds readiness.');
      return response.data;
    },
    onSuccess: (data) => { apply(data); toast({ title: 'Funds readiness saved' }); },
    onError: (error) => toast({ title: 'Unable to save readiness', description: error instanceof Error ? error.message : 'Try again.', variant: 'destructive' }),
  });

  if (query.isLoading) return <Card><CardHeader><CardTitle className="text-lg">Closing Disclosure & Cash-to-Close Review</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Loading disclosure workspace…</p></CardContent></Card>;
  if (query.isError) return <Card><CardHeader><CardTitle className="text-lg">Closing Disclosure & Cash-to-Close Review</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Select a current confirmed Loan Estimate above before starting the Closing Disclosure review.</p></CardContent></Card>;

  const data = query.data;
  const workspace = data?.workspace;
  const draft = workspace?.revisions.find((item) => item.status === 'DRAFT');
  const current = workspace?.revisions.find((item) => item.id === workspace.currentRevisionId);
  const displayed = draft ?? current;

  return <Card className="border-indigo-200 bg-indigo-50/20">
    <CardHeader><CardTitle className="text-lg">Closing Disclosure & Cash-to-Close Review</CardTitle></CardHeader>
    <CardContent className="space-y-5">
      <p className="text-sm text-muted-foreground">Enter the official disclosure manually, save partial work, and confirm only after checking it. This comparison organizes recorded numbers; it does not approve the loan, validate settlement charges, or provide legal advice.</p>
      {data && <div className="rounded-lg border bg-background p-3 text-sm"><p className="font-medium">Selected Loan Estimate · {data.selectedLoanEstimate.lenderName} · revision {data.selectedLoanEstimate.revisionNumber}</p><p className="mt-1 text-xs text-muted-foreground">Recorded contract credits: {money(data.contractCredits.totalCents)}. Confirm any difference with the closing professional.</p></div>}

      <form key={displayed?.id ?? 'new-closing-disclosure'} className="grid gap-3 md:grid-cols-3" onSubmit={(event) => {
        event.preventDefault();
        saveMutation.mutate({ revisionId: draft?.id, input: inputFromForm(new FormData(event.currentTarget)) });
      }}>
        {displayed && <div className="flex items-center gap-2 md:col-span-3"><Badge variant={displayed.status === 'CONFIRMED' ? 'default' : 'secondary'}>Revision {displayed.revisionNumber} · {displayed.status}</Badge>{current && !draft && <span className="text-xs text-muted-foreground">Saving below starts the next revision.</span>}</div>}
        <label className="space-y-1 text-sm"><span>Issue date</span><Input name="issuedDate" type="date" defaultValue={draft?.issuedDate ?? ''} disabled={readOnly} /></label>
        <label className="space-y-1 text-sm"><span>Loan amount</span><Input name="loanAmount" type="number" min="0" step="0.01" defaultValue={dollars(draft?.loanAmountCents)} disabled={readOnly} /></label>
        <label className="space-y-1 text-sm"><span>Note rate (%)</span><Input name="noteRate" type="number" min="0" step="0.001" defaultValue={percent(draft?.noteRateBps)} disabled={readOnly} /></label>
        <label className="space-y-1 text-sm"><span>APR (%)</span><Input name="apr" type="number" min="0" step="0.001" defaultValue={percent(draft?.aprBps)} disabled={readOnly} /></label>
        <label className="space-y-1 text-sm"><span>Estimated total monthly payment</span><Input name="totalPayment" type="number" min="0" step="0.01" defaultValue={dollars(draft?.estimatedTotalMonthlyPaymentCents)} disabled={readOnly} /></label>
        <label className="space-y-1 text-sm"><span>Loan costs</span><Input name="loanCosts" type="number" min="0" step="0.01" defaultValue={dollars(draft?.loanCostsCents)} disabled={readOnly} /></label>
        <label className="space-y-1 text-sm"><span>Lender credits</span><Input name="lenderCredits" type="number" min="0" step="0.01" defaultValue={dollars(draft?.lenderCreditsCents)} disabled={readOnly} /></label>
        <label className="space-y-1 text-sm"><span>Prepaids & initial escrow</span><Input name="prepaidAndEscrow" type="number" min="0" step="0.01" defaultValue={dollars(draft?.prepaidAndEscrowCents)} disabled={readOnly} /></label>
        <label className="space-y-1 text-sm"><span>Seller credits</span><Input name="sellerCredits" type="number" min="0" step="0.01" defaultValue={dollars(draft?.sellerCreditsCents)} disabled={readOnly} /></label>
        <label className="space-y-1 text-sm"><span>Cash to close</span><Input name="cashToClose" type="number" min="0" step="0.01" defaultValue={dollars(draft?.cashToCloseCents)} disabled={readOnly} /></label>
        <label className="space-y-1 text-sm"><span>Cash direction</span><select name="cashToCloseDirection" defaultValue={draft?.cashToCloseDirection ?? 'UNKNOWN'} disabled={readOnly} className="h-10 w-full rounded-md border bg-background px-3"><option value="UNKNOWN">Unknown</option><option value="FROM_BORROWER">From buyer</option><option value="TO_BORROWER">To buyer</option></select></label>
        <label className="space-y-1 text-sm md:col-span-3"><span>Change explanation or professional follow-up</span><textarea name="changeExplanation" defaultValue={draft?.changeExplanation ?? ''} disabled={readOnly} rows={3} className="w-full rounded-md border bg-background p-2" /></label>
        <div className="flex gap-2 md:col-span-3"><Button type="submit" disabled={readOnly || saveMutation.isPending}>{draft ? 'Save partial draft' : 'Start new revision'}</Button>{draft && <Button type="button" disabled={readOnly || confirmMutation.isPending} onClick={() => confirmMutation.mutate(draft.id)}>Confirm revision</Button>}</div>
      </form>

      {data && data.comparison.length > 0 && <div className="space-y-2 border-t pt-4"><p className="font-medium">Selected Loan Estimate → current disclosure</p><div className="grid gap-2 md:grid-cols-2">{data.comparison.map((item) => {
        const rate = item.field === 'noteRateBps' || item.field === 'aprBps';
        const format = (value: number | null) => rate ? (value == null ? '—' : `${(value / 100).toFixed(3)}%`) : money(value);
        return <div key={item.field} className="rounded border bg-background p-2 text-sm"><p className="font-medium">{labels[item.field] ?? item.field}</p><p>{format(item.loanEstimateValue)} → {format(item.closingDisclosureValue)}</p><p className="text-xs text-muted-foreground">Change: {format(item.delta)}</p></div>;
      })}</div><p className="text-xs text-muted-foreground">Seller-credit difference from recorded contract outcomes: {money(data.sellerCreditDeltaCents)}</p></div>}

      {workspace && <form key={`funds-${workspace.updatedAt}`} className="space-y-3 border-t pt-4" onSubmit={(event) => {
        event.preventDefault(); const form = new FormData(event.currentTarget); const expected = String(form.get('fundsExpectedAt') ?? '');
        fundsMutation.mutate({ fundsMethod: String(form.get('fundsMethod')) as typeof workspace.fundsMethod, fundsExpectedAt: expected ? new Date(expected).toISOString() : null, fundsReady: form.has('fundsReady'), instructionsVerified: form.has('instructionsVerified'), verificationChannel: String(form.get('verificationChannel')) as typeof workspace.verificationChannel, questions: lines(form.get('questions')), questionsResolved: form.has('questionsResolved') });
      }}>
        <div><p className="font-medium">Funds readiness and trusted instructions</p><p className="text-xs text-amber-800">Never enter account numbers, routing numbers, passwords, security codes, or full wire instructions here. Independently call a known settlement or lender number if instructions change.</p></div>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="space-y-1 text-sm"><span>Funds method</span><select name="fundsMethod" defaultValue={workspace.fundsMethod} disabled={readOnly} className="h-10 w-full rounded-md border bg-background px-3"><option value="UNKNOWN">Unknown</option><option value="WIRE">Wire</option><option value="CASHIERS_CHECK">Cashier&apos;s check</option><option value="OTHER">Other verified method</option></select></label>
          <label className="space-y-1 text-sm"><span>Funds expected</span><Input name="fundsExpectedAt" type="datetime-local" defaultValue={workspace.fundsExpectedAt?.slice(0, 16) ?? ''} disabled={readOnly} /></label>
          <label className="space-y-1 text-sm"><span>Verification channel</span><select name="verificationChannel" defaultValue={workspace.verificationChannel} disabled={readOnly} className="h-10 w-full rounded-md border bg-background px-3"><option value="UNKNOWN">Not verified</option><option value="KNOWN_PHONE">Known phone number</option><option value="IN_PERSON">In person</option><option value="SECURE_PORTAL">Secure portal</option><option value="OTHER">Other trusted channel</option></select></label>
          <label className="flex items-center gap-2 text-sm"><input name="fundsReady" type="checkbox" defaultChecked={workspace.fundsReady} disabled={readOnly} />Funds are ready</label>
          <label className="flex items-center gap-2 text-sm"><input name="instructionsVerified" type="checkbox" defaultChecked={workspace.instructionsVerified} disabled={readOnly} />Instructions independently verified</label>
          <label className="flex items-center gap-2 text-sm"><input name="questionsResolved" type="checkbox" defaultChecked={workspace.questionsResolved} disabled={readOnly} />Questions resolved</label>
          <label className="space-y-1 text-sm md:col-span-3"><span>Questions for lender or settlement professional (one per line)</span><textarea name="questions" defaultValue={workspace.questions.join('\n')} disabled={readOnly} rows={3} className="w-full rounded-md border bg-background p-2" /></label>
        </div>
        <Button type="submit" disabled={readOnly || fundsMutation.isPending}>Save funds readiness</Button>
      </form>}
      {data && <p className="text-xs text-muted-foreground">{data.disclaimer}</p>}
    </CardContent>
  </Card>;
}
