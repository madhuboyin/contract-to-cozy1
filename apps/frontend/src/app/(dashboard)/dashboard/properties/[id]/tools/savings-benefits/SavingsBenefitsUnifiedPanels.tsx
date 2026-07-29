'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api/client';
import type { SavingsBenefitsUnifiedItemDTO } from '@/types';
import {
  EmptyStateCard,
  MobileCard,
  StatusChip,
  type StatusChipTone,
} from '@/components/mobile/dashboard/MobilePrimitives';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

const FAMILY_LABEL: Record<SavingsBenefitsUnifiedItemDTO['family'], string> = {
  BENEFIT: 'Benefit',
  RECURRING_COST: 'Recurring cost',
};

const FAMILY_TONE: Record<SavingsBenefitsUnifiedItemDTO['family'], StatusChipTone> = {
  BENEFIT: 'info',
  RECURRING_COST: 'protected',
};

function formatMoney(value: number | null, currency: string): string | null {
  if (value == null) return null;
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
  } catch {
    return `$${Math.round(value).toLocaleString()}`;
  }
}

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function useSavingsBenefitsUnified(propertyId: string) {
  return useQuery({
    queryKey: ['savings-benefits-unified', propertyId],
    queryFn: () => api.getSavingsBenefitsUnified(propertyId),
    staleTime: 60_000,
  });
}

const DOMAIN_LABEL: Record<string, string> = {
  PROPERTY_TAX: 'Property tax',
  COVERAGE: 'Coverage',
  REFINANCE: 'Refinance',
};

/**
 * Read-only pointers into Property Tax, Coverage and Premium Review, and
 * Mortgage Refinance Radar (§4.5 of the audit) — each domain still owns its
 * own decisions; this only surfaces that something's there, with a link to
 * that domain's own tool. Renders nothing when there's nothing to point to.
 */
export function RelatedOpportunitiesStrip({ propertyId }: { propertyId: string }) {
  const query = useSavingsBenefitsUnified(propertyId);
  const pointers = query.data?.relatedOpportunities ?? [];
  if (pointers.length === 0) return null;

  return (
    <div className="mb-4 space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--mobile-text-secondary))]">
        Also worth a look
      </p>
      <div className="grid gap-2 sm:grid-cols-3">
        {pointers.map((pointer) => (
          <Link
            key={pointer.domain}
            href={pointer.detailHref}
            className="block rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 py-2.5 text-xs transition-transform active:scale-[0.99] dark:bg-slate-900/40"
          >
            <StatusChip tone="elevated">{DOMAIN_LABEL[pointer.domain] ?? pointer.domain}</StatusChip>
            <p className="mt-1.5 leading-snug text-[hsl(var(--mobile-text-primary))]">{pointer.summary}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

function PartnerHandoffControls({
  propertyId,
  item,
}: {
  propertyId: string;
  item: SavingsBenefitsUnifiedItemDTO;
}) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'consent' | 'revoke' | 'complaint' | null>(null);
  const [partnerId, setPartnerId] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [reason, setReason] = useState('');
  const [category, setCategory] = useState('SERVICE');
  const partnersQ = useQuery({
    queryKey: ['savings-benefits-eligible-partners', propertyId],
    queryFn: () => api.getSavingsBenefitsEligiblePartners(propertyId),
    enabled: mode === 'consent',
    staleTime: 60_000,
  });
  const selectedPartner = partnersQ.data?.find((partner) => partner.id === partnerId) ?? null;
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['savings-benefits-unified', propertyId] });
  const handoffM = useMutation({
    mutationFn: async () => {
      if (!selectedPartner) throw new Error('Select an approved partner.');
      const sharedFields = {
        opportunityId: item.id,
        opportunityFamily: item.family,
        opportunityTitle: item.title,
        category: item.category,
      };
      await api.createSavingsBenefitsAction(propertyId, item.id, {
        idempotencyKey: `partner-handoff:${item.id}:${selectedPartner.id}:${crypto.randomUUID()}`,
        family: item.family,
        actionType: 'PARTNER_HANDOFF_CONSENTED',
        externalOwner: selectedPartner.id,
        sharedFields,
        consent: {
          partnerId: selectedPartner.id,
          disclosureAcknowledged: true,
          consentVersion: selectedPartner.disclosureVersion,
          consentedAt: new Date().toISOString(),
          compensationMayOccur: selectedPartner.compensationMayOccur,
          rankingInfluenced: false,
          selectionCriteria: ['Jurisdiction support', 'Program or recurring-cost category fit'],
          nonCommercialAlternative: 'Continue independently using the official source or provider.',
          sharedFieldNames: Object.keys(sharedFields),
        },
      });
    },
    onSuccess: async () => {
      setMode(null);
      setAcknowledged(false);
      setPartnerId('');
      await refresh();
    },
  });
  const revokeM = useMutation({
    mutationFn: () => api.revokeSavingsBenefitsPartnerHandoff(propertyId, item.canonicalAction!.id, reason.trim()),
    onSuccess: async () => {
      setMode(null);
      setReason('');
      await refresh();
    },
  });
  const complaintM = useMutation({
    mutationFn: () => api.reportSavingsBenefitsPartnerComplaint(
      propertyId,
      item.canonicalAction!.id,
      { category, description: reason.trim() },
    ),
    onSuccess: () => {
      setMode(null);
      setReason('');
    },
  });
  const handoffStatus = item.canonicalAction?.handoffStatus ?? null;
  const activeHandoff = handoffStatus && !['FULFILLED', 'FAILED', 'REVOKED'].includes(handoffStatus);
  const canStart = item.canonicalAction?.state === 'STARTED' && !handoffStatus;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[hsl(var(--mobile-border-subtle))] pt-3">
      {handoffStatus ? (
        <StatusChip tone={activeHandoff ? 'info' : 'elevated'}>
          Partner: {item.canonicalAction?.partner?.name ?? 'approved partner'} · {handoffStatus.toLowerCase()}
        </StatusChip>
      ) : null}
      {canStart ? <Button size="sm" variant="outline" onClick={() => setMode('consent')}>Get partner help</Button> : null}
      {activeHandoff ? (
        <Button size="sm" variant="outline" onClick={() => setMode('revoke')}>Revoke consent</Button>
      ) : null}
      {handoffStatus ? (
        <Button size="sm" variant="outline" onClick={() => setMode('complaint')}>Report a problem</Button>
      ) : null}

      <Dialog open={mode === 'consent'} onOpenChange={(open) => !open && setMode(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Share this opportunity with an approved partner</DialogTitle>
            <DialogDescription>
              Review the recipient, commercial disclosures, ranking policy, privacy terms, and exact fields before consenting.
            </DialogDescription>
          </DialogHeader>
          <Label htmlFor={`partner-${item.id}`}>Partner</Label>
          <Select value={partnerId} onValueChange={setPartnerId}>
            <SelectTrigger id={`partner-${item.id}`}><SelectValue placeholder="Select an eligible partner" /></SelectTrigger>
            <SelectContent>
              {(partnersQ.data ?? []).map((partner) => (
                <SelectItem key={partner.id} value={partner.id}>{partner.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedPartner ? (
            <div className="space-y-3 rounded-lg border p-3 text-sm">
              <div><p className="font-semibold">Compensation</p><p>{selectedPartner.compensationDisclosure}</p></div>
              <div><p className="font-semibold">Ranking</p><p>{selectedPartner.rankingDisclosure}</p></div>
              <div><p className="font-semibold">Privacy</p><p>{selectedPartner.privacyDisclosure}</p></div>
              <div>
                <p className="font-semibold">Fields shared</p>
                <ul className="list-disc pl-5">
                  <li>Opportunity identifier and family</li>
                  <li>Opportunity title</li>
                  <li>Category</li>
                </ul>
              </div>
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(event) => setAcknowledged(event.target.checked)}
                />
                <span>I consent to sharing these exact fields with {selectedPartner.name} under disclosure version {selectedPartner.disclosureVersion}.</span>
              </label>
            </div>
          ) : null}
          {handoffM.error ? <p role="alert" className="text-sm text-red-600">{handoffM.error.message}</p> : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setMode(null)}>Cancel</Button>
            <Button disabled={!selectedPartner || !acknowledged || handoffM.isPending} onClick={() => handoffM.mutate()}>
              Consent and share
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={mode === 'revoke' || mode === 'complaint'} onOpenChange={(open) => !open && setMode(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{mode === 'revoke' ? 'Revoke partner consent' : 'Report a partner problem'}</DialogTitle>
            <DialogDescription>
              {mode === 'revoke'
                ? 'Revocation stops this handoff and returns the opportunity to your saved work.'
                : 'Your report is added to the partner-governance review queue.'}
            </DialogDescription>
          </DialogHeader>
          {mode === 'complaint' ? (
            <>
              <Label htmlFor={`complaint-category-${item.id}`}>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id={`complaint-category-${item.id}`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="SERVICE">Service</SelectItem>
                  <SelectItem value="PRIVACY">Privacy</SelectItem>
                  <SelectItem value="DISCLOSURE">Disclosure</SelectItem>
                  <SelectItem value="OTHER">Other</SelectItem>
                </SelectContent>
              </Select>
            </>
          ) : null}
          <Label htmlFor={`partner-reason-${item.id}`}>{mode === 'revoke' ? 'Reason' : 'What happened?'}</Label>
          <Textarea
            id={`partner-reason-${item.id}`}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="min-h-[96px]"
          />
          {(revokeM.error || complaintM.error) ? (
            <p role="alert" className="text-sm text-red-600">{(revokeM.error ?? complaintM.error)?.message}</p>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setMode(null)}>Cancel</Button>
            <Button
              variant={mode === 'revoke' ? 'destructive' : 'default'}
              disabled={reason.trim().length < 3 || revokeM.isPending || complaintM.isPending}
              onClick={() => mode === 'revoke' ? revokeM.mutate() : complaintM.mutate()}
            >
              {mode === 'revoke' ? 'Revoke consent' : 'Submit report'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ItemRow({ item, propertyId }: { item: SavingsBenefitsUnifiedItemDTO; propertyId: string }) {
  const valueLabel =
    item.lifecycle === 'REALIZED'
      ? formatMoney(item.realizedValue, item.currency)
      : formatMoney(item.estimatedValue, item.currency);
  const valueQualifier =
    item.lifecycle === 'REALIZED'
      ? 'Realized'
      : item.estimatedValueBasis === 'ONE_TIME'
        ? 'One-time (est.)'
        : item.estimatedValueBasis === 'MONTHLY'
          ? 'Monthly (est.)'
          : item.estimatedValueBasis === 'ANNUAL'
            ? 'Annual (est.)'
          : 'Estimated';
  const deadlineLabel = formatDate(item.deadline);

  return (
    <div className="rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-white px-4 py-3 dark:bg-slate-900/40">
      <Link href={item.detailHref} className="block transition-transform active:scale-[0.99]">
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip tone={FAMILY_TONE[item.family]}>{FAMILY_LABEL[item.family]}</StatusChip>
        <StatusChip tone="info">{item.statusLabel}</StatusChip>
        {item.lifecycle === 'REALIZED' ? (
          <StatusChip tone={item.verificationState === 'VERIFIED' ? 'protected' : 'elevated'}>
            {item.verificationState === 'VERIFIED'
              ? 'Independently verified'
              : item.verificationState === 'EVIDENCE_ATTACHED'
                ? 'Evidence attached'
                : 'Self-reported'}
          </StatusChip>
        ) : null}
        {item.mutuallyExclusiveWith.length > 0 ? (
          <StatusChip tone="elevated">Conflicts with {item.mutuallyExclusiveWith.length}</StatusChip>
        ) : null}
      </div>
      <p className="mt-2 mb-0 text-sm font-semibold text-[hsl(var(--mobile-text-primary))]">{item.title}</p>
      {item.explanation ? (
        <p className="mt-1 mb-0 text-xs leading-relaxed text-[hsl(var(--mobile-text-secondary))]">
          {item.explanation}
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[hsl(var(--mobile-text-secondary))]">
        {valueLabel ? (
          <span>
            <span className="font-semibold text-[hsl(var(--mobile-text-primary))]">{valueLabel}</span> {valueQualifier}
          </span>
        ) : null}
        {deadlineLabel ? <span>Deadline: {deadlineLabel}</span> : null}
        {item.sourceLabel ? <span>{item.sourceLabel}</span> : null}
      </div>
      </Link>
      {item.lifecycle === 'IN_PROGRESS' ? <PartnerHandoffControls propertyId={propertyId} item={item} /> : null}
    </div>
  );
}

function LoadingPanel() {
  return (
    <div className="space-y-2">
      {[0, 1].map((key) => (
        <div
          key={key}
          className="h-24 animate-pulse rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-slate-100 dark:bg-slate-800/40"
        />
      ))}
    </div>
  );
}

function ErrorPanel() {
  return (
    <EmptyStateCard
      title="Couldn't load this view"
      description="Something went wrong fetching your combined savings and benefits activity. Try again in a moment."
    />
  );
}

export function InProgressPanel({ propertyId }: { propertyId: string }) {
  const query = useSavingsBenefitsUnified(propertyId);

  if (query.isLoading) return <LoadingPanel />;
  if (query.isError) return <ErrorPanel />;

  const items = query.data?.inProgress ?? [];
  if (items.length === 0) {
    return (
      <EmptyStateCard
        title="Nothing in progress yet"
        description="Mark a benefit as Pursuing or apply to a recurring-cost switch, and it'll show up here across both."
      />
    );
  }

  return (
    <MobileCard variant="compact" className="space-y-2 bg-transparent p-0 shadow-none">
      {items.map((item) => (
        <ItemRow key={`${item.family}-${item.id}`} item={item} propertyId={propertyId} />
      ))}
    </MobileCard>
  );
}

export function RealizedPanel({ propertyId }: { propertyId: string }) {
  const query = useSavingsBenefitsUnified(propertyId);

  if (query.isLoading) return <LoadingPanel />;
  if (query.isError) return <ErrorPanel />;

  const items = query.data?.realized ?? [];
  const totals = query.data?.totals;

  if (items.length === 0) {
    return (
      <EmptyStateCard
        title="Nothing realized yet"
        description="Once you record a received benefit or a recurring-cost result with supporting evidence, it'll appear here as recorded value. Estimates shown elsewhere aren't counted."
      />
    );
  }

  return (
    <div className="space-y-3">
      {totals ? (
        <MobileCard variant="compact" className="space-y-2">
          <p className="text-xs text-[hsl(var(--mobile-text-secondary))]">
            Recorded received value, grouped by currency
          </p>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {Object.entries(totals.realizedValueByCurrency).map(([currency, value]) => (
              <div key={currency}>
                <p className="text-sm font-semibold text-[hsl(var(--mobile-text-primary))]">
                  {formatMoney(value, currency)}
                </p>
                <p className="text-[11px] text-[hsl(var(--mobile-text-secondary))]">
                  {formatMoney(totals.verifiedValueByCurrency[currency] ?? 0, currency)} independently verified
                </p>
              </div>
            ))}
          </div>
        </MobileCard>
      ) : null}
      {totals && totals.exclusionConflicts.length > 0 ? (
        <MobileCard variant="compact" className="border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-900/20">
          <p className="text-xs leading-relaxed text-amber-800 dark:text-amber-200">
            You have realized value recorded on {totals.exclusionConflicts.length === 1 ? 'a pair' : `${totals.exclusionConflicts.length} sets`} of
            programs normally treated as mutually exclusive. The total above still includes every recorded amount —
            worth double-checking with each program that both are actually valid together.
          </p>
        </MobileCard>
      ) : null}
      <div className="space-y-2">
        {items.map((item) => (
          <ItemRow key={`${item.family}-${item.id}`} item={item} propertyId={propertyId} />
        ))}
      </div>
    </div>
  );
}
