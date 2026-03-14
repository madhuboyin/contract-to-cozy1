'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  ChevronRight,
  ClipboardList,
  FileText,
  Info,
  Loader2,
  Pencil,
  Pin,
  Plus,
  Shield,
  Trash2,
  Wrench,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import {
  BottomSafeAreaReserve,
  EmptyStateCard,
  IconBadge,
  MobileCard,
  MobilePageContainer,
  MobileSection,
  MobileSectionHeader,
  StatusChip,
} from '@/components/mobile/dashboard/MobilePrimitives';
import { MOBILE_CARD_RADIUS, MOBILE_TYPE_TOKENS } from '@/components/mobile/dashboard/mobileDesignTokens';
import RelatedTools from '@/components/tools/RelatedTools';
import {
  createEntry,
  deleteEntry,
  getDigitalWill,
  getOrCreateDigitalWill,
  updateDigitalWill,
  updateEntry,
} from './homeDigitalWillApi';
import type {
  CreateEntryInput,
  DigitalWill,
  DigitalWillEntry,
  DigitalWillSection,
  EntryPriority,
  EntryType,
  SectionType,
  UpdateEntryInput,
  UpdateWillInput,
} from './types';

// ─── Display config ───────────────────────────────────────────────────────────

const SECTION_CONFIG: Record<
  SectionType,
  {
    Icon: React.ElementType;
    iconColor: string;
    iconBg: string;
    tone: 'danger' | 'elevated' | 'info' | 'good';
    label: string;
    hint: string;
  }
> = {
  EMERGENCY: {
    Icon: AlertTriangle,
    iconColor: 'text-red-600',
    iconBg: 'bg-red-50',
    tone: 'danger',
    label: 'Emergency Instructions',
    hint: 'Critical steps and contacts for urgent situations',
  },
  CRITICAL_INFO: {
    Icon: Info,
    iconColor: 'text-orange-600',
    iconBg: 'bg-orange-50',
    tone: 'elevated',
    label: 'Critical Information',
    hint: 'Essential knowledge for anyone managing this home',
  },
  CONTRACTORS: {
    Icon: Wrench,
    iconColor: 'text-blue-600',
    iconBg: 'bg-blue-50',
    tone: 'info',
    label: 'Preferred Contractors',
    hint: 'Trusted service providers and preferences',
  },
  MAINTENANCE_KNOWLEDGE: {
    Icon: BookOpen,
    iconColor: 'text-teal-600',
    iconBg: 'bg-teal-50',
    tone: 'good',
    label: 'Maintenance Knowledge',
    hint: 'Home quirks, routines, and maintenance know-how',
  },
  UTILITIES: {
    Icon: Zap,
    iconColor: 'text-yellow-600',
    iconBg: 'bg-yellow-50',
    tone: 'elevated',
    label: 'Utilities',
    hint: 'Providers, account details, and shutoff procedures',
  },
  INSURANCE: {
    Icon: Shield,
    iconColor: 'text-green-600',
    iconBg: 'bg-green-50',
    tone: 'good',
    label: 'Insurance Notes',
    hint: 'Policies, contacts, and claim guidance',
  },
  HOUSE_RULES: {
    Icon: ClipboardList,
    iconColor: 'text-purple-600',
    iconBg: 'bg-purple-50',
    tone: 'info',
    label: 'House Rules',
    hint: 'How this home should be operated and cared for',
  },
  GENERAL_NOTES: {
    Icon: FileText,
    iconColor: 'text-gray-600',
    iconBg: 'bg-gray-50',
    tone: 'good',
    label: 'General Notes',
    hint: 'Additional notes and information',
  },
};

const READINESS_TONE: Record<
  string,
  'good' | 'elevated' | 'danger' | 'info'
> = {
  NOT_STARTED: 'elevated',
  IN_PROGRESS: 'info',
  READY: 'good',
  NEEDS_REVIEW: 'danger',
};

const READINESS_LABEL: Record<string, string> = {
  NOT_STARTED: 'Not Started',
  IN_PROGRESS: 'In Progress',
  READY: 'Ready',
  NEEDS_REVIEW: 'Needs Review',
};

const PRIORITY_TONE: Record<EntryPriority, 'good' | 'elevated' | 'danger' | 'info'> = {
  LOW: 'good',
  MEDIUM: 'info',
  HIGH: 'elevated',
  CRITICAL: 'danger',
};

const ENTRY_TYPE_OPTIONS: { value: EntryType; label: string }[] = [
  { value: 'INSTRUCTION', label: 'Instruction' },
  { value: 'LOCATION_NOTE', label: 'Location Note' },
  { value: 'CONTACT_NOTE', label: 'Contact Note' },
  { value: 'SERVICE_PREFERENCE', label: 'Service Preference' },
  { value: 'MAINTENANCE_RULE', label: 'Maintenance Rule' },
  { value: 'POLICY_NOTE', label: 'Policy Note' },
  { value: 'ACCESS_NOTE', label: 'Access Note' },
  { value: 'GENERAL_NOTE', label: 'General Note' },
];

const PRIORITY_OPTIONS: { value: EntryPriority; label: string }[] = [
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
  { value: 'CRITICAL', label: 'Critical' },
];

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function WillSkeleton() {
  return (
    <MobilePageContainer className="space-y-5 py-4 lg:max-w-7xl lg:px-8 lg:pb-10">
      <div className="animate-pulse space-y-4">
        <div className={cn('h-28 rounded-[22px] bg-gray-100')} />
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className={cn('h-16 rounded-[22px] bg-gray-100')} />
          ))}
        </div>
      </div>
    </MobilePageContainer>
  );
}

// ─── Empty / init state ───────────────────────────────────────────────────────

function WillEmptyState({
  propertyId,
  onInit,
  isLoading,
}: {
  propertyId: string;
  onInit: () => void;
  isLoading: boolean;
}) {
  return (
    <MobilePageContainer className="space-y-5 py-4 lg:max-w-7xl lg:px-8 lg:pb-10">
      <MobileSection>
        <div className="mb-4 flex items-center gap-2">
          <Link href={`/dashboard/properties/${propertyId}`}>
            <Button variant="ghost" size="sm" className="gap-1.5 text-sm">
              <ArrowLeft className="h-3.5 w-3.5" />
              Property
            </Button>
          </Link>
        </div>
        <EmptyStateCard
          title="Home Digital Will"
          description="Capture the critical knowledge your family may need to manage this home — emergency instructions, home quirks, contractor preferences, utilities, and more."
          action={
            <Button onClick={onInit} disabled={isLoading} className="mt-2 gap-2">
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              {isLoading ? 'Creating…' : 'Create Home Digital Will'}
            </Button>
          }
        />
      </MobileSection>
      <BottomSafeAreaReserve size="chatAware" />
    </MobilePageContainer>
  );
}

// ─── Will header ──────────────────────────────────────────────────────────────

function WillHeader({
  will,
  onEditMetadata,
}: {
  will: DigitalWill;
  onEditMetadata: () => void;
}) {
  const readinessTone = READINESS_TONE[will.readiness] ?? 'info';
  const readinessLabel = READINESS_LABEL[will.readiness] ?? will.readiness;
  const lastReviewed = will.lastReviewedAt
    ? new Date(will.lastReviewedAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  return (
    <MobileCard
      className={cn(MOBILE_CARD_RADIUS, 'border border-gray-200 bg-white p-5')}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className={cn(MOBILE_TYPE_TOKENS.caption, 'mb-1 text-gray-500')}>
            Home Digital Will
          </p>
          <h1 className={cn(MOBILE_TYPE_TOKENS.sectionTitle, 'text-gray-900')}>
            {will.title}
          </h1>
          <p className={cn(MOBILE_TYPE_TOKENS.body, 'mt-1 text-gray-500')}>
            Store the critical knowledge your home needs to function.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusChip tone={readinessTone}>{readinessLabel}</StatusChip>
            {will.counts.entryCount > 0 && (
              <StatusChip tone="good">
                {will.counts.entryCount} {will.counts.entryCount === 1 ? 'entry' : 'entries'}
              </StatusChip>
            )}
            {lastReviewed && (
              <span className={cn(MOBILE_TYPE_TOKENS.caption, 'text-gray-400')}>
                Reviewed {lastReviewed}
              </span>
            )}
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onEditMetadata} className="mt-1 shrink-0">
          <Pencil className="h-4 w-4" />
        </Button>
      </div>
    </MobileCard>
  );
}

// ─── Section card (list item) ──────────────────────────────────────────────────

function SectionCard({
  section,
  isSelected,
  onClick,
}: {
  section: DigitalWillSection;
  isSelected: boolean;
  onClick: () => void;
}) {
  const config = SECTION_CONFIG[section.type];
  const { Icon } = config;
  const entryCount = section.entries.length;
  const hasEmergency = section.entries.some((e) => e.isEmergency);

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full rounded-[22px] border p-4 text-left transition-colors',
        isSelected
          ? 'border-gray-900 bg-gray-900 text-white'
          : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50',
      )}
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
            isSelected ? 'bg-white/15' : config.iconBg,
          )}
        >
          <Icon
            className={cn(
              'h-4.5 w-4.5',
              isSelected ? 'text-white' : config.iconColor,
            )}
          />
        </div>
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              MOBILE_TYPE_TOKENS.cardTitle,
              isSelected ? 'text-white' : 'text-gray-900',
            )}
          >
            {config.label}
          </p>
          {entryCount > 0 ? (
            <p
              className={cn(
                MOBILE_TYPE_TOKENS.caption,
                'mt-0.5',
                isSelected ? 'text-gray-300' : 'text-gray-500',
              )}
            >
              {entryCount} {entryCount === 1 ? 'entry' : 'entries'}
              {hasEmergency && ' · includes emergency'}
            </p>
          ) : (
            <p
              className={cn(
                MOBILE_TYPE_TOKENS.caption,
                'mt-0.5',
                isSelected ? 'text-gray-400' : 'text-gray-400',
              )}
            >
              No entries yet
            </p>
          )}
        </div>
        <ChevronRight
          className={cn('h-4 w-4 shrink-0', isSelected ? 'text-gray-400' : 'text-gray-300')}
        />
      </div>
    </button>
  );
}

// ─── Entry card ───────────────────────────────────────────────────────────────

function EntryCard({
  entry,
  onEdit,
  onDelete,
  isDeleting,
}: {
  entry: DigitalWillEntry;
  onEdit: (entry: DigitalWillEntry) => void;
  onDelete: (id: string) => void;
  isDeleting: boolean;
}) {
  return (
    <div className={cn(MOBILE_CARD_RADIUS, 'border border-gray-200 bg-white p-4')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {entry.isEmergency && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700">
                <AlertTriangle className="h-3 w-3" />
                Emergency
              </span>
            )}
            {entry.isPinned && (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                <Pin className="h-3 w-3" />
                Pinned
              </span>
            )}
            {entry.priority !== 'MEDIUM' && (
              <StatusChip tone={PRIORITY_TONE[entry.priority]}>
                {entry.priority.charAt(0) + entry.priority.slice(1).toLowerCase()}
              </StatusChip>
            )}
          </div>
          <p
            className={cn(
              MOBILE_TYPE_TOKENS.cardTitle,
              'mt-1.5 text-gray-900',
            )}
          >
            {entry.title}
          </p>
          {(entry.summary || entry.content) && (
            <p
              className={cn(
                MOBILE_TYPE_TOKENS.body,
                'mt-1 line-clamp-2 text-gray-500',
              )}
            >
              {entry.summary || entry.content}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => onEdit(entry)}
          >
            <Pencil className="h-3.5 w-3.5 text-gray-400" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => onDelete(entry.id)}
            disabled={isDeleting}
          >
            {isDeleting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />
            ) : (
              <Trash2 className="h-3.5 w-3.5 text-gray-400 hover:text-red-500" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Section detail panel ─────────────────────────────────────────────────────

function SectionDetailPanel({
  section,
  onBack,
  onAddEntry,
  onEditEntry,
  onDeleteEntry,
  deletingEntryId,
}: {
  section: DigitalWillSection;
  onBack: () => void;
  onAddEntry: () => void;
  onEditEntry: (entry: DigitalWillEntry) => void;
  onDeleteEntry: (id: string) => void;
  deletingEntryId: string | null;
}) {
  const config = SECTION_CONFIG[section.type];
  const { Icon } = config;

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0 gap-1.5 lg:hidden"
          onClick={onBack}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Sections
        </Button>
        <div
          className={cn(
            'hidden items-center gap-3 lg:flex',
          )}
        >
          <div
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-xl',
              config.iconBg,
            )}
          >
            <Icon className={cn('h-4.5 w-4.5', config.iconColor)} />
          </div>
          <div>
            <h2 className={cn(MOBILE_TYPE_TOKENS.sectionTitle, 'text-gray-900')}>
              {config.label}
            </h2>
            {config.hint && (
              <p className={cn(MOBILE_TYPE_TOKENS.caption, 'text-gray-500')}>
                {config.hint}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Mobile section title */}
      <div className="lg:hidden">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-xl',
              config.iconBg,
            )}
          >
            <Icon className={cn('h-4.5 w-4.5', config.iconColor)} />
          </div>
          <div>
            <h2 className={cn(MOBILE_TYPE_TOKENS.cardTitle, 'text-gray-900')}>
              {config.label}
            </h2>
            <p className={cn(MOBILE_TYPE_TOKENS.caption, 'text-gray-500')}>
              {config.hint}
            </p>
          </div>
        </div>
      </div>

      {/* Add entry button */}
      <Button
        variant="outline"
        size="sm"
        className="w-full justify-start gap-2 rounded-xl border-dashed"
        onClick={onAddEntry}
      >
        <Plus className="h-4 w-4" />
        Add Entry
      </Button>

      {/* Entries */}
      {section.entries.length === 0 ? (
        <EmptyStateCard
          title="No entries yet"
          description="Add instructions, notes, contacts, and other important information for this section."
          action={
            <Button
              variant="outline"
              size="sm"
              className="mt-2 gap-2"
              onClick={onAddEntry}
            >
              <Plus className="h-4 w-4" />
              Add first entry
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-2.5">
          {section.entries.map((entry) => (
            <EntryCard
              key={entry.id}
              entry={entry}
              onEdit={onEditEntry}
              onDelete={onDeleteEntry}
              isDeleting={deletingEntryId === entry.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Entry editor sheet ───────────────────────────────────────────────────────

interface EntryEditorState {
  mode: 'create' | 'edit';
  sectionId: string;
  entry?: DigitalWillEntry;
}

function EntryEditorSheet({
  state,
  onClose,
  onSave,
  isSaving,
}: {
  state: EntryEditorState | null;
  onClose: () => void;
  onSave: (data: CreateEntryInput | UpdateEntryInput) => void;
  isSaving: boolean;
}) {
  const [form, setForm] = React.useState<CreateEntryInput>({
    entryType: 'GENERAL_NOTE',
    title: '',
    content: null,
    summary: null,
    priority: 'MEDIUM',
    isPinned: false,
    isEmergency: false,
    effectiveFrom: null,
    effectiveTo: null,
  });

  React.useEffect(() => {
    if (!state) return;
    if (state.mode === 'edit' && state.entry) {
      setForm({
        entryType: state.entry.entryType,
        title: state.entry.title,
        content: state.entry.content,
        summary: state.entry.summary,
        priority: state.entry.priority,
        isPinned: state.entry.isPinned,
        isEmergency: state.entry.isEmergency,
        effectiveFrom: state.entry.effectiveFrom
          ? state.entry.effectiveFrom.slice(0, 10)
          : null,
        effectiveTo: state.entry.effectiveTo
          ? state.entry.effectiveTo.slice(0, 10)
          : null,
      });
    } else {
      setForm({
        entryType: 'GENERAL_NOTE',
        title: '',
        content: null,
        summary: null,
        priority: 'MEDIUM',
        isPinned: false,
        isEmergency: false,
        effectiveFrom: null,
        effectiveTo: null,
      });
    }
  }, [state]);

  const isOpen = state !== null;
  const title = state?.mode === 'edit' ? 'Edit Entry' : 'Add Entry';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    onSave({
      ...form,
      title: form.title.trim(),
      content: form.content?.trim() || null,
      summary: form.summary?.trim() || null,
      effectiveFrom: form.effectiveFrom
        ? new Date(form.effectiveFrom).toISOString()
        : null,
      effectiveTo: form.effectiveTo
        ? new Date(form.effectiveTo).toISOString()
        : null,
    });
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b px-5 py-4">
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-y-auto">
          <div className="flex flex-col gap-5 px-5 py-5">
            {/* Basics */}
            <div className="space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                Basics
              </h3>

              <div className="space-y-1.5">
                <Label htmlFor="entry-type">Entry type</Label>
                <Select
                  value={form.entryType}
                  onValueChange={(v) => setForm((f) => ({ ...f, entryType: v as EntryType }))}
                >
                  <SelectTrigger id="entry-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ENTRY_TYPE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="entry-title">Title *</Label>
                <Input
                  id="entry-title"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Main water shutoff valve location"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="entry-content">
                  Content <span className="text-gray-400">(optional)</span>
                </Label>
                <Textarea
                  id="entry-content"
                  value={form.content ?? ''}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, content: e.target.value || null }))
                  }
                  placeholder="Detailed instructions, location, notes…"
                  rows={4}
                  className="resize-none"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="entry-summary">
                  Summary <span className="text-gray-400">(optional)</span>
                </Label>
                <Input
                  id="entry-summary"
                  value={form.summary ?? ''}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, summary: e.target.value || null }))
                  }
                  placeholder="One-line summary for quick reference"
                />
              </div>
            </div>

            {/* Importance */}
            <div className="space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                Importance
              </h3>

              <div className="space-y-1.5">
                <Label htmlFor="entry-priority">Priority</Label>
                <Select
                  value={form.priority ?? 'MEDIUM'}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, priority: v as EntryPriority }))
                  }
                >
                  <SelectTrigger id="entry-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITY_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">Emergency entry</p>
                  <p className="text-xs text-gray-500">Mark for urgent situations</p>
                </div>
                <Switch
                  checked={form.isEmergency ?? false}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, isEmergency: v }))}
                />
              </div>

              <div className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">Pin entry</p>
                  <p className="text-xs text-gray-500">Surface at the top of the list</p>
                </div>
                <Switch
                  checked={form.isPinned ?? false}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, isPinned: v }))}
                />
              </div>
            </div>

            {/* Timing */}
            <div className="space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                Timing <span className="font-normal normal-case text-gray-400">(optional)</span>
              </h3>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="entry-from">Effective from</Label>
                  <Input
                    id="entry-from"
                    type="date"
                    value={form.effectiveFrom ?? ''}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, effectiveFrom: e.target.value || null }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="entry-to">Effective to</Label>
                  <Input
                    id="entry-to"
                    type="date"
                    value={form.effectiveTo ?? ''}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, effectiveTo: e.target.value || null }))
                    }
                  />
                </div>
              </div>
            </div>
          </div>

          <SheetFooter className="mt-auto border-t px-5 py-4">
            <div className="flex w-full gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={onClose}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="flex-1 gap-2"
                disabled={isSaving || !form.title.trim()}
              >
                {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                {state?.mode === 'edit' ? 'Save changes' : 'Add entry'}
              </Button>
            </div>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

// ─── Metadata editor sheet ────────────────────────────────────────────────────

function WillMetadataSheet({
  will,
  open,
  onClose,
  onSave,
  isSaving,
}: {
  will: DigitalWill | null;
  open: boolean;
  onClose: () => void;
  onSave: (data: UpdateWillInput) => void;
  isSaving: boolean;
}) {
  const [form, setForm] = React.useState({
    title: '',
    status: 'DRAFT' as string,
    readiness: 'NOT_STARTED' as string,
    lastReviewedAt: '',
  });

  React.useEffect(() => {
    if (will && open) {
      setForm({
        title: will.title,
        status: will.status,
        readiness: will.readiness,
        lastReviewedAt: will.lastReviewedAt
          ? will.lastReviewedAt.slice(0, 10)
          : '',
      });
    }
  }, [will, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      title: form.title.trim() || undefined,
      status: form.status as UpdateWillInput['status'],
      readiness: form.readiness as UpdateWillInput['readiness'],
      lastReviewedAt: form.lastReviewedAt
        ? new Date(form.lastReviewedAt).toISOString()
        : null,
    });
  };

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b px-5 py-4">
          <SheetTitle>Edit Will Details</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-y-auto">
          <div className="flex flex-col gap-4 px-5 py-5">
            <div className="space-y-1.5">
              <Label htmlFor="will-title">Title</Label>
              <Input
                id="will-title"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Home Digital Will"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="will-status">Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}
              >
                <SelectTrigger id="will-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DRAFT">Draft</SelectItem>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="ARCHIVED">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="will-readiness">Readiness</Label>
              <Select
                value={form.readiness}
                onValueChange={(v) => setForm((f) => ({ ...f, readiness: v }))}
              >
                <SelectTrigger id="will-readiness">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NOT_STARTED">Not Started</SelectItem>
                  <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                  <SelectItem value="READY">Ready</SelectItem>
                  <SelectItem value="NEEDS_REVIEW">Needs Review</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="will-reviewed">Last reviewed</Label>
              <Input
                id="will-reviewed"
                type="date"
                value={form.lastReviewedAt}
                onChange={(e) =>
                  setForm((f) => ({ ...f, lastReviewedAt: e.target.value }))
                }
              />
            </div>
          </div>

          <SheetFooter className="mt-auto border-t px-5 py-4">
            <div className="flex w-full gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" className="flex-1 gap-2" disabled={isSaving}>
                {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                Save changes
              </Button>
            </div>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

// ─── Trusted contacts placeholder ─────────────────────────────────────────────

function TrustedContactsPlaceholder() {
  return (
    <div
      className={cn(
        MOBILE_CARD_RADIUS,
        'border border-dashed border-gray-200 bg-gray-50 p-4 text-center',
      )}
    >
      <p className={cn(MOBILE_TYPE_TOKENS.body, 'text-gray-500')}>
        Trusted contacts coming soon — store who can access and operate this home.
      </p>
    </div>
  );
}

// ─── Main page component ──────────────────────────────────────────────────────

export default function HomeDigitalWillClient() {
  const { id: propertyId } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [selectedSectionId, setSelectedSectionId] = React.useState<string | null>(null);
  const [entryEditorState, setEntryEditorState] =
    React.useState<EntryEditorState | null>(null);
  const [metadataEditorOpen, setMetadataEditorOpen] = React.useState(false);
  const [deletingEntryId, setDeletingEntryId] = React.useState<string | null>(null);

  // ─── Queries ───────────────────────────────────────────────────────────────

  const willQuery = useQuery({
    queryKey: ['home-digital-will', propertyId],
    queryFn: () => getDigitalWill(propertyId),
    enabled: !!propertyId,
    staleTime: 3 * 60 * 1000,
  });

  const will = willQuery.data ?? null;

  // Auto-select the first section once loaded (desktop)
  React.useEffect(() => {
    if (will && !selectedSectionId && will.sections.length > 0) {
      setSelectedSectionId(will.sections[0].id);
    }
  }, [will, selectedSectionId]);

  const selectedSection = will?.sections.find((s) => s.id === selectedSectionId) ?? null;

  // ─── Mutations ────────────────────────────────────────────────────────────

  const initWillMutation = useMutation({
    mutationFn: () => getOrCreateDigitalWill(propertyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['home-digital-will', propertyId] });
      toast({ title: 'Home Digital Will created', description: 'Your will has been set up with default sections.' });
    },
    onError: () => {
      toast({ title: 'Failed to create will', variant: 'destructive' });
    },
  });

  const updateWillMutation = useMutation({
    mutationFn: (data: UpdateWillInput) => updateDigitalWill(will!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['home-digital-will', propertyId] });
      setMetadataEditorOpen(false);
      toast({ title: 'Will details updated' });
    },
    onError: () => {
      toast({ title: 'Failed to update will details', variant: 'destructive' });
    },
  });

  const createEntryMutation = useMutation({
    mutationFn: (data: CreateEntryInput) =>
      createEntry(entryEditorState!.sectionId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['home-digital-will', propertyId] });
      setEntryEditorState(null);
      toast({ title: 'Entry added' });
    },
    onError: () => {
      toast({ title: 'Failed to add entry', variant: 'destructive' });
    },
  });

  const updateEntryMutation = useMutation({
    mutationFn: (data: UpdateEntryInput) =>
      updateEntry(entryEditorState!.entry!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['home-digital-will', propertyId] });
      setEntryEditorState(null);
      toast({ title: 'Entry updated' });
    },
    onError: () => {
      toast({ title: 'Failed to update entry', variant: 'destructive' });
    },
  });

  const deleteEntryMutation = useMutation({
    mutationFn: (entryId: string) => deleteEntry(entryId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['home-digital-will', propertyId] });
      setDeletingEntryId(null);
      toast({ title: 'Entry deleted' });
    },
    onError: () => {
      setDeletingEntryId(null);
      toast({ title: 'Failed to delete entry', variant: 'destructive' });
    },
  });

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const handleDeleteEntry = (entryId: string) => {
    setDeletingEntryId(entryId);
    deleteEntryMutation.mutate(entryId);
  };

  const handleSaveEntry = (data: CreateEntryInput | UpdateEntryInput) => {
    if (entryEditorState?.mode === 'edit') {
      updateEntryMutation.mutate(data as UpdateEntryInput);
    } else {
      createEntryMutation.mutate(data as CreateEntryInput);
    }
  };

  const isSavingEntry =
    createEntryMutation.isPending || updateEntryMutation.isPending;

  // ─── Render states ─────────────────────────────────────────────────────────

  if (!propertyId) {
    return (
      <MobilePageContainer className="py-10 text-center lg:max-w-7xl lg:px-8">
        <p className="text-sm text-gray-500">No property selected.</p>
      </MobilePageContainer>
    );
  }

  if (willQuery.isLoading) return <WillSkeleton />;

  if (willQuery.isError) {
    return (
      <MobilePageContainer className="space-y-4 py-4 lg:max-w-7xl lg:px-8">
        <EmptyStateCard
          title="Couldn't load your Home Digital Will"
          description="There was a problem fetching your data. Please try again."
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => willQuery.refetch()}
              className="mt-2 gap-2"
            >
              Retry
            </Button>
          }
        />
      </MobilePageContainer>
    );
  }

  if (!will) {
    return (
      <WillEmptyState
        propertyId={propertyId}
        onInit={() => initWillMutation.mutate()}
        isLoading={initWillMutation.isPending}
      />
    );
  }

  // ─── Main UI ───────────────────────────────────────────────────────────────

  const showSectionList = !selectedSectionId;
  const showSectionDetail = !!selectedSectionId && !!selectedSection;

  return (
    <>
      <MobilePageContainer className="space-y-5 py-3 lg:max-w-7xl lg:px-8 lg:pb-10">
        {/* Back link */}
        <div>
          <Link href={`/dashboard/properties/${propertyId}`}>
            <Button variant="ghost" size="sm" className="gap-1.5 text-sm text-gray-500">
              <ArrowLeft className="h-3.5 w-3.5" />
              Property
            </Button>
          </Link>
        </div>

        {/* Header card — always visible */}
        <WillHeader will={will} onEditMetadata={() => setMetadataEditorOpen(true)} />

        {/* Desktop: two-column layout */}
        <div className="hidden lg:flex lg:gap-6">
          {/* Left: section nav */}
          <div className="w-72 shrink-0 space-y-2">
            <MobileSectionHeader
              title="Sections"
              subtitle={`${will.sections.length} sections`}
            />
            {will.sections.map((section) => (
              <SectionCard
                key={section.id}
                section={section}
                isSelected={selectedSectionId === section.id}
                onClick={() => setSelectedSectionId(section.id)}
              />
            ))}
            <TrustedContactsPlaceholder />
          </div>

          {/* Right: section detail */}
          <div className="min-w-0 flex-1">
            {selectedSection ? (
              <SectionDetailPanel
                section={selectedSection}
                onBack={() => setSelectedSectionId(null)}
                onAddEntry={() =>
                  setEntryEditorState({
                    mode: 'create',
                    sectionId: selectedSection.id,
                  })
                }
                onEditEntry={(entry) =>
                  setEntryEditorState({
                    mode: 'edit',
                    sectionId: selectedSection.id,
                    entry,
                  })
                }
                onDeleteEntry={handleDeleteEntry}
                deletingEntryId={deletingEntryId}
              />
            ) : (
              <div className="flex h-48 items-center justify-center rounded-[22px] border border-dashed border-gray-200">
                <p className="text-sm text-gray-400">Select a section to view entries</p>
              </div>
            )}
          </div>
        </div>

        {/* Mobile: stacked — section list OR section detail */}
        <div className="lg:hidden">
          {showSectionList && (
            <MobileSection>
              <MobileSectionHeader
                title="Sections"
                subtitle="Tap a section to view and edit entries"
              />
              <div className="mt-3 space-y-2.5">
                {will.sections.map((section) => (
                  <SectionCard
                    key={section.id}
                    section={section}
                    isSelected={false}
                    onClick={() => setSelectedSectionId(section.id)}
                  />
                ))}
              </div>
              <div className="mt-4">
                <TrustedContactsPlaceholder />
              </div>
            </MobileSection>
          )}

          {showSectionDetail && selectedSection && (
            <MobileSection>
              <SectionDetailPanel
                section={selectedSection}
                onBack={() => setSelectedSectionId(null)}
                onAddEntry={() =>
                  setEntryEditorState({
                    mode: 'create',
                    sectionId: selectedSection.id,
                  })
                }
                onEditEntry={(entry) =>
                  setEntryEditorState({
                    mode: 'edit',
                    sectionId: selectedSection.id,
                    entry,
                  })
                }
                onDeleteEntry={handleDeleteEntry}
                deletingEntryId={deletingEntryId}
              />
            </MobileSection>
          )}
        </div>

        <RelatedTools context="home-digital-will" propertyId={propertyId} />
        <BottomSafeAreaReserve size="chatAware" />
      </MobilePageContainer>

      {/* Sheets — always mounted */}
      <EntryEditorSheet
        state={entryEditorState}
        onClose={() => setEntryEditorState(null)}
        onSave={handleSaveEntry}
        isSaving={isSavingEntry}
      />

      <WillMetadataSheet
        will={will}
        open={metadataEditorOpen}
        onClose={() => setMetadataEditorOpen(false)}
        onSave={(data) => updateWillMutation.mutate(data)}
        isSaving={updateWillMutation.isPending}
      />
    </>
  );
}
