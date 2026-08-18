'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, ClipboardList, FolderLock, House } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { MilestoneCelebration } from '@/components/ui/MilestoneCelebration';
import { useToast } from '@/components/ui/use-toast';
import { useCelebration } from '@/hooks/useCelebration';
import { api } from '@/lib/api/client';
import { BuyerWorkspaceGuidance } from './BuyerWorkspaceGuidance';
import type { BuyerClosingChecklistItemStatus, BuyerClosingDayInput, BuyerClosingDayWorkspaceResponse } from '@/types';

const lines = (value: FormDataEntryValue | null) => String(value ?? '').split('\n').map((item) => item.trim()).filter(Boolean);
const localDatetime = (value = new Date()) => {
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
};
const statusOptions: Array<{ value: BuyerClosingChecklistItemStatus; label: string }> = [
  { value: 'UNKNOWN', label: 'Not confirmed' },
  { value: 'CONFIRMED', label: 'Received / confirmed' },
  { value: 'NOT_APPLICABLE', label: 'Not applicable' },
];

function StatusField({ name, label, value, disabled }: { name: string; label: string; value: BuyerClosingChecklistItemStatus; disabled: boolean }) {
  return <label className="space-y-1 text-sm"><span>{label}</span><select name={name} defaultValue={value} disabled={disabled} className="h-10 w-full rounded-md border bg-background px-3">{statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
}

export function BuyerClosingDayCenter({ propertyId, readOnly }: { propertyId: string; readOnly: boolean }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { celebration, celebrate, dismiss } = useCelebration(`buyer-closing-${propertyId}`);
  const [signedFile, setSignedFile] = useState<File | null>(null);
  const queryKey = ['buyer-closing-day', propertyId];
  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const response = await api.getBuyerClosingDay(propertyId);
      if (!response.success) throw new Error(response.message || 'Unable to load Closing Day Companion.');
      return response.data;
    },
  });
  const apply = (data: BuyerClosingDayWorkspaceResponse) => {
    queryClient.setQueryData(queryKey, data);
    void queryClient.invalidateQueries({ queryKey: ['buyer-plan-overview', propertyId] });
  };
  const saveMutation = useMutation({
    mutationFn: async (input: BuyerClosingDayInput) => {
      let signedClosingDocumentId: string | undefined;
      if (signedFile) {
        const upload = await api.uploadDocument(signedFile, {
          propertyId,
          type: 'CONTRACT',
          name: signedFile.name || 'Signed closing record',
          description: 'Buyer-supplied signed closing record. ContractToCozy does not interpret its legal effect.',
        });
        if (!upload.success || !upload.data?.id) throw new Error('Unable to upload the signed closing record.');
        signedClosingDocumentId = upload.data.id;
      }
      const response = await api.updateBuyerClosingDay(propertyId, { ...input, ...(signedClosingDocumentId ? { signedClosingDocumentId } : {}) });
      if (!response.success) throw new Error(response.message || 'Unable to save Closing Day preparation.');
      return response.data;
    },
    onSuccess: (data) => { setSignedFile(null); apply(data); toast({ title: 'Closing Day preparation saved' }); },
    onError: (error) => toast({ title: 'Unable to save Closing Day', description: error instanceof Error ? error.message : 'Try again.', variant: 'destructive' }),
  });
  const confirmMutation = useMutation({
    mutationFn: async ({ closedAt, confirmationNotes }: { closedAt: string; confirmationNotes: string | null }) => {
      const response = await api.confirmBuyerProfessionalClose(propertyId, { professionalClosingComplete: true, closedAt, confirmationNotes });
      if (!response.success) throw new Error(response.message || 'Unable to confirm professional close.');
      return response.data;
    },
    onSuccess: (data) => {
      apply(data);
      void queryClient.invalidateQueries({ queryKey: ['buyer-closing-home', propertyId] });
      celebrate('closing');
      toast({ title: 'Professional closing recorded', description: 'This property is now presented as a recent home. Closing records remain available.' });
    },
    onError: (error) => toast({ title: 'Close confirmation not recorded', description: error instanceof Error ? error.message : 'Complete every required confirmation.', variant: 'destructive' }),
  });

  if (query.isLoading) return <Card><CardHeader><CardTitle className="text-lg">Closing Day Companion</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Loading closing preparation…</p></CardContent></Card>;
  if (query.isError || !query.data) return <Card><CardHeader><CardTitle className="text-lg">Closing Day Companion</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Closing Day preparation is temporarily unavailable.</p></CardContent></Card>;

  const data = query.data;
  const workspace = data.workspace;
  const closed = Boolean(workspace?.professionalClosingConfirmedAt);
  return <><Card className={closed ? 'border-emerald-300 bg-emerald-50/30' : 'border-blue-200 bg-blue-50/20'}>
    <CardHeader><CardTitle className="flex flex-wrap items-center justify-between gap-2 text-lg"><span>Closing Day Companion</span><Badge variant={closed ? 'default' : 'secondary'}>{closed ? 'Professional close recorded' : 'Preparation in progress'}</Badge></CardTitle></CardHeader>
    <CardContent className="space-y-5">
      <BuyerWorkspaceGuidance
        eyebrow="What matters now"
        title={closed ? 'Your professional close is recorded' : data.blockers.length ? 'Review the recorded blockers with your closing professional' : !data.appointment?.scheduledAt ? 'Confirm the closing appointment' : 'Prepare only what you need for closing day'}
        description="C2C brings the appointment, trusted contact, funds readiness, blockers and possession timing together. The closing professional remains the source of truth for whether closing is complete."
        status={closed ? 'Welcome home' : data.blockers.length ? `${data.blockers.length} blocker${data.blockers.length === 1 ? '' : 's'}` : 'Closing preparation'}
        steps={[
          { label: 'Confirm appointment and trusted contact', complete: Boolean(data.appointment?.scheduledAt && data.appointment?.trustedContact), detail: 'Use a known number if payment instructions change.' },
          { label: 'Review funds, documents and questions', complete: Boolean(workspace?.fundsReadinessReviewed && workspace.requiredDocumentsReady && workspace.questionsResolved), detail: 'Sensitive account information never belongs here.' },
          { label: 'Record professional close', complete: closed, detail: 'A scheduled date or signing alone does not complete the purchase.' },
        ]}
      />
      <p className="text-sm text-muted-foreground">Prepare the appointment, record what you received, and preserve signed copies. This workflow never tells you whether to close or interprets the legal effect of a document.</p>

      <div className="grid gap-3 rounded-lg border bg-background p-3 text-sm md:grid-cols-2">
        <div><p className="font-medium">Appointment</p><p>{data.appointment?.scheduledAt ? new Date(data.appointment.scheduledAt).toLocaleString() : 'Time not recorded'} · {data.appointment?.format.replace(/_/g, ' ').toLowerCase() ?? 'method unknown'}</p><p className="text-xs text-muted-foreground">{data.appointment?.location || 'Location or remote details not recorded'}</p></div>
        <div><p className="font-medium">Trusted last-minute contact</p><p>{data.appointment?.trustedContact?.name ?? 'Not recorded'}{data.appointment?.trustedContact?.company ? ` · ${data.appointment.trustedContact.company}` : ''}</p><p className="text-xs text-muted-foreground">Use a known phone number or secure channel; never rely only on changed emailed instructions.</p></div>
        <div><p className="font-medium">Possession</p><p>{data.appointment?.possessionAt ? new Date(data.appointment.possessionAt).toLocaleString() : 'Timing not recorded in Title & Escrow'}</p></div>
        <div><p className="font-medium">Funds readiness</p><p>{data.fundsReadiness?.status.replace(/_/g, ' ').toLowerCase() ?? 'Not yet recorded'}</p><p className="text-xs text-muted-foreground">{data.fundsReadiness?.statusReason}</p></div>
      </div>

      {data.blockers.length > 0 && <div className="rounded-lg border border-amber-300 bg-amber-50 p-3"><p className="text-sm font-medium">Review {data.blockers.length} recorded blocker(s) with the responsible professional</p><div className="mt-2 space-y-1">{data.blockers.map((blocker) => <p key={blocker.id} className="text-xs">• {blocker.title} — {blocker.status.replace(/_/g, ' ').toLowerCase()}</p>)}</div><p className="mt-2 text-xs text-muted-foreground">ContractToCozy does not decide whether a blocker prevents closing.</p></div>}

      {!closed && <form key={workspace?.updatedAt ?? 'new-closing-day'} className="space-y-4" onSubmit={(event) => {
        event.preventDefault(); const form = new FormData(event.currentTarget);
        saveMutation.mutate({
          attendees: lines(form.get('attendees')),
          requiredDocuments: lines(form.get('requiredDocuments')),
          questions: lines(form.get('questions')),
          identificationReady: form.has('identificationReady'), requiredDocumentsReady: form.has('requiredDocumentsReady'),
          fundsReadinessReviewed: form.has('fundsReadinessReviewed'), blockersReviewed: form.has('blockersReviewed'), questionsResolved: form.has('questionsResolved'),
          signingCompleted: form.has('signingCompleted'), copiesReceived: form.has('copiesReceived'), possessionConfirmed: form.has('possessionConfirmed'),
          keysStatus: String(form.get('keysStatus')) as BuyerClosingChecklistItemStatus,
          remotesStatus: String(form.get('remotesStatus')) as BuyerClosingChecklistItemStatus,
          accessCodesStatus: String(form.get('accessCodesStatus')) as BuyerClosingChecklistItemStatus,
          mailboxAccessStatus: String(form.get('mailboxAccessStatus')) as BuyerClosingChecklistItemStatus,
          warrantiesManualsStatus: String(form.get('warrantiesManualsStatus')) as BuyerClosingChecklistItemStatus,
          preparationNotes: String(form.get('preparationNotes') ?? '').trim() || null,
        });
      }}>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="space-y-1 text-sm"><span>Attendees (one per line)</span><textarea name="attendees" defaultValue={workspace?.attendees.join('\n') ?? ''} rows={3} disabled={readOnly} className="w-full rounded-md border bg-background p-2" /></label>
          <label className="space-y-1 text-sm"><span>Required documents (one per line)</span><textarea name="requiredDocuments" defaultValue={workspace?.requiredDocuments.join('\n') ?? ''} rows={3} disabled={readOnly} className="w-full rounded-md border bg-background p-2" /></label>
          <label className="space-y-1 text-sm"><span>Questions for professionals</span><textarea name="questions" defaultValue={workspace?.questions.join('\n') ?? ''} rows={3} disabled={readOnly} className="w-full rounded-md border bg-background p-2" /></label>
        </div>
        <div className="grid gap-2 md:grid-cols-3">
          {([
            ['identificationReady', 'Required identification is ready'], ['requiredDocumentsReady', 'Required documents are ready'],
            ['fundsReadinessReviewed', 'Funds readiness and trusted instructions reviewed'], ['blockersReviewed', 'Recorded blockers reviewed with professionals'],
            ['questionsResolved', 'Closing questions resolved'], ['signingCompleted', 'Professional signing process completed'],
            ['copiesReceived', 'Signed copies received'], ['possessionConfirmed', 'Possession arrangements confirmed'],
          ] as const).map(([name, label]) => <label key={name} className="flex items-start gap-2 rounded border bg-background p-2 text-sm"><input name={name} type="checkbox" defaultChecked={workspace?.[name] ?? false} disabled={readOnly} className="mt-1" />{label}</label>)}
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <StatusField name="keysStatus" label="Keys" value={workspace?.keysStatus ?? 'UNKNOWN'} disabled={readOnly} />
          <StatusField name="remotesStatus" label="Remotes" value={workspace?.remotesStatus ?? 'UNKNOWN'} disabled={readOnly} />
          <StatusField name="accessCodesStatus" label="Access codes" value={workspace?.accessCodesStatus ?? 'UNKNOWN'} disabled={readOnly} />
          <StatusField name="mailboxAccessStatus" label="Mailbox access" value={workspace?.mailboxAccessStatus ?? 'UNKNOWN'} disabled={readOnly} />
          <StatusField name="warrantiesManualsStatus" label="Warranties and manuals" value={workspace?.warrantiesManualsStatus ?? 'UNKNOWN'} disabled={readOnly} />
        </div>
        <div className="space-y-2 rounded-lg border border-dashed bg-background p-3"><p className="text-sm font-medium">Signed closing record</p><Input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" disabled={readOnly} onChange={(event) => setSignedFile(event.target.files?.[0] ?? null)} />{data.signedDocument && <p className="text-xs text-muted-foreground">Saved: {data.signedDocument.name}</p>}<p className="text-xs text-muted-foreground">Store the record only—ContractToCozy does not interpret signatures or legal effect.</p></div>
        <label className="space-y-1 text-sm"><span>Preparation notes</span><textarea name="preparationNotes" defaultValue={workspace?.preparationNotes ?? ''} rows={3} disabled={readOnly} className="w-full rounded-md border bg-background p-2" /></label>
        <Button type="submit" disabled={readOnly || saveMutation.isPending}>{saveMutation.isPending ? 'Saving…' : 'Save Closing Day preparation'}</Button>
      </form>}

      {!closed && workspace && <form className="space-y-3 rounded-lg border-2 border-emerald-300 bg-emerald-50 p-4" onSubmit={(event) => {
        event.preventDefault(); const form = new FormData(event.currentTarget); if (!form.has('professionalClosingComplete')) return;
        confirmMutation.mutate({ closedAt: new Date(String(form.get('closedAt'))).toISOString(), confirmationNotes: String(form.get('confirmationNotes') ?? '').trim() || null });
      }}>
        <div><p className="font-semibold">Explicit professional-close confirmation</p><p className="text-xs text-muted-foreground">Use this only after the professional closing process is actually complete. A scheduled date, signing appointment, funds transfer, or clear-to-close status does not confirm legal closing.</p></div>
        <label className="space-y-1 text-sm"><span>Professional closing completed at</span><Input name="closedAt" type="datetime-local" max={localDatetime()} defaultValue={localDatetime()} disabled={readOnly} required /></label>
        <label className="flex items-start gap-2 text-sm"><input name="professionalClosingComplete" type="checkbox" disabled={readOnly} required className="mt-1" />I explicitly confirm that the professional closing process is complete.</label>
        <label className="space-y-1 text-sm"><span>Confirmation notes (optional)</span><textarea name="confirmationNotes" rows={2} disabled={readOnly} className="w-full rounded-md border bg-background p-2" /></label>
        <Button type="submit" disabled={readOnly || confirmMutation.isPending}>{confirmMutation.isPending ? 'Recording…' : 'Confirm professional close'}</Button>
      </form>}

      {closed && <div className="space-y-4 rounded-xl border border-emerald-300 bg-emerald-50 p-5">
        <div><p className="flex items-center gap-2 text-lg font-semibold text-emerald-950"><House className="h-5 w-5" />Welcome home</p><p className="mt-1 text-sm text-emerald-900">Professional close was recorded effective {workspace?.closeEffectiveAt ? new Date(workspace.closeEffectiveAt).toLocaleString() : 'time unavailable'}. A durable purchase-completion milestone and its signed-record evidence are now preserved in this home’s history.</p></div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Button asChild><Link href={`/dashboard/properties/${propertyId}/buyer-plan`}><ClipboardList className="mr-2 h-4 w-4" />First 90-day plan</Link></Button>
          <Button asChild variant="outline"><Link href={`/dashboard/properties/${propertyId}/timeline`}>View home milestone</Link></Button>
          <Button asChild variant="outline"><Link href={`/dashboard/properties/${propertyId}/tools/home-records`}><FolderLock className="mr-2 h-4 w-4" />Home Records</Link></Button>
          <Button asChild variant="outline"><Link href={`/dashboard/properties/${propertyId}/home-operations`}>Home Operations <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
        </div>
        <p className="text-xs text-emerald-800">Closing evidence stays intact while move-in, safety, setup, and recurring-care work continue from the same property plan.</p>
      </div>}
      <p className="text-xs text-muted-foreground">Never enter identity-document numbers, account or routing numbers, passwords, security codes, or full wire instructions. {data.disclaimer}</p>
    </CardContent>
  </Card><MilestoneCelebration type={celebration.type} isOpen={celebration.isOpen} onClose={dismiss} /></>;
}
