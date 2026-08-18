'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { api } from '@/lib/api/client';
import { BuyerWorkspaceDetails, BuyerWorkspaceGuidance } from './BuyerWorkspaceGuidance';
import type {
  BuyerLenderConditionCategory,
  BuyerLenderConditionStatus,
  BuyerPurchaseAppraisalStatus,
  BuyerPurchaseLenderReadinessInput,
  BuyerPurchaseLenderReadinessWorkspace,
  BuyerPurchaseUnderwritingStatus,
} from '@/types';

const dateInput = (value: string | null | undefined) => value?.slice(0, 10) ?? '';
const dateIso = (value: FormDataEntryValue | null) => {
  const text = String(value ?? '');
  return text ? new Date(`${text}T12:00:00.000Z`).toISOString() : null;
};

export function BuyerPurchaseLenderReadinessCenter({ propertyId, readOnly }: { propertyId: string; readOnly: boolean }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const queryKey = ['buyer-purchase-lender-readiness', propertyId];
  const workspaceQuery = useQuery({
    queryKey,
    queryFn: async () => {
      const response = await api.getBuyerPurchaseLenderReadiness(propertyId);
      if (!response.success) throw new Error(response.message || 'Unable to load lender readiness.');
      return response.data;
    },
  });
  const applyWorkspace = (workspace: BuyerPurchaseLenderReadinessWorkspace) => {
    queryClient.setQueryData(queryKey, workspace);
    void queryClient.invalidateQueries({ queryKey: ['buyer-plan-overview', propertyId] });
  };
  const readinessMutation = useMutation({
    mutationFn: async (input: BuyerPurchaseLenderReadinessInput) => {
      const response = await api.updateBuyerPurchaseLenderReadiness(propertyId, input);
      if (!response.success) throw new Error(response.message || 'Unable to update lender readiness.');
      return response.data;
    },
    onSuccess: (workspace) => {
      applyWorkspace(workspace);
      toast({ title: 'Lender readiness updated', description: 'The appraisal milestone and existing Buyer Plan task were reconciled.' });
    },
    onError: (error) => toast({ title: 'Unable to update readiness', description: error instanceof Error ? error.message : 'Review the dates and try again.', variant: 'destructive' }),
  });
  const conditionMutation = useMutation({
    mutationFn: async (input: { category: BuyerLenderConditionCategory; title: string; notes: string | null; dueAt: string | null; blocking: boolean }) => {
      const response = await api.createBuyerLenderCondition(propertyId, input);
      if (!response.success) throw new Error(response.message || 'Unable to add the lender condition.');
      return response.data;
    },
    onSuccess: (workspace) => {
      applyWorkspace(workspace);
      toast({ title: 'Lender condition added', description: 'Blocking conditions now appear in Buyer Plan readiness.' });
    },
    onError: (error) => toast({ title: 'Unable to add condition', description: error instanceof Error ? error.message : 'Try again.', variant: 'destructive' }),
  });
  const conditionStatusMutation = useMutation({
    mutationFn: async ({ conditionId, status }: { conditionId: string; status: BuyerLenderConditionStatus }) => {
      const response = await api.updateBuyerLenderCondition(propertyId, conditionId, { status });
      if (!response.success) throw new Error(response.message || 'Unable to update the lender condition.');
      return response.data;
    },
    onSuccess: applyWorkspace,
    onError: (error) => toast({ title: 'Unable to update condition', description: error instanceof Error ? error.message : 'Try again.', variant: 'destructive' }),
  });

  const workspace = workspaceQuery.data;
  const readiness = workspace?.readiness;
  if (workspace && !workspace.selectedRevisionId) {
    return <Card><CardHeader><CardTitle className="text-lg">Appraisal & lender readiness</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Select a current confirmed Loan Estimate above before recording appraisal or underwriting follow-up.</p></CardContent></Card>;
  }

  const openConditions = readiness?.conditions.filter((condition) => ['OPEN', 'SUBMITTED'].includes(condition.status)) ?? [];
  const appraisalStarted = Boolean(readiness && readiness.appraisalStatus !== 'NOT_ORDERED');
  const appraisalComplete = Boolean(readiness && ['COMPLETED', 'RESOLVED'].includes(readiness.appraisalStatus));
  const lenderReady = readiness?.underwritingStatus === 'USER_RECORDED_CLEAR_TO_CLOSE';

  return <Card>
    <CardHeader><CardTitle className="text-lg">Appraisal & lender readiness</CardTitle></CardHeader>
    <CardContent className="space-y-5">
      <BuyerWorkspaceGuidance
        eyebrow="What matters now"
        title={openConditions.length ? 'Respond to the lender requests that could delay closing' : !appraisalStarted ? 'Ask when the appraisal will be ordered' : !appraisalComplete ? 'Keep the appraisal moving' : !lenderReady ? 'Confirm what the lender still needs' : 'Lender readiness is recorded'}
        description="C2C turns lender-reported dates and requests into an appraisal milestone, due items and blockers. Record only what your lender or professional actually told you."
        status={openConditions.length ? `${openConditions.length} request${openConditions.length === 1 ? '' : 's'} open` : lenderReady ? 'Buyer-recorded clear to close' : 'In progress'}
        steps={[
          { label: 'Track the appraisal', complete: appraisalComplete, detail: appraisalStarted ? `Current status: ${readiness!.appraisalStatus.replace(/_/g, ' ').toLowerCase()}.` : 'No appraisal activity recorded yet.' },
          { label: 'Answer lender requests', complete: openConditions.length === 0 && Boolean(readiness), detail: 'Overdue or blocking requests rise in your plan.' },
          { label: 'Confirm the latest lender status', complete: lenderReady, detail: 'C2C records what you were told; it does not approve the loan.' },
        ]}
      />
      <p className="text-sm text-muted-foreground">Record what the lender or professional told you. ContractToCozy does not perform the appraisal, approve underwriting, or certify clear-to-close status.</p>
      <BuyerWorkspaceDetails summary="Appraisal dates, underwriting status and new lender-request entry stay available when you receive an update.">
      <div className="space-y-5">
      <form key={readiness?.updatedAt ?? 'new-readiness'} className="grid gap-3 md:grid-cols-3" onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        readinessMutation.mutate({
          appraisalStatus: String(form.get('appraisalStatus')) as BuyerPurchaseAppraisalStatus,
          appraisalOrderedAt: dateIso(form.get('appraisalOrderedAt')),
          appraisalScheduledAt: dateIso(form.get('appraisalScheduledAt')),
          appraisalCompletedAt: dateIso(form.get('appraisalCompletedAt')),
          appraisalIssueType: String(form.get('appraisalIssueType') || '').trim() || null,
          appraisalIssueNotes: String(form.get('appraisalIssueNotes') || '').trim() || null,
          underwritingStatus: String(form.get('underwritingStatus')) as BuyerPurchaseUnderwritingStatus,
        });
      }}>
        <label className="space-y-1 text-sm"><span>Appraisal status</span><select name="appraisalStatus" defaultValue={readiness?.appraisalStatus ?? 'NOT_ORDERED'} disabled={readOnly} className="h-10 w-full rounded-md border bg-background px-3"><option value="NOT_ORDERED">Not ordered</option><option value="ORDERED">Ordered</option><option value="SCHEDULED">Scheduled</option><option value="COMPLETED">Completed</option><option value="ISSUE_REPORTED">Issue reported</option><option value="RESOLVED">Issue resolved</option></select></label>
        <label className="space-y-1 text-sm"><span>Ordered date</span><Input name="appraisalOrderedAt" type="date" defaultValue={dateInput(readiness?.appraisalOrderedAt)} disabled={readOnly} /></label>
        <label className="space-y-1 text-sm"><span>Appointment date</span><Input name="appraisalScheduledAt" type="date" defaultValue={dateInput(readiness?.appraisalScheduledAt)} disabled={readOnly} /></label>
        <label className="space-y-1 text-sm"><span>Completed date</span><Input name="appraisalCompletedAt" type="date" defaultValue={dateInput(readiness?.appraisalCompletedAt)} disabled={readOnly} /></label>
        <label className="space-y-1 text-sm"><span>Issue type</span><Input name="appraisalIssueType" defaultValue={readiness?.appraisalIssueType ?? ''} placeholder="Value, condition, repair…" disabled={readOnly} /></label>
        <label className="space-y-1 text-sm"><span>Issue or resolution notes</span><Input name="appraisalIssueNotes" defaultValue={readiness?.appraisalIssueNotes ?? ''} disabled={readOnly} /></label>
        <label className="space-y-1 text-sm md:col-span-2"><span>Underwriting status (user recorded)</span><select name="underwritingStatus" defaultValue={readiness?.underwritingStatus ?? 'NOT_STARTED'} disabled={readOnly} className="h-10 w-full rounded-md border bg-background px-3"><option value="NOT_STARTED">Not started</option><option value="IN_REVIEW">In review</option><option value="CONDITIONAL">Conditional / requests open</option><option value="USER_RECORDED_CLEAR_TO_CLOSE">I was told clear to close</option></select></label>
        <div className="flex items-end"><Button type="submit" disabled={readOnly || readinessMutation.isPending}>{readinessMutation.isPending ? 'Saving…' : 'Save readiness'}</Button></div>
      </form>

      <form className="grid gap-3 border-t pt-4 md:grid-cols-3" onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        conditionMutation.mutate({
          category: String(form.get('category')) as BuyerLenderConditionCategory,
          title: String(form.get('title') ?? '').trim(),
          notes: String(form.get('notes') || '').trim() || null,
          dueAt: dateIso(form.get('dueAt')),
          blocking: form.get('blocking') === 'on',
        });
        event.currentTarget.reset();
      }}>
        <label className="space-y-1 text-sm"><span>Condition category</span><select name="category" defaultValue="INCOME_ASSET" disabled={readOnly} className="h-10 w-full rounded-md border bg-background px-3"><option value="INCOME_ASSET">Income / assets</option><option value="CREDIT">Credit</option><option value="APPRAISAL">Appraisal</option><option value="INSURANCE_PROOF">Insurance proof</option><option value="TITLE">Title</option><option value="FINAL_VERIFICATION">Final verification</option><option value="OTHER">Other</option></select></label>
        <label className="space-y-1 text-sm"><span>Requested item</span><Input name="title" required maxLength={200} disabled={readOnly} /></label>
        <label className="space-y-1 text-sm"><span>Due date</span><Input name="dueAt" type="date" disabled={readOnly} /></label>
        <label className="space-y-1 text-sm md:col-span-2"><span>Notes</span><Input name="notes" disabled={readOnly} /></label>
        <div className="flex items-end justify-between gap-2"><label className="flex items-center gap-2 text-sm"><input name="blocking" type="checkbox" disabled={readOnly} /> Blocks closing readiness</label><Button type="submit" variant="outline" disabled={readOnly || conditionMutation.isPending}>Add condition</Button></div>
      </form>
      </div>
      </BuyerWorkspaceDetails>

      <div className="space-y-2">
        {readiness?.conditions.map((condition) => {
          const unresolved = ['OPEN', 'SUBMITTED'].includes(condition.status);
          const overdue = Boolean(condition.dueAt && new Date(condition.dueAt) < new Date());
          return <div key={condition.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm"><div><p className="font-medium">{condition.title}</p><p className="text-xs text-muted-foreground">{condition.category.replace(/_/g, ' ').toLowerCase()}{condition.dueAt ? ` · due ${dateInput(condition.dueAt)}` : ''}{overdue && unresolved ? ' · overdue' : ''}</p></div><div className="flex flex-wrap gap-2"><Badge variant={(condition.blocking || overdue) && unresolved ? 'destructive' : 'secondary'}>{condition.status}</Badge>{unresolved && <><Button size="sm" variant="outline" disabled={readOnly || conditionStatusMutation.isPending} onClick={() => conditionStatusMutation.mutate({ conditionId: condition.id, status: 'SUBMITTED' })}>Submitted</Button><Button size="sm" disabled={readOnly || conditionStatusMutation.isPending} onClick={() => conditionStatusMutation.mutate({ conditionId: condition.id, status: 'SATISFIED' })}>Satisfied</Button><Button size="sm" variant="ghost" disabled={readOnly || conditionStatusMutation.isPending} onClick={() => conditionStatusMutation.mutate({ conditionId: condition.id, status: 'WAIVED' })}>Waived</Button></>}</div></div>;
        })}
        {!readiness?.conditions.length && <p className="text-sm text-muted-foreground">No lender-requested conditions recorded yet.</p>}
      </div>
    </CardContent>
  </Card>;
}
