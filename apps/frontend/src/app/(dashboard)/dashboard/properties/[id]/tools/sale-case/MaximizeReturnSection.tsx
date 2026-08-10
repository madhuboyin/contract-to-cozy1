'use client';

// Sale Readiness Value-Maximization Checklist plan §4.5/§4.9/§4.10/§10
// Phase 7 (reworked): the "Maximize your return" section.
//
// Redesigned per direct product feedback on the first version of this
// section: showing unverified, generic "general guidance" content as the
// default experience — with a personalize option buried as a collapsible
// afterthought — read as dead/generic. This version asks first: real,
// property-derived items (Tier 1 findings, confirmed evidence, confirmed
// upgrades) always show immediately since they're already true. Generic
// catalog fallback content — the only genuinely unverified content in this
// section — stays hidden behind a real, step-by-step questionnaire until
// the homeowner has gone through it (answered or explicitly skipped),
// instead of being dumped on the page up front.

import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Bath,
  CheckCircle2,
  ChefHat,
  DollarSign,
  Layers,
  Loader2,
  PaintBucket,
  Sofa,
  Sparkles,
  Star,
  TreePine,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  MobileCard,
  MobileSection,
  MobileSectionHeader,
} from '@/components/mobile/dashboard/MobilePrimitives';
import { MOBILE_TYPE_TOKENS } from '@/components/mobile/dashboard/mobileDesignTokens';
import { SellerPrepDisclaimer } from '@/components/seller-prep/SellerPrepDisclaimer';
import {
  confirmNotableUpgrades,
  getNotableUpgradeCandidates,
  getSalePrepQuestionStatus,
  patchSalePrepFact,
  setItemDecision,
  updateBudgetRange,
} from './saleCaseApi';
import {
  BUDGET_RANGE_LABELS,
  type NotableUpgradeCandidate,
  type PropertyCosmeticCondition,
  type PropertyRoomUpdateStatus,
  type PropertyStagingReadiness,
  type SalePrepBudgetRange,
  type SalePrepQuestionStatus,
  type SaleReadinessItem,
} from './types';

const COSMETIC_CONDITION_OPTIONS: Array<{ value: PropertyCosmeticCondition; label: string }> = [
  { value: 'FRESH', label: 'Fresh' },
  { value: 'SOME_WEAR', label: 'Some wear' },
  { value: 'NEEDS_REFRESH', label: 'Needs a refresh' },
];

const ROOM_UPDATE_OPTIONS: Array<{ value: PropertyRoomUpdateStatus; label: string }> = [
  { value: 'RECENTLY_UPDATED', label: 'Recently updated' },
  { value: 'DATED_BUT_FUNCTIONAL', label: 'Dated but functional' },
  { value: 'NEEDS_WORK', label: 'Needs work' },
];

const STAGING_OPTIONS: Array<{ value: PropertyStagingReadiness; label: string }> = [
  { value: 'READY_TO_SHOW', label: 'Ready to show' },
  { value: 'NEEDS_SOME_WORK', label: 'Needs some work' },
  { value: 'NEEDS_SIGNIFICANT_WORK', label: 'Needs significant work' },
];

const BUDGET_OPTIONS: SalePrepBudgetRange[] = ['UNDER_5K', 'FIVE_TO_15K', 'FIFTEEN_TO_30K', 'OVER_30K'];

type ConditionQuestionKey = 'paintCondition' | 'curbAppealCondition' | 'flooringCondition' | 'kitchenStatus' | 'bathroomStatus' | 'stagingReadiness';

type ConditionQuestion = {
  key: ConditionQuestionKey;
  factKey: string;
  question: string;
  options: Array<{ value: string; label: string }>;
  categoryKey: string;
};

const CONDITION_QUESTIONS: ConditionQuestion[] = [
  { key: 'paintCondition', factKey: 'salePrep.paintCondition', question: 'How does your interior paint and wall condition look right now?', options: COSMETIC_CONDITION_OPTIONS, categoryKey: 'paint' },
  { key: 'curbAppealCondition', factKey: 'salePrep.curbAppealCondition', question: 'How would you describe your curb appeal and landscaping today?', options: COSMETIC_CONDITION_OPTIONS, categoryKey: 'curbAppeal' },
  { key: 'flooringCondition', factKey: 'salePrep.flooringCondition', question: "What's the current condition of your flooring?", options: COSMETIC_CONDITION_OPTIONS, categoryKey: 'flooring' },
  { key: 'kitchenStatus', factKey: 'salePrep.kitchenStatus', question: 'How would you describe your kitchen?', options: ROOM_UPDATE_OPTIONS, categoryKey: 'kitchen' },
  { key: 'bathroomStatus', factKey: 'salePrep.bathroomStatus', question: 'How would you describe your bathrooms?', options: ROOM_UPDATE_OPTIONS, categoryKey: 'bathroom' },
  { key: 'stagingReadiness', factKey: 'salePrep.stagingReadiness', question: 'How ready is your home to show to buyers today?', options: STAGING_OPTIONS, categoryKey: 'staging' },
];

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  paint: PaintBucket,
  curbAppeal: TreePine,
  flooring: Layers,
  kitchen: ChefHat,
  bathroom: Bath,
  staging: Sofa,
};

type WizardStep =
  | { kind: 'condition'; question: ConditionQuestion }
  | { kind: 'budget' }
  | { kind: 'upgrades'; candidates: NotableUpgradeCandidate[] };

function isGenericFallback(item: SaleReadinessItem): boolean {
  return item.sourceEntityType === 'SALE_PREP_GENERIC';
}

function isConfirmKnownSignal(item: SaleReadinessItem): boolean {
  return item.title.includes('confirm current condition');
}

const CENTS_FORMATTER = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

function formatCents(cents: number): string {
  return CENTS_FORMATTER.format(cents / 100);
}

function formatCentsRange(minCents: number, maxCents: number): string {
  return minCents === maxCents ? formatCents(minCents) : `${formatCents(minCents)}–${formatCents(maxCents)}`;
}

interface DollarRange { minCents: number; maxCents: number }

// Value-aware checklist plan (2026-08-07, §12 Stage 2): sums cost/value-add
// only across whatever's actually rendered right now — generic-fallback
// items still behind the personalize wizard aren't counted yet, so the
// total never references content the homeowner hasn't seen. Cost and
// value-add are summed independently (not every item with a cost has a
// value-add, e.g. staging) rather than skipping an item just because one
// of its two figures is missing.
function aggregateSalePrepValue(items: SaleReadinessItem[]): { cost: DollarRange | null; valueAdd: DollarRange | null; itemCount: number } {
  let costMin = 0;
  let costMax = 0;
  let hasCost = false;
  let valueMin = 0;
  let valueMax = 0;
  let hasValue = false;
  let itemCount = 0;
  for (const item of items) {
    if (item.estimatedCostMinCents != null && item.estimatedCostMaxCents != null) {
      costMin += item.estimatedCostMinCents;
      costMax += item.estimatedCostMaxCents;
      hasCost = true;
      itemCount += 1;
    }
    if (item.estimatedValueAddMinCents != null && item.estimatedValueAddMaxCents != null) {
      valueMin += item.estimatedValueAddMinCents;
      valueMax += item.estimatedValueAddMaxCents;
      hasValue = true;
    }
  }
  return {
    cost: hasCost ? { minCents: costMin, maxCents: costMax } : null,
    valueAdd: hasValue ? { minCents: valueMin, maxCents: valueMax } : null,
    itemCount,
  };
}

function YourReturnSummary({ items }: { items: SaleReadinessItem[] }) {
  const { cost, valueAdd, itemCount } = aggregateSalePrepValue(items);
  if (!cost && !valueAdd) return null;

  // Reuses SellerPrepDisclaimer as-is (same ROI-sourcing disclaimer + "View
  // data sources" dialog already shown on Seller Prep) rather than
  // duplicating the copy here — this is the first place on the Sale Case
  // page that surfaces real dollar figures, so it needs the same caveat.

  return (
    <div className="mb-3 space-y-2">
      <MobileCard className="space-y-3 border-emerald-200 bg-emerald-50/40">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100">
            <TrendingUp className="h-5 w-5 text-emerald-700" />
          </div>
          <div>
            <p className={cn('mb-0 font-semibold text-[hsl(var(--mobile-text-primary))]', MOBILE_TYPE_TOKENS.body)}>
              Your return
            </p>
            <p className={cn('mb-0 text-[hsl(var(--mobile-text-secondary))]', MOBILE_TYPE_TOKENS.caption)}>
              Across {itemCount} item{itemCount === 1 ? '' : 's'} with a cost estimate
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {cost ? (
            <div>
              <p className={cn('mb-0 text-[hsl(var(--mobile-text-muted))]', MOBILE_TYPE_TOKENS.caption)}>Estimated cost</p>
              <p className={cn('mb-0 font-semibold text-[hsl(var(--mobile-text-primary))]', MOBILE_TYPE_TOKENS.body)}>
                {formatCentsRange(cost.minCents, cost.maxCents)}
              </p>
            </div>
          ) : null}
          {valueAdd ? (
            <div>
              <p className={cn('mb-0 text-[hsl(var(--mobile-text-muted))]', MOBILE_TYPE_TOKENS.caption)}>Estimated value added</p>
              <p className={cn('mb-0 font-semibold text-emerald-700', MOBILE_TYPE_TOKENS.body)}>
                {formatCentsRange(valueAdd.minCents, valueAdd.maxCents)}
              </p>
            </div>
          ) : null}
        </div>
      </MobileCard>
      <SellerPrepDisclaimer />
    </div>
  );
}

export function MaximizeReturnSection({
  propertyId,
  items,
  focusedItemId,
}: {
  propertyId: string;
  items: SaleReadinessItem[];
  focusedItemId?: string | null;
}) {
  const [wizardDismissed, setWizardDismissed] = React.useState(false);

  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['sale-case', propertyId] });
    queryClient.invalidateQueries({ queryKey: ['sale-case-prep-questions', propertyId] });
    queryClient.invalidateQueries({ queryKey: ['sale-case-notable-upgrades', propertyId] });
  };

  const questionStatusQuery = useQuery({
    queryKey: ['sale-case-prep-questions', propertyId],
    queryFn: () => getSalePrepQuestionStatus(propertyId),
  });

  const upgradesQuery = useQuery({
    queryKey: ['sale-case-notable-upgrades', propertyId],
    queryFn: () => getNotableUpgradeCandidates(propertyId),
  });

  const factMutation = useMutation({
    mutationFn: ({ factKey, value }: { factKey: string; value: unknown }) => patchSalePrepFact(propertyId, factKey, value),
    onSuccess: invalidate,
  });

  const budgetMutation = useMutation({
    mutationFn: (value: SalePrepBudgetRange) => updateBudgetRange(propertyId, value),
    onSuccess: invalidate,
  });

  const upgradesMutation = useMutation({
    mutationFn: (keys: string[]) => confirmNotableUpgrades(propertyId, keys),
    onSuccess: invalidate,
  });

  // §12 Stage 3: pursue/un-pursue an item, typically one from the
  // budget-based recommendation. Self-contained here (not threaded down
  // from SaleCaseClient's own decisionMutation) to stay consistent with
  // how this component already manages all of its own mutations.
  const decisionMutation = useMutation({
    mutationFn: ({ itemId, action }: { itemId: string; action: 'PURSUE' | 'UNPURSUE' }) =>
      setItemDecision(propertyId, itemId, action),
    onSuccess: invalidate,
  });

  const loading = questionStatusQuery.isLoading || upgradesQuery.isLoading;
  const status = questionStatusQuery.data;
  const unconfirmedUpgrades = (upgradesQuery.data ?? []).filter((candidate) => !candidate.confirmed);

  const steps: WizardStep[] = React.useMemo(() => {
    if (!status) return [];
    const conditionSteps: WizardStep[] = CONDITION_QUESTIONS
      .filter((question) => status[question.key] == null)
      .map((question) => ({ kind: 'condition', question }));
    const budgetStep: WizardStep[] = status.budgetRange == null ? [{ kind: 'budget' }] : [];
    const upgradesStep: WizardStep[] = unconfirmedUpgrades.length > 0 ? [{ kind: 'upgrades', candidates: unconfirmedUpgrades }] : [];
    return [...conditionSteps, ...budgetStep, ...upgradesStep];
  }, [status, unconfirmedUpgrades]);

  const realItems = items.filter((item) => !isGenericFallback(item));
  const genericItems = items.filter(isGenericFallback);
  // The generic catalog fallback is the only genuinely unverified content
  // here — hold it back until the homeowner has actually been asked,
  // rather than defaulting to showing it. Real, property-derived items
  // (findings, confirmed evidence, confirmed upgrades) are already true,
  // so they never wait on this.
  const revealGeneric = wizardDismissed || (!loading && steps.length === 0) || genericItems.some((item) => item.id === focusedItemId);
  const showWizard = !loading && steps.length > 0 && !wizardDismissed;
  const visibleItems = revealGeneric ? items : realItems;

  if (loading) {
    return (
      <MobileSection className="mb-4">
        <MobileSectionHeader title="Maximize your return" />
        <MobileCard className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-[hsl(var(--mobile-text-muted))]" />
        </MobileCard>
      </MobileSection>
    );
  }

  if (items.length === 0 && steps.length === 0) return null;

  return (
    <MobileSection className="mb-4">
      <MobileSectionHeader
        title="Maximize your return"
        subtitle="Value-boosting improvements before you list, personalized to your home."
      />

      <YourReturnSummary items={visibleItems} />

      {realItems.length > 0 ? (
        <div className="mb-3 space-y-2">
          {realItems.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              focused={item.id === focusedItemId}
              pursuePending={decisionMutation.isPending}
              onPursue={() => decisionMutation.mutate({ itemId: item.id, action: 'PURSUE' })}
              onUnpursue={() => decisionMutation.mutate({ itemId: item.id, action: 'UNPURSUE' })}
            />
          ))}
        </div>
      ) : null}

      {showWizard ? (
        <PersonalizeWizard
          steps={steps}
          saving={factMutation.isPending || budgetMutation.isPending || upgradesMutation.isPending}
          onAnswerCondition={(factKey, value) => factMutation.mutate({ factKey, value })}
          onAnswerBudget={(value) => budgetMutation.mutate(value)}
          onConfirmUpgrades={(keys) => upgradesMutation.mutate(keys)}
          onDone={() => setWizardDismissed(true)}
        />
      ) : null}

      {revealGeneric && genericItems.length > 0 ? (
        <div className="mt-3 space-y-2">
          {genericItems.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              focused={item.id === focusedItemId}
              pursuePending={decisionMutation.isPending}
              onPursue={() => decisionMutation.mutate({ itemId: item.id, action: 'PURSUE' })}
              onUnpursue={() => decisionMutation.mutate({ itemId: item.id, action: 'UNPURSUE' })}
            />
          ))}
        </div>
      ) : null}
    </MobileSection>
  );
}

function PersonalizeWizard({
  steps,
  saving,
  onAnswerCondition,
  onAnswerBudget,
  onConfirmUpgrades,
  onDone,
}: {
  steps: WizardStep[];
  saving: boolean;
  onAnswerCondition: (factKey: string, value: string) => void;
  onAnswerBudget: (value: SalePrepBudgetRange) => void;
  onConfirmUpgrades: (keys: string[]) => void;
  onDone: () => void;
}) {
  const [index, setIndex] = React.useState(0);
  const [selectedUpgrades, setSelectedUpgrades] = React.useState<string[]>([]);
  const total = steps.length;
  const step = steps[Math.min(index, total - 1)];

  const advance = () => {
    if (index + 1 >= total) onDone();
    else setIndex((current) => current + 1);
  };

  return (
    <MobileCard className="space-y-5 border-2 border-sky-100 bg-gradient-to-b from-sky-50/70 to-white">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-sky-600" />
          <span className="text-xs font-semibold uppercase tracking-wide text-sky-700">
            Personalize your checklist
          </span>
        </div>
        <button
          type="button"
          onClick={onDone}
          className="text-xs font-medium text-[hsl(var(--mobile-text-muted))] hover:text-[hsl(var(--mobile-text-secondary))] hover:underline"
        >
          Skip for now
        </button>
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-sky-100">
        <div
          className="h-full rounded-full bg-sky-500 transition-all duration-300 ease-out"
          style={{ width: `${(index / total) * 100}%` }}
        />
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={index}
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -16 }}
          transition={{ duration: 0.18 }}
        >
          {step.kind === 'condition' ? (
            <ConditionStep
              question={step.question}
              disabled={saving}
              onAnswer={(value) => { onAnswerCondition(step.question.factKey, value); advance(); }}
              onSkip={advance}
            />
          ) : step.kind === 'budget' ? (
            <BudgetStep
              disabled={saving}
              onAnswer={(value) => { onAnswerBudget(value); advance(); }}
              onSkip={advance}
            />
          ) : (
            <UpgradesStep
              candidates={step.candidates}
              selected={selectedUpgrades}
              disabled={saving}
              onToggle={(key) => setSelectedUpgrades((current) => current.includes(key)
                ? current.filter((existing) => existing !== key)
                : [...current, key])}
              onConfirm={() => { onConfirmUpgrades(selectedUpgrades); advance(); }}
              onSkip={advance}
            />
          )}
        </motion.div>
      </AnimatePresence>

      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          onClick={() => setIndex((current) => Math.max(0, current - 1))}
          disabled={index === 0}
          className={cn(
            'inline-flex items-center gap-1 text-xs font-medium',
            index === 0 ? 'invisible' : 'text-[hsl(var(--mobile-text-secondary))] hover:text-[hsl(var(--mobile-text-primary))]',
          )}
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </button>
        <span className="text-xs text-[hsl(var(--mobile-text-muted))]">{index + 1} of {total}</span>
      </div>
    </MobileCard>
  );
}

function QuestionHeading({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <div className="space-y-3 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-sky-100">
        <Icon className="h-6 w-6 text-sky-700" />
      </div>
      <p className={cn('mb-0 font-semibold text-[hsl(var(--mobile-text-primary))]', MOBILE_TYPE_TOKENS.cardTitle)}>
        {children}
      </p>
    </div>
  );
}

function OptionGrid({
  options,
  disabled,
  onSelect,
}: {
  options: Array<{ value: string; label: string }>;
  disabled: boolean;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(option.value)}
          className="rounded-xl border-2 border-[hsl(var(--mobile-border-subtle))] bg-white px-4 py-3.5 text-sm font-medium text-[hsl(var(--mobile-text-primary))] transition-all hover:border-sky-400 hover:bg-sky-50 disabled:opacity-50"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function SkipLink({ disabled, onSkip }: { disabled: boolean; onSkip: () => void }) {
  return (
    <div className="text-center">
      <button
        type="button"
        onClick={onSkip}
        disabled={disabled}
        className="text-xs font-medium text-[hsl(var(--mobile-text-muted))] hover:underline"
      >
        Skip this question
      </button>
    </div>
  );
}

function ConditionStep({
  question,
  disabled,
  onAnswer,
  onSkip,
}: {
  question: ConditionQuestion;
  disabled: boolean;
  onAnswer: (value: string) => void;
  onSkip: () => void;
}) {
  const Icon = CATEGORY_ICONS[question.categoryKey] ?? Star;
  return (
    <div className="space-y-4">
      <QuestionHeading icon={Icon}>{question.question}</QuestionHeading>
      <OptionGrid options={question.options} disabled={disabled} onSelect={onAnswer} />
      <SkipLink disabled={disabled} onSkip={onSkip} />
    </div>
  );
}

function BudgetStep({
  disabled,
  onAnswer,
  onSkip,
}: {
  disabled: boolean;
  onAnswer: (value: SalePrepBudgetRange) => void;
  onSkip: () => void;
}) {
  return (
    <div className="space-y-4">
      <QuestionHeading icon={DollarSign}>What&apos;s your budget for pre-sale prep work?</QuestionHeading>
      <OptionGrid
        options={BUDGET_OPTIONS.map((value) => ({ value, label: BUDGET_RANGE_LABELS[value] }))}
        disabled={disabled}
        onSelect={(value) => onAnswer(value as SalePrepBudgetRange)}
      />
      <SkipLink disabled={disabled} onSkip={onSkip} />
    </div>
  );
}

function UpgradesStep({
  candidates,
  selected,
  disabled,
  onToggle,
  onConfirm,
  onSkip,
}: {
  candidates: NotableUpgradeCandidate[];
  selected: string[];
  disabled: boolean;
  onToggle: (key: string) => void;
  onConfirm: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="space-y-4">
      <QuestionHeading icon={Sparkles}>Any recent upgrades worth highlighting to buyers?</QuestionHeading>
      <div className="space-y-1.5">
        {candidates.map((candidate) => {
          const key = `${candidate.sourceEntityType}:${candidate.sourceEntityId}`;
          const checked = selected.includes(key);
          return (
            <label
              key={key}
              className={cn(
                'flex items-start gap-2 rounded-xl border-2 p-3 transition-colors',
                checked ? 'border-sky-400 bg-sky-50' : 'border-[hsl(var(--mobile-border-subtle))] bg-white',
              )}
            >
              <input
                type="checkbox"
                className="mt-0.5"
                checked={checked}
                disabled={disabled}
                onChange={() => onToggle(key)}
              />
              <span>
                <span className={cn('block text-[hsl(var(--mobile-text-primary))]', MOBILE_TYPE_TOKENS.caption)}>{candidate.title}</span>
                {candidate.detail ? (
                  <span className={cn('block text-[hsl(var(--mobile-text-secondary))]', MOBILE_TYPE_TOKENS.caption)}>{candidate.detail}</span>
                ) : null}
              </span>
            </label>
          );
        })}
      </div>
      <div className="flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={onSkip}
          disabled={disabled}
          className="text-xs font-medium text-[hsl(var(--mobile-text-muted))] hover:underline"
        >
          Skip this question
        </button>
        <Button size="sm" disabled={disabled || selected.length === 0} onClick={onConfirm}>
          {disabled ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Confirm selected
        </Button>
      </div>
    </div>
  );
}

function ItemCard({
  item,
  focused,
  pursuePending,
  onPursue,
  onUnpursue,
}: {
  item: SaleReadinessItem;
  focused?: boolean;
  pursuePending: boolean;
  onPursue: () => void;
  onUnpursue: () => void;
}) {
  const generic = isGenericFallback(item);
  const confirmSignal = isConfirmKnownSignal(item);
  const categoryKey = generic ? item.sourceEntityId : null;
  const Icon = (categoryKey ? CATEGORY_ICONS[categoryKey] : null) ?? Star;
  const pursuing = item.status === 'PURSUING';
  // §12 Stage 3: pursue-tracking only makes sense for items the budget
  // recommendation could actually consider (cosmetic items with a cost
  // estimate) — not a generic "track anything" control.
  const canPursue = item.estimatedCostMinCents != null && (item.status === 'OPEN' || pursuing);

  return (
    <div id={`sale-readiness-item-${item.id}`} className="scroll-mt-24">
      <MobileCard className={cn(
        'flex gap-3 transition-shadow',
        pursuing ? 'border-violet-300 bg-violet-50/50' : confirmSignal && 'border-sky-200 bg-sky-50/40',
        focused && 'border-sky-400 bg-sky-50/60 ring-2 ring-sky-200',
      )}>
      <div className={cn(
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
        generic ? 'bg-amber-100' : confirmSignal ? 'bg-sky-100' : 'bg-emerald-100',
      )}>
        <Icon className={cn('h-5 w-5', generic ? 'text-amber-700' : confirmSignal ? 'text-sky-700' : 'text-emerald-700')} />
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {item.recommendedForBudget ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-800">
              <Sparkles className="h-3 w-3" /> Recommended for your budget
            </span>
          ) : null}
          {generic ? (
            <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
              General guidance — not verified against your records
            </span>
          ) : confirmSignal ? (
            <span className="inline-block rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-800">
              Based on your records
            </span>
          ) : null}
        </div>
        <p className={cn('mb-0.5 font-medium text-[hsl(var(--mobile-text-primary))]', MOBILE_TYPE_TOKENS.body)}>
          {item.title}
        </p>
        {item.detail ? (
          <p className={cn('mb-0 text-[hsl(var(--mobile-text-secondary))]', MOBILE_TYPE_TOKENS.caption)}>
            {item.detail}
          </p>
        ) : null}
        {item.estimatedCostMinCents != null && item.estimatedCostMaxCents != null ? (
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 pt-0.5">
            <span className="text-[11px] font-medium text-[hsl(var(--mobile-text-secondary))]">
              Est. cost {formatCentsRange(item.estimatedCostMinCents, item.estimatedCostMaxCents)}
            </span>
            {item.estimatedValueAddMinCents != null && item.estimatedValueAddMaxCents != null ? (
              <span className="text-[11px] font-medium text-emerald-700">
                Est. value add {formatCentsRange(item.estimatedValueAddMinCents, item.estimatedValueAddMaxCents)}
              </span>
            ) : null}
          </div>
        ) : null}
        {canPursue ? (
          <div className="flex justify-end pt-1">
            {pursuing ? (
              <Button size="sm" variant="outline" className="border-violet-300 text-violet-800" disabled={pursuePending} onClick={onUnpursue}>
                <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Pursuing — remove
              </Button>
            ) : (
              <Button size="sm" variant="outline" disabled={pursuePending} onClick={onPursue}>
                Pursue this
              </Button>
            )}
          </div>
        ) : null}
      </div>
      </MobileCard>
    </div>
  );
}
