'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  Check,
  ChevronRight,
  ClipboardList,
  FileText,
  Info,
  Loader2,
  Mail,
  Pencil,
  Phone,
  Pin,
  Plus,
  Shield,
  Siren,
  Star,
  Trash2,
  Users,
  Wrench,
  X,
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
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import {
  BottomSafeAreaReserve,
  EmptyStateCard,
  MobileCard,
  MobilePageContainer,
  MobilePageIntro,
  MobileSection,
  MobileSectionHeader,
  StatusChip,
} from '@/components/mobile/dashboard/MobilePrimitives';
import { MOBILE_CARD_RADIUS, MOBILE_TYPE_TOKENS } from '@/components/mobile/dashboard/mobileDesignTokens';
import HomeToolHeader from '@/components/tools/HomeToolHeader';
import {
  createEntry,
  createTrustedContact,
  deleteEntry,
  deleteTrustedContact,
  getDigitalWill,
  getOrCreateDigitalWill,
  updateDigitalWill,
  updateEntry,
  updateTrustedContact,
} from './homeDigitalWillApi';
import type {
  CreateEntryInput,
  CreateTrustedContactInput,
  DigitalWill,
  DigitalWillEntry,
  DigitalWillSection,
  EntryPriority,
  EntryType,
  SectionType,
  TrustedContact,
  TrustedContactAccessLevel,
  TrustedContactRole,
  UpdateEntryInput,
  UpdateTrustedContactInput,
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

const READINESS_TONE: Record<string, 'good' | 'elevated' | 'danger' | 'info'> = {
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

const ACCESS_LEVEL_CONFIG: Record<
  TrustedContactAccessLevel,
  { label: string; description: string; tone: 'good' | 'elevated' | 'danger' | 'info' }
> = {
  VIEW: { label: 'Can view', description: 'Can view the full digital will', tone: 'info' },
  EDIT: { label: 'Can edit', description: 'Can help update and maintain the will', tone: 'good' },
  EMERGENCY_ONLY: {
    label: 'Emergency only',
    description: 'Intended for emergency reference only',
    tone: 'elevated',
  },
};

const ROLE_LABELS: Record<TrustedContactRole, string> = {
  SPOUSE: 'Spouse',
  FAMILY_MEMBER: 'Family Member',
  PROPERTY_MANAGER: 'Property Manager',
  EMERGENCY_CONTACT: 'Emergency Contact',
  CARETAKER: 'Caretaker',
  OTHER: 'Other',
};

const ROLE_OPTIONS: { value: TrustedContactRole; label: string }[] = [
  { value: 'SPOUSE', label: 'Spouse' },
  { value: 'FAMILY_MEMBER', label: 'Family Member' },
  { value: 'PROPERTY_MANAGER', label: 'Property Manager' },
  { value: 'EMERGENCY_CONTACT', label: 'Emergency Contact' },
  { value: 'CARETAKER', label: 'Caretaker' },
  { value: 'OTHER', label: 'Other' },
];

const ACCESS_LEVEL_OPTIONS: { value: TrustedContactAccessLevel; label: string }[] = [
  { value: 'VIEW', label: 'Can view — read the full digital will' },
  { value: 'EDIT', label: 'Can edit — help update and maintain the will' },
  { value: 'EMERGENCY_ONLY', label: 'Emergency only — for urgent situations' },
];

// ─── Utility ──────────────────────────────────────────────────────────────────

function formatDate(
  dateString: string | null | undefined,
  style: 'short' | 'long' = 'short',
): string {
  if (!dateString) return 'Never';
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return 'Invalid date';
  if (style === 'long') {
    return d.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  }
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

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
        <Button variant="ghost" className="min-h-[44px] w-fit gap-1.5 px-0 text-sm text-muted-foreground" asChild>
          <Link href={`/dashboard/properties/${propertyId}`}>
            <ArrowLeft className="h-4 w-4" />
            Back to property
          </Link>
        </Button>
        <MobilePageIntro
          eyebrow="Home Tool"
          title="Home Digital Will"
          subtitle="Capture the knowledge your home needs — emergency contacts, utility info, contractor preferences, and critical instructions."
         className="lg:hidden"/>
        <HomeToolHeader toolId="home-digital-will" propertyId={propertyId} />
        <EmptyStateCard
          title="Get started"
          description="Create your Home Digital Will to store everything someone would need to manage this property — in an emergency or any time you're unavailable."
          action={
            <Button onClick={onInit} disabled={isLoading} className="mt-2 gap-2">
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <BookOpen className="h-4 w-4" />
              )}
              {isLoading ? 'Setting up…' : 'Create Home Digital Will'}
            </Button>
          }
        />
      </MobileSection>
      <BottomSafeAreaReserve size="chatAware" />
    </MobilePageContainer>
  );
}

// ─── Delete confirm button ────────────────────────────────────────────────────

function DeleteConfirmButton({
  onConfirm,
  isDeleting,
  confirmLabel = 'Delete',
}: {
  onConfirm: () => void;
  isDeleting: boolean;
  confirmLabel?: string;
}) {
  const [confirming, setConfirming] = React.useState(false);

  if (isDeleting) {
    return (
      <div className="flex h-8 w-8 items-center justify-center">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />
      </div>
    );
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-1 rounded-xl border border-gray-200 bg-white px-2 py-1">
        <button
          onClick={() => setConfirming(false)}
          className="rounded px-1.5 py-0.5 text-xs text-gray-500 hover:bg-gray-100"
        >
          No
        </button>
        <span className="text-xs text-gray-300">·</span>
        <button
          onClick={() => {
            setConfirming(false);
            onConfirm();
          }}
          className="rounded px-1.5 py-0.5 text-xs font-medium text-red-600 hover:bg-red-50"
        >
          {confirmLabel}
        </button>
      </div>
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-8 w-8 p-0"
      onClick={() => setConfirming(true)}
      aria-label={confirmLabel}
    >
      <Trash2 className="h-3.5 w-3.5 text-gray-400 hover:text-red-500" />
    </Button>
  );
}

// ─── Setup checklist ──────────────────────────────────────────────────────────

interface SetupStep {
  id: string;
  label: string;
  description: string;
  done: boolean;
  action?: () => void;
}

function SetupChecklist({
  will,
  onSelectSection,
  onOpenContacts,
  onEditMetadata,
  onDismiss,
}: {
  will: DigitalWill;
  onSelectSection: (sectionId: string) => void;
  onOpenContacts: () => void;
  onEditMetadata: () => void;
  onDismiss: () => void;
}) {
  const emergencySection = will.sections.find((s) => s.type === 'EMERGENCY');
  const utilitiesSection = will.sections.find((s) => s.type === 'UTILITIES');
  const hasEmergencyEntries = (emergencySection?.entries.length ?? 0) > 0;
  const hasContact = will.trustedContacts.length > 0;
  const hasPrimary = will.trustedContacts.some((c) => c.isPrimary);
  const hasUtilityEntries = (utilitiesSection?.entries.length ?? 0) > 0;
  const isInProgress =
    will.readiness === 'IN_PROGRESS' || will.readiness === 'READY';

  const steps: SetupStep[] = [
    {
      id: 'emergency',
      label: 'Add emergency instructions',
      description: 'Steps for urgent home situations',
      done: hasEmergencyEntries,
      action: emergencySection
        ? () => onSelectSection(emergencySection.id)
        : undefined,
    },
    {
      id: 'contact',
      label: 'Add a trusted contact',
      description: 'Someone who can access this home',
      done: hasContact,
      action: onOpenContacts,
    },
    {
      id: 'primary',
      label: 'Set a primary contact',
      description: 'The first person to reach in an emergency',
      done: hasPrimary,
      action: onOpenContacts,
    },
    {
      id: 'utilities',
      label: 'Add utility information',
      description: 'Providers, shutoffs, and account details',
      done: hasUtilityEntries,
      action: utilitiesSection
        ? () => onSelectSection(utilitiesSection.id)
        : undefined,
    },
    {
      id: 'readiness',
      label: 'Mark will as in progress',
      description: 'Let trusted contacts know it\'s being maintained',
      done: isInProgress,
      action: onEditMetadata,
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  const allDone = doneCount === steps.length;

  if (allDone) return null;

  return (
    <div className={cn(MOBILE_CARD_RADIUS, 'border border-blue-100 bg-blue-50/40 p-4')}>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <p className={cn(MOBILE_TYPE_TOKENS.cardTitle, 'text-gray-900')}>
            Start with the essentials
          </p>
          <p className={cn(MOBILE_TYPE_TOKENS.caption, 'mt-0.5 text-gray-500')}>
            {doneCount} of {steps.length} complete
          </p>
        </div>
        <button
          onClick={onDismiss}
          className="rounded-full p-1 text-gray-400 hover:text-gray-600"
          aria-label="Dismiss setup guide"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Progress bar */}
      <div className="mb-3 h-1 overflow-hidden rounded-full bg-blue-100">
        <div
          className="h-1 rounded-full bg-blue-500 transition-all duration-300"
          style={{ width: `${(doneCount / steps.length) * 100}%` }}
        />
      </div>

      <div className="space-y-1.5">
        {steps.map((step) => (
          <button
            key={step.id}
            onClick={!step.done && step.action ? step.action : undefined}
            disabled={step.done || !step.action}
            className={cn(
              'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors',
              step.done
                ? 'cursor-default'
                : step.action
                ? 'bg-white hover:bg-gray-50'
                : 'cursor-default bg-white',
            )}
          >
            <div
              className={cn(
                'flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
                step.done ? 'bg-green-100' : 'bg-gray-100',
              )}
            >
              {step.done ? (
                <Check className="h-3 w-3 text-green-600" />
              ) : (
                <div className="h-2 w-2 rounded-full bg-gray-300" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  MOBILE_TYPE_TOKENS.body,
                  'font-medium',
                  step.done ? 'text-gray-400 line-through' : 'text-gray-800',
                )}
              >
                {step.label}
              </p>
              {!step.done && (
                <p className={cn(MOBILE_TYPE_TOKENS.caption, 'text-gray-500')}>
                  {step.description}
                </p>
              )}
            </div>
            {!step.done && step.action && (
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-300" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Readiness nudges ─────────────────────────────────────────────────────────

function ReadinessNudges({
  will,
  onOpenContacts,
  onSelectSection,
}: {
  will: DigitalWill;
  onOpenContacts: () => void;
  onSelectSection?: (sectionId: string) => void;
}) {
  const emergencySection = will.sections.find((s) => s.type === 'EMERGENCY');
  const hasEmergencyEntries = emergencySection && emergencySection.entries.length > 0;
  const hasContacts = will.trustedContacts.length > 0;
  const hasPrimary = will.trustedContacts.some((c) => c.isPrimary);

  const nudges: {
    icon: React.ElementType;
    text: string;
    action?: () => void;
    actionLabel?: string;
  }[] = [];

  if (!hasEmergencyEntries) {
    nudges.push({
      icon: AlertTriangle,
      text: 'Emergency instructions are empty — add steps for urgent home situations.',
      action: emergencySection && onSelectSection ? () => onSelectSection(emergencySection.id) : undefined,
      actionLabel: 'Add steps',
    });
  }
  if (!hasContacts) {
    nudges.push({
      icon: Users,
      text: 'Add a trusted contact so others can access critical home knowledge when needed.',
      action: onOpenContacts,
      actionLabel: 'Add contact',
    });
  } else if (!hasPrimary) {
    nudges.push({
      icon: Star,
      text: 'No primary contact set — mark one contact as primary.',
      action: onOpenContacts,
      actionLabel: 'Set primary',
    });
  }

  if (nudges.length === 0) return null;

  return (
    <div className="space-y-2">
      {nudges.map((nudge, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 px-3.5 py-2.5"
        >
          <nudge.icon className="h-3.5 w-3.5 shrink-0 text-gray-400" />
          <p className={cn(MOBILE_TYPE_TOKENS.caption, 'flex-1 text-gray-600')}>{nudge.text}</p>
          {nudge.action && (
            <button
              onClick={nudge.action}
              className="shrink-0 text-xs font-medium text-blue-600 hover:text-blue-700"
            >
              {nudge.actionLabel}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Will header ──────────────────────────────────────────────────────────────

function WillHeader({
  will,
  onEditMetadata,
  onOpenEmergencyView,
}: {
  will: DigitalWill;
  onEditMetadata: () => void;
  onOpenEmergencyView: () => void;
}) {
  const readinessTone = READINESS_TONE[will.readiness] ?? 'info';
  const readinessLabel = READINESS_LABEL[will.readiness] ?? will.readiness;
  const lastReviewed = will.lastReviewedAt ? formatDate(will.lastReviewedAt) : null;
  const primaryContact = will.trustedContacts.find((c) => c.isPrimary);
  const hasContent =
    will.counts.entryCount > 0 || will.trustedContacts.length > 0;

  return (
    <MobileCard className={cn(MOBILE_CARD_RADIUS, 'border border-gray-200 bg-white p-5')}>
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
                {will.counts.entryCount}{' '}
                {will.counts.entryCount === 1 ? 'entry' : 'entries'}
              </StatusChip>
            )}
            {will.trustedContacts.length > 0 && (
              <StatusChip tone="info">
                {will.trustedContacts.length}{' '}
                {will.trustedContacts.length === 1 ? 'contact' : 'contacts'}
              </StatusChip>
            )}
            {lastReviewed && (
              <span className={cn(MOBILE_TYPE_TOKENS.caption, 'text-gray-400')}>
                Reviewed {lastReviewed}
              </span>
            )}
          </div>
          {primaryContact && (
            <div className="mt-2 flex items-center gap-1.5">
              <Star className="h-3 w-3 shrink-0 text-blue-500" />
              <p className={cn(MOBILE_TYPE_TOKENS.caption, 'text-gray-500')}>
                {primaryContact.name} is your primary contact
              </p>
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <Button variant="ghost" size="sm" onClick={onEditMetadata} aria-label="Edit will details">
            <Pencil className="h-4 w-4" />
          </Button>
          {hasContent && (
            <Button
              variant="outline"
              size="sm"
              onClick={onOpenEmergencyView}
              className="gap-1.5 border-amber-200 text-amber-700 hover:border-amber-300 hover:bg-amber-50"
            >
              <Siren className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Emergency</span>
              <span className="sm:hidden">View</span>
            </Button>
          )}
        </div>
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
      aria-label={config.label}
      aria-current={isSelected ? 'page' : undefined}
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
            className={cn('h-5 w-5', isSelected ? 'text-white' : config.iconColor)}
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
          className={cn(
            'h-4 w-4 shrink-0',
            isSelected ? 'text-gray-400' : 'text-gray-300',
          )}
        />
      </div>
    </button>
  );
}

// ─── Trusted contacts nav card ────────────────────────────────────────────────

function TrustedContactsNavCard({
  contacts,
  isSelected,
  onClick,
}: {
  contacts: TrustedContact[];
  isSelected: boolean;
  onClick: () => void;
}) {
  const primary = contacts.find((c) => c.isPrimary);

  return (
    <button
      onClick={onClick}
      aria-label="Trusted Contacts"
      aria-current={isSelected ? 'page' : undefined}
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
            isSelected ? 'bg-white/15' : 'bg-blue-50',
          )}
        >
          <Users className={cn('h-5 w-5', isSelected ? 'text-white' : 'text-blue-600')} />
        </div>
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              MOBILE_TYPE_TOKENS.cardTitle,
              isSelected ? 'text-white' : 'text-gray-900',
            )}
          >
            Trusted Contacts
          </p>
          {contacts.length > 0 ? (
            <p
              className={cn(
                MOBILE_TYPE_TOKENS.caption,
                'mt-0.5',
                isSelected ? 'text-gray-300' : 'text-gray-500',
              )}
            >
              {contacts.length} {contacts.length === 1 ? 'contact' : 'contacts'}
              {primary && ` · ${primary.name} primary`}
            </p>
          ) : (
            <p
              className={cn(
                MOBILE_TYPE_TOKENS.caption,
                'mt-0.5',
                isSelected ? 'text-gray-400' : 'text-gray-400',
              )}
            >
              No contacts added
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
          <p className={cn(MOBILE_TYPE_TOKENS.cardTitle, 'mt-1.5 text-gray-900')}>
            {entry.title}
          </p>
          {(entry.summary || entry.content) && (
            <p className={cn(MOBILE_TYPE_TOKENS.body, 'mt-1 line-clamp-2 text-gray-500')}>
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
            aria-label={`Edit "${entry.title}"`}
          >
            <Pencil className="h-3.5 w-3.5 text-gray-400" />
          </Button>
          <DeleteConfirmButton
            onConfirm={() => onDelete(entry.id)}
            isDeleting={isDeleting}
          />
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
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="mb-3 shrink-0 gap-1.5 lg:hidden"
          onClick={onBack}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Sections
        </Button>
        <div className="flex items-center gap-3">
          <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', config.iconBg)}>
            <Icon className={cn('h-5 w-5', config.iconColor)} />
          </div>
          <div>
            <h2 className={cn(MOBILE_TYPE_TOKENS.sectionTitle, 'text-gray-900')}>
              {config.label}
            </h2>
            {config.hint && (
              <p className={cn(MOBILE_TYPE_TOKENS.caption, 'text-gray-500')}>{config.hint}</p>
            )}
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
            <Button variant="outline" size="sm" className="mt-2 gap-2" onClick={onAddEntry}>
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

// ─── Contact item ─────────────────────────────────────────────────────────────

function ContactItem({
  contact,
  onEdit,
  onDelete,
  onMakePrimary,
  isDeleting,
  isUpdating,
}: {
  contact: TrustedContact;
  onEdit: (c: TrustedContact) => void;
  onDelete: (id: string) => void;
  onMakePrimary: (id: string) => void;
  isDeleting: boolean;
  isUpdating: boolean;
}) {
  const accessCfg = ACCESS_LEVEL_CONFIG[contact.accessLevel];

  return (
    <div
      className={cn(
        MOBILE_CARD_RADIUS,
        'border bg-white p-4',
        contact.isPrimary ? 'border-blue-200 bg-blue-50/30' : 'border-gray-200',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {contact.isPrimary && (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                <Star className="h-3 w-3" />
                Primary
              </span>
            )}
            <StatusChip tone={accessCfg.tone}>{accessCfg.label}</StatusChip>
            <span className={cn(MOBILE_TYPE_TOKENS.caption, 'text-gray-400')}>
              {ROLE_LABELS[contact.role]}
            </span>
          </div>

          <p className={cn(MOBILE_TYPE_TOKENS.cardTitle, 'mt-1.5 text-gray-900')}>
            {contact.name}
          </p>

          {contact.relationship && (
            <p className={cn(MOBILE_TYPE_TOKENS.body, 'mt-0.5 text-gray-500')}>
              {contact.relationship}
            </p>
          )}

          <div className="mt-1.5 space-y-0.5">
            {contact.phone && (
              <a
                href={`tel:${contact.phone}`}
                className={cn(MOBILE_TYPE_TOKENS.caption, 'flex items-center gap-1.5 text-blue-600 hover:text-blue-700')}
              >
                <Phone className="h-3 w-3 shrink-0" />
                {contact.phone}
              </a>
            )}
            {contact.email && (
              <a
                href={`mailto:${contact.email}`}
                className={cn(MOBILE_TYPE_TOKENS.caption, 'flex items-center gap-1.5 text-gray-500 hover:text-gray-700')}
              >
                <Mail className="h-3 w-3 shrink-0" />
                {contact.email}
              </a>
            )}
          </div>

          {contact.notes && (
            <p className={cn(MOBILE_TYPE_TOKENS.caption, 'mt-1.5 line-clamp-2 text-gray-400')}>
              {contact.notes}
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => onEdit(contact)}
              aria-label={`Edit contact ${contact.name}`}
            >
              <Pencil className="h-3.5 w-3.5 text-gray-400" />
            </Button>
            <DeleteConfirmButton
              onConfirm={() => onDelete(contact.id)}
              isDeleting={isDeleting}
            />
          </div>
          {!contact.isPrimary && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs text-blue-600 hover:text-blue-700"
              onClick={() => onMakePrimary(contact.id)}
              disabled={isUpdating}
            >
              {isUpdating ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Star className="h-3 w-3" />
              )}
              Set primary
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Contacts detail panel ────────────────────────────────────────────────────

function ContactsDetailPanel({
  contacts,
  onBack,
  onAdd,
  onEdit,
  onDelete,
  onMakePrimary,
  deletingContactId,
  updatingContactId,
}: {
  contacts: TrustedContact[];
  onBack: () => void;
  onAdd: () => void;
  onEdit: (c: TrustedContact) => void;
  onDelete: (id: string) => void;
  onMakePrimary: (id: string) => void;
  deletingContactId: string | null;
  updatingContactId: string | null;
}) {
  return (
    <div className="flex flex-col gap-4">
      {/* Back button (mobile) + header */}
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="mb-3 shrink-0 gap-1.5 lg:hidden"
          onClick={onBack}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Sections
        </Button>
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50">
            <Users className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h2 className={cn(MOBILE_TYPE_TOKENS.sectionTitle, 'text-gray-900')}>
              Trusted Contacts
            </h2>
            <p className={cn(MOBILE_TYPE_TOKENS.caption, 'text-gray-500')}>
              People who can access critical home knowledge
            </p>
          </div>
        </div>
      </div>

      {/* Explanation */}
      <div className="rounded-xl bg-gray-50 px-4 py-3">
        <p className={cn(MOBILE_TYPE_TOKENS.body, 'text-gray-600')}>
          Trusted contacts can access critical home knowledge when needed — during an emergency,
          a transition, or when you&apos;re unavailable. Choose each person&apos;s access level based on
          their role.
        </p>
      </div>

      {/* Add button */}
      <Button
        variant="outline"
        size="sm"
        className="w-full justify-start gap-2 rounded-xl border-dashed"
        onClick={onAdd}
      >
        <Plus className="h-4 w-4" />
        Add trusted contact
      </Button>

      {/* Access level legend */}
      <div className="space-y-2">
        <p
          className={cn(
            MOBILE_TYPE_TOKENS.caption,
            'font-semibold uppercase tracking-wider text-gray-400',
          )}
        >
          Access levels
        </p>
        <div className="space-y-1.5">
          {(
            Object.entries(ACCESS_LEVEL_CONFIG) as [
              TrustedContactAccessLevel,
              (typeof ACCESS_LEVEL_CONFIG)[TrustedContactAccessLevel],
            ][]
          ).map(([, cfg]) => (
            <div key={cfg.label} className="flex items-center gap-2">
              <StatusChip tone={cfg.tone}>{cfg.label}</StatusChip>
              <p className={cn(MOBILE_TYPE_TOKENS.caption, 'text-gray-500')}>{cfg.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Contacts list */}
      {contacts.length === 0 ? (
        <EmptyStateCard
          title="No trusted contacts yet"
          description="Add someone your family or support network can rely on — a spouse, caretaker, property manager, or emergency contact."
          action={
            <Button variant="outline" size="sm" className="mt-2 gap-2" onClick={onAdd}>
              <Plus className="h-4 w-4" />
              Add first contact
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-2.5">
          {contacts.map((contact) => (
            <ContactItem
              key={contact.id}
              contact={contact}
              onEdit={onEdit}
              onDelete={onDelete}
              onMakePrimary={onMakePrimary}
              isDeleting={deletingContactId === contact.id}
              isUpdating={updatingContactId === contact.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Emergency view sub-components ───────────────────────────────────────────

function EmergencyEntryCard({ entry }: { entry: DigitalWillEntry }) {
  return (
    <div className={cn(MOBILE_CARD_RADIUS, 'border border-gray-200 bg-white p-4')}>
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
        {entry.priority === 'CRITICAL' && (
          <StatusChip tone="danger">Critical</StatusChip>
        )}
      </div>
      <p className={cn(MOBILE_TYPE_TOKENS.cardTitle, 'mt-2 text-gray-900')}>{entry.title}</p>
      {(entry.content || entry.summary) && (
        <p className={cn(MOBILE_TYPE_TOKENS.body, 'mt-1 text-gray-600')}>
          {entry.content || entry.summary}
        </p>
      )}
    </div>
  );
}

function EmergencyContactCard({
  contact,
  isPrimary = false,
}: {
  contact: TrustedContact;
  isPrimary?: boolean;
}) {
  return (
    <div
      className={cn(
        MOBILE_CARD_RADIUS,
        'border p-4',
        isPrimary ? 'border-blue-200 bg-blue-50/40' : 'border-gray-200 bg-white',
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-semibold',
            isPrimary ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600',
          )}
        >
          {contact.name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {isPrimary && (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                <Star className="h-3 w-3" />
                Primary
              </span>
            )}
            <span className={cn(MOBILE_TYPE_TOKENS.caption, 'text-gray-400')}>
              {ROLE_LABELS[contact.role]}
            </span>
          </div>
          <p className={cn(MOBILE_TYPE_TOKENS.cardTitle, 'mt-1 text-gray-900')}>{contact.name}</p>
          {contact.relationship && (
            <p className={cn(MOBILE_TYPE_TOKENS.caption, 'text-gray-500')}>{contact.relationship}</p>
          )}
          <div className="mt-2 flex flex-col gap-1.5">
            {contact.phone && (
              <a
                href={`tel:${contact.phone}`}
                className={cn(
                  MOBILE_TYPE_TOKENS.body,
                  'flex items-center gap-2 font-medium text-blue-600 hover:text-blue-700',
                )}
              >
                <Phone className="h-4 w-4 shrink-0" />
                {contact.phone}
              </a>
            )}
            {contact.email && (
              <a
                href={`mailto:${contact.email}`}
                className={cn(
                  MOBILE_TYPE_TOKENS.caption,
                  'flex items-center gap-2 text-gray-500 hover:text-gray-700',
                )}
              >
                <Mail className="h-3.5 w-3.5 shrink-0" />
                {contact.email}
              </a>
            )}
          </div>
          {contact.notes && (
            <p className={cn(MOBILE_TYPE_TOKENS.caption, 'mt-2 text-gray-400')}>
              {contact.notes}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function EmergencyViewSection({
  title,
  icon: Icon,
  iconColor,
  iconBg,
  entries,
  emptyMessage,
}: {
  title: string;
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  entries: DigitalWillEntry[];
  emptyMessage: string;
}) {
  if (entries.length === 0) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2.5">
          <div className={cn('flex h-8 w-8 items-center justify-center rounded-xl', iconBg)}>
            <Icon className={cn('h-4 w-4', iconColor)} />
          </div>
          <p className={cn(MOBILE_TYPE_TOKENS.cardTitle, 'text-gray-900')}>{title}</p>
        </div>
        <p className={cn(MOBILE_TYPE_TOKENS.caption, 'pl-11 text-gray-400')}>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2.5">
        <div className={cn('flex h-8 w-8 items-center justify-center rounded-xl', iconBg)}>
          <Icon className={cn('h-4 w-4', iconColor)} />
        </div>
        <p className={cn(MOBILE_TYPE_TOKENS.cardTitle, 'text-gray-900')}>{title}</p>
      </div>
      <div className="space-y-2.5">
        {entries.map((entry) => (
          <EmergencyEntryCard key={entry.id} entry={entry} />
        ))}
      </div>
    </div>
  );
}

// ─── Emergency view ───────────────────────────────────────────────────────────

function EmergencyView({
  will,
  onExit,
}: {
  will: DigitalWill;
  onExit: () => void;
}) {
  const emergencySection = will.sections.find((s) => s.type === 'EMERGENCY');
  const utilitiesSection = will.sections.find((s) => s.type === 'UTILITIES');
  const criticalInfoSection = will.sections.find((s) => s.type === 'CRITICAL_INFO');
  const primaryContact = will.trustedContacts.find((c) => c.isPrimary);
  const otherContacts = will.trustedContacts.filter((c) => !c.isPrimary);

  // Collect critical/pinned/emergency entries from other sections
  const otherCriticalEntries = will.sections
    .filter((s) => s.type !== 'EMERGENCY' && s.type !== 'UTILITIES')
    .flatMap((s) =>
      s.entries.filter(
        (e) => e.isEmergency || e.isPinned || e.priority === 'CRITICAL',
      ),
    )
    .sort((a, b) => {
      if (a.isEmergency && !b.isEmergency) return -1;
      if (!a.isEmergency && b.isEmergency) return 1;
      if (a.priority === 'CRITICAL' && b.priority !== 'CRITICAL') return -1;
      if (a.priority !== 'CRITICAL' && b.priority === 'CRITICAL') return 1;
      return 0;
    });

  const criticalInfoEntries = criticalInfoSection?.entries ?? [];

  return (
    <MobilePageContainer className="space-y-5 py-3 lg:max-w-3xl lg:px-8 lg:pb-10">
      {/* Emergency banner */}
      <div className={cn(MOBILE_CARD_RADIUS, 'border border-amber-200 bg-amber-50 px-4 py-3')}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Siren className="h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <p className={cn(MOBILE_TYPE_TOKENS.body, 'font-semibold text-amber-900')}>
                Emergency View
              </p>
              <p className={cn(MOBILE_TYPE_TOKENS.caption, 'text-amber-700')}>
                Read-only · Essential information first
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onExit}
            className="shrink-0 gap-1.5 border-amber-200 text-amber-800 hover:border-amber-300 hover:bg-amber-100"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Exit
          </Button>
        </div>
      </div>

      {/* Emergency instructions */}
      {emergencySection && (
        <EmergencyViewSection
          title="Emergency Instructions"
          icon={AlertTriangle}
          iconColor="text-red-600"
          iconBg="bg-red-50"
          entries={emergencySection.entries}
          emptyMessage="No emergency instructions added yet. Exit this view to add them."
        />
      )}

      {/* Primary trusted contact */}
      {primaryContact && (
        <div className="space-y-3">
          <p
            className={cn(
              MOBILE_TYPE_TOKENS.caption,
              'font-semibold uppercase tracking-wider text-gray-400',
            )}
          >
            Primary contact
          </p>
          <EmergencyContactCard contact={primaryContact} isPrimary />
        </div>
      )}

      {/* Other trusted contacts */}
      {otherContacts.length > 0 && (
        <div className="space-y-3">
          <p
            className={cn(
              MOBILE_TYPE_TOKENS.caption,
              'font-semibold uppercase tracking-wider text-gray-400',
            )}
          >
            Other trusted contacts
          </p>
          <div className="space-y-2.5">
            {otherContacts.map((c) => (
              <EmergencyContactCard key={c.id} contact={c} />
            ))}
          </div>
        </div>
      )}

      {/* No contacts fallback */}
      {will.trustedContacts.length === 0 && (
        <div className="rounded-xl border border-amber-100 bg-amber-50/50 px-4 py-3">
          <p className={cn(MOBILE_TYPE_TOKENS.caption, 'text-amber-700')}>
            No trusted contacts have been added yet. Exit this view and add at least one contact.
          </p>
        </div>
      )}

      {/* Utilities */}
      {utilitiesSection && (
        <EmergencyViewSection
          title="Utilities"
          icon={Zap}
          iconColor="text-yellow-600"
          iconBg="bg-yellow-50"
          entries={utilitiesSection.entries}
          emptyMessage="No utility information added yet."
        />
      )}

      {/* Critical info */}
      {criticalInfoEntries.length > 0 && (
        <EmergencyViewSection
          title="Critical Information"
          icon={Info}
          iconColor="text-orange-600"
          iconBg="bg-orange-50"
          entries={criticalInfoEntries}
          emptyMessage=""
        />
      )}

      {/* Other pinned/critical entries */}
      {otherCriticalEntries.length > 0 && (
        <div className="space-y-3">
          <p
            className={cn(
              MOBILE_TYPE_TOKENS.caption,
              'font-semibold uppercase tracking-wider text-gray-400',
            )}
          >
            Other important notes
          </p>
          <div className="space-y-2.5">
            {otherCriticalEntries.map((entry) => (
              <EmergencyEntryCard key={entry.id} entry={entry} />
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-4 text-center">
        <p className={cn(MOBILE_TYPE_TOKENS.caption, 'text-gray-500')}>
          {will.title}
        </p>
        <p className={cn(MOBILE_TYPE_TOKENS.caption, 'mt-0.5 text-gray-400')}>
          Last reviewed {formatDate(will.lastReviewedAt)}
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={onExit}
          className="mt-2 h-auto gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 hover:text-blue-700"
        >
          <ArrowLeft className="h-3 w-3" />
          Return to full view
        </Button>
      </div>

      <BottomSafeAreaReserve size="chatAware" />
    </MobilePageContainer>
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
  const [titleError, setTitleError] = React.useState('');

  React.useEffect(() => {
    if (!state) return;
    setTitleError('');
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
    if (!form.title.trim()) {
      setTitleError('Title is required');
      return;
    }
    setTitleError('');
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
          <SheetDescription className="sr-only">
            {state?.mode === 'edit' ? 'Edit the details of this entry.' : 'Add a new entry to this section.'}
          </SheetDescription>
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
                <Label htmlFor="entry-title">
                  Title <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="entry-title"
                  value={form.title}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, title: e.target.value }));
                    if (titleError && e.target.value.trim()) setTitleError('');
                  }}
                  placeholder="e.g. Main water shutoff valve location"
                  className={titleError ? 'border-red-400 focus-visible:ring-red-300' : ''}
                  aria-describedby={titleError ? 'entry-title-error' : undefined}
                />
                {titleError && (
                  <p id="entry-title-error" className="text-sm text-red-500">{titleError}</p>
                )}
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
                  <Label htmlFor="entry-is-emergency" className="text-sm font-medium text-gray-900">Emergency entry</Label>
                  <p className="text-xs text-gray-500">Mark for urgent situations</p>
                </div>
                <Switch
                  id="entry-is-emergency"
                  checked={form.isEmergency ?? false}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, isEmergency: v }))}
                />
              </div>

              <div className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3">
                <div>
                  <Label htmlFor="entry-is-pinned" className="text-sm font-medium text-gray-900">Pin entry</Label>
                  <p className="text-xs text-gray-500">Surface at the top of the list</p>
                </div>
                <Switch
                  id="entry-is-pinned"
                  checked={form.isPinned ?? false}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, isPinned: v }))}
                />
              </div>
            </div>

            {/* Timing */}
            <div className="space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                Timing{' '}
                <span className="font-normal normal-case text-gray-400">(optional)</span>
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
              <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
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

// ─── Will metadata editor sheet ───────────────────────────────────────────────

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
        lastReviewedAt: will.lastReviewedAt ? will.lastReviewedAt.slice(0, 10) : '',
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
          <SheetDescription className="sr-only">
            Update the title, status, readiness, and last reviewed date for this Home Digital Will.
          </SheetDescription>
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
                  <SelectItem value="DRAFT">Draft — still being filled in</SelectItem>
                  <SelectItem value="ACTIVE">Active — ready for use</SelectItem>
                  <SelectItem value="ARCHIVED">Archived — no longer current</SelectItem>
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
                  <SelectItem value="NOT_STARTED">Not started</SelectItem>
                  <SelectItem value="IN_PROGRESS">In progress</SelectItem>
                  <SelectItem value="READY">Ready</SelectItem>
                  <SelectItem value="NEEDS_REVIEW">Needs review</SelectItem>
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
              <p className="text-xs text-gray-400">When did you last review the contents of this will?</p>
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

// ─── Contact editor sheet ─────────────────────────────────────────────────────

interface ContactEditorState {
  mode: 'create' | 'edit';
  contact?: TrustedContact;
}

const EMPTY_CONTACT_FORM = {
  name: '',
  email: null as string | null,
  phone: null as string | null,
  relationship: null as string | null,
  role: 'OTHER' as TrustedContactRole,
  accessLevel: 'VIEW' as TrustedContactAccessLevel,
  isPrimary: false,
  notes: null as string | null,
};

function ContactEditorSheet({
  state,
  onClose,
  onSave,
  isSaving,
}: {
  state: ContactEditorState | null;
  onClose: () => void;
  onSave: (data: CreateTrustedContactInput | UpdateTrustedContactInput) => void;
  isSaving: boolean;
}) {
  const [form, setForm] = React.useState(EMPTY_CONTACT_FORM);
  const [nameError, setNameError] = React.useState('');

  React.useEffect(() => {
    if (!state) return;
    setNameError('');
    if (state.mode === 'edit' && state.contact) {
      setForm({
        name: state.contact.name,
        email: state.contact.email,
        phone: state.contact.phone,
        relationship: state.contact.relationship,
        role: state.contact.role,
        accessLevel: state.contact.accessLevel,
        isPrimary: state.contact.isPrimary,
        notes: state.contact.notes,
      });
    } else {
      setForm(EMPTY_CONTACT_FORM);
    }
  }, [state]);

  const isOpen = state !== null;
  const sheetTitle = state?.mode === 'edit' ? 'Edit Contact' : 'Add Trusted Contact';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setNameError('Name is required');
      return;
    }
    setNameError('');
    onSave({
      ...form,
      name: form.name.trim(),
      email: form.email?.trim() || null,
      phone: form.phone?.trim() || null,
      relationship: form.relationship?.trim() || null,
      notes: form.notes?.trim() || null,
    });
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b px-5 py-4">
          <SheetTitle>{sheetTitle}</SheetTitle>
          <SheetDescription className="sr-only">
            {state?.mode === 'edit' ? 'Update this trusted contact\'s information and access level.' : 'Add a trusted contact who can access critical home knowledge.'}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-y-auto">
          <div className="flex flex-col gap-5 px-5 py-5">
            {/* Identity */}
            <div className="space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                Identity
              </h3>

              <div className="space-y-1.5">
                <Label htmlFor="contact-name">
                  Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="contact-name"
                  value={form.name}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, name: e.target.value }));
                    if (nameError && e.target.value.trim()) setNameError('');
                  }}
                  placeholder="e.g. Jane Smith"
                  className={nameError ? 'border-red-400 focus-visible:ring-red-300' : ''}
                  aria-describedby={nameError ? 'contact-name-error' : undefined}
                />
                {nameError && (
                  <p id="contact-name-error" className="text-sm text-red-500">{nameError}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="contact-relationship">
                  Relationship <span className="text-gray-400">(optional)</span>
                </Label>
                <Input
                  id="contact-relationship"
                  value={form.relationship ?? ''}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, relationship: e.target.value || null }))
                  }
                  placeholder="e.g. Sister, neighbor, property manager…"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="contact-role">Role</Label>
                <Select
                  value={form.role}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, role: v as TrustedContactRole }))
                  }
                >
                  <SelectTrigger id="contact-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Access */}
            <div className="space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                Access
              </h3>

              <div className="space-y-1.5">
                <Label htmlFor="contact-access">Access level</Label>
                <Select
                  value={form.accessLevel}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, accessLevel: v as TrustedContactAccessLevel }))
                  }
                >
                  <SelectTrigger id="contact-access">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACCESS_LEVEL_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3">
                <div>
                  <Label htmlFor="contact-is-primary" className="text-sm font-medium text-gray-900">Primary contact</Label>
                  <p className="text-xs text-gray-500">
                    Designate as the main person to reach first
                  </p>
                </div>
                <Switch
                  id="contact-is-primary"
                  checked={form.isPrimary ?? false}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, isPrimary: v }))}
                />
              </div>
            </div>

            {/* Contact details */}
            <div className="space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                Contact details{' '}
                <span className="font-normal normal-case text-gray-400">(optional)</span>
              </h3>

              <div className="space-y-1.5">
                <Label htmlFor="contact-email">Email</Label>
                <Input
                  id="contact-email"
                  type="email"
                  value={form.email ?? ''}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, email: e.target.value || null }))
                  }
                  placeholder="jane@example.com"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="contact-phone">Phone</Label>
                <Input
                  id="contact-phone"
                  type="tel"
                  value={form.phone ?? ''}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, phone: e.target.value || null }))
                  }
                  placeholder="+1 555 000 0000"
                />
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                Notes{' '}
                <span className="font-normal normal-case text-gray-400">(optional)</span>
              </h3>

              <div className="space-y-1.5">
                <Label htmlFor="contact-notes">Additional notes</Label>
                <Textarea
                  id="contact-notes"
                  value={form.notes ?? ''}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, notes: e.target.value || null }))
                  }
                  placeholder="Any context about this person's role or how to reach them…"
                  rows={3}
                  className="resize-none"
                />
              </div>
            </div>
          </div>

          <SheetFooter className="mt-auto border-t px-5 py-4">
            <div className="flex w-full gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="submit"
                className="flex-1 gap-2"
                disabled={isSaving || !form.name.trim()}
              >
                {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                {state?.mode === 'edit' ? 'Save changes' : 'Add contact'}
              </Button>
            </div>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

// ─── Main page component ──────────────────────────────────────────────────────

export default function HomeDigitalWillClient() {
  const { id: propertyId } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Navigation state
  const [selectedSectionId, setSelectedSectionId] = React.useState<string | null>(null);
  const [showContactsPanel, setShowContactsPanel] = React.useState(false);

  // View mode state
  const [emergencyMode, setEmergencyMode] = React.useState(false);
  const [setupDismissed, setSetupDismissed] = React.useState(false);

  // Editor sheet state
  const [entryEditorState, setEntryEditorState] = React.useState<EntryEditorState | null>(null);
  const [metadataEditorOpen, setMetadataEditorOpen] = React.useState(false);
  const [contactEditorState, setContactEditorState] =
    React.useState<ContactEditorState | null>(null);

  // Mutation-in-progress tracking
  const [deletingEntryId, setDeletingEntryId] = React.useState<string | null>(null);
  const [deletingContactId, setDeletingContactId] = React.useState<string | null>(null);
  const [updatingContactId, setUpdatingContactId] = React.useState<string | null>(null);

  // ─── Query ─────────────────────────────────────────────────────────────────

  const willQuery = useQuery({
    queryKey: ['home-digital-will', propertyId],
    queryFn: () => getDigitalWill(propertyId),
    enabled: !!propertyId,
    staleTime: 3 * 60 * 1000,
  });

  const will = willQuery.data ?? null;

  // Auto-select the first section on desktop when loaded
  React.useEffect(() => {
    if (will && !selectedSectionId && !showContactsPanel && will.sections.length > 0) {
      setSelectedSectionId(will.sections[0].id);
    }
  }, [will, selectedSectionId, showContactsPanel]);

  const selectedSection =
    selectedSectionId && !showContactsPanel
      ? will?.sections.find((s) => s.id === selectedSectionId) ?? null
      : null;

  // Derived: is setup incomplete?
  const hasIncompleteSetup = React.useMemo(() => {
    if (!will) return false;
    const emergencySection = will.sections.find((s) => s.type === 'EMERGENCY');
    const hasEmergency = (emergencySection?.entries.length ?? 0) > 0;
    const hasContact = will.trustedContacts.length > 0;
    const hasPrimary = will.trustedContacts.some((c) => c.isPrimary);
    return !hasEmergency || !hasContact || !hasPrimary;
  }, [will]);

  const showSetupChecklist = hasIncompleteSetup && !setupDismissed;

  // ─── Entry mutations ───────────────────────────────────────────────────────

  const initWillMutation = useMutation({
    mutationFn: () => getOrCreateDigitalWill(propertyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['home-digital-will', propertyId] });
      toast({
        title: 'Home Digital Will created',
        description: 'Your will has been set up with default sections.',
      });
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

  // ─── Contact mutations ─────────────────────────────────────────────────────

  const createContactMutation = useMutation({
    mutationFn: (data: CreateTrustedContactInput) =>
      createTrustedContact(will!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['home-digital-will', propertyId] });
      setContactEditorState(null);
      toast({ title: 'Contact added' });
    },
    onError: () => {
      toast({ title: 'Failed to add contact', variant: 'destructive' });
    },
  });

  const updateContactMutation = useMutation({
    mutationFn: ({
      contactId,
      data,
    }: {
      contactId: string;
      data: UpdateTrustedContactInput;
    }) => updateTrustedContact(contactId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['home-digital-will', propertyId] });
      setContactEditorState(null);
      setUpdatingContactId(null);
      toast({ title: 'Contact updated' });
    },
    onError: () => {
      setUpdatingContactId(null);
      toast({ title: 'Failed to update contact', variant: 'destructive' });
    },
  });

  const deleteContactMutation = useMutation({
    mutationFn: (contactId: string) => deleteTrustedContact(contactId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['home-digital-will', propertyId] });
      setDeletingContactId(null);
      toast({ title: 'Contact removed' });
    },
    onError: () => {
      setDeletingContactId(null);
      toast({ title: 'Failed to remove contact', variant: 'destructive' });
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

  const handleSaveContact = (
    data: CreateTrustedContactInput | UpdateTrustedContactInput,
  ) => {
    if (contactEditorState?.mode === 'edit' && contactEditorState.contact) {
      updateContactMutation.mutate({
        contactId: contactEditorState.contact.id,
        data,
      });
    } else {
      createContactMutation.mutate(data as CreateTrustedContactInput);
    }
  };

  const handleDeleteContact = (contactId: string) => {
    setDeletingContactId(contactId);
    deleteContactMutation.mutate(contactId);
  };

  const handleMakePrimary = (contactId: string) => {
    setUpdatingContactId(contactId);
    updateContactMutation.mutate({ contactId, data: { isPrimary: true } });
  };

  const handleSelectSection = (sectionId: string) => {
    setSelectedSectionId(sectionId);
    setShowContactsPanel(false);
  };

  const handleOpenContacts = () => {
    setShowContactsPanel(true);
    setSelectedSectionId(null);
  };

  const isSavingEntry =
    createEntryMutation.isPending || updateEntryMutation.isPending;
  const isSavingContact =
    createContactMutation.isPending || updateContactMutation.isPending;

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

  // ─── Emergency mode ────────────────────────────────────────────────────────

  if (emergencyMode) {
    return (
      <>
        <EmergencyView will={will} onExit={() => setEmergencyMode(false)} />
        {/* Sheets still available if user exits back */}
      </>
    );
  }

  // ─── Main UI ───────────────────────────────────────────────────────────────

  const showSectionList = !selectedSectionId && !showContactsPanel;
  const showSectionDetail =
    !!selectedSectionId && !!selectedSection && !showContactsPanel;
  const showContactsDetailMobile = showContactsPanel;

  return (
    <>
      <MobilePageContainer className="space-y-5 py-3 lg:max-w-7xl lg:px-8 lg:pb-10">
        {/* Back link — hidden on mobile when inside section/contacts detail */}
        <div className={cn(
          (selectedSectionId && !showContactsPanel) || showContactsPanel ? 'hidden lg:block' : '',
        )}>
          <Button variant="ghost" className="min-h-[44px] w-fit gap-1.5 px-0 text-sm text-muted-foreground" asChild>
            <Link href={`/dashboard/properties/${propertyId}`}>
              <ArrowLeft className="h-4 w-4" />
              Back to property
            </Link>
          </Button>
        </div>

        <HomeToolHeader toolId="home-digital-will" propertyId={propertyId} />

        {/* Header: always on desktop, hidden on mobile during section detail or contacts panel */}
        <div
          className={cn(
            (selectedSectionId && !showContactsPanel) || showContactsPanel ? 'hidden lg:block' : '',
          )}
        >
          <WillHeader
            will={will}
            onEditMetadata={() => setMetadataEditorOpen(true)}
            onOpenEmergencyView={() => setEmergencyMode(true)}
          />
        </div>

        {/* Setup checklist OR readiness nudges — shown below header on section list */}
        <div
          className={cn(
            (selectedSectionId && !showContactsPanel) || showContactsPanel ? 'hidden lg:block' : '',
          )}
        >
          {showSetupChecklist ? (
            <SetupChecklist
              will={will}
              onSelectSection={handleSelectSection}
              onOpenContacts={handleOpenContacts}
              onEditMetadata={() => setMetadataEditorOpen(true)}
              onDismiss={() => setSetupDismissed(true)}
            />
          ) : (
            <ReadinessNudges
              will={will}
              onOpenContacts={handleOpenContacts}
              onSelectSection={handleSelectSection}
            />
          )}
        </div>

        {/* Desktop: two-column layout */}
        <div className="hidden lg:flex lg:gap-6">
          {/* Left: nav list */}
          <div className="w-72 shrink-0 space-y-2">
            <MobileSectionHeader
              title="Sections"
              subtitle={`${will.sections.length} sections`}
            />
            {will.sections.map((section) => (
              <SectionCard
                key={section.id}
                section={section}
                isSelected={
                  selectedSectionId === section.id && !showContactsPanel
                }
                onClick={() => handleSelectSection(section.id)}
              />
            ))}
            <div className="pt-1">
              <TrustedContactsNavCard
                contacts={will.trustedContacts}
                isSelected={showContactsPanel}
                onClick={handleOpenContacts}
              />
            </div>
          </div>

          {/* Right: detail panel */}
          <div className="min-w-0 flex-1">
            {showContactsPanel ? (
              <ContactsDetailPanel
                contacts={will.trustedContacts}
                onBack={() => setShowContactsPanel(false)}
                onAdd={() => setContactEditorState({ mode: 'create' })}
                onEdit={(c) => setContactEditorState({ mode: 'edit', contact: c })}
                onDelete={handleDeleteContact}
                onMakePrimary={handleMakePrimary}
                deletingContactId={deletingContactId}
                updatingContactId={updatingContactId}
              />
            ) : selectedSection ? (
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
                <p className="text-sm text-gray-400">Select a section from the left to view its entries</p>
              </div>
            )}
          </div>
        </div>

        {/* Mobile: stacked views */}
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
                    onClick={() => handleSelectSection(section.id)}
                  />
                ))}
              </div>
              <div className="mt-2.5">
                <TrustedContactsNavCard
                  contacts={will.trustedContacts}
                  isSelected={false}
                  onClick={handleOpenContacts}
                />
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

          {showContactsDetailMobile && (
            <MobileSection>
              <ContactsDetailPanel
                contacts={will.trustedContacts}
                onBack={() => setShowContactsPanel(false)}
                onAdd={() => setContactEditorState({ mode: 'create' })}
                onEdit={(c) => setContactEditorState({ mode: 'edit', contact: c })}
                onDelete={handleDeleteContact}
                onMakePrimary={handleMakePrimary}
                deletingContactId={deletingContactId}
                updatingContactId={updatingContactId}
              />
            </MobileSection>
          )}
        </div>

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

      <ContactEditorSheet
        state={contactEditorState}
        onClose={() => setContactEditorState(null)}
        onSave={handleSaveContact}
        isSaving={isSavingContact}
      />
    </>
  );
}
