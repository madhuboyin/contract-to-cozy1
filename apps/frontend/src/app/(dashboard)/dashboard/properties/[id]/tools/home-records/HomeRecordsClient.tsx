'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  ArchiveRestore,
  Check,
  Download,
  FileText,
  Link as LinkIcon,
  Loader2,
  Lock,
  Pencil,
  Plus,
  Search,
  Shield,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useToast } from '@/components/ui/use-toast';
import {
  BottomSafeAreaReserve,
  EmptyStateCard,
  MobileCard,
  MobilePageContainer,
  MobilePageIntro,
  StatusChip,
} from '@/components/mobile/dashboard/MobilePrimitives';
import { MOBILE_TYPE_TOKENS } from '@/components/mobile/dashboard/mobileDesignTokens';
import HomeToolHeader from '@/components/tools/HomeToolHeader';
import {
  addLink,
  addVersion,
  archiveRecord,
  checkPossibleVersion,
  createRecord,
  getRecord,
  listRecords,
  promoteExpense,
  promoteWarranty,
  restoreRecord,
  reviewCandidate,
  runExtraction,
  setEffectivePeriod,
  setRetention,
  trashRecord,
  type PossibleVersionMatch,
} from './homeRecordsApi';
import type {
  CreateRecordInput,
  ExtractedFactCandidate,
  PropertyRecordDetail,
  PropertyRecordLinkEntityType,
  PropertyRecordLinkPurpose,
  PropertyRecordSensitivity,
  PropertyRecordSummary,
  PropertyRecordType,
  PropertyRecordVisibility,
} from './types';

// ─── Display config ─────────────────────────────────────────────────────────

const RECORD_TYPE_LABELS: Record<PropertyRecordType, string> = {
  WARRANTY: 'Warranty',
  RECEIPT: 'Receipt',
  MANUAL: 'Manual',
  INSPECTION_REPORT: 'Inspection Report',
  INVOICE: 'Invoice',
  CONTRACT: 'Contract',
  PERMIT: 'Permit',
  INSURANCE_POLICY: 'Insurance Policy',
  CLAIM: 'Claim',
  PHOTO: 'Photo',
  DEED: 'Deed',
  TAX_DOCUMENT: 'Tax Document',
  UTILITY: 'Utility',
  DISCLOSURE: 'Disclosure',
  SURVEY: 'Survey',
  CLOSING_DOCUMENT: 'Closing Document',
  OTHER: 'Other',
};

const SENSITIVITY_LABELS: Record<PropertyRecordSensitivity, string> = {
  STANDARD: 'Standard',
  PERSONAL: 'Personal',
  FINANCIAL: 'Financial',
  INSURANCE: 'Insurance',
  CLAIM: 'Claim',
  SECURITY: 'Security',
  LEGAL: 'Legal',
};

const VISIBILITY_LABELS: Record<PropertyRecordVisibility, string> = {
  HOUSEHOLD: 'Household',
  OWNER_ONLY: 'Owner only',
  RECIPIENT_SELECTED: 'Recipient-selected',
};

const LINK_ENTITY_LABELS: Record<PropertyRecordLinkEntityType, string> = {
  HOME_EVENT: 'Home Event',
  INVENTORY_ITEM: 'Inventory Item',
  MATERIAL_SPEC: 'Material Spec',
  PROJECT: 'Project',
  WARRANTY: 'Warranty',
  INSURANCE_POLICY: 'Insurance Policy',
  CLAIM: 'Claim',
  PERMIT: 'Permit',
  PROPERTY_BRIEF: 'Property Brief',
  EXPENSE: 'Expense',
  OTHER: 'Other',
};

// Slice 11 (unified experience) cross-link: a linked entity is otherwise
// just a text label with no way to actually get to what it evidences.
// List pages are used where no per-entity detail route is known (WARRANTY,
// INSURANCE_POLICY, EXPENSE, PERMIT, HOME_EVENT) — still a real navigation
// improvement over no link at all, and never wrong.
function linkedEntityHref(propertyId: string, entityType: PropertyRecordLinkEntityType, entityId: string): string | null {
  switch (entityType) {
    case 'HOME_EVENT': return `/dashboard/properties/${propertyId}/timeline`;
    case 'INVENTORY_ITEM': return `/dashboard/properties/${propertyId}/inventory`;
    case 'MATERIAL_SPEC': return `/dashboard/properties/${propertyId}/materials/${entityId}`;
    case 'PROJECT': return `/dashboard/properties/${propertyId}/projects/${entityId}`;
    case 'WARRANTY': return `/dashboard/warranties`;
    case 'INSURANCE_POLICY': return `/dashboard/insurance`;
    case 'CLAIM': return `/dashboard/properties/${propertyId}/claims/${entityId}`;
    case 'PERMIT': return `/dashboard/properties/${propertyId}/tools/permits`;
    case 'PROPERTY_BRIEF': return `/dashboard/properties/${propertyId}/property-brief`;
    case 'EXPENSE': return `/dashboard/expenses`;
    case 'OTHER': return null;
  }
}

const LINK_PURPOSE_LABELS: Record<PropertyRecordLinkPurpose, string> = {
  EVIDENCE: 'Evidence',
  SOURCE: 'Source',
  ATTACHMENT: 'Attachment',
  APPROVAL: 'Approval',
  RECEIPT: 'Receipt',
  WARRANTY: 'Warranty',
  MANUAL: 'Manual',
};

const LIFECYCLE_TONE: Record<string, 'good' | 'elevated' | 'danger' | 'info'> = {
  ACTIVE: 'good',
  ARCHIVED: 'info',
  TRASHED: 'danger',
};

// WARRANTY and RECEIPT records have an AI review/promotion path today — see
// homeRecordsExtraction.service.ts. '_documentType' is excluded here: it's
// the AI's informational overall classification, not a reviewable field.
const WARRANTY_REQUIRED_FIELD_KEYS = ['providerName', 'startDate', 'expiryDate'];
const WARRANTY_FIELD_LABELS: Record<string, string> = {
  providerName: 'Provider / manufacturer',
  startDate: 'Warranty start date',
  expiryDate: 'Warranty expiration date',
  category: 'Category',
  coverageDetails: 'Coverage details',
  cost: 'Cost',
};

const EXPENSE_REQUIRED_FIELD_KEYS = ['description', 'amount', 'transactionDate'];
const EXPENSE_FIELD_LABELS: Record<string, string> = {
  description: 'Vendor / description',
  amount: 'Amount',
  transactionDate: 'Transaction date',
  category: 'Category',
};

const REVIEW_STATUS_TONE: Record<string, 'good' | 'elevated' | 'danger' | 'info'> = {
  PENDING: 'elevated',
  CONFIRMED: 'good',
  CORRECTED: 'good',
  REJECTED: 'danger',
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const ALLOWED_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
const MAX_FILE_BYTES = 10 * 1024 * 1024;

// ─── Upload dialog ───────────────────────────────────────────────────────────

function UploadDialog({
  open,
  onOpenChange,
  onSubmit,
  isSubmitting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: {
    file: File;
    title: string;
    description?: string;
    recordType: PropertyRecordType;
    sensitivity: PropertyRecordSensitivity;
    visibility: PropertyRecordVisibility;
    effectiveTo?: string;
  }) => void;
  isSubmitting: boolean;
}) {
  const [file, setFile] = React.useState<File | null>(null);
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [recordType, setRecordType] = React.useState<PropertyRecordType>('OTHER');
  const [sensitivity, setSensitivity] = React.useState<PropertyRecordSensitivity>('STANDARD');
  const [visibility, setVisibility] = React.useState<PropertyRecordVisibility>('HOUSEHOLD');
  const [expiresOn, setExpiresOn] = React.useState('');
  const [fileError, setFileError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      setFile(null);
      setTitle('');
      setDescription('');
      setRecordType('OTHER');
      setSensitivity('STANDARD');
      setVisibility('HOUSEHOLD');
      setExpiresOn('');
      setFileError(null);
    }
  }, [open]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null;
    if (!selected) {
      setFile(null);
      return;
    }
    if (!ALLOWED_MIME_TYPES.has(selected.type)) {
      setFileError('Only PDF, JPEG, PNG, and WEBP files are supported.');
      setFile(null);
      return;
    }
    if (selected.size > MAX_FILE_BYTES) {
      setFileError('File exceeds the 10 MB size limit.');
      setFile(null);
      return;
    }
    setFileError(null);
    setFile(selected);
    if (!title) setTitle(selected.name.replace(/\.[^.]+$/, ''));
  }

  const canSubmit = Boolean(file) && title.trim().length > 0 && !isSubmitting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a record</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="record-file">File</Label>
            <Input id="record-file" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={handleFileChange} />
            {fileError && <p className="mt-1 text-xs text-red-600">{fileError}</p>}
            {file && !fileError && (
              <p className="mt-1 text-xs text-gray-500">{file.name} · {formatBytes(file.size)}</p>
            )}
          </div>
          <div>
            <Label htmlFor="record-title">Title</Label>
            <Input id="record-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={240} />
          </div>
          <div>
            <Label htmlFor="record-description">Description (optional)</Label>
            <Textarea id="record-description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} rows={2} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <Label>Record type</Label>
              <Select value={recordType} onValueChange={(v) => setRecordType(v as PropertyRecordType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.entries(RECORD_TYPE_LABELS) as [PropertyRecordType, string][]).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Sensitivity</Label>
              <Select value={sensitivity} onValueChange={(v) => setSensitivity(v as PropertyRecordSensitivity)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.entries(SENSITIVITY_LABELS) as [PropertyRecordSensitivity, string][]).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Visibility</Label>
              <Select value={visibility} onValueChange={(v) => setVisibility(v as PropertyRecordVisibility)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.entries(VISIBILITY_LABELS) as [PropertyRecordVisibility, string][]).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="record-expires">Expires / needs renewal on (optional)</Label>
            <Input id="record-expires" type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} />
            <p className="mt-1 text-xs text-gray-400">Shown under "Expiring or outdated" as the date approaches.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>Cancel</Button>
          <Button
            disabled={!canSubmit}
            onClick={() => file && onSubmit({
              file,
              title: title.trim(),
              description: description.trim() || undefined,
              recordType,
              sensitivity,
              visibility,
              effectiveTo: expiresOn ? new Date(`${expiresOn}T00:00:00.000Z`).toISOString() : undefined,
            })}
            className="gap-2"
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Add record
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Record card ─────────────────────────────────────────────────────────────

function RecordCard({ record, onOpen }: { record: PropertyRecordSummary; onOpen: () => void }) {
  const availability = record.currentVersion?.availability;
  return (
    <button
      onClick={onOpen}
      className="w-full rounded-[18px] border border-gray-200 bg-white p-4 text-left transition-colors hover:border-gray-300 hover:bg-gray-50"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-50">
          <FileText className="h-5 w-5 text-gray-500" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusChip tone={LIFECYCLE_TONE[record.lifecycleStatus] ?? 'info'}>
              {record.lifecycleStatus === 'ACTIVE' ? 'Active' : record.lifecycleStatus === 'ARCHIVED' ? 'Archived' : 'Trashed'}
            </StatusChip>
            <span className={cn(MOBILE_TYPE_TOKENS.caption, 'text-gray-400')}>{RECORD_TYPE_LABELS[record.recordType]}</span>
            {record.sensitivity !== 'STANDARD' && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                <Lock className="h-3 w-3" />
                {SENSITIVITY_LABELS[record.sensitivity]}
              </span>
            )}
            {availability && availability !== 'AVAILABLE' && (
              <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">
                {availability === 'PENDING' ? 'Scanning…' : availability}
              </span>
            )}
            {record.needsReview && <StatusChip tone="elevated">Needs review</StatusChip>}
            {record.expiryStatus === 'EXPIRED' && <StatusChip tone="danger">Expired</StatusChip>}
            {record.expiryStatus === 'EXPIRING_SOON' && <StatusChip tone="elevated">Expiring soon</StatusChip>}
          </div>
          <p className={cn(MOBILE_TYPE_TOKENS.cardTitle, 'mt-1.5 truncate text-gray-900')}>{record.title}</p>
          <p className={cn(MOBILE_TYPE_TOKENS.caption, 'mt-0.5 text-gray-500')}>
            {record._count.versions} {record._count.versions === 1 ? 'version' : 'versions'}
            {record._count.links > 0 && ` · linked to ${record._count.links}`}
            {' · '}Updated {formatDate(record.updatedAt)}
          </p>
        </div>
      </div>
    </button>
  );
}

// ─── Add-link mini form ──────────────────────────────────────────────────────

function AddLinkForm({ onAdd, isSubmitting }: { onAdd: (input: { entityType: PropertyRecordLinkEntityType; entityId: string; purpose: PropertyRecordLinkPurpose; label?: string }) => void; isSubmitting: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [entityType, setEntityType] = React.useState<PropertyRecordLinkEntityType>('HOME_EVENT');
  const [entityId, setEntityId] = React.useState('');
  const [purpose, setPurpose] = React.useState<PropertyRecordLinkPurpose>('EVIDENCE');
  const [label, setLabel] = React.useState('');

  if (!open) {
    return (
      <Button variant="outline" size="sm" className="w-full justify-start gap-2 border-dashed" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Link to another record
      </Button>
    );
  }

  return (
    <div className="space-y-2 rounded-xl border border-gray-200 bg-gray-50 p-3">
      <div className="grid grid-cols-2 gap-2">
        <Select value={entityType} onValueChange={(v) => setEntityType(v as PropertyRecordLinkEntityType)}>
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(Object.entries(LINK_ENTITY_LABELS) as [PropertyRecordLinkEntityType, string][]).map(([value, l]) => (
              <SelectItem key={value} value={value}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={purpose} onValueChange={(v) => setPurpose(v as PropertyRecordLinkPurpose)}>
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(Object.entries(LINK_PURPOSE_LABELS) as [PropertyRecordLinkPurpose, string][]).map(([value, l]) => (
              <SelectItem key={value} value={value}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Input placeholder="Entity ID" value={entityId} onChange={(e) => setEntityId(e.target.value)} className="h-9" />
      <Input placeholder="Label (optional)" value={label} onChange={(e) => setLabel(e.target.value)} className="h-9" />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
        <Button
          size="sm"
          disabled={!entityId.trim() || isSubmitting}
          onClick={() => {
            onAdd({ entityType, entityId: entityId.trim(), purpose, label: label.trim() || undefined });
            setEntityId('');
            setLabel('');
            setOpen(false);
          }}
        >
          {isSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Add link'}
        </Button>
      </div>
    </div>
  );
}

// ─── AI extraction review ─────────────────────────────────────────────────────

function CandidateReviewRow({
  candidate,
  fieldLabels,
  onReview,
  isSubmitting,
}: {
  candidate: ExtractedFactCandidate;
  fieldLabels: Record<string, string>;
  onReview: (input: { action: 'CONFIRM' | 'CORRECT' | 'REJECT'; reviewedValue?: string }) => void;
  isSubmitting: boolean;
}) {
  const [correcting, setCorrecting] = React.useState(false);
  const [draft, setDraft] = React.useState(candidate.proposedValue ?? '');
  const label = fieldLabels[candidate.fieldKey] ?? candidate.fieldKey;
  const isPending = candidate.reviewStatus === 'PENDING';
  const isPromoted = Boolean(candidate.promotedEntityId);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className={cn(MOBILE_TYPE_TOKENS.caption, 'font-semibold text-gray-500')}>{label}</p>
            <StatusChip tone={REVIEW_STATUS_TONE[candidate.reviewStatus] ?? 'info'}>
              {candidate.reviewStatus.charAt(0) + candidate.reviewStatus.slice(1).toLowerCase()}
            </StatusChip>
            {isPromoted && <StatusChip tone="good">Used</StatusChip>}
          </div>
          {correcting ? (
            <div className="mt-1.5 flex items-center gap-2">
              <Input value={draft} onChange={(e) => setDraft(e.target.value)} className="h-8" autoFocus />
              <Button
                size="sm"
                className="h-8 gap-1 px-2"
                disabled={!draft.trim() || isSubmitting}
                onClick={() => { onReview({ action: 'CORRECT', reviewedValue: draft.trim() }); setCorrecting(false); }}
              >
                <Check className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => setCorrecting(false)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <p className={cn(MOBILE_TYPE_TOKENS.body, 'mt-0.5 text-gray-800')}>
              {isPending ? candidate.proposedValue || '—' : candidate.reviewedValue || '—'}
            </p>
          )}
        </div>
        {isPending && !isPromoted && !correcting && (
          <div className="flex shrink-0 items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1 px-2 text-xs text-green-700 hover:bg-green-50"
              onClick={() => onReview({ action: 'CONFIRM' })}
              disabled={isSubmitting}
            >
              <Check className="h-3 w-3" />
              Confirm
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1 px-2 text-xs text-gray-600 hover:bg-gray-50"
              onClick={() => { setDraft(candidate.proposedValue ?? ''); setCorrecting(true); }}
              disabled={isSubmitting}
            >
              <Pencil className="h-3 w-3" />
              Correct
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1 px-2 text-xs text-red-600 hover:bg-red-50"
              onClick={() => onReview({ action: 'REJECT' })}
              disabled={isSubmitting}
            >
              <X className="h-3 w-3" />
              Reject
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

type ExtractionDomainConfig = {
  requiredFieldKeys: string[];
  fieldLabels: Record<string, string>;
  promote: (propertyId: string, recordId: string, versionId: string) => Promise<{ id: string }>;
  promoteButtonLabel: string;
  promotedMessage: string;
  successToastTitle: string;
  errorToastTitle: string;
};

const WARRANTY_EXTRACTION_CONFIG: ExtractionDomainConfig = {
  requiredFieldKeys: WARRANTY_REQUIRED_FIELD_KEYS,
  fieldLabels: WARRANTY_FIELD_LABELS,
  promote: promoteWarranty,
  promoteButtonLabel: 'Create warranty from confirmed details',
  promotedMessage: 'A warranty was created from these details.',
  successToastTitle: 'Warranty created',
  errorToastTitle: 'Could not create warranty',
};

const EXPENSE_EXTRACTION_CONFIG: ExtractionDomainConfig = {
  requiredFieldKeys: EXPENSE_REQUIRED_FIELD_KEYS,
  fieldLabels: EXPENSE_FIELD_LABELS,
  promote: promoteExpense,
  promoteButtonLabel: 'Log expense from confirmed details',
  promotedMessage: 'An expense was logged from these details.',
  successToastTitle: 'Expense logged',
  errorToastTitle: 'Could not log expense',
};

function ExtractionReviewSection({
  propertyId,
  recordId,
  versionId,
  candidates,
  config,
}: {
  propertyId: string;
  recordId: string;
  versionId: string;
  candidates: ExtractedFactCandidate[];
  config: ExtractionDomainConfig;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['home-records', propertyId, 'detail', recordId] });
    queryClient.invalidateQueries({ queryKey: ['home-records', propertyId] });
  }

  const extractMutation = useMutation({
    mutationFn: () => runExtraction(propertyId, recordId, versionId),
    onSuccess: invalidate,
    onError: (e: any) => toast({ title: 'AI analysis failed', description: e?.message, variant: 'destructive' }),
  });

  const reviewMutation = useMutation({
    mutationFn: (input: { candidateId: string; action: 'CONFIRM' | 'CORRECT' | 'REJECT'; reviewedValue?: string }) =>
      reviewCandidate(propertyId, recordId, input.candidateId, { action: input.action, reviewedValue: input.reviewedValue }),
    onSuccess: invalidate,
    onError: (e: any) => toast({ title: 'Could not save review', description: e?.message, variant: 'destructive' }),
  });

  const promoteMutation = useMutation({
    mutationFn: () => config.promote(propertyId, recordId, versionId),
    onSuccess: () => { invalidate(); toast({ title: config.successToastTitle, description: 'Linked back to this record.' }); },
    onError: (e: any) => toast({ title: config.errorToastTitle, description: e?.message, variant: 'destructive' }),
  });

  const docTypeCandidate = candidates.find((c) => c.fieldKey === '_documentType');
  const fieldCandidates = candidates.filter((c) => c.fieldKey !== '_documentType');
  const alreadyPromoted = fieldCandidates.some((c) => c.promotedEntityId);
  const missingRequired = config.requiredFieldKeys.filter((key) => {
    const c = fieldCandidates.find((candidate) => candidate.fieldKey === key);
    return !c || !c.reviewedValue || (c.reviewStatus !== 'CONFIRMED' && c.reviewStatus !== 'CORRECTED');
  });

  return (
    <div className="space-y-2">
      <p className={cn(MOBILE_TYPE_TOKENS.caption, 'font-semibold tracking-normal text-gray-400')}>
        AI-assisted review
      </p>
      {candidates.length === 0 ? (
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2 border-dashed"
          onClick={() => extractMutation.mutate()}
          disabled={extractMutation.isPending}
        >
          {extractMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Analyze with AI
        </Button>
      ) : (
        <>
          {docTypeCandidate && (
            <p className={cn(MOBILE_TYPE_TOKENS.caption, 'text-gray-400')}>
              AI classified this as {docTypeCandidate.proposedValue} ({Math.round(docTypeCandidate.confidence * 100)}% confidence). Review each field below before it becomes part of your home record.
            </p>
          )}
          <div className="space-y-1.5">
            {fieldCandidates.map((candidate) => (
              <CandidateReviewRow
                key={candidate.id}
                candidate={candidate}
                fieldLabels={config.fieldLabels}
                isSubmitting={reviewMutation.isPending}
                onReview={(input) => reviewMutation.mutate({ candidateId: candidate.id, ...input })}
              />
            ))}
          </div>
          {alreadyPromoted ? (
            <p className={cn(MOBILE_TYPE_TOKENS.caption, 'text-green-700')}>{config.promotedMessage}</p>
          ) : (
            <Button
              size="sm"
              className="w-full gap-2"
              disabled={missingRequired.length > 0 || promoteMutation.isPending}
              onClick={() => promoteMutation.mutate()}
              title={missingRequired.length > 0 ? `Still needs: ${missingRequired.map((k) => config.fieldLabels[k]).join(', ')}` : undefined}
            >
              {promoteMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {config.promoteButtonLabel}
            </Button>
          )}
        </>
      )}
    </div>
  );
}

// ─── Record detail sheet ─────────────────────────────────────────────────────

function RecordDetailSheet({
  propertyId,
  recordId,
  onClose,
}: {
  propertyId: string;
  recordId: string;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [confirmingTrash, setConfirmingTrash] = React.useState(false);
  const versionInputRef = React.useRef<HTMLInputElement>(null);

  const detailQuery = useQuery({
    queryKey: ['home-records', propertyId, 'detail', recordId],
    queryFn: () => getRecord(propertyId, recordId),
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['home-records', propertyId] });
  }

  const addVersionMutation = useMutation({
    mutationFn: (file: File) => addVersion(propertyId, recordId, file),
    onSuccess: () => { invalidate(); toast({ title: 'New version added' }); },
    onError: (e: any) => toast({ title: 'Could not add version', description: e?.message, variant: 'destructive' }),
  });

  const addLinkMutation = useMutation({
    mutationFn: (input: { entityType: PropertyRecordLinkEntityType; entityId: string; purpose: PropertyRecordLinkPurpose; label?: string }) =>
      addLink(propertyId, recordId, input),
    onSuccess: () => { invalidate(); toast({ title: 'Link added' }); },
    onError: (e: any) => toast({ title: 'Could not add link', description: e?.message, variant: 'destructive' }),
  });

  const archiveMutation = useMutation({
    mutationFn: () => archiveRecord(propertyId, recordId),
    onSuccess: () => { invalidate(); toast({ title: 'Record archived' }); },
    onError: (e: any) => toast({ title: 'Could not archive', description: e?.message, variant: 'destructive' }),
  });

  const trashMutation = useMutation({
    mutationFn: (impactDecision?: 'KEEP_LINKS' | 'REMOVE_LINKS') => trashRecord(propertyId, recordId, impactDecision),
    onSuccess: () => { invalidate(); setConfirmingTrash(false); toast({ title: 'Moved to trash', description: 'Recoverable for 30 days.' }); onClose(); },
    onError: (e: any) => toast({ title: 'Could not trash record', description: e?.message, variant: 'destructive' }),
  });

  const restoreMutation = useMutation({
    mutationFn: () => restoreRecord(propertyId, recordId),
    onSuccess: () => { invalidate(); toast({ title: 'Record restored' }); },
    onError: (e: any) => toast({ title: 'Could not restore', description: e?.message, variant: 'destructive' }),
  });

  const retentionMutation = useMutation({
    mutationFn: (input: { legalHoldReason?: string | null }) => setRetention(propertyId, recordId, input),
    onSuccess: () => { invalidate(); toast({ title: 'Retention updated' }); },
    onError: (e: any) => toast({ title: 'Could not update retention', description: e?.message, variant: 'destructive' }),
  });

  const effectivePeriodMutation = useMutation({
    mutationFn: (input: { effectiveTo: string | null }) => setEffectivePeriod(propertyId, recordId, input),
    onSuccess: () => { invalidate(); toast({ title: 'Expiration updated' }); },
    onError: (e: any) => toast({ title: 'Could not update expiration', description: e?.message, variant: 'destructive' }),
  });

  const record = detailQuery.data;

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{record?.title ?? 'Record'}</SheetTitle>
        </SheetHeader>

        {detailQuery.isLoading && (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
        )}

        {record && (
          <div className="mt-4 space-y-5">
            <div className="flex flex-wrap items-center gap-1.5">
              <StatusChip tone={LIFECYCLE_TONE[record.lifecycleStatus] ?? 'info'}>
                {record.lifecycleStatus === 'ACTIVE' ? 'Active' : record.lifecycleStatus === 'ARCHIVED' ? 'Archived' : 'Trashed'}
              </StatusChip>
              <span className={cn(MOBILE_TYPE_TOKENS.caption, 'text-gray-500')}>{RECORD_TYPE_LABELS[record.recordType]}</span>
              <span className={cn(MOBILE_TYPE_TOKENS.caption, 'text-gray-400')}>· {SENSITIVITY_LABELS[record.sensitivity]}</span>
              <span className={cn(MOBILE_TYPE_TOKENS.caption, 'text-gray-400')}>· {VISIBILITY_LABELS[record.visibility]}</span>
              {record.needsReview && <StatusChip tone="elevated">Needs review</StatusChip>}
              {record.expiryStatus === 'EXPIRED' && <StatusChip tone="danger">Expired</StatusChip>}
              {record.expiryStatus === 'EXPIRING_SOON' && <StatusChip tone="elevated">Expiring soon</StatusChip>}
            </div>
            {record.description && <p className={cn(MOBILE_TYPE_TOKENS.body, 'text-gray-600')}>{record.description}</p>}

            {record.allowedActions.manageEffectivePeriod && (
              <div className="flex items-center gap-2">
                <Label htmlFor="record-effective-to" className="shrink-0 text-xs text-gray-500">Expires / needs renewal on</Label>
                <Input
                  id="record-effective-to"
                  type="date"
                  className="h-8 w-auto"
                  defaultValue={record.effectiveTo ? record.effectiveTo.slice(0, 10) : ''}
                  onBlur={(e) => {
                    const value = e.target.value;
                    const currentValue = record.effectiveTo ? record.effectiveTo.slice(0, 10) : '';
                    if (value === currentValue) return;
                    effectivePeriodMutation.mutate({
                      effectiveTo: value ? new Date(`${value}T00:00:00.000Z`).toISOString() : null,
                    });
                  }}
                />
              </div>
            )}

            {record.legalHoldReason && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
                <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                <p className={cn(MOBILE_TYPE_TOKENS.caption, 'text-amber-800')}>Legal hold: {record.legalHoldReason}</p>
              </div>
            )}

            {/* Versions */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className={cn(MOBILE_TYPE_TOKENS.caption, 'font-semibold tracking-normal text-gray-400')}>
                  Versions ({record.versions.length})
                </p>
                {record.allowedActions.addVersion && (
                  <>
                    <input
                      ref={versionInputRef}
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.webp"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) addVersionMutation.mutate(f);
                        e.target.value = '';
                      }}
                    />
                    <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => versionInputRef.current?.click()} disabled={addVersionMutation.isPending}>
                      {addVersionMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                      New version
                    </Button>
                  </>
                )}
              </div>
              <div className="space-y-1.5">
                {record.versions.map((v) => (
                  <div key={v.id} className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-3 py-2">
                    <div className="min-w-0">
                      <p className={cn(MOBILE_TYPE_TOKENS.body, 'truncate font-medium text-gray-800')}>
                        v{v.versionNumber} · {v.originalFileName}
                      </p>
                      <p className={cn(MOBILE_TYPE_TOKENS.caption, 'text-gray-400')}>
                        {formatBytes(v.fileSizeBytes)} · {formatDate(v.createdAt)} · {v.scanStatus === 'CLEAN' ? 'Clean' : v.scanStatus}
                      </p>
                    </div>
                    {v.id === record.currentVersion?.id && record.currentVersion?.downloadUrl && (
                      <a href={record.currentVersion.downloadUrl} target="_blank" rel="noreferrer" className="shrink-0 text-gray-400 hover:text-gray-700">
                        <Download className="h-4 w-4" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {(record.recordType === 'WARRANTY' || record.recordType === 'RECEIPT')
              && record.currentVersion?.scanStatus === 'CLEAN' && (
              <ExtractionReviewSection
                propertyId={propertyId}
                recordId={record.id}
                versionId={record.currentVersion.id}
                candidates={
                  record.versions.find((v) => v.id === record.currentVersion?.id)?.extractedFacts ?? []
                }
                config={record.recordType === 'WARRANTY' ? WARRANTY_EXTRACTION_CONFIG : EXPENSE_EXTRACTION_CONFIG}
              />
            )}

            {/* Links */}
            <div className="space-y-2">
              <p className={cn(MOBILE_TYPE_TOKENS.caption, 'font-semibold tracking-normal text-gray-400')}>
                Linked records ({record.links.length})
              </p>
              {record.links.length > 0 && (
                <div className="space-y-1.5">
                  {record.links.map((link) => {
                    const href = linkedEntityHref(propertyId, link.entityType, link.entityId);
                    const labelText = (
                      <p className={cn(MOBILE_TYPE_TOKENS.caption, 'flex-1', href ? 'text-blue-600' : 'text-gray-600')}>
                        {LINK_ENTITY_LABELS[link.entityType]} · {LINK_PURPOSE_LABELS[link.purpose]}
                        {link.label ? ` · ${link.label}` : ''}
                      </p>
                    );
                    return (
                      <div key={link.id} className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2">
                        <LinkIcon className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                        {href ? (
                          <Link href={href} className="min-w-0 flex-1 hover:underline">{labelText}</Link>
                        ) : labelText}
                        {link.broken === true && (
                          <span title="This link's target record could no longer be found.">
                            <StatusChip tone="danger">Broken</StatusChip>
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {record.allowedActions.link && (
                <AddLinkForm onAdd={(input) => addLinkMutation.mutate(input)} isSubmitting={addLinkMutation.isPending} />
              )}
            </div>

            {/* Retention (owner only) */}
            {record.allowedActions.manageRetention && (
              <div className="space-y-2">
                <p className={cn(MOBILE_TYPE_TOKENS.caption, 'font-semibold tracking-normal text-gray-400')}>Retention</p>
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Legal hold reason (optional)"
                    defaultValue={record.legalHoldReason ?? ''}
                    className="h-9"
                    onBlur={(e) => {
                      const value = e.target.value.trim();
                      if (value !== (record.legalHoldReason ?? '')) {
                        retentionMutation.mutate({ legalHoldReason: value || null });
                      }
                    }}
                  />
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-4">
              {record.allowedActions.archive && (
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => archiveMutation.mutate()} disabled={archiveMutation.isPending}>
                  <Archive className="h-3.5 w-3.5" />
                  Archive
                </Button>
              )}
              {record.allowedActions.restore && (
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => restoreMutation.mutate()} disabled={restoreMutation.isPending}>
                  <ArchiveRestore className="h-3.5 w-3.5" />
                  Restore
                </Button>
              )}
              {record.allowedActions.trash && !confirmingTrash && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 border-red-200 text-red-600 hover:bg-red-50"
                  onClick={() => {
                    if (record.deletionImpact.requiresImpactDecision) {
                      setConfirmingTrash(true);
                    } else {
                      trashMutation.mutate(undefined);
                    }
                  }}
                  disabled={trashMutation.isPending}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Move to trash
                </Button>
              )}
              {confirmingTrash && (
                <div className="w-full space-y-2 rounded-xl border border-red-200 bg-red-50 p-3">
                  <p className={cn(MOBILE_TYPE_TOKENS.caption, 'text-red-700')}>
                    This record is linked to {record.deletionImpact.activeLinkCount} other {record.deletionImpact.activeLinkCount === 1 ? 'record' : 'records'}. Choose what happens to those links.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => trashMutation.mutate('KEEP_LINKS')} disabled={trashMutation.isPending}>Keep links & trash</Button>
                    <Button size="sm" variant="outline" className="text-red-600" onClick={() => trashMutation.mutate('REMOVE_LINKS')} disabled={trashMutation.isPending}>Remove links & trash</Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmingTrash(false)}>Cancel</Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ─── Main client ──────────────────────────────────────────────────────────────

type RecordView = 'ALL' | 'NEEDS_REVIEW' | 'EXPIRING';

export default function HomeRecordsClient() {
  const { id: propertyId } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showTrashed, setShowTrashed] = React.useState(false);
  const [uploadOpen, setUploadOpen] = React.useState(false);
  // A real resolution flow, not just an after-the-fact toast: holds the
  // pending upload + its possible-version match while the homeowner
  // decides whether this is a new version of an existing record.
  const [pendingVersionResolution, setPendingVersionResolution] = React.useState<{
    input: CreateRecordInput;
    match: NonNullable<PossibleVersionMatch>;
  } | null>(null);
  // Deep-linkable from elsewhere (e.g. a Timeline event's evidence link) —
  // detail is otherwise a client-state-driven sheet with no URL of its own.
  const [selectedRecordId, setSelectedRecordId] = React.useState<string | null>(() => searchParams.get('recordId'));
  const [search, setSearch] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  const [recordTypeFilter, setRecordTypeFilter] = React.useState<PropertyRecordType | 'ALL'>('ALL');
  const [view, setView] = React.useState<RecordView>('ALL');

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const recordsQuery = useQuery({
    queryKey: ['home-records', propertyId, showTrashed ? 'TRASHED' : 'ACTIVE', debouncedSearch, recordTypeFilter],
    queryFn: () => listRecords(propertyId, {
      lifecycleStatus: showTrashed ? 'TRASHED' : undefined,
      search: debouncedSearch || undefined,
      recordType: recordTypeFilter === 'ALL' ? undefined : recordTypeFilter,
    }),
    enabled: Boolean(propertyId),
    staleTime: 2 * 60 * 1000,
  });

  const createMutation = useMutation({
    mutationFn: (input: Parameters<typeof createRecord>[1]) => createRecord(propertyId, input),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['home-records', propertyId] });
      setUploadOpen(false);
      toast({
        title: 'Record added',
        // Rare fallback (e.g. a matching record appeared after the
        // pre-flight check ran) — the real resolution flow is
        // pendingVersionResolution below, not this toast.
        description: result.possibleVersionOf
          ? `A record named "${result.possibleVersionOf.title}" already exists — consider linking this as a new version instead.`
          : undefined,
      });
    },
    onError: (e: any) => {
      toast({ title: 'Could not add record', description: e?.message, variant: 'destructive' });
    },
  });

  const addVersionForResolutionMutation = useMutation({
    mutationFn: (args: { recordId: string; file: File }) => addVersion(propertyId, args.recordId, args.file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['home-records', propertyId] });
      setPendingVersionResolution(null);
      setUploadOpen(false);
      toast({ title: 'Added as a new version' });
    },
    onError: (e: any) => {
      toast({ title: 'Could not add version', description: e?.message, variant: 'destructive' });
    },
  });

  // Checks for a possible-version match before ever creating a record —
  // real resolution instead of create()'s own after-the-fact toast.
  async function handleUploadSubmit(input: CreateRecordInput) {
    try {
      const match = await checkPossibleVersion(propertyId, input.title, input.recordType);
      if (match) {
        setPendingVersionResolution({ input, match });
        return;
      }
    } catch {
      // Pre-flight check failing must not block uploading — fall through
      // to create(), which still runs its own (after-the-fact) check.
    }
    createMutation.mutate(input);
  }

  const records = recordsQuery.data ?? [];
  const needsReviewCount = records.filter((record) => record.needsReview).length;
  const expiringCount = records.filter((record) => record.expiryStatus === 'EXPIRING_SOON' || record.expiryStatus === 'EXPIRED').length;
  const visibleRecords = records.filter((record) => {
    if (view === 'NEEDS_REVIEW') return record.needsReview;
    if (view === 'EXPIRING') return record.expiryStatus === 'EXPIRING_SOON' || record.expiryStatus === 'EXPIRED';
    return true;
  });
  const isFiltering = Boolean(debouncedSearch) || recordTypeFilter !== 'ALL' || view !== 'ALL';

  return (
    <MobilePageContainer className="space-y-5 py-4 lg:max-w-5xl lg:px-8 lg:pb-10">
      <MobilePageIntro
        eyebrow="Home tool"
        title="Property Records"
        subtitle="Warranties, receipts, inspections, permits, and other property records — organized by property, not by who uploaded them."
        className="lg:hidden"
      />
      <HomeToolHeader toolId="home-records" propertyId={propertyId} />

      <MobileCard className="flex flex-wrap items-center justify-between gap-3 border border-gray-200 bg-white p-4">
        <div className="flex items-center gap-2">
          <Button variant={!showTrashed ? 'default' : 'outline'} size="sm" onClick={() => setShowTrashed(false)}>
            Records
          </Button>
          <Button variant={showTrashed ? 'default' : 'outline'} size="sm" onClick={() => setShowTrashed(true)}>
            Trash
          </Button>
        </div>
        {!showTrashed && (
          <Button size="sm" className="gap-1.5" onClick={() => setUploadOpen(true)}>
            <Plus className="h-4 w-4" />
            Add record
          </Button>
        )}
      </MobileCard>

      {!showTrashed && (
        <div className="space-y-2.5">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search records — including text inside documents"
                className="pl-9"
              />
            </div>
            <Select value={recordTypeFilter} onValueChange={(v) => setRecordTypeFilter(v as PropertyRecordType | 'ALL')}>
              <SelectTrigger className="sm:w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All types</SelectItem>
                {(Object.entries(RECORD_TYPE_LABELS) as [PropertyRecordType, string][]).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {search.trim() && (
            <p className="text-xs text-gray-500">
              Searching titles, descriptions, and document content. Newly uploaded files may take a
              moment before their content is searchable.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            <Button variant={view === 'ALL' ? 'default' : 'outline'} size="sm" className="h-7 rounded-full px-3 text-xs" onClick={() => setView('ALL')}>
              All records
            </Button>
            <Button
              variant={view === 'NEEDS_REVIEW' ? 'default' : 'outline'}
              size="sm"
              className="h-7 gap-1 rounded-full px-3 text-xs"
              onClick={() => setView('NEEDS_REVIEW')}
              disabled={needsReviewCount === 0 && view !== 'NEEDS_REVIEW'}
            >
              Needs review{needsReviewCount > 0 ? ` (${needsReviewCount})` : ''}
            </Button>
            <Button
              variant={view === 'EXPIRING' ? 'default' : 'outline'}
              size="sm"
              className="h-7 gap-1 rounded-full px-3 text-xs"
              onClick={() => setView('EXPIRING')}
              disabled={expiringCount === 0 && view !== 'EXPIRING'}
            >
              Expiring or outdated{expiringCount > 0 ? ` (${expiringCount})` : ''}
            </Button>
          </div>
        </div>
      )}

      {recordsQuery.isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
      ) : visibleRecords.length === 0 ? (
        <EmptyStateCard
          title={showTrashed ? 'Trash is empty' : isFiltering ? 'No records match' : 'No records yet'}
          description={
            showTrashed
              ? 'Records you move to trash stay recoverable here for 30 days.'
              : isFiltering
                ? 'Try a different search term, type, or view.'
                : 'Add a warranty, receipt, inspection report, or other file tied to this property.'
          }
          action={
            !showTrashed && !isFiltering ? (
              <Button variant="outline" size="sm" className="mt-2 gap-2" onClick={() => setUploadOpen(true)}>
                <Plus className="h-4 w-4" />
                Add first record
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-2.5">
          {visibleRecords.map((record) => (
            <RecordCard key={record.id} record={record} onOpen={() => setSelectedRecordId(record.id)} />
          ))}
        </div>
      )}

      <UploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        isSubmitting={createMutation.isPending}
        onSubmit={handleUploadSubmit}
      />

      <Dialog open={Boolean(pendingVersionResolution)} onOpenChange={(open) => { if (!open) setPendingVersionResolution(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Is this a new version?</DialogTitle>
          </DialogHeader>
          {pendingVersionResolution && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                A record named <span className="font-medium text-gray-900">&ldquo;{pendingVersionResolution.match.title}&rdquo;</span> already
                exists for this property. Add this upload as a new version of it, or create a separate record?
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  className="flex-1"
                  disabled={addVersionForResolutionMutation.isPending}
                  onClick={() => addVersionForResolutionMutation.mutate({
                    recordId: pendingVersionResolution.match.id,
                    file: pendingVersionResolution.input.file,
                  })}
                >
                  Add as new version
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  disabled={createMutation.isPending}
                  onClick={() => {
                    const { input } = pendingVersionResolution;
                    setPendingVersionResolution(null);
                    createMutation.mutate(input);
                  }}
                >
                  Create separate record
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {selectedRecordId && propertyId && (
        <RecordDetailSheet propertyId={propertyId} recordId={selectedRecordId} onClose={() => setSelectedRecordId(null)} />
      )}

      <BottomSafeAreaReserve size="chatAware" />
    </MobilePageContainer>
  );
}
