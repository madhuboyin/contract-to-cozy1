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
  useSavingsBenefitPartnerComplaints,
  useSavingsBenefitPartnerHandoffs,
  useSavingsBenefitPartners,
  useReviewSavingsBenefitsSource,
  useSavingsBenefitsOutcomeVerificationQueue,
  useSavingsBenefitsSources,
  useTransitionSavingsBenefitsProgram,
  useTransitionSavingsBenefitPartnerHandoff,
  useUpdateSavingsBenefitsProgram,
  useUpdateSavingsBenefitsSource,
  useUpsertSavingsBenefitPartner,
  useVerifySavingsBenefitsOutcome,
  useResolveSavingsBenefitPartnerComplaint,
} from '@/hooks/useSavingsBenefitsAdmin';
import type {
  AdminProgramInput,
  AdminProgramListItem,
  AdminProgramRuleInput,
  AdminSourceInput,
  AdminSourceListItem,
  OutcomeVerificationQueueItem,
  EditorialQueueItem,
  LifecycleAction,
  SavingsBenefitPartnerInput,
  SavingsBenefitPartnerItem,
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
const BENEFIT_PERIODS = ['UNKNOWN', 'ONE_TIME', 'MONTHLY', 'ANNUAL'] as const;

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

function QueuePager({
  offset,
  limit,
  total,
  onOffsetChange,
}: {
  offset: number;
  limit: number;
  total: number;
  onOffsetChange: (offset: number) => void;
}) {
  if (total <= limit) return null;
  return (
    <nav aria-label="Queue pagination" className="flex items-center justify-between gap-3 pt-2">
      <p className="text-xs text-slate-500">
        {offset + 1}–{Math.min(offset + limit, total)} of {total}
      </p>
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={offset === 0}
          onClick={() => onOffsetChange(Math.max(0, offset - limit))}
        >
          Previous
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={offset + limit >= total}
          onClick={() => onOffsetChange(offset + limit)}
        >
          Next
        </Button>
      </div>
    </nav>
  );
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
            An organization that owns one or more benefit programs. Material metadata changes invalidate the prior review and require a new attestation.
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
  const [benefitPeriod, setBenefitPeriod] = useState<string>(initial?.benefitPeriod ?? 'UNKNOWN');
  const [fundingStatus, setFundingStatus] = useState<string>(initial?.fundingStatus ?? 'UNKNOWN');
  const [applicationWindowOpensAt, setApplicationWindowOpensAt] = useState(
    initial?.applicationWindowOpensAt?.slice(0, 10) ?? '',
  );
  const [applicationWindowClosesAt, setApplicationWindowClosesAt] = useState(
    initial?.applicationWindowClosesAt?.slice(0, 10) ?? '',
  );
  const [expiresAt, setExpiresAt] = useState(initial?.expiresAt?.slice(0, 10) ?? '');
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
    setBenefitPeriod(initial?.benefitPeriod ?? 'UNKNOWN');
    setFundingStatus(initial?.fundingStatus ?? 'UNKNOWN');
    setApplicationWindowOpensAt(initial?.applicationWindowOpensAt?.slice(0, 10) ?? '');
    setApplicationWindowClosesAt(initial?.applicationWindowClosesAt?.slice(0, 10) ?? '');
    setExpiresAt(initial?.expiresAt?.slice(0, 10) ?? '');
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Benefit estimate max ($, optional)</Label>
              <Input type="number" value={benefitMax} onChange={(e) => setBenefitMax(e.target.value)} />
            </div>
            <div>
              <Label>Amount period</Label>
              <Select value={benefitPeriod} onValueChange={setBenefitPeriod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BENEFIT_PERIODS.map((period) => (
                    <SelectItem key={period} value={period}>{period}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-slate-500">
                Use UNKNOWN unless the official source clearly says whether the amount is one-time or recurring.
              </p>
            </div>
          </div>
          <div>
            <Label>Official source URL</Label>
            <Input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://..." />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="program-funding-status">Funding status</Label>
              <Select value={fundingStatus} onValueChange={setFundingStatus}>
                <SelectTrigger id="program-funding-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="UNKNOWN">Unknown—verify before relying on availability</SelectItem>
                  <SelectItem value="OPEN">Reported open</SelectItem>
                  <SelectItem value="CLOSED">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="program-expires-at">Program expires (optional)</Label>
              <Input id="program-expires-at" type="date" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} />
            </div>
            <div>
              <Label htmlFor="program-applications-open">Applications open (optional)</Label>
              <Input
                id="program-applications-open"
                type="date"
                value={applicationWindowOpensAt}
                onChange={(event) => setApplicationWindowOpensAt(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="program-application-deadline">Application deadline (optional)</Label>
              <Input
                id="program-application-deadline"
                type="date"
                value={applicationWindowClosesAt}
                onChange={(event) => setApplicationWindowClosesAt(event.target.value)}
              />
            </div>
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
                <SelectItem value="EITHER">Either, depending on how it&apos;s claimed</SelectItem>
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
                benefitPeriod: benefitPeriod as AdminProgramInput['benefitPeriod'],
                fundingStatus: fundingStatus as AdminProgramInput['fundingStatus'],
                applicationWindowOpensAt: applicationWindowOpensAt
                  ? new Date(`${applicationWindowOpensAt}T00:00:00.000Z`).toISOString()
                  : null,
                applicationWindowClosesAt: applicationWindowClosesAt
                  ? new Date(`${applicationWindowClosesAt}T23:59:59.999Z`).toISOString()
                  : null,
                expiresAt: expiresAt
                  ? new Date(`${expiresAt}T23:59:59.999Z`).toISOString()
                  : null,
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

function OperationalReasonDialog({
  open,
  title,
  description,
  pending,
  destructive = false,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  pending: boolean;
  destructive?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setReason('');
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Label htmlFor="operational-reason">Reason</Label>
        <Textarea
          id="operational-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          className="min-h-[96px]"
          placeholder="Required audit and resolution notes"
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            disabled={pending || reason.trim().length < 3}
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

function ManualDeliveryDialog({
  open,
  partnerName,
  pending,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  partnerName: string;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string, deliveryReference: string) => void;
}) {
  const [reason, setReason] = useState('');
  const [deliveryReference, setDeliveryReference] = useState('');
  const reset = () => {
    setReason('');
    setDeliveryReference('');
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm delivery to {partnerName}</DialogTitle>
          <DialogDescription>
            Confirm that only the displayed, consented fields were delivered outside the platform.
            Record a durable receipt, ticket, or external submission reference before advancing the handoff.
          </DialogDescription>
        </DialogHeader>
        <Label htmlFor="handoff-delivery-reference">Delivery reference</Label>
        <Input
          id="handoff-delivery-reference"
          value={deliveryReference}
          onChange={(event) => setDeliveryReference(event.target.value)}
          placeholder="Partner receipt, secure-transfer ticket, or submission ID"
        />
        <Label htmlFor="handoff-delivery-reason">Delivery notes</Label>
        <Textarea
          id="handoff-delivery-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          className="min-h-[96px]"
          placeholder="How and when the approved payload was delivered"
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
          <Button
            disabled={pending || reason.trim().length < 3 || deliveryReference.trim().length < 3}
            onClick={() => onConfirm(reason.trim(), deliveryReference.trim())}
          >
            {pending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            Confirm delivered
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SourceReviewDialog({
  source,
  onOpenChange,
  pending,
  onConfirm,
}: {
  source: AdminSourceListItem | null;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  return (
    <Dialog
      open={source !== null}
      onOpenChange={(next) => {
        if (!next) setReason('');
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Attest source review: {source?.name}</DialogTitle>
          <DialogDescription>
            Confirm that the official source remains active and accurate. This renews the source review SLA and is recorded in the audit log.
          </DialogDescription>
        </DialogHeader>
        <Label htmlFor="source-review-reason">Review evidence or reason</Label>
        <Textarea
          id="source-review-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="What was checked, including the official page or publication date"
          className="min-h-[80px]"
        />
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
          <Button size="sm" disabled={pending || !reason.trim()} onClick={() => onConfirm(reason.trim())}>
            {pending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            Record review
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OutcomeVerificationDialog({
  outcome,
  onOpenChange,
  pending,
  onConfirm,
}: {
  outcome: OutcomeVerificationQueueItem | null;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  return (
    <Dialog
      open={outcome !== null}
      onOpenChange={(next) => {
        if (!next) setReason('');
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Verify received outcome: {outcome?.title}</DialogTitle>
          <DialogDescription>
            Independently check the attached evidence before promoting this value into verified downstream totals.
          </DialogDescription>
        </DialogHeader>
        <Label htmlFor="outcome-verification-reason">Verification notes</Label>
        <Textarea
          id="outcome-verification-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="What evidence was checked and why it supports the recorded amount"
          className="min-h-[80px]"
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
          <Button onClick={() => onConfirm(reason.trim())} disabled={pending || reason.trim().length < 3}>
            {pending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            Verify outcome
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PartnerFormDialog({
  open,
  initial,
  pending,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  initial: SavingsBenefitPartnerItem | null;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (partnerId: string, input: SavingsBenefitPartnerInput) => void;
}) {
  const [partnerId, setPartnerId] = useState('');
  const [name, setName] = useState('');
  const [jurisdictions, setJurisdictions] = useState('');
  const [disclosureVersion, setDisclosureVersion] = useState('');
  const [compensationMayOccur, setCompensationMayOccur] = useState(true);
  const [compensationDisclosure, setCompensationDisclosure] = useState('');
  const [rankingDisclosure, setRankingDisclosure] = useState('');
  const [privacyDisclosure, setPrivacyDisclosure] = useState('');
  const [fulfillmentSlaHours, setFulfillmentSlaHours] = useState('48');
  const [status, setStatus] = useState<SavingsBenefitPartnerItem['status']>('ACTIVE');
  const [effectiveAt, setEffectiveAt] = useState('');
  const [expiresAt, setExpiresAt] = useState('');

  React.useEffect(() => {
    if (!open) return;
    setPartnerId(initial?.id ?? '');
    setName(initial?.name ?? '');
    setJurisdictions(initial?.supportedJurisdictions.join(', ') ?? '');
    setDisclosureVersion(initial?.disclosureVersion ?? '');
    setCompensationMayOccur(initial?.compensationMayOccur ?? true);
    setCompensationDisclosure(initial?.compensationDisclosure ?? '');
    setRankingDisclosure(initial?.rankingDisclosure ?? '');
    setPrivacyDisclosure(initial?.privacyDisclosure ?? '');
    setFulfillmentSlaHours(String(initial?.fulfillmentSlaHours ?? 48));
    setStatus(initial?.status ?? 'ACTIVE');
    setEffectiveAt((initial?.effectiveAt ?? new Date().toISOString()).slice(0, 16));
    setExpiresAt(initial?.expiresAt?.slice(0, 16) ?? '');
  }, [initial, open]);

  const valid =
    partnerId.trim()
    && name.trim()
    && disclosureVersion.trim()
    && compensationDisclosure.trim()
    && rankingDisclosure.trim()
    && privacyDisclosure.trim()
    && Number(fulfillmentSlaHours) > 0
    && effectiveAt
    && !Number.isNaN(new Date(effectiveAt).getTime())
    && (!expiresAt || new Date(expiresAt) > new Date(effectiveAt));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? 'Edit partner governance' : 'Add approved partner'}</DialogTitle>
          <DialogDescription>
            Configure jurisdiction, disclosures, effective period, and fulfillment SLA. Handoffs fail closed outside this registry.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label htmlFor="partner-id">Partner ID</Label><Input id="partner-id" value={partnerId} disabled={Boolean(initial)} onChange={(e) => setPartnerId(e.target.value)} /></div>
          <div><Label htmlFor="partner-name">Name</Label><Input id="partner-name" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div>
            <Label htmlFor="partner-status">Status</Label>
            <Select value={status} onValueChange={(value) => setStatus(value as SavingsBenefitPartnerItem['status'])}>
              <SelectTrigger id="partner-status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="PAUSED">Paused</SelectItem>
                <SelectItem value="RETIRED">Retired</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2"><Label htmlFor="partner-jurisdictions">Jurisdictions</Label><Input id="partner-jurisdictions" value={jurisdictions} onChange={(e) => setJurisdictions(e.target.value)} placeholder="NJ, NY" /></div>
          <div><Label htmlFor="partner-disclosure-version">Disclosure version</Label><Input id="partner-disclosure-version" value={disclosureVersion} onChange={(e) => setDisclosureVersion(e.target.value)} /></div>
          <div><Label htmlFor="partner-sla">Fulfillment SLA hours</Label><Input id="partner-sla" type="number" min={1} value={fulfillmentSlaHours} onChange={(e) => setFulfillmentSlaHours(e.target.value)} /></div>
          <div><Label htmlFor="partner-effective-at">Effective at</Label><Input id="partner-effective-at" type="datetime-local" value={effectiveAt} onChange={(e) => setEffectiveAt(e.target.value)} /></div>
          <div><Label htmlFor="partner-expires-at">Expires at (optional)</Label><Input id="partner-expires-at" type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} /></div>
          <div className="sm:col-span-2"><Label htmlFor="partner-compensation">Compensation disclosure</Label><Textarea id="partner-compensation" value={compensationDisclosure} onChange={(e) => setCompensationDisclosure(e.target.value)} /></div>
          <label className="sm:col-span-2 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={compensationMayOccur}
              onChange={(event) => setCompensationMayOccur(event.target.checked)}
            />
            Contract to Cozy may receive compensation from this partner
          </label>
          <div className="sm:col-span-2"><Label htmlFor="partner-ranking">Ranking disclosure</Label><Textarea id="partner-ranking" value={rankingDisclosure} onChange={(e) => setRankingDisclosure(e.target.value)} /></div>
          <div className="sm:col-span-2"><Label htmlFor="partner-privacy">Privacy disclosure</Label><Textarea id="partner-privacy" value={privacyDisclosure} onChange={(e) => setPrivacyDisclosure(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
          <Button
            disabled={pending || !valid}
            onClick={() => onSubmit(partnerId.trim(), {
              name: name.trim(),
              status,
              supportedJurisdictions: jurisdictions.split(',').map((value) => value.trim()).filter(Boolean),
              disclosureVersion: disclosureVersion.trim(),
              compensationMayOccur,
              compensationDisclosure: compensationDisclosure.trim(),
              rankingDisclosure: rankingDisclosure.trim(),
              privacyDisclosure: privacyDisclosure.trim(),
              fulfillmentSlaHours: Number(fulfillmentSlaHours),
              effectiveAt: new Date(effectiveAt).toISOString(),
              expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
            })}
          >
            {pending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            Save partner
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
  const queuePageSize = 50;
  const [verificationOffset, setVerificationOffset] = useState(0);
  const [complaintOffset, setComplaintOffset] = useState(0);
  const [handoffOffset, setHandoffOffset] = useState(0);

  const sourcesQ = useSavingsBenefitsSources();
  const programsQ = useSavingsBenefitsPrograms();
  const queuesQ = useSavingsBenefitsQueues();
  const outcomeVerificationQ = useSavingsBenefitsOutcomeVerificationQueue(verificationOffset, queuePageSize);
  const partnersQ = useSavingsBenefitPartners();
  const partnerComplaintsQ = useSavingsBenefitPartnerComplaints(complaintOffset, queuePageSize);
  const partnerHandoffsQ = useSavingsBenefitPartnerHandoffs(handoffOffset, queuePageSize);
  const createSourceM = useCreateSavingsBenefitsSource();
  const updateSourceM = useUpdateSavingsBenefitsSource();
  const reviewSourceM = useReviewSavingsBenefitsSource();
  const createProgramM = useCreateSavingsBenefitsProgram();
  const updateProgramM = useUpdateSavingsBenefitsProgram();
  const transitionM = useTransitionSavingsBenefitsProgram();
  const verifyOutcomeM = useVerifySavingsBenefitsOutcome();
  const upsertPartnerM = useUpsertSavingsBenefitPartner();
  const resolveComplaintM = useResolveSavingsBenefitPartnerComplaint();
  const transitionHandoffM = useTransitionSavingsBenefitPartnerHandoff();

  const [sourceDialog, setSourceDialog] = useState<{ open: boolean; item: AdminSourceListItem | null }>({ open: false, item: null });
  const [sourceReviewTarget, setSourceReviewTarget] = useState<AdminSourceListItem | null>(null);
  const [programDialog, setProgramDialog] = useState<{ open: boolean; item: AdminProgramListItem | null }>({ open: false, item: null });
  const [target, setTarget] = useState<{ item: EditorialQueueItem; action: LifecycleAction } | null>(null);
  const [verificationTarget, setVerificationTarget] = useState<OutcomeVerificationQueueItem | null>(null);
  const [partnerDialog, setPartnerDialog] = useState<{ open: boolean; item: SavingsBenefitPartnerItem | null }>({ open: false, item: null });
  const [handoffDecision, setHandoffDecision] = useState<{
    actionId: string;
    status: 'FAILED' | 'REVOKED';
    partnerName: string;
  } | null>(null);
  const [submissionTarget, setSubmissionTarget] = useState<{
    actionId: string;
    partnerName: string;
  } | null>(null);
  const [complaintDecision, setComplaintDecision] = useState<{
    complaintId: string;
    partnerName: string;
    status: 'RESOLVED' | 'DISMISSED';
  } | null>(null);

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
          <TabsTrigger value="outcomes">Outcome verification</TabsTrigger>
          <TabsTrigger value="partners">Partners</TabsTrigger>
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
                  <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => setSourceReviewTarget(source)}>
                    Record review
                  </Button>
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
                    disabled={program.reviewStatus !== 'DRAFT'}
                    title={program.reviewStatus !== 'DRAFT' ? 'Return this program to Draft before editing.' : undefined}
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
        <TabsContent value="outcomes" className="mt-4">
          {outcomeVerificationQ.isLoading ? (
            <div className="flex items-center gap-2 p-6 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading received outcomes…
            </div>
          ) : (
            <div className="space-y-2">
              {(outcomeVerificationQ.data?.outcomes ?? []).map((outcome) => (
                <div key={`${outcome.family}-${outcome.id}`} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800">{outcome.title}</p>
                    <p className="text-[11px] text-slate-500">
                      {outcome.family} · {outcome.value ? `${outcome.currency} ${outcome.value}` : 'value unavailable'} · {outcome.documents.length} document(s)
                    </p>
                  </div>
                  <Badge variant="outline">{outcome.verificationState}</Badge>
                  <Button
                    size="sm"
                    disabled={outcome.documents.length === 0}
                    title={outcome.documents.length === 0 ? 'Document Vault evidence is required' : undefined}
                    onClick={() => setVerificationTarget(outcome)}
                  >
                    Verify
                  </Button>
                </div>
              ))}
              {(outcomeVerificationQ.data?.outcomes ?? []).length === 0 ? (
                <p className="text-xs text-slate-400">No received outcomes are waiting for verification.</p>
              ) : null}
              <QueuePager
                offset={verificationOffset}
                limit={queuePageSize}
                total={outcomeVerificationQ.data?.total ?? 0}
                onOffsetChange={setVerificationOffset}
              />
            </div>
          )}
        </TabsContent>
        <TabsContent value="partners" className="mt-4 space-y-5">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setPartnerDialog({ open: true, item: null })}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Add partner
            </Button>
          </div>
          <section aria-labelledby="partner-registry-heading" className="space-y-2">
            <h3 id="partner-registry-heading" className="text-sm font-semibold">Approved partner registry</h3>
            {(partnersQ.data?.partners ?? []).map((partner) => (
              <div key={partner.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{partner.name}</p>
                  <p className="text-[11px] text-slate-500">
                    {partner.id} · {partner.supportedJurisdictions.join(', ') || 'all jurisdictions'} · SLA {partner.fulfillmentSlaHours}h
                  </p>
                </div>
                <Badge variant="outline">{partner.status}</Badge>
                <Button size="sm" variant="outline" onClick={() => setPartnerDialog({ open: true, item: partner })}>Edit</Button>
              </div>
            ))}
            {(partnersQ.data?.partners ?? []).length === 0 ? <p className="text-xs text-slate-400">No partners are approved.</p> : null}
          </section>
          <section aria-labelledby="partner-complaints-heading" className="space-y-2">
            <h3 id="partner-complaints-heading" className="text-sm font-semibold">Open partner complaints</h3>
            {(partnerComplaintsQ.data?.complaints ?? []).map((complaint) => (
              <div key={complaint.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{complaint.action.partner?.name ?? 'Unknown partner'} · {complaint.category}</p>
                  <p className="text-xs text-slate-600">{complaint.description}</p>
                </div>
                <Button
                  size="sm"
                  disabled={resolveComplaintM.isPending}
                  onClick={() => setComplaintDecision({
                    complaintId: complaint.id,
                    partnerName: complaint.action.partner?.name ?? 'Unknown partner',
                    status: 'RESOLVED',
                  })}
                >
                  Resolve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={resolveComplaintM.isPending}
                  onClick={() => setComplaintDecision({
                    complaintId: complaint.id,
                    partnerName: complaint.action.partner?.name ?? 'Unknown partner',
                    status: 'DISMISSED',
                  })}
                >
                  Dismiss
                </Button>
              </div>
            ))}
            {(partnerComplaintsQ.data?.complaints ?? []).length === 0 ? <p className="text-xs text-slate-400">No open complaints.</p> : null}
            <QueuePager
              offset={complaintOffset}
              limit={queuePageSize}
              total={partnerComplaintsQ.data?.total ?? 0}
              onOffsetChange={setComplaintOffset}
            />
          </section>
          <section aria-labelledby="partner-handoffs-heading" className="space-y-2">
            <h3 id="partner-handoffs-heading" className="text-sm font-semibold">Partner handoffs and SLA</h3>
            {(partnerHandoffsQ.data?.handoffs ?? []).map((handoff) => (
              <div
                key={handoff.id}
                className={`flex flex-wrap items-center gap-3 rounded-xl border p-3 ${
                  handoff.overdue ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">
                    {handoff.partner?.name ?? 'Unknown partner'} · {handoff.handoffStatus}
                  </p>
                  <p className="text-xs text-slate-600">
                    Property {handoff.propertyId} · due {handoff.dueAt ? new Date(handoff.dueAt).toLocaleString() : 'not set'}
                    {' · '}
                    {handoff.outcome
                      ? `Outcome ${handoff.outcome.stage} (${handoff.outcome.verificationState})`
                      : 'No reconciled outcome'}
                    {handoff.openComplaintCount ? ` · ${handoff.openComplaintCount} open complaint(s)` : ''}
                  </p>
                  {handoff.sharedFields ? (
                    <dl className="mt-2 grid gap-x-3 gap-y-1 text-xs sm:grid-cols-2">
                      {Object.entries(handoff.sharedFields).map(([field, value]) => (
                        <div key={field}>
                          <dt className="font-semibold text-slate-700">{field}</dt>
                          <dd className="break-words text-slate-600">{String(value)}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                  {handoff.deliveryReference ? (
                    <p className="mt-1 text-xs text-slate-600">
                      Delivery reference: {handoff.deliveryReference}
                    </p>
                  ) : null}
                </div>
                {handoff.overdue ? <Badge variant="destructive">SLA overdue</Badge> : null}
                {handoff.handoffStatus === 'CONSENTED' ? (
                  <Button
                    size="sm"
                    disabled={transitionHandoffM.isPending}
                    onClick={() => setSubmissionTarget({
                      actionId: handoff.id,
                      partnerName: handoff.partner?.name ?? 'Unknown partner',
                    })}
                  >
                    Confirm delivery
                  </Button>
                ) : null}
                {handoff.handoffStatus === 'SUBMITTED' ? (
                  <Button
                    size="sm"
                    disabled={transitionHandoffM.isPending}
                    onClick={() => transitionHandoffM.mutate({
                      actionId: handoff.id,
                      status: 'ACKNOWLEDGED',
                      reason: 'Partner acknowledgement confirmed by administrator.',
                    })}
                  >
                    Mark acknowledged
                  </Button>
                ) : null}
                {handoff.handoffStatus === 'ACKNOWLEDGED' ? (
                  <Button
                    size="sm"
                    disabled={transitionHandoffM.isPending}
                    onClick={() => transitionHandoffM.mutate({
                      actionId: handoff.id,
                      status: 'FULFILLED',
                      reason: 'Partner fulfillment confirmed by administrator.',
                    })}
                  >
                    Mark fulfilled
                  </Button>
                ) : null}
                {['SUBMITTED', 'ACKNOWLEDGED'].includes(handoff.handoffStatus) ? (
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={transitionHandoffM.isPending}
                    onClick={() => setHandoffDecision({
                      actionId: handoff.id,
                      status: 'FAILED',
                      partnerName: handoff.partner?.name ?? 'Unknown partner',
                    })}
                  >
                    Mark failed
                  </Button>
                ) : null}
                {['CONSENTED', 'SUBMITTED', 'ACKNOWLEDGED'].includes(handoff.handoffStatus) ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={transitionHandoffM.isPending}
                    onClick={() => setHandoffDecision({
                      actionId: handoff.id,
                      status: 'REVOKED',
                      partnerName: handoff.partner?.name ?? 'Unknown partner',
                    })}
                  >
                    Revoke
                  </Button>
                ) : null}
              </div>
            ))}
            {(partnerHandoffsQ.data?.handoffs ?? []).length === 0 ? <p className="text-xs text-slate-400">No partner handoffs.</p> : null}
            <QueuePager
              offset={handoffOffset}
              limit={queuePageSize}
              total={partnerHandoffsQ.data?.total ?? 0}
              onOffsetChange={setHandoffOffset}
            />
          </section>
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
      <SourceReviewDialog
        source={sourceReviewTarget}
        onOpenChange={(open) => {
          if (!open) setSourceReviewTarget(null);
        }}
        pending={reviewSourceM.isPending}
        onConfirm={(reason) => {
          if (!sourceReviewTarget) return;
          reviewSourceM.mutate(
            { sourceId: sourceReviewTarget.id, reason },
            {
              onSuccess: () => {
                setSourceReviewTarget(null);
                toast({ title: 'Source review recorded' });
              },
              onError: (error) => toast({
                title: 'Could not record source review',
                description: error instanceof Error ? error.message : undefined,
                variant: 'destructive',
              }),
            },
          );
        }}
      />
      <OutcomeVerificationDialog
        outcome={verificationTarget}
        onOpenChange={(open) => {
          if (!open) setVerificationTarget(null);
        }}
        pending={verifyOutcomeM.isPending}
        onConfirm={(reason) => {
          if (!verificationTarget) return;
          verifyOutcomeM.mutate(
            {
              outcomeId: verificationTarget.id,
              family: verificationTarget.family,
              reason,
            },
            {
              onSuccess: () => {
                setVerificationTarget(null);
                toast({ title: 'Outcome independently verified' });
              },
              onError: (error) => toast({
                title: 'Could not verify outcome',
                description: error instanceof Error ? error.message : undefined,
                variant: 'destructive',
              }),
            },
          );
        }}
      />
      <PartnerFormDialog
        open={partnerDialog.open}
        initial={partnerDialog.item}
        pending={upsertPartnerM.isPending}
        onOpenChange={(open) => setPartnerDialog((previous) => ({ ...previous, open }))}
        onSubmit={(partnerId, input) => {
          upsertPartnerM.mutate(
            { partnerId, input },
            {
              onSuccess: () => {
                setPartnerDialog({ open: false, item: null });
                toast({ title: 'Partner governance saved' });
              },
              onError: (error) => toast({
                title: 'Could not save partner',
                description: error instanceof Error ? error.message : undefined,
                variant: 'destructive',
              }),
            },
          );
        }}
      />
      <OperationalReasonDialog
        open={handoffDecision !== null}
        title={`${handoffDecision?.status === 'FAILED' ? 'Mark failed' : 'Revoke handoff'}: ${handoffDecision?.partnerName ?? ''}`}
        description="This terminal transition reconciles the canonical action and is recorded in the administrative audit log."
        pending={transitionHandoffM.isPending}
        destructive
        onOpenChange={(open) => {
          if (!open) setHandoffDecision(null);
        }}
        onConfirm={(reason) => {
          if (!handoffDecision) return;
          transitionHandoffM.mutate(
            {
              actionId: handoffDecision.actionId,
              status: handoffDecision.status,
              reason,
            },
            {
              onSuccess: () => {
                setHandoffDecision(null);
                toast({ title: 'Handoff updated' });
              },
              onError: (error) => toast({
                title: 'Could not update handoff',
                description: error instanceof Error ? error.message : undefined,
                variant: 'destructive',
              }),
            },
          );
        }}
      />
      <ManualDeliveryDialog
        open={submissionTarget !== null}
        partnerName={submissionTarget?.partnerName ?? ''}
        pending={transitionHandoffM.isPending}
        onOpenChange={(open) => {
          if (!open) setSubmissionTarget(null);
        }}
        onConfirm={(reason, deliveryReference) => {
          if (!submissionTarget) return;
          transitionHandoffM.mutate(
            {
              actionId: submissionTarget.actionId,
              status: 'SUBMITTED',
              reason,
              deliveryReference,
            },
            {
              onSuccess: () => {
                setSubmissionTarget(null);
                toast({ title: 'Partner delivery recorded' });
              },
              onError: (error) => toast({
                title: 'Could not record delivery',
                description: error instanceof Error ? error.message : undefined,
                variant: 'destructive',
              }),
            },
          );
        }}
      />
      <OperationalReasonDialog
        open={complaintDecision !== null}
        title={`${complaintDecision?.status === 'RESOLVED' ? 'Resolve' : 'Dismiss'} complaint: ${complaintDecision?.partnerName ?? ''}`}
        description="Record the investigation outcome for the homeowner complaint."
        pending={resolveComplaintM.isPending}
        destructive={complaintDecision?.status === 'DISMISSED'}
        onOpenChange={(open) => {
          if (!open) setComplaintDecision(null);
        }}
        onConfirm={(resolution) => {
          if (!complaintDecision) return;
          resolveComplaintM.mutate(
            {
              complaintId: complaintDecision.complaintId,
              status: complaintDecision.status,
              resolution,
            },
            {
              onSuccess: () => {
                setComplaintDecision(null);
                toast({ title: 'Complaint updated' });
              },
              onError: (error) => toast({
                title: 'Could not update complaint',
                description: error instanceof Error ? error.message : undefined,
                variant: 'destructive',
              }),
            },
          );
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
