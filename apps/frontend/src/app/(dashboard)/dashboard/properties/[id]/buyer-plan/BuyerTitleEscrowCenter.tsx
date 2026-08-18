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
  BuyerClosingAppointmentFormat,
  BuyerTitleEscrowIssueInput,
  BuyerTitleEscrowWorkspaceInput,
  BuyerTitleEscrowWorkspaceResponse,
  BuyerTitleIssueCategory,
  BuyerTitleIssueStatus,
  BuyerTitleRequirementStatus,
  BuyerTitleReviewStatus,
} from '@/types';

const datetimeInput = (value: string | null | undefined) => value ? value.slice(0, 16) : '';
const datetimeIso = (value: FormDataEntryValue | null) => {
  const text = String(value ?? '');
  return text ? new Date(text).toISOString() : null;
};
const dateIso = (value: FormDataEntryValue | null) => {
  const text = String(value ?? '');
  return text ? new Date(`${text}T12:00:00.000Z`).toISOString() : null;
};

type DocumentSlot = 'titleCommitmentDocumentId' | 'surveyDocumentId' | 'associationDocumentId';

export function BuyerTitleEscrowCenter({ propertyId, readOnly }: { propertyId: string; readOnly: boolean }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const queryKey = ['buyer-title-escrow', propertyId];
  const [files, setFiles] = useState<Partial<Record<DocumentSlot, File>>>({});
  const workspaceQuery = useQuery({
    queryKey,
    queryFn: async () => {
      const response = await api.getBuyerTitleEscrow(propertyId);
      if (!response.success) throw new Error(response.message || 'Unable to load title and closing preparation.');
      return response.data;
    },
  });
  const applyWorkspace = (workspace: BuyerTitleEscrowWorkspaceResponse) => {
    queryClient.setQueryData(queryKey, workspace);
    void queryClient.invalidateQueries({ queryKey: ['buyer-plan-overview', propertyId] });
  };
  const upload = async (slot: DocumentSlot, label: string, type: 'CONTRACT' | 'OTHER') => {
    const file = files[slot];
    if (!file) return workspaceQuery.data?.workspace?.[slot] ?? null;
    const response = await api.uploadDocument(file, {
      propertyId,
      type,
      name: label,
      description: 'Buyer closing preparation document. Professional review remains external.',
    });
    if (!response.success || !response.data?.id) throw new Error(`Unable to upload ${label}.`);
    return response.data.id;
  };
  const workspaceMutation = useMutation({
    mutationFn: async (input: BuyerTitleEscrowWorkspaceInput) => {
      const [titleCommitmentDocumentId, surveyDocumentId, associationDocumentId] = await Promise.all([
        upload('titleCommitmentDocumentId', 'Title commitment or preliminary title report', 'CONTRACT'),
        upload('surveyDocumentId', 'Property survey', 'OTHER'),
        upload('associationDocumentId', 'Association or HOA records', 'OTHER'),
      ]);
      const response = await api.updateBuyerTitleEscrow(propertyId, {
        ...input,
        titleCommitmentDocumentId,
        surveyDocumentId,
        associationDocumentId,
      });
      if (!response.success) throw new Error(response.message || 'Unable to save title and closing preparation.');
      return response.data;
    },
    onSuccess: (workspace) => {
      setFiles({});
      applyWorkspace(workspace);
      toast({ title: 'Title and closing preparation saved', description: 'Buyer Plan tasks and the title/survey milestone were reconciled.' });
    },
    onError: (error) => toast({ title: 'Unable to save preparation', description: error instanceof Error ? error.message : 'Review the information and try again.', variant: 'destructive' }),
  });
  const issueMutation = useMutation({
    mutationFn: async (input: BuyerTitleEscrowIssueInput) => {
      const response = await api.createBuyerTitleEscrowIssue(propertyId, input);
      if (!response.success) throw new Error(response.message || 'Unable to add the title or closing question.');
      return response.data;
    },
    onSuccess: (workspace) => {
      applyWorkspace(workspace);
      toast({ title: 'Question recorded', description: 'Route it to the attorney, title, settlement, or escrow professional.' });
    },
    onError: (error) => toast({ title: 'Unable to add question', description: error instanceof Error ? error.message : 'Try again.', variant: 'destructive' }),
  });
  const issueStatusMutation = useMutation({
    mutationFn: async ({ issueId, status }: { issueId: string; status: BuyerTitleIssueStatus }) => {
      const response = await api.updateBuyerTitleEscrowIssue(propertyId, issueId, { status });
      if (!response.success) throw new Error(response.message || 'Unable to update the question.');
      return response.data;
    },
    onSuccess: applyWorkspace,
    onError: (error) => toast({ title: 'Unable to update question', description: error instanceof Error ? error.message : 'Try again.', variant: 'destructive' }),
  });

  const data = workspaceQuery.data;
  const workspace = data?.workspace;
  const contact = data?.contact;
  const documentName = (id: string | null | undefined) => data?.documents.find((document) => document.id === id)?.name;
  const openIssues = workspace?.issues.filter((issue) => ['OPEN', 'PROFESSIONAL_REVIEW'].includes(issue.status)) ?? [];
  const titleReceived = Boolean(workspace?.titleCommitmentDocumentId || (workspace && workspace.titleReviewStatus !== 'NOT_RECEIVED'));
  const titleReviewed = workspace?.titleReviewStatus === 'REVIEWED_WITH_PROFESSIONAL';

  return <Card className="border-sky-200 bg-sky-50/20">
    <CardHeader><CardTitle className="text-lg">Get title and closing details ready</CardTitle></CardHeader>
    <CardContent className="space-y-5">
      <BuyerWorkspaceGuidance
        eyebrow="What matters now"
        title={!contact ? 'Confirm who is handling title and closing' : !titleReceived ? 'Upload the title report when it arrives' : openIssues.length ? 'Route the open questions to your professional' : !titleReviewed ? 'Review the title report with your professional' : 'Title preparation is recorded'}
        description="C2C uses the responsible professional, received documents, appointment and open questions to organize readiness and surface blockers. It does not interpret title exceptions or decide that title is clear."
        status={openIssues.length ? `${openIssues.length} question${openIssues.length === 1 ? '' : 's'} open` : titleReviewed ? 'Professional review recorded' : 'Preparation needed'}
        steps={[
          { label: 'Know who handles closing', complete: Boolean(contact), detail: 'This is the person to ask about title, survey and local requirements.' },
          { label: 'Upload the title report', complete: titleReceived, detail: 'Keep the source document with this property.' },
          { label: 'Resolve consequential questions', complete: titleReviewed && openIssues.length === 0, detail: 'Only buyer-recorded questions and blockers appear here.' },
        ]}
      />
      <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-sm text-amber-950">
        <p className="font-medium">Preparation organizer—not legal or title review.</p>
        <p className="mt-1 text-xs">ContractToCozy does not interpret exceptions, give legal advice, certify clear title, or validate wiring instructions. Confirm every payment instruction using a trusted phone number you obtained independently; never store wire instructions here.</p>
      </div>

      <BuyerWorkspaceDetails summary="Contact metadata, survey and HOA applicability, appointment logistics, documents and question entry are available when they affect your next step.">
      <div className="space-y-5">
      <form key={workspace?.updatedAt ?? 'new-title-workspace'} className="space-y-5" onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const contactName = String(form.get('contactName') ?? '').trim();
        workspaceMutation.mutate({
          contact: contactName ? {
            role: String(form.get('contactRole')) as 'ATTORNEY' | 'TITLE_ESCROW',
            name: contactName,
            company: String(form.get('contactCompany') ?? '').trim() || null,
            email: String(form.get('contactEmail') ?? '').trim() || null,
            phone: String(form.get('contactPhone') ?? '').trim() || null,
            notes: String(form.get('contactNotes') ?? '').trim() || null,
          } : null,
          earnestMoneyConfirmed: form.has('earnestMoneyConfirmed'),
          titleReviewStatus: String(form.get('titleReviewStatus')) as BuyerTitleReviewStatus,
          surveyRequirement: String(form.get('surveyRequirement')) as BuyerTitleRequirementStatus,
          associationRequirement: String(form.get('associationRequirement')) as BuyerTitleRequirementStatus,
          associationReviewed: form.has('associationReviewed'),
          localRequirementsNotes: String(form.get('localRequirementsNotes') ?? '').trim() || null,
          closingAppointmentAt: datetimeIso(form.get('closingAppointmentAt')),
          closingAppointmentFormat: String(form.get('closingAppointmentFormat')) as BuyerClosingAppointmentFormat,
          closingLocation: String(form.get('closingLocation') ?? '').trim() || null,
          possessionAt: datetimeIso(form.get('possessionAt')),
        });
      }}>
        <div>
          <p className="text-sm font-medium">Responsible professional</p>
          <div className="mt-2 grid gap-3 md:grid-cols-3">
            <label className="space-y-1 text-sm"><span>Role</span><select name="contactRole" defaultValue={contact?.role ?? 'TITLE_ESCROW'} disabled={readOnly} className="h-10 w-full rounded-md border bg-background px-3"><option value="TITLE_ESCROW">Title / settlement / escrow</option><option value="ATTORNEY">Attorney</option></select></label>
            <label className="space-y-1 text-sm"><span>Name</span><Input name="contactName" defaultValue={contact?.name ?? ''} maxLength={160} disabled={readOnly} /></label>
            <label className="space-y-1 text-sm"><span>Company</span><Input name="contactCompany" defaultValue={contact?.company ?? ''} maxLength={160} disabled={readOnly} /></label>
            <label className="space-y-1 text-sm"><span>Email</span><Input name="contactEmail" type="email" defaultValue={contact?.email ?? ''} disabled={readOnly} /></label>
            <label className="space-y-1 text-sm"><span>Phone</span><Input name="contactPhone" defaultValue={contact?.phone ?? ''} disabled={readOnly} /></label>
            <label className="space-y-1 text-sm"><span>Contact notes</span><Input name="contactNotes" defaultValue={contact?.notes ?? ''} disabled={readOnly} /></label>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <label className="space-y-1 text-sm"><span>Title report status</span><select name="titleReviewStatus" defaultValue={workspace?.titleReviewStatus ?? 'NOT_RECEIVED'} disabled={readOnly} className="h-10 w-full rounded-md border bg-background px-3"><option value="NOT_RECEIVED">Not received</option><option value="RECEIVED">Received</option><option value="QUESTIONS_OPEN">Questions open</option><option value="REVIEWED_WITH_PROFESSIONAL">Reviewed with professional</option></select></label>
          <label className="space-y-1 text-sm"><span>Survey</span><select name="surveyRequirement" defaultValue={workspace?.surveyRequirement ?? 'UNKNOWN'} disabled={readOnly} className="h-10 w-full rounded-md border bg-background px-3"><option value="UNKNOWN">Not confirmed</option><option value="REQUIRED">Required</option><option value="NOT_REQUIRED">Not required</option></select></label>
          <label className="space-y-1 text-sm"><span>Association / HOA records</span><select name="associationRequirement" defaultValue={workspace?.associationRequirement ?? 'UNKNOWN'} disabled={readOnly} className="h-10 w-full rounded-md border bg-background px-3"><option value="UNKNOWN">Not confirmed</option><option value="REQUIRED">Required</option><option value="NOT_REQUIRED">Not required</option></select></label>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {([
            ['titleCommitmentDocumentId', 'Title commitment / report', 'CONTRACT'],
            ['surveyDocumentId', 'Survey', 'OTHER'],
            ['associationDocumentId', 'Association / HOA records', 'OTHER'],
          ] as const).map(([slot, label]) => <label key={slot} className="space-y-1 text-sm"><span>{label}</span><Input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" disabled={readOnly} onChange={(event) => setFiles((current) => ({ ...current, [slot]: event.target.files?.[0] }))} />{documentName(workspace?.[slot]) && <span className="block text-xs text-muted-foreground">Current: {documentName(workspace?.[slot])}</span>}</label>)}
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <label className="space-y-1 text-sm"><span>Closing appointment</span><Input name="closingAppointmentAt" type="datetime-local" defaultValue={datetimeInput(workspace?.closingAppointmentAt)} disabled={readOnly} /></label>
          <label className="space-y-1 text-sm"><span>Format</span><select name="closingAppointmentFormat" defaultValue={workspace?.closingAppointmentFormat ?? 'UNKNOWN'} disabled={readOnly} className="h-10 w-full rounded-md border bg-background px-3"><option value="UNKNOWN">Not confirmed</option><option value="IN_PERSON">In person</option><option value="REMOTE">Remote</option><option value="HYBRID">Hybrid</option></select></label>
          <label className="space-y-1 text-sm"><span>Location or meeting details</span><Input name="closingLocation" defaultValue={workspace?.closingLocation ?? ''} disabled={readOnly} placeholder="Do not enter wiring instructions" /></label>
          <label className="space-y-1 text-sm"><span>Expected possession</span><Input name="possessionAt" type="datetime-local" defaultValue={datetimeInput(workspace?.possessionAt)} disabled={readOnly} /></label>
          <label className="space-y-1 text-sm md:col-span-2"><span>Local or transaction-specific requirements</span><Input name="localRequirementsNotes" defaultValue={workspace?.localRequirementsNotes ?? ''} disabled={readOnly} placeholder="Ask your attorney or settlement professional what applies" /></label>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-4 text-sm"><label className="flex items-center gap-2"><input name="earnestMoneyConfirmed" type="checkbox" defaultChecked={Boolean(workspace?.earnestMoneyConfirmedAt)} disabled={readOnly} />Earnest money delivery confirmed independently</label><label className="flex items-center gap-2"><input name="associationReviewed" type="checkbox" defaultChecked={Boolean(workspace?.associationReviewedAt)} disabled={readOnly} />Association records reviewed with professional</label></div>
          <Button type="submit" disabled={readOnly || workspaceMutation.isPending}>{workspaceMutation.isPending ? 'Saving…' : 'Save closing preparation'}</Button>
        </div>
      </form>

      <form className="grid gap-3 border-t pt-4 md:grid-cols-3" onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        issueMutation.mutate({
          category: String(form.get('category')) as BuyerTitleIssueCategory,
          title: String(form.get('title') ?? '').trim(),
          notes: String(form.get('notes') ?? '').trim() || null,
          dueAt: dateIso(form.get('dueAt')),
          blocking: form.has('blocking'),
        });
        event.currentTarget.reset();
      }}>
        <label className="space-y-1 text-sm"><span>Question category</span><select name="category" defaultValue="TITLE_EXCEPTION" disabled={readOnly} className="h-10 w-full rounded-md border bg-background px-3"><option value="TITLE_EXCEPTION">Title exception</option><option value="LIEN_JUDGMENT">Lien / judgment</option><option value="EASEMENT">Easement</option><option value="VESTING_DEED_NAME">Vesting / deed name</option><option value="LEGAL_DESCRIPTION">Legal description</option><option value="SURVEY">Survey</option><option value="ASSOCIATION">Association / HOA</option><option value="MUNICIPAL_PERMIT_COO">Municipal / permit / COO</option><option value="SEPTIC_WELL">Septic / well</option><option value="OTHER">Other</option></select></label>
        <label className="space-y-1 text-sm"><span>Question or follow-up</span><Input name="title" required maxLength={200} disabled={readOnly} /></label>
        <label className="space-y-1 text-sm"><span>Due date</span><Input name="dueAt" type="date" disabled={readOnly} /></label>
        <label className="space-y-1 text-sm md:col-span-2"><span>Notes for the professional</span><Input name="notes" maxLength={2000} disabled={readOnly} /></label>
        <div className="flex items-end justify-between gap-2"><label className="flex items-center gap-2 text-sm"><input name="blocking" type="checkbox" disabled={readOnly} />Blocks closing preparation</label><Button type="submit" variant="outline" disabled={readOnly || issueMutation.isPending}>Add question</Button></div>
      </form>
      </div>
      </BuyerWorkspaceDetails>

      <div className="space-y-2">
        {workspace?.issues.map((issue) => {
          const unresolved = ['OPEN', 'PROFESSIONAL_REVIEW'].includes(issue.status);
          const overdue = Boolean(issue.dueAt && new Date(issue.dueAt) < new Date());
          return <div key={issue.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-background p-3 text-sm"><div><p className="font-medium">{issue.title}</p><p className="text-xs text-muted-foreground">{issue.category.replace(/_/g, ' ').toLowerCase()}{issue.dueAt ? ` · due ${issue.dueAt.slice(0, 10)}` : ''}{overdue && unresolved ? ' · overdue' : ''}</p></div><div className="flex flex-wrap gap-2"><Badge variant={(issue.blocking || overdue) && unresolved ? 'destructive' : 'secondary'}>{issue.status.replace(/_/g, ' ')}</Badge>{unresolved && <><Button size="sm" variant="outline" disabled={readOnly || issueStatusMutation.isPending} onClick={() => issueStatusMutation.mutate({ issueId: issue.id, status: 'PROFESSIONAL_REVIEW' })}>With professional</Button><Button size="sm" disabled={readOnly || issueStatusMutation.isPending} onClick={() => issueStatusMutation.mutate({ issueId: issue.id, status: 'RESOLVED' })}>Resolved</Button><Button size="sm" variant="ghost" disabled={readOnly || issueStatusMutation.isPending} onClick={() => issueStatusMutation.mutate({ issueId: issue.id, status: 'WAIVED' })}>Waived</Button></>}</div></div>;
        })}
        {!workspace?.issues.length && <p className="text-sm text-muted-foreground">No title, survey, association, or closing questions recorded.</p>}
      </div>
    </CardContent>
  </Card>;
}
