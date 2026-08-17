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
  BuyerWalkthroughIssueCategory,
  BuyerWalkthroughIssueStatus,
  BuyerWalkthroughObservationCategory,
  BuyerWalkthroughObservationStatus,
  BuyerWalkthroughWorkspaceResponse,
} from '@/types';

const datetimeInput = (value: string | null | undefined) => value?.slice(0, 16) ?? '';
const datetimeIso = (value: FormDataEntryValue | null) => {
  const text = String(value ?? '');
  return text ? new Date(text).toISOString() : null;
};
const lines = (value: FormDataEntryValue | null) => String(value ?? '').split(/\n|,/).map((item) => item.trim()).filter(Boolean);

export function BuyerWalkthroughCenter({ propertyId, readOnly }: { propertyId: string; readOnly: boolean }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const queryKey = ['buyer-final-walkthrough', propertyId];
  const [observationFile, setObservationFile] = useState<File | null>(null);
  const [issueFile, setIssueFile] = useState<File | null>(null);
  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const response = await api.getBuyerWalkthrough(propertyId);
      if (!response.success) throw new Error(response.message || 'Unable to load final walkthrough.');
      return response.data;
    },
  });
  const apply = (data: BuyerWalkthroughWorkspaceResponse) => {
    queryClient.setQueryData(queryKey, data);
    void queryClient.invalidateQueries({ queryKey: ['buyer-plan-overview', propertyId] });
  };
  const upload = async (file: File, name: string) => {
    const response = await api.uploadDocument(file, { propertyId, type: 'PHOTO', name, description: 'Buyer-recorded final walkthrough evidence; not a professional condition or repair certification.' });
    if (!response.success || !response.data?.id) throw new Error(`Unable to upload ${name}.`);
    return response.data.id;
  };
  const workspaceMutation = useMutation({
    mutationFn: async (input: Parameters<typeof api.updateBuyerWalkthrough>[1]) => {
      const response = await api.updateBuyerWalkthrough(propertyId, input);
      if (!response.success) throw new Error(response.message || 'Unable to update walkthrough preparation.');
      return response.data;
    },
    onSuccess: (data) => { apply(data); toast({ title: 'Walkthrough preparation saved' }); },
    onError: (error) => toast({ title: 'Unable to save walkthrough', description: error instanceof Error ? error.message : 'Try again.', variant: 'destructive' }),
  });
  const observationMutation = useMutation({
    mutationFn: async (input: { area: string; category: BuyerWalkthroughObservationCategory; status: BuyerWalkthroughObservationStatus; notes: string | null }) => {
      const evidenceDocumentId = observationFile ? await upload(observationFile, `Walkthrough: ${input.area}`) : null;
      const response = await api.createBuyerWalkthroughObservation(propertyId, { ...input, evidenceDocumentId });
      if (!response.success) throw new Error(response.message || 'Unable to add observation.');
      return response.data;
    },
    onSuccess: (data) => { setObservationFile(null); apply(data); toast({ title: 'Observation recorded' }); },
    onError: (error) => toast({ title: 'Unable to add observation', description: error instanceof Error ? error.message : 'Try again.', variant: 'destructive' }),
  });
  const observationStatusMutation = useMutation({
    mutationFn: async ({ observationId, status }: { observationId: string; status: BuyerWalkthroughObservationStatus }) => {
      const response = await api.updateBuyerWalkthroughObservation(propertyId, observationId, { status });
      if (!response.success) throw new Error(response.message || 'Unable to update observation.');
      return response.data;
    },
    onSuccess: apply,
  });
  const issueMutation = useMutation({
    mutationFn: async (input: { sourceObservationId: string | null; inspectionFindingId: string | null; negotiationFindingId: string | null; category: BuyerWalkthroughIssueCategory; title: string; notes: string | null; blocking: boolean }) => {
      const evidenceDocumentId = issueFile ? await upload(issueFile, `Walkthrough issue: ${input.title}`) : null;
      const response = await api.createBuyerWalkthroughIssue(propertyId, { ...input, evidenceDocumentId });
      if (!response.success) throw new Error(response.message || 'Unable to add walkthrough issue.');
      return response.data;
    },
    onSuccess: (data) => { setIssueFile(null); apply(data); toast({ title: 'Walkthrough issue recorded', description: 'Route it to the buyer representative or closing professional before completing.' }); },
    onError: (error) => toast({ title: 'Unable to add issue', description: error instanceof Error ? error.message : 'Try again.', variant: 'destructive' }),
  });
  const issueStatusMutation = useMutation({
    mutationFn: async ({ issueId, status, routedToRole }: { issueId: string; status: BuyerWalkthroughIssueStatus; routedToRole?: 'BUYER_AGENT' | 'ATTORNEY' | 'TITLE_ESCROW' | 'OTHER' }) => {
      const response = await api.updateBuyerWalkthroughIssue(propertyId, issueId, { status, routedToRole });
      if (!response.success) throw new Error(response.message || 'Unable to update walkthrough issue.');
      return response.data;
    },
    onSuccess: apply,
  });
  const completeMutation = useMutation({
    mutationFn: async () => {
      const response = await api.completeBuyerWalkthrough(propertyId);
      if (!response.success) throw new Error(response.message || 'Unable to complete walkthrough.');
      return response.data;
    },
    onSuccess: (data) => { apply(data); toast({ title: 'Walkthrough recorded as complete', description: 'Any routed unresolved issues remain visible in closing readiness.' }); },
    onError: (error) => toast({ title: 'Walkthrough is not ready to complete', description: error instanceof Error ? error.message : 'Review every observation and route each issue.', variant: 'destructive' }),
  });

  const data = query.data;
  const workspace = data?.workspace;
  const evidenceName = (id: string | null) => data?.evidenceDocuments.find((document) => document.id === id)?.name;

  return <Card className="border-teal-200 bg-teal-50/20">
    <CardHeader><CardTitle className="text-lg">Final Walkthrough Companion</CardTitle></CardHeader>
    <CardContent className="space-y-5">
      <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-sm text-amber-950"><p className="font-medium">Observe, document, and escalate—do not self-certify.</p><p className="mt-1 text-xs">Record only what you can safely observe. ContractToCozy does not certify condition, repair quality, code compliance, safety, or legal remedies. Stop unsafe testing and route material changes to your buyer representative, attorney, inspector, or closing professional.</p></div>

      <form key={workspace?.updatedAt ?? 'walkthrough'} className="grid gap-3 md:grid-cols-3" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); workspaceMutation.mutate({ scheduledAt: datetimeIso(form.get('scheduledAt')), attendees: lines(form.get('attendees')), accessConfirmed: form.has('accessConfirmed'), utilitiesConfirmed: form.has('utilitiesConfirmed'), started: form.has('started'), generalNotes: String(form.get('generalNotes') ?? '').trim() || null }); }}>
        <label className="space-y-1 text-sm"><span>Walkthrough appointment</span><Input name="scheduledAt" type="datetime-local" defaultValue={datetimeInput(workspace?.scheduledAt)} disabled={readOnly} /></label>
        <label className="space-y-1 text-sm"><span>Attendees</span><Input name="attendees" defaultValue={workspace?.attendees.join(', ') ?? ''} disabled={readOnly} placeholder="Buyer, agent, inspector…" /></label>
        <label className="space-y-1 text-sm"><span>General notes</span><Input name="generalNotes" defaultValue={workspace?.generalNotes ?? ''} disabled={readOnly} /></label>
        <div className="flex flex-wrap gap-4 text-sm md:col-span-2"><label className="flex items-center gap-2"><input name="accessConfirmed" type="checkbox" defaultChecked={Boolean(workspace?.accessConfirmedAt)} disabled={readOnly} />Access confirmed</label><label className="flex items-center gap-2"><input name="utilitiesConfirmed" type="checkbox" defaultChecked={Boolean(workspace?.utilitiesConfirmedAt)} disabled={readOnly} />Needed utilities are on</label><label className="flex items-center gap-2"><input name="started" type="checkbox" defaultChecked={Boolean(workspace?.startedAt)} disabled={readOnly} />Walkthrough started</label></div>
        <div className="flex items-end"><Button type="submit" disabled={readOnly || workspaceMutation.isPending}>Save preparation</Button></div>
      </form>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-lg border bg-background p-4"><p className="text-sm font-medium">Contract and included-item context</p>{data?.context.contractDocuments.length ? <ul className="mt-2 space-y-1 text-xs text-muted-foreground">{data.context.contractDocuments.map((document) => <li key={document.id}>{document.name} · {document.verificationStatus.toLowerCase()}</li>)}</ul> : <p className="mt-2 text-xs text-muted-foreground">No canonical contract documents are attached to this property.</p>}</div>
        <div className="rounded-lg border bg-background p-4"><p className="text-sm font-medium">Inspection and seller-outcome context</p>{data?.context.findings.length ? <div className="mt-2 max-h-56 space-y-2 overflow-auto">{data.context.findings.map((finding) => <div key={finding.id} className="rounded border p-2 text-xs"><p className="font-medium">{finding.homeSystem}{finding.location ? ` · ${finding.location}` : ''}</p><p className="text-muted-foreground">{finding.inspectorDescription}</p>{finding.negotiationCaseLinks.map((link) => <p key={link.id} className="mt-1 text-teal-800">Seller outcome: {link.outcome.replace(/_/g, ' ').toLowerCase()}{link.outcomeDocument ? ` · ${link.outcomeDocument.name}` : ''}</p>)}</div>)}</div> : <p className="mt-2 text-xs text-muted-foreground">No pre-close inspection or negotiation findings are linked.</p>}</div>
      </div>

      <form className="grid gap-3 border-t pt-4 md:grid-cols-4" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); observationMutation.mutate({ area: String(form.get('area') ?? '').trim(), category: String(form.get('category')) as BuyerWalkthroughObservationCategory, status: String(form.get('status')) as BuyerWalkthroughObservationStatus, notes: String(form.get('notes') ?? '').trim() || null }); event.currentTarget.reset(); }}>
        <label className="space-y-1 text-sm"><span>Area / room</span><Input name="area" required disabled={readOnly} placeholder="Kitchen, exterior, whole property…" /></label>
        <label className="space-y-1 text-sm"><span>Check</span><select name="category" defaultValue="OVERALL_CONDITION" disabled={readOnly} className="h-10 w-full rounded-md border bg-background px-3"><option value="OVERALL_CONDITION">Overall condition</option><option value="INCLUDED_ITEMS">Included items</option><option value="AGREED_REPAIRS">Agreed repairs</option><option value="NEW_DAMAGE">New damage</option><option value="LIGHTING_ELECTRICAL">Lights / electrical</option><option value="PLUMBING">Plumbing</option><option value="HVAC_APPLIANCES">HVAC / appliances</option><option value="DOORS_WINDOWS">Doors / windows</option><option value="GARAGE_ACCESS">Garage / access devices</option><option value="SMOKE_CO">Smoke / CO devices</option><option value="OTHER">Other</option></select></label>
        <label className="space-y-1 text-sm"><span>Observation</span><select name="status" defaultValue="ACCEPTABLE" disabled={readOnly} className="h-10 w-full rounded-md border bg-background px-3"><option value="ACCEPTABLE">Appears as expected</option><option value="ISSUE">Issue observed</option><option value="NOT_APPLICABLE">Not applicable</option><option value="NOT_REVIEWED">Not reviewed</option></select></label>
        <label className="space-y-1 text-sm"><span>Photo / evidence</span><Input type="file" accept="image/*,.pdf" capture="environment" disabled={readOnly} onChange={(event) => setObservationFile(event.target.files?.[0] ?? null)} /></label>
        <label className="space-y-1 text-sm md:col-span-3"><span>Notes</span><Input name="notes" disabled={readOnly} /></label><div className="flex items-end"><Button type="submit" variant="outline" disabled={readOnly || observationMutation.isPending}>Add observation</Button></div>
      </form>

      <div className="space-y-2">{workspace?.observations.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-background p-3 text-sm"><div><p className="font-medium">{item.area} · {item.category.replace(/_/g, ' ').toLowerCase()}</p><p className="text-xs text-muted-foreground">{item.notes || 'No notes'}{item.evidenceDocumentId ? ` · ${evidenceName(item.evidenceDocumentId) ?? 'evidence attached'}` : ''}</p></div><div className="flex flex-wrap gap-2"><Badge variant={item.status === 'ISSUE' ? 'destructive' : 'secondary'}>{item.status.replace(/_/g, ' ')}</Badge>{item.status === 'NOT_REVIEWED' && <Button size="sm" variant="outline" disabled={readOnly} onClick={() => observationStatusMutation.mutate({ observationId: item.id, status: 'ACCEPTABLE' })}>Reviewed</Button>}</div></div>)}{!workspace?.observations.length && <p className="text-sm text-muted-foreground">No walkthrough observations recorded.</p>}</div>

      <form className="grid gap-3 border-t pt-4 md:grid-cols-3" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const context = String(form.get('findingContext') ?? '').split('|'); issueMutation.mutate({ sourceObservationId: String(form.get('sourceObservationId') ?? '') || null, inspectionFindingId: context[0] || null, negotiationFindingId: context[1] || null, category: String(form.get('category')) as BuyerWalkthroughIssueCategory, title: String(form.get('title') ?? '').trim(), notes: String(form.get('notes') ?? '').trim() || null, blocking: form.has('blocking') }); event.currentTarget.reset(); }}>
        <label className="space-y-1 text-sm"><span>Issue category</span><select name="category" defaultValue="NEW_DAMAGE" disabled={readOnly} className="h-10 w-full rounded-md border bg-background px-3"><option value="REPAIR_COMMITMENT">Repair commitment</option><option value="INCLUDED_ITEM">Included item</option><option value="NEW_DAMAGE">New damage</option><option value="ACCESS_UTILITY">Access / utility</option><option value="SYSTEM_SAFETY">System / safety</option><option value="CLEANLINESS">Cleanliness</option><option value="OTHER">Other</option></select></label>
        <label className="space-y-1 text-sm"><span>Source observation</span><select name="sourceObservationId" defaultValue="" disabled={readOnly} className="h-10 w-full rounded-md border bg-background px-3"><option value="">General issue</option>{workspace?.observations.map((item) => <option key={item.id} value={item.id}>{item.area} · {item.category.replace(/_/g, ' ')}</option>)}</select></label>
        <label className="space-y-1 text-sm"><span>Inspection / seller context</span><select name="findingContext" defaultValue="" disabled={readOnly} className="h-10 w-full rounded-md border bg-background px-3"><option value="">No linked finding</option>{data?.context.findings.map((finding) => <option key={finding.id} value={`${finding.id}|${finding.negotiationCaseLinks[0]?.id ?? ''}`}>{finding.homeSystem} · {finding.location ?? finding.severity}</option>)}</select></label>
        <label className="space-y-1 text-sm"><span>Issue</span><Input name="title" required disabled={readOnly} /></label><label className="space-y-1 text-sm"><span>Notes / question</span><Input name="notes" disabled={readOnly} /></label><label className="space-y-1 text-sm"><span>Photo / evidence</span><Input type="file" accept="image/*,.pdf" capture="environment" disabled={readOnly} onChange={(event) => setIssueFile(event.target.files?.[0] ?? null)} /></label>
        <div className="flex items-center justify-between gap-2 md:col-span-3"><label className="flex items-center gap-2 text-sm"><input name="blocking" type="checkbox" disabled={readOnly} />Material issue that may block closing</label><Button type="submit" variant="outline" disabled={readOnly || issueMutation.isPending}>Add issue</Button></div>
      </form>

      <div className="space-y-2">{workspace?.issues.map((item) => { const unresolved = ['OPEN', 'ROUTED_TO_PROFESSIONAL'].includes(item.status); return <div key={item.id} className="rounded-lg border bg-background p-3 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-medium">{item.title}</p><p className="text-xs text-muted-foreground">{item.category.replace(/_/g, ' ').toLowerCase()}{item.evidenceDocumentId ? ` · ${evidenceName(item.evidenceDocumentId) ?? 'evidence attached'}` : ''}</p></div><Badge variant={item.blocking && unresolved ? 'destructive' : 'secondary'}>{item.status.replace(/_/g, ' ')}</Badge></div>{unresolved && <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={readOnly} onClick={() => issueStatusMutation.mutate({ issueId: item.id, status: 'ROUTED_TO_PROFESSIONAL', routedToRole: 'BUYER_AGENT' })}>Route to buyer agent</Button><Button size="sm" variant="outline" disabled={readOnly} onClick={() => issueStatusMutation.mutate({ issueId: item.id, status: 'ROUTED_TO_PROFESSIONAL', routedToRole: 'ATTORNEY' })}>Route to attorney</Button><Button size="sm" disabled={readOnly} onClick={() => issueStatusMutation.mutate({ issueId: item.id, status: 'RESOLVED' })}>Resolved</Button><Button size="sm" variant="ghost" disabled={readOnly} onClick={() => issueStatusMutation.mutate({ issueId: item.id, status: 'ACCEPTED_AS_IS' })}>Buyer accepts as-is</Button></div>}</div>; })}{!workspace?.issues.length && <p className="text-sm text-muted-foreground">No walkthrough issues recorded.</p>}</div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4"><p className="text-xs text-muted-foreground">Completion records that every observation was reviewed and every issue was routed or dispositioned. It does not confirm closing or waive contractual rights.</p><Button disabled={readOnly || completeMutation.isPending || Boolean(workspace?.completedAt)} onClick={() => completeMutation.mutate()}>{workspace?.completedAt ? 'Walkthrough recorded complete' : completeMutation.isPending ? 'Completing…' : 'Complete walkthrough record'}</Button></div>
    </CardContent>
  </Card>;
}
