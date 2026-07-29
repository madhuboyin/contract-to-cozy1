'use client';

// apps/frontend/src/app/(dashboard)/dashboard/admin/savings-benefits/page.tsx
//
// Admin console for the Savings and Benefits reviewed source registry
// (HIDDEN_SAVINGS_AND_BENEFITS_CAPABILITY_AUDIT_AND_IMPLEMENTATION_PLAN.md
// Slice 2). Three tabs in one page (Sources / Programs / Review queue) since
// the resource surface is smaller than Knowledge Hub's — mirrors that
// workspace's patterns (AdminConsoleShell, useAdminGuard, ReasonConfirmDialog).

import React, { useState } from 'react';
import { Landmark, Loader2, Plus, Trash2 } from 'lucide-react';
import { useAdminGuard } from '@/hooks/useAdminGuard';
import { AdminConsoleShell, AdminRouteState } from '@/components/ops/AdminConsoleShell';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  useCreateSavingsBenefitsProgram,
  useCreateSavingsBenefitsSource,
  useSavingsBenefitsPrograms,
  useSavingsBenefitsQueues,
  useSavingsBenefitsSources,
  useTransitionSavingsBenefitsProgram,
  useUpdateSavingsBenefitsProgram,
  useUpdateSavingsBenefitsSource,
} from '@/hooks/useSavingsBenefitsAdmin';
import type {
  AdminProgramInput,
  AdminProgramListItem,
  AdminProgramRuleInput,
  AdminSourceInput,
  AdminSourceListItem,
  EditorialQueueItem,
  LifecycleAction,
} from '@/lib/api/savingsBenefitsAdmin';

const SOURCE_KINDS = [
  'OFFICIAL_GOVERNMENT',
  'OFFICIAL_UTILITY',
  'OFFICIAL_NONPROFIT',
  'CARRIER_MANUFACTURER',
  'LICENSED_MARKET_PARTNER',
  'PUBLIC_BENCHMARK',
] as const;

const CATEGORIES = [
  'TAX_EXEMPTION',
  'REBATE',
  'UTILITY_INCENTIVE',
  'INSURANCE_DISCOUNT',
  'ENERGY_CREDIT',
  'LOCAL_GRANT',
  'HISTORIC_BENEFIT',
  'STORM_RESILIENCE',
] as const;

const REGION_TYPES = ['COUNTRY', 'STATE', 'COUNTY', 'CITY', 'ZIP', 'UTILITY', 'HAZARD_ZONE', 'HISTORIC_DISTRICT'] as const;

const BENEFIT_TYPES = ['TAX_SAVINGS', 'TAX_CREDIT', 'REBATE', 'DISCOUNT', 'GRANT', 'CREDIT', 'OTHER'] as const;

const RULE_OPERATORS = [
  'EQUALS',
  'NOT_EQUALS',
  'IN',
  'NOT_IN',
  'GREATER_THAN',
  'GREATER_THAN_OR_EQUAL',
  'LESS_THAN',
  'LESS_THAN_OR_EQUAL',
  'EXISTS',
  'NOT_EXISTS',
  'CONTAINS',
  'BOOLEAN_IS',
] as const;

const RULE_KINDS = ['MANDATORY', 'OPTIONAL', 'DISQUALIFYING'] as const;

function emptyRule(): AdminProgramRuleInput {
  return {
    attribute: '',
    operator: 'EQUALS',
    value: '',
    kind: 'MANDATORY',
    groupKey: null,
    evidenceRequirement: null,
    homeownerExplanation: null,
    isSensitive: false,
    requiresExternalVerification: false,
    unknownHandling: 'HOLD_CANDIDATE',
  };
}

const HEALTH_TONE: Record<string, string> = {
  HEALTHY: 'bg-emerald-50 text-emerald-700',
  DEGRADED: 'bg-amber-50 text-amber-700',
  CRITICAL: 'bg-rose-50 text-rose-700',
};

const ACTION_COPY: Record<LifecycleAction, { label: string; description: string; destructive: boolean }> = {
  SUBMIT_FOR_REVIEW: { label: 'Submit for review', description: 'Sends this program to a reviewer.', destructive: false },
  REVIVE_TO_DRAFT: { label: 'Revive to draft', description: 'Brings an archived program back for editing.', destructive: false },
  APPROVE: { label: 'Approve', description: 'Marks this program approved. Publication is a separate action.', destructive: false },
  RETURN_TO_DRAFT: { label: 'Return to draft', description: 'Sends this program back to the author with your reason.', destructive: true },
  PUBLISH: { label: 'Publish', description: 'Makes this program eligible to match homeowner properties immediately.', destructive: false },
  UNPUBLISH: { label: 'Unpublish', description: 'Stops this program from matching properties; it returns to the approved queue.', destructive: true },
  ARCHIVE: { label: 'Archive', description: 'Retires this program. An author can later revive it to draft.', destructive: true },
};

function fmtDate(value: string | null): string {
  if (!value) return 'never';
  return new Date(value).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

function SourceFormDialog({
  open,
  onOpenChange,
  initial,
  onSubmit,
  pending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: AdminSourceListItem | null;
  onSubmit: (input: AdminSourceInput) => void;
  pending: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [sourceKind, setSourceKind] = useState<string>(initial?.sourceKind ?? 'OFFICIAL_GOVERNMENT');
  const [officialUrl, setOfficialUrl] = useState(initial?.officialUrl ?? '');
  const [reviewSlaDays, setReviewSlaDays] = useState(String(initial?.reviewSlaDays ?? 180));

  React.useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? '');
    setSourceKind(initial?.sourceKind ?? 'OFFICIAL_GOVERNMENT');
    setOfficialUrl(initial?.officialUrl ?? '');
    setReviewSlaDays(String(initial?.reviewSlaDays ?? 180));
  }, [open, initial]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? 'Edit source' : 'Add source'}</DialogTitle>
          <DialogDescription>
            A reviewed organization that owns one or more benefit programs. Re-saving stamps a fresh review.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. New Jersey Division of Taxation" />
          </div>
          <div>
            <Label>Source kind</Label>
            <Select value={sourceKind} onValueChange={setSourceKind}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SOURCE_KINDS.map((kind) => <SelectItem key={kind} value={kind}>{kind}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Official URL</Label>
            <Input value={officialUrl} onChange={(e) => setOfficialUrl(e.target.value)} placeholder="https://..." />
          </div>
          <div>
            <Label>Review SLA (days)</Label>
            <Input type="number" value={reviewSlaDays} onChange={(e) => setReviewSlaDays(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
          <Button
            size="sm"
            disabled={pending || !name.trim() || !officialUrl.trim()}
            onClick={() =>
              onSubmit({
                name: name.trim(),
                sourceKind: sourceKind as AdminSourceInput['sourceKind'],
                officialUrl: officialUrl.trim(),
                reviewSlaDays: Number(reviewSlaDays) || 180,
              })
            }
          >
            {pending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProgramFormDialog({
  open,
  onOpenChange,
  initial,
  sources,
  onSubmit,
  pending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: AdminProgramListItem | null;
  sources: AdminSourceListItem[];
  onSubmit: (input: AdminProgramInput) => void;
  pending: boolean;
}) {
  const [sourceId, setSourceId] = useState(initial?.source.id ?? sources[0]?.id ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [category, setCategory] = useState<string>(initial?.category ?? 'TAX_EXEMPTION');
  const [regionType, setRegionType] = useState<string>(initial?.regionType ?? 'STATE');
  const [regionValue, setRegionValue] = useState(initial?.regionValue ?? '');
  const [benefitType, setBenefitType] = useState<string>(initial?.benefitType ?? 'TAX_CREDIT');
  const [benefitMax, setBenefitMax] = useState(initial?.benefitEstimateMax?.toString() ?? '');
  const [sourceUrl, setSourceUrl] = useState(initial?.sourceUrl ?? '');
  const [eligibilityNotes, setEligibilityNotes] = useState(initial?.eligibilityNotes ?? '');
  const [exclusionGroupKey, setExclusionGroupKey] = useState(initial?.exclusionGroupKey ?? '');
  const [beneficiaryScope, setBeneficiaryScope] = useState<string>(initial?.beneficiaryScope ?? 'PROPERTY');
  const [rules, setRules] = useState<AdminProgramRuleInput[]>(
    initial?.rules?.length ? initial.rules : [emptyRule()],
  );

  React.useEffect(() => {
    if (!open) return;
    setSourceId(initial?.source.id ?? sources[0]?.id ?? '');
    setName(initial?.name ?? '');
    setCategory(initial?.category ?? 'TAX_EXEMPTION');
    setRegionType(initial?.regionType ?? 'STATE');
    setRegionValue(initial?.regionValue ?? '');
    setBenefitType(initial?.benefitType ?? 'TAX_CREDIT');
    setBenefitMax(initial?.benefitEstimateMax?.toString() ?? '');
    setSourceUrl(initial?.sourceUrl ?? '');
    setEligibilityNotes(initial?.eligibilityNotes ?? '');
    setExclusionGroupKey(initial?.exclusionGroupKey ?? '');
    setBeneficiaryScope(initial?.beneficiaryScope ?? 'PROPERTY');
    setRules(initial?.rules?.length ? initial.rules : [emptyRule()]);
  }, [open, initial, sources]);

  function updateRule(index: number, patch: Partial<AdminProgramRuleInput>) {
    setRules((prev) => prev.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)));
  }

  function removeRule(index: number) {
    setRules((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? 'Edit program' : 'Add program'}</DialogTitle>
          <DialogDescription>
            Saving never changes review status — new programs start DRAFT, edits preserve the current status.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Source</Label>
            <Select value={sourceId} onValueChange={setSourceId}>
              <SelectTrigger><SelectValue placeholder="Select a source" /></SelectTrigger>
              <SelectContent>
                {sources.map((source) => <SelectItem key={source.id} value={source.id}>{source.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Program name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Senior Freeze (Property Tax Reimbursement)" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Benefit type</Label>
              <Select value={benefitType} onValueChange={setBenefitType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{BENEFIT_TYPES.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Region type</Label>
              <Select value={regionType} onValueChange={setRegionType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{REGION_TYPES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Region value</Label>
              <Input value={regionValue} onChange={(e) => setRegionValue(e.target.value)} placeholder="e.g. NJ" />
            </div>
          </div>
          <div>
            <Label>Benefit estimate max ($, optional)</Label>
            <Input type="number" value={benefitMax} onChange={(e) => setBenefitMax(e.target.value)} />
          </div>
          <div>
            <Label>Official source URL</Label>
            <Input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://..." />
          </div>
          <div>
            <Label>Mutual-exclusion group key (optional)</Label>
            <Input
              value={exclusionGroupKey}
              onChange={(e) => setExclusionGroupKey(e.target.value)}
              placeholder="e.g. state-energy-rebate-pool-2026"
            />
            <p className="mt-1 text-xs text-slate-500">
              Programs sharing this key are treated as mutually exclusive — a homeowner can realistically
              claim only one. Leave blank if this program doesn&apos;t conflict with any other.
            </p>
          </div>
          <div>
            <Label>Who this benefit belongs to</Label>
            <Select value={beneficiaryScope} onValueChange={setBeneficiaryScope}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="PROPERTY">The property (default — re-evaluated per property)</SelectItem>
                <SelectItem value="HOUSEHOLD">The household / applicant (e.g. veteran status, income)</SelectItem>
                <SelectItem value="EITHER">Either, depending on how it's claimed</SelectItem>
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-slate-500">
              Prevents a household-level benefit (like an income or veteran-status credit) from being shown as
              if it must be reapplied for on every property, or a property-level benefit from being conflated
              with the homeowner personally.
            </p>
          </div>
          <div className="space-y-2 rounded-lg border border-slate-200 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">
                Machine-evaluated rules (property attribute match)
              </span>
              <Button type="button" variant="outline" size="sm" onClick={() => setRules((prev) => [...prev, emptyRule()])}>
                <Plus className="mr-1 h-3 w-3" /> Add rule
              </Button>
            </div>
            <p className="text-xs text-slate-500">
              Rules sharing a group key are OR&apos;d together and must share one kind. Sensitive attributes
              (income, disability, age, veteranStatus, taxFilingStatus, householdComposition, hardshipStatus,
              immigrationStatus) never resolve from property data — they only ever come from a homeowner&apos;s
              consented answer for that specific match.
            </p>
            {rules.map((rule, index) => (
              <div key={index} className="grid grid-cols-2 gap-2 rounded-md border border-slate-100 bg-slate-50/60 p-2 sm:grid-cols-6">
                <div className="col-span-2 sm:col-span-2">
                  <Label className="text-[11px]">Attribute</Label>
                  <Input value={rule.attribute} onChange={(e) => updateRule(index, { attribute: e.target.value })} placeholder="state" />
                </div>
                <div>
                  <Label className="text-[11px]">Operator</Label>
                  <Select value={rule.operator} onValueChange={(v) => updateRule(index, { operator: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{RULE_OPERATORS.map((op) => <SelectItem key={op} value={op}>{op}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[11px]">Value</Label>
                  <Input value={rule.value} onChange={(e) => updateRule(index, { value: e.target.value })} placeholder="NJ" />
                </div>
                <div>
                  <Label className="text-[11px]">Kind</Label>
                  <Select value={rule.kind ?? 'MANDATORY'} onValueChange={(v) => updateRule(index, { kind: v as AdminProgramRuleInput['kind'] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{RULE_KINDS.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="flex items-end gap-1">
                  <div className="flex-1">
                    <Label className="text-[11px]">Group key (OR)</Label>
                    <Input
                      value={rule.groupKey ?? ''}
                      onChange={(e) => updateRule(index, { groupKey: e.target.value || null })}
                      placeholder="optional"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Remove rule ${index + 1}`}
                    className="mb-0.5 shrink-0 text-rose-600 hover:text-rose-700"
                    disabled={rules.length <= 1}
                    onClick={() => removeRule(index)}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                </div>
                <div className="col-span-2 sm:col-span-2">
                  <Label className="text-[11px]">Unknown handling</Label>
                  <Select
                    value={rule.unknownHandling ?? 'HOLD_CANDIDATE'}
                    onValueChange={(value) => updateRule(index, { unknownHandling: value as AdminProgramRuleInput['unknownHandling'] })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="HOLD_CANDIDATE">Hold as candidate</SelectItem>
                      <SelectItem value="EXCLUDE">Exclude when unknown</SelectItem>
                      <SelectItem value="EXTERNAL_VERIFICATION">External verification</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2 sm:col-span-2">
                  <Label className="text-[11px]">Evidence requirement</Label>
                  <Input
                    value={rule.evidenceRequirement ?? ''}
                    onChange={(e) => updateRule(index, { evidenceRequirement: e.target.value || null })}
                    placeholder="e.g. current award letter"
                  />
                </div>
                <div className="col-span-2 sm:col-span-2">
                  <Label className="text-[11px]">Homeowner explanation</Label>
                  <Input
                    value={rule.homeownerExplanation ?? ''}
                    onChange={(e) => updateRule(index, { homeownerExplanation: e.target.value || null })}
                    placeholder="Why this criterion matters"
                  />
                </div>
                <label className="col-span-1 flex items-center gap-2 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={rule.isSensitive ?? false}
                    onChange={(e) => updateRule(index, { isSensitive: e.target.checked })}
                  />
                  Sensitive
                </label>
                <label className="col-span-1 flex items-center gap-2 text-xs text-slate-600 sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={rule.requiresExternalVerification ?? false}
                    onChange={(e) => updateRule(index, { requiresExternalVerification: e.target.checked })}
                  />
                  Must be externally verified
                </label>
              </div>
            ))}
          </div>
          <div>
            <Label>Eligibility notes (homeowner-facing, not machine-evaluated)</Label>
            <Textarea
              value={eligibilityNotes}
              onChange={(e) => setEligibilityNotes(e.target.value)}
              className="min-h-[100px]"
              placeholder="Criteria the rule engine doesn't model yet (income, age, residency, etc.) — tell the homeowner what to verify."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
          <Button
            size="sm"
            disabled={
              pending ||
              !name.trim() ||
              !regionValue.trim() ||
              !sourceId ||
              rules.some((r) => !r.attribute.trim() || (!r.value.trim() && r.operator !== 'EXISTS' && r.operator !== 'NOT_EXISTS'))
            }
            onClick={() =>
              onSubmit({
                sourceId,
                name: name.trim(),
                category,
                regionType,
                regionValue: regionValue.trim(),
                benefitType,
                benefitEstimateMax: benefitMax ? Number(benefitMax) : null,
                sourceUrl: sourceUrl.trim() || null,
                eligibilityNotes: eligibilityNotes.trim() || null,
                exclusionGroupKey: exclusionGroupKey.trim() || null,
                beneficiaryScope: beneficiaryScope as AdminProgramInput['beneficiaryScope'],
                rules: rules.map((r, index) => ({
                  attribute: r.attribute.trim(),
                  operator: r.operator,
                  value: r.value.trim(),
                  sortOrder: index,
                  kind: r.kind ?? 'MANDATORY',
                  groupKey: r.groupKey || null,
                  evidenceRequirement: r.evidenceRequirement || null,
                  homeownerExplanation: r.homeownerExplanation || null,
                  isSensitive: r.isSensitive ?? false,
                  requiresExternalVerification: r.requiresExternalVerification ?? false,
                  unknownHandling: r.unknownHandling ?? 'HOLD_CANDIDATE',
                })),
              })
            }
          >
            {pending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReasonConfirmDialog({
  target,
  onOpenChange,
  pending,
  onConfirm,
}: {
  target: { item: { name: string }; action: LifecycleAction } | null;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  const copy = target ? ACTION_COPY[target.action] : null;

  return (
    <Dialog
      open={target !== null}
      onOpenChange={(next) => {
        if (!next) setReason('');
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{copy?.label}: {target?.item.name}</DialogTitle>
          <DialogDescription>{copy?.description}</DialogDescription>
        </DialogHeader>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (required) — this is recorded in the audit log"
          className="min-h-[80px]"
        />
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
          <Button
            size="sm"
            variant={copy?.destructive ? 'destructive' : 'default'}
            disabled={pending || !reason.trim()}
            onClick={() => onConfirm(reason.trim())}
          >
            {pending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function QueueSection({
  title,
  emptyText,
  items,
  actions,
  onAction,
}: {
  title: string;
  emptyText: string;
  items: EditorialQueueItem[];
  actions: LifecycleAction[];
  onAction: (item: EditorialQueueItem, action: LifecycleAction) => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-900">{title} ({items.length})</h3>
      {items.length === 0 ? <p className="mt-2 text-xs text-slate-400">{emptyText}</p> : null}
      <ul className="mt-2 divide-y divide-slate-100">
        {items.map((item) => (
          <li key={item.id} className="flex flex-wrap items-center gap-2 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-slate-800">{item.name}</p>
              <p className="text-[11px] text-slate-400">
                {item.source.name} · {item.regionType}:{item.regionValue} · updated {fmtDate(item.updatedAt)}
              </p>
            </div>
            <Badge variant="outline" className="text-[10px]">{item.reviewStatus}</Badge>
            <span className="flex gap-1">
              {actions.map((action) => (
                <Button
                  key={action}
                  size="sm"
                  variant={ACTION_COPY[action].destructive ? 'destructive' : 'outline'}
                  className="h-7 text-[11px]"
                  onClick={() => onAction(item, action)}
                >
                  {ACTION_COPY[action].label}
                </Button>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function SavingsBenefitsAdminPage() {
  const { toast } = useToast();
  const guard = useAdminGuard({
    title: 'Savings and Benefits',
    subtitle: 'Reviewed source registry: sources, programs, and the review/publish workflow.',
  });

  const sourcesQ = useSavingsBenefitsSources();
  const programsQ = useSavingsBenefitsPrograms();
  const queuesQ = useSavingsBenefitsQueues();
  const createSourceM = useCreateSavingsBenefitsSource();
  const updateSourceM = useUpdateSavingsBenefitsSource();
  const createProgramM = useCreateSavingsBenefitsProgram();
  const updateProgramM = useUpdateSavingsBenefitsProgram();
  const transitionM = useTransitionSavingsBenefitsProgram();

  const [sourceDialog, setSourceDialog] = useState<{ open: boolean; item: AdminSourceListItem | null }>({ open: false, item: null });
  const [programDialog, setProgramDialog] = useState<{ open: boolean; item: AdminProgramListItem | null }>({ open: false, item: null });
  const [target, setTarget] = useState<{ item: EditorialQueueItem; action: LifecycleAction } | null>(null);

  if (guard.status !== 'ready') return guard.node;

  const sources = sourcesQ.data?.sources ?? [];

  return (
    <AdminConsoleShell
      title="Savings and Benefits"
      subtitle="Reviewed source registry. Only PUBLISHED programs are ever evaluated against a homeowner's property."
      chips={
        <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
          <Landmark className="h-3 w-3" />
          {queuesQ.data ? `${queuesQ.data.reviewQueue.length} in review · ${queuesQ.data.approvedQueue.length} awaiting publish` : 'Loading…'}
        </span>
      }
    >
      <Tabs defaultValue="sources">
        <TabsList>
          <TabsTrigger value="sources">Sources</TabsTrigger>
          <TabsTrigger value="programs">Programs</TabsTrigger>
          <TabsTrigger value="queue">Review queue</TabsTrigger>
        </TabsList>

        <TabsContent value="sources" className="mt-4 space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setSourceDialog({ open: true, item: null })}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Add source
            </Button>
          </div>
          {sourcesQ.isLoading ? (
            <div className="flex items-center gap-2 p-6 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading sources…
            </div>
          ) : (
            <div className="space-y-2">
              {sources.map((source) => (
                <div key={source.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800">{source.name}</p>
                    <p className="text-[11px] text-slate-400">
                      {source.sourceKind} · {source.programCount} program(s) · last reviewed {fmtDate(source.lastReviewedAt)}
                    </p>
                  </div>
                  <Badge className={`text-[10px] ${HEALTH_TONE[source.health]}`}>{source.health}</Badge>
                  <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => setSourceDialog({ open: true, item: source })}>
                    Edit
                  </Button>
                </div>
              ))}
              {sources.length === 0 ? <p className="text-xs text-slate-400">No sources yet.</p> : null}
            </div>
          )}
        </TabsContent>

        <TabsContent value="programs" className="mt-4 space-y-3">
          <div className="flex justify-end">
            <Button size="sm" disabled={sources.length === 0} onClick={() => setProgramDialog({ open: true, item: null })}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Add program
            </Button>
          </div>
          {sources.length === 0 ? (
            <p className="text-xs text-slate-400">Add a source before adding programs.</p>
          ) : null}
          {programsQ.isLoading ? (
            <div className="flex items-center gap-2 p-6 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading programs…
            </div>
          ) : (
            <div className="space-y-2">
              {(programsQ.data?.programs ?? []).map((program) => (
                <div key={program.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800">{program.name}</p>
                    <p className="text-[11px] text-slate-400">
                      {program.source.name} · {program.category} · {program.regionType}:{program.regionValue} · v{program.version}
                      {program.beneficiaryScope !== 'PROPERTY' ? ` · scope: ${program.beneficiaryScope.toLowerCase()}` : ''}
                      {program.exclusionGroupKey ? ` · excludes: ${program.exclusionGroupKey}` : ''}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-[10px]">{program.reviewStatus}</Badge>
                  {program.reviewStatus === 'PUBLISHED' ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[11px]"
                      onClick={() => setTarget({ item: program, action: 'UNPUBLISH' })}
                    >
                      Unpublish to edit
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[11px]"
                    disabled={program.reviewStatus === 'PUBLISHED'}
                    title={program.reviewStatus === 'PUBLISHED' ? 'Unpublish and return to draft before editing.' : undefined}
                    onClick={() => setProgramDialog({ open: true, item: program })}
                  >
                    Edit
                  </Button>
                </div>
              ))}
              {(programsQ.data?.programs ?? []).length === 0 ? <p className="text-xs text-slate-400">No programs yet.</p> : null}
            </div>
          )}
        </TabsContent>

        <TabsContent value="queue" className="mt-4">
          {queuesQ.isLoading ? (
            <div className="flex items-center gap-2 p-6 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading queues…
            </div>
          ) : queuesQ.isError ? (
            <AdminRouteState state="error" title="Failed to load queues" description="The request failed. Refresh to try again." />
          ) : queuesQ.data ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <QueueSection
                title="Awaiting review"
                emptyText="No programs are waiting for a review decision."
                items={queuesQ.data.reviewQueue}
                actions={['APPROVE', 'RETURN_TO_DRAFT']}
                onAction={(item, action) => setTarget({ item, action })}
              />
              <QueueSection
                title="Awaiting publish"
                emptyText="No approved programs are waiting to be published."
                items={queuesQ.data.approvedQueue}
                actions={['PUBLISH', 'RETURN_TO_DRAFT', 'ARCHIVE']}
                onAction={(item, action) => setTarget({ item, action })}
              />
            </div>
          ) : null}
        </TabsContent>
      </Tabs>

      <SourceFormDialog
        open={sourceDialog.open}
        onOpenChange={(open) => setSourceDialog((prev) => ({ ...prev, open }))}
        initial={sourceDialog.item}
        pending={createSourceM.isPending || updateSourceM.isPending}
        onSubmit={(input) => {
          const opts = {
            onSuccess: () => {
              setSourceDialog({ open: false, item: null });
              toast({ title: 'Source saved' });
            },
            onError: (err: any) => toast({ title: 'Save failed', description: err?.message, variant: 'destructive' }),
          };
          if (sourceDialog.item) updateSourceM.mutate({ sourceId: sourceDialog.item.id, input }, opts);
          else createSourceM.mutate(input, opts);
        }}
      />

      <ProgramFormDialog
        open={programDialog.open}
        onOpenChange={(open) => setProgramDialog((prev) => ({ ...prev, open }))}
        initial={programDialog.item}
        sources={sources}
        pending={createProgramM.isPending || updateProgramM.isPending}
        onSubmit={(input) => {
          const opts = {
            onSuccess: () => {
              setProgramDialog({ open: false, item: null });
              toast({ title: 'Program saved as DRAFT (if new) or unchanged status (if edited)' });
            },
            onError: (err: any) => toast({ title: 'Save failed', description: err?.message, variant: 'destructive' }),
          };
          if (programDialog.item) updateProgramM.mutate({ programId: programDialog.item.id, input }, opts);
          else createProgramM.mutate(input, opts);
        }}
      />

      <ReasonConfirmDialog
        target={target}
        onOpenChange={(next) => !next && setTarget(null)}
        pending={transitionM.isPending}
        onConfirm={(reason) => {
          if (!target) return;
          transitionM.mutate(
            { programId: target.item.id, action: target.action, reason },
            {
              onSuccess: (result) => {
                setTarget(null);
                toast({ title: 'Lifecycle updated', description: `Moved to ${result.status}.` });
              },
              onError: (err: any) => toast({ title: 'Action failed', description: err?.message, variant: 'destructive' }),
            },
          );
        }}
      />
    </AdminConsoleShell>
  );
}
