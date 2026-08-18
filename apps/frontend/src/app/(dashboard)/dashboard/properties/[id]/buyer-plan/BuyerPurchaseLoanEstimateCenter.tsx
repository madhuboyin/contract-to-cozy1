'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { api } from '@/lib/api/client';
import { BuyerWorkspaceDetails, BuyerWorkspaceGuidance } from './BuyerWorkspaceGuidance';
import type {
  BuyerPurchaseLoanEstimateInput,
  BuyerPurchaseLoanEstimateRevision,
  BuyerPurchaseLoanEstimateWorkspace,
} from '@/types';

interface EditTarget {
  offerId?: string;
  lenderName?: string;
  revision?: BuyerPurchaseLoanEstimateRevision;
}

const dollars = (cents: number | null | undefined) => cents == null ? '' : String(cents / 100);
const percent = (bps: number | null | undefined) => bps == null ? '' : String(bps / 100);
const money = (value: number) => value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

function numberField(form: FormData, name: string, multiplier: number): number | null {
  const value = String(form.get(name) ?? '').trim();
  return value === '' ? null : Math.round(Number(value) * multiplier);
}

function inputFromForm(form: FormData, provenance?: Pick<BuyerPurchaseLoanEstimateInput, 'sourceType' | 'extractionMetadata'>): BuyerPurchaseLoanEstimateInput {
  const loanType = String(form.get('loanType') ?? '');
  return {
    ...provenance,
    loanAmountCents: numberField(form, 'loanAmount', 100),
    loanTermMonths: numberField(form, 'loanTermYears', 12),
    loanType: loanType ? loanType as 'FIXED' | 'ARM' | 'OTHER' : null,
    noteRateBps: numberField(form, 'noteRate', 100),
    aprBps: numberField(form, 'apr', 100),
    monthlyPrincipalAndInterestCents: numberField(form, 'monthlyPrincipalAndInterest', 100),
    monthlyMortgageInsuranceCents: numberField(form, 'monthlyMortgageInsurance', 100),
    estimatedTotalMonthlyPaymentCents: numberField(form, 'estimatedTotalMonthlyPayment', 100),
    loanCostsCents: numberField(form, 'loanCosts', 100),
    lenderCreditsCents: numberField(form, 'lenderCredits', 100),
    discountPointsBps: numberField(form, 'discountPointsPct', 100),
    discountPointsCents: numberField(form, 'discountPoints', 100),
    prepaidAndEscrowCents: numberField(form, 'prepaidAndEscrow', 100),
    cashToCloseCents: numberField(form, 'cashToClose', 100),
    cashToCloseDirection: 'FROM_BORROWER',
    fiveYearTotalPaidCents: numberField(form, 'fiveYearTotalPaid', 100),
    fiveYearPrincipalPaidCents: numberField(form, 'fiveYearPrincipalPaid', 100),
    issuedDate: String(form.get('issuedDate') || '') || null,
    rateLockStatus: String(form.get('rateLockStatus') || 'UNKNOWN') as 'LOCKED' | 'NOT_LOCKED' | 'UNKNOWN',
    rateLockExpirationDate: String(form.get('rateLockExpirationDate') || '') || null,
  };
}

export function BuyerPurchaseLoanEstimateCenter({ propertyId, readOnly }: { propertyId: string; readOnly: boolean }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editTarget, setEditTarget] = useState<EditTarget>({});
  const [extractionProposal, setExtractionProposal] = useState<import('@/types').BuyerPurchaseLoanEstimateExtractionProposal | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const queryKey = ['buyer-purchase-loan-estimates', propertyId];
  const workspaceQuery = useQuery({
    queryKey,
    queryFn: async () => {
      const response = await api.getBuyerPurchaseLoanEstimates(propertyId);
      if (!response.success) throw new Error(response.message || 'Unable to load purchase Loan Estimates.');
      return response.data;
    },
  });
  const applyWorkspace = (workspace: BuyerPurchaseLoanEstimateWorkspace) => {
    queryClient.setQueryData(queryKey, workspace);
    setEditTarget({});
    setExtractionProposal(null);
  };
  const extractionMutation = useMutation({
    mutationFn: async (files: File[]) => {
      const response = await api.extractBuyerPurchaseLoanEstimate(propertyId, files);
      if (!response.success) throw new Error(response.message || 'Unable to read the Loan Estimate.');
      return response.data;
    },
    onSuccess: (proposal) => {
      setEditTarget({});
      setExtractionProposal(proposal);
      setShowDetails(true);
      toast({ title: 'Review extracted values', description: 'Every populated value is proposed only. Check it against the official disclosure before saving.' });
    },
    onError: (error) => toast({ title: 'Extraction unavailable', description: error instanceof Error ? error.message : 'Enter the values manually instead.', variant: 'destructive' }),
  });
  const saveMutation = useMutation({
    mutationFn: async ({ target, input }: { target: EditTarget; input: BuyerPurchaseLoanEstimateInput }) => {
      const response = target.revision
        ? await api.updateBuyerPurchaseLoanEstimateDraft(propertyId, target.revision.id, input)
        : target.offerId
          ? await api.addBuyerPurchaseLoanEstimateRevision(propertyId, target.offerId, input)
          : await api.createBuyerPurchaseLoanOffer(propertyId, { ...input, lenderName: target.lenderName! });
      if (!response.success) throw new Error(response.message || 'Unable to save the Loan Estimate draft.');
      return response.data;
    },
    onSuccess: (workspace) => {
      applyWorkspace(workspace);
      toast({ title: 'Loan Estimate draft saved', description: 'You can resume and confirm it after every required field is entered.' });
    },
    onError: (error) => toast({ title: 'Unable to save Loan Estimate', description: error instanceof Error ? error.message : 'Try again.', variant: 'destructive' }),
  });
  const confirmMutation = useMutation({
    mutationFn: async (revisionId: string) => {
      const response = await api.confirmBuyerPurchaseLoanEstimate(propertyId, revisionId);
      if (!response.success) throw new Error(response.message || 'Unable to confirm the Loan Estimate.');
      return response.data;
    },
    onSuccess: (workspace) => {
      applyWorkspace(workspace);
      toast({ title: 'Loan Estimate confirmed', description: workspace.comparison ? 'The current confirmed lender offers are now compared.' : 'Add and confirm another current offer to compare.' });
    },
    onError: (error) => toast({ title: 'Loan Estimate is incomplete', description: error instanceof Error ? error.message : 'Complete the required fields and try again.', variant: 'destructive' }),
  });
  const selectionMutation = useMutation({
    mutationFn: async ({ revisionId, intentToProceed }: { revisionId: string; intentToProceed: boolean }) => {
      const response = await api.selectBuyerPurchaseLoanOffer(propertyId, revisionId, intentToProceed);
      if (!response.success) throw new Error(response.message || 'Unable to record lender selection.');
      return response.data;
    },
    onSuccess: (workspace) => {
      applyWorkspace(workspace);
      toast({ title: 'Buyer decision recorded', description: 'The selected confirmed revision is now linked to financing and appraisal follow-up.' });
    },
    onError: (error) => toast({ title: 'Unable to record selection', description: error instanceof Error ? error.message : 'Try again.', variant: 'destructive' }),
  });

  const workspace = workspaceQuery.data;
  const revision = editTarget.revision;
  const draft = revision ?? extractionProposal?.proposedInput;
  const formKey = revision?.id ?? editTarget.offerId ?? (extractionProposal ? 'extracted-offer' : 'new-offer');
  const confirmedCount = workspace?.offers.reduce((count, offer) => count + offer.revisions.filter((item) => item.status === 'CONFIRMED').length, 0) ?? 0;
  const selectedOffer = workspace?.offers.flatMap((offer) => offer.revisions.map((item) => ({ offer, item }))).find(({ item }) => item.id === workspace.selection?.revisionId);

  return <Card>
    <CardHeader><CardTitle className="text-lg">Compare your Loan Estimates</CardTitle></CardHeader>
    <CardContent className="space-y-5">
      <BuyerWorkspaceGuidance
        eyebrow="What C2C does with this information"
        title={selectedOffer ? `${selectedOffer.offer.lenderName} is selected for planning` : confirmedCount > 1 ? 'Your confirmed offers are ready to compare' : 'Start with the official lender document'}
        description="C2C extracts the figures that affect monthly payment, cash needed at closing, lender costs and rate-lock timing. Comparisons organize recorded figures; they do not recommend a lender or determine eligibility."
        status={selectedOffer ? 'Selection recorded' : confirmedCount ? `${confirmedCount} confirmed` : 'No estimate confirmed'}
        steps={[
          { label: 'Upload the official Loan Estimate', complete: Boolean(workspace?.offers.length), detail: 'A PDF or clear page images reduce manual typing.' },
          { label: 'Check extracted figures against the disclosure', complete: confirmedCount > 0, detail: 'Nothing becomes confirmed automatically.' },
          { label: 'Compare costs and record your decision', complete: Boolean(workspace?.selection), detail: 'C2C keeps appraisal and lender follow-up connected.' },
        ]}
      />
      <div className="space-y-2 rounded-xl border-2 border-dashed border-teal-200 bg-white p-4">
        <p className="text-sm font-semibold text-slate-900">Upload a Loan Estimate</p>
        <p className="text-xs leading-5 text-muted-foreground">Upload one PDF or up to three page images. Extraction never confirms or saves values for you.</p>
        <Input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" multiple disabled={readOnly || extractionMutation.isPending} onChange={(event) => {
          const files = Array.from(event.target.files ?? []).slice(0, 3);
          if (files.length) extractionMutation.mutate(files);
        }} />
        {extractionProposal && <div className="space-y-1 rounded bg-amber-50 p-3 text-xs text-amber-950"><p className="font-medium">Review required · {extractionProposal.review.extractedFieldCount} fields proposed · page set {extractionProposal.review.pageIntegrity.status.toLowerCase()}</p>{extractionProposal.review.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div>}
      </div>
      <BuyerWorkspaceDetails
        summary="Manual entry, revisions, rate-lock fields and five-year figures stay here when the document cannot be read or needs correction."
        open={showDetails || Boolean(editTarget.offerId) || Boolean(extractionProposal)}
        onOpenChange={setShowDetails}
      >
      <form key={formKey} className="grid gap-3 md:grid-cols-3" onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const lenderName = editTarget.offerId ? editTarget.lenderName : String(form.get('lenderName') ?? '').trim();
        if (!lenderName) return;
        saveMutation.mutate({
          target: { ...editTarget, lenderName },
          input: inputFromForm(form, extractionProposal ? {
            sourceType: 'DOCUMENT_EXTRACTION',
            extractionMetadata: extractionProposal.proposedInput.extractionMetadata,
          } : undefined),
        });
      }}>
        {!editTarget.offerId && <label className="space-y-1 text-sm"><span>Lender name</span><Input name="lenderName" required disabled={readOnly} /></label>}
        {editTarget.offerId && <div className="md:col-span-3"><Badge variant="secondary">{editTarget.lenderName} · {revision ? `Revision ${revision.revisionNumber}` : 'New revision'}</Badge></div>}
        <label className="space-y-1 text-sm"><span>Issue date</span><Input name="issuedDate" type="date" defaultValue={draft?.issuedDate ?? ''} disabled={readOnly} /></label>
        <label className="space-y-1 text-sm"><span>Loan amount</span><Input name="loanAmount" type="number" min="0" step="0.01" defaultValue={dollars(draft?.loanAmountCents)} disabled={readOnly} /></label>
        <label className="space-y-1 text-sm"><span>Term (years)</span><Input name="loanTermYears" type="number" min="1" max="50" defaultValue={draft?.loanTermMonths ? draft.loanTermMonths / 12 : ''} disabled={readOnly} /></label>
        <label className="space-y-1 text-sm"><span>Loan type</span><select name="loanType" defaultValue={draft?.loanType ?? ''} disabled={readOnly} className="h-10 w-full rounded-md border bg-background px-3"><option value="">Unknown</option><option value="FIXED">Fixed</option><option value="ARM">ARM</option><option value="OTHER">Other</option></select></label>
        <label className="space-y-1 text-sm"><span>Note rate (%)</span><Input name="noteRate" type="number" min="0" step="0.001" defaultValue={percent(draft?.noteRateBps)} disabled={readOnly} /></label>
        <label className="space-y-1 text-sm"><span>APR (%)</span><Input name="apr" type="number" min="0" step="0.001" defaultValue={percent(draft?.aprBps)} disabled={readOnly} /></label>
        <label className="space-y-1 text-sm"><span>Monthly principal & interest</span><Input name="monthlyPrincipalAndInterest" type="number" min="0" step="0.01" defaultValue={dollars(draft?.monthlyPrincipalAndInterestCents)} disabled={readOnly} /></label>
        <label className="space-y-1 text-sm"><span>Monthly mortgage insurance</span><Input name="monthlyMortgageInsurance" type="number" min="0" step="0.01" defaultValue={dollars(draft?.monthlyMortgageInsuranceCents)} disabled={readOnly} /></label>
        <label className="space-y-1 text-sm"><span>Estimated total payment</span><Input name="estimatedTotalMonthlyPayment" type="number" min="0" step="0.01" defaultValue={dollars(draft?.estimatedTotalMonthlyPaymentCents)} disabled={readOnly} /></label>
        <label className="space-y-1 text-sm"><span>Loan costs</span><Input name="loanCosts" type="number" min="0" step="0.01" defaultValue={dollars(draft?.loanCostsCents)} disabled={readOnly} /></label>
        <label className="space-y-1 text-sm"><span>Lender credits</span><Input name="lenderCredits" type="number" min="0" step="0.01" defaultValue={dollars(draft?.lenderCreditsCents)} disabled={readOnly} /></label>
        <label className="space-y-1 text-sm"><span>Discount points (%)</span><Input name="discountPointsPct" type="number" min="0" step="0.001" defaultValue={percent(draft?.discountPointsBps)} disabled={readOnly} /></label>
        <label className="space-y-1 text-sm"><span>Discount points amount</span><Input name="discountPoints" type="number" min="0" step="0.01" defaultValue={dollars(draft?.discountPointsCents)} disabled={readOnly} /></label>
        <label className="space-y-1 text-sm"><span>Prepaids & initial escrow</span><Input name="prepaidAndEscrow" type="number" min="0" step="0.01" defaultValue={dollars(draft?.prepaidAndEscrowCents)} disabled={readOnly} /></label>
        <label className="space-y-1 text-sm"><span>Cash to close</span><Input name="cashToClose" type="number" min="0" step="0.01" defaultValue={dollars(draft?.cashToCloseCents)} disabled={readOnly} /></label>
        <label className="space-y-1 text-sm"><span>In 5 years: total paid</span><Input name="fiveYearTotalPaid" type="number" min="0" step="0.01" defaultValue={dollars(draft?.fiveYearTotalPaidCents)} disabled={readOnly} /></label>
        <label className="space-y-1 text-sm"><span>In 5 years: principal paid</span><Input name="fiveYearPrincipalPaid" type="number" min="0" step="0.01" defaultValue={dollars(draft?.fiveYearPrincipalPaidCents)} disabled={readOnly} /></label>
        <label className="space-y-1 text-sm"><span>Rate lock</span><select name="rateLockStatus" defaultValue={draft?.rateLockStatus ?? 'UNKNOWN'} disabled={readOnly} className="h-10 w-full rounded-md border bg-background px-3"><option value="UNKNOWN">Unknown</option><option value="NOT_LOCKED">Not locked</option><option value="LOCKED">Locked</option></select></label>
        <label className="space-y-1 text-sm"><span>Lock expiration</span><Input name="rateLockExpirationDate" type="date" defaultValue={draft?.rateLockExpirationDate ?? ''} disabled={readOnly} /></label>
        <div className="flex items-end gap-2 md:col-span-3"><Button type="submit" disabled={readOnly || saveMutation.isPending}>{saveMutation.isPending ? 'Saving…' : 'Save draft'}</Button>{(editTarget.offerId || revision) && <Button type="button" variant="outline" onClick={() => setEditTarget({})}>Cancel</Button>}</div>
      </form>
      </BuyerWorkspaceDetails>

      <div className="space-y-3 border-t pt-4">
        {workspace?.offers.map((offer) => <div key={offer.id} className="rounded-lg border p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium">{offer.lenderName}</p><Button size="sm" variant="outline" disabled={readOnly} onClick={() => { setExtractionProposal(null); setEditTarget({ offerId: offer.id, lenderName: offer.lenderName }); }}>Add revision</Button></div><div className="mt-2 space-y-2">{offer.revisions.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>Revision {item.revisionNumber} · {item.issuedDate ?? 'date unknown'}</span><div className="flex flex-wrap gap-2"><Badge variant={item.status === 'CONFIRMED' ? 'default' : 'secondary'}>{item.status}</Badge>{workspace.selection?.revisionId === item.id && <Badge variant="outline">Buyer selected{workspace.selection.intentToProceedAt ? ' · intent recorded' : ''}</Badge>}{item.status === 'DRAFT' && <><Button size="sm" variant="outline" disabled={readOnly} onClick={() => { setExtractionProposal(null); setEditTarget({ offerId: offer.id, lenderName: offer.lenderName, revision: item }); }}>Resume</Button><Button size="sm" disabled={readOnly || confirmMutation.isPending} onClick={() => confirmMutation.mutate(item.id)}>Confirm</Button></>}{item.status === 'CONFIRMED' && workspace.selection?.revisionId !== item.id && <><Button size="sm" variant="outline" disabled={readOnly || selectionMutation.isPending} onClick={() => selectionMutation.mutate({ revisionId: item.id, intentToProceed: false })}>Select for planning</Button><Button size="sm" disabled={readOnly || selectionMutation.isPending} onClick={() => selectionMutation.mutate({ revisionId: item.id, intentToProceed: true })}>Record intent to proceed</Button></>}</div></div>)}</div></div>)}
        {!workspace?.offers.length && <p className="text-sm text-muted-foreground">No lender offers saved yet. Start with any known fields and return later.</p>}
      </div>

      {workspace?.comparison && <div className="space-y-3 rounded-lg border border-blue-200 bg-blue-50/40 p-4"><p className="font-medium">Confirmed offer comparison</p>{workspace.comparison.summary.map((summary) => <p key={summary} className="text-sm">{summary}</p>)}<div className="grid gap-2 md:grid-cols-2">{workspace.comparison.offers.map((offer) => <div key={offer.id} className="rounded border bg-background p-3 text-sm"><p className="font-medium">{offer.lenderName}</p><p>Net loan costs: {money(offer.netLoanCostsUsd)}</p>{offer.fiveYearBorrowingCostUsd != null && <p>Five-year borrowing cost: {money(offer.fiveYearBorrowingCostUsd)}</p>}<p className="mt-1 text-xs text-muted-foreground">{offer.bestMetrics.length ? `Lowest: ${offer.bestMetrics.join(', ').replace(/_/g, ' ').toLowerCase()}` : 'Review tradeoffs and cautions.'}</p></div>)}</div><p className="text-xs text-muted-foreground">{workspace.comparison.disclaimer}</p></div>}
    </CardContent>
  </Card>;
}
