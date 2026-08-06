'use client';

// Sale Readiness Value-Maximization Checklist plan §4.5/§4.9/§4.10/§10 Phase 7:
// the "Maximize your return" section — PRESENTATION-category readiness items
// (visually distinct from the compliance-oriented requirement-class groups
// rendered elsewhere on this page) plus the grouped question card that lets
// a homeowner personalize the generic-fallback items with their own answers.

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  MobileCard,
  MobileSection,
  MobileSectionHeader,
} from '@/components/mobile/dashboard/MobilePrimitives';
import { MOBILE_TYPE_TOKENS } from '@/components/mobile/dashboard/mobileDesignTokens';
import {
  confirmNotableUpgrades,
  getNotableUpgradeCandidates,
  getSalePrepQuestionStatus,
  patchSalePrepFact,
  updateBudgetRange,
} from './saleCaseApi';
import {
  BUDGET_RANGE_LABELS,
  type NotableUpgradeCandidate,
  type PropertyCosmeticCondition,
  type PropertyRoomUpdateStatus,
  type PropertyStagingReadiness,
  type SalePrepBudgetRange,
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

const CONDITION_QUESTIONS: Array<{
  key: ConditionQuestionKey;
  factKey: string;
  question: string;
  options: Array<{ value: string; label: string }>;
  categoryKey: string;
}> = [
  { key: 'paintCondition', factKey: 'salePrep.paintCondition', question: 'How does your interior paint and wall condition look right now?', options: COSMETIC_CONDITION_OPTIONS, categoryKey: 'paint' },
  { key: 'curbAppealCondition', factKey: 'salePrep.curbAppealCondition', question: 'How would you describe your curb appeal and landscaping today?', options: COSMETIC_CONDITION_OPTIONS, categoryKey: 'curbAppeal' },
  { key: 'flooringCondition', factKey: 'salePrep.flooringCondition', question: "What's the current condition of your flooring?", options: COSMETIC_CONDITION_OPTIONS, categoryKey: 'flooring' },
  { key: 'kitchenStatus', factKey: 'salePrep.kitchenStatus', question: 'How would you describe your kitchen?', options: ROOM_UPDATE_OPTIONS, categoryKey: 'kitchen' },
  { key: 'bathroomStatus', factKey: 'salePrep.bathroomStatus', question: 'How would you describe your bathrooms?', options: ROOM_UPDATE_OPTIONS, categoryKey: 'bathroom' },
  { key: 'stagingReadiness', factKey: 'salePrep.stagingReadiness', question: 'How ready is your home to show to buyers today?', options: STAGING_OPTIONS, categoryKey: 'staging' },
];

const CATEGORY_QUESTION_TITLES: Record<string, string> = {
  paint: 'paint condition',
  curbAppeal: 'curb appeal',
  flooring: 'flooring condition',
  kitchen: 'kitchen',
  bathroom: 'bathrooms',
  staging: 'staging readiness',
};

function isGenericFallback(item: SaleReadinessItem): boolean {
  return item.sourceEntityType === 'SALE_PREP_GENERIC';
}

function isConfirmKnownSignal(item: SaleReadinessItem): boolean {
  return item.title.includes('confirm current condition');
}

export function MaximizeReturnSection({
  propertyId,
  items,
}: {
  propertyId: string;
  items: SaleReadinessItem[];
}) {
  const [expanded, setExpanded] = React.useState(true);
  const [focusKey, setFocusKey] = React.useState<string | null>(null);
  const fieldRefs = React.useRef<Partial<Record<string, HTMLDivElement | null>>>({});

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

  const jumpToQuestion = (categoryKey: string) => {
    setExpanded(true);
    setFocusKey(categoryKey);
    // Let the expand happen before scrolling.
    requestAnimationFrame(() => {
      fieldRefs.current[categoryKey]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  };

  const status = questionStatusQuery.data;
  const unansweredConditions = status
    ? CONDITION_QUESTIONS.filter((question) => status[question.key] == null)
    : [];
  const upgradeCandidates = upgradesQuery.data ?? [];
  const unconfirmedUpgrades = upgradeCandidates.filter((candidate) => !candidate.confirmed);
  const unansweredCount = unansweredConditions.length
    + (status?.budgetRange == null ? 1 : 0)
    + (unconfirmedUpgrades.length > 0 ? 1 : 0);

  const loading = questionStatusQuery.isLoading || upgradesQuery.isLoading;

  return (
    <MobileSection className="mb-4">
      <MobileSectionHeader title="Maximize your return" />
      <div className="space-y-2">
        {items.map((item) => (
          <PresentationItemCard key={item.id} item={item} onJumpToQuestion={jumpToQuestion} />
        ))}
      </div>

      {!loading && unansweredCount > 0 ? (
        expanded ? (
          <QuestionCard
            status={status ?? null}
            unansweredConditions={unansweredConditions}
            upgradeCandidates={upgradeCandidates}
            fieldRefs={fieldRefs}
            focusKey={focusKey}
            saving={factMutation.isPending || budgetMutation.isPending || upgradesMutation.isPending}
            onAnswerCondition={(factKey, value) => factMutation.mutate({ factKey, value })}
            onAnswerBudget={(value) => budgetMutation.mutate(value)}
            onConfirmUpgrades={(keys) => upgradesMutation.mutate(keys)}
            onCollapse={() => setExpanded(false)}
          />
        ) : (
          <MobileCard variant="compact" className="mt-2 flex items-center justify-between gap-3">
            <p className={cn('mb-0 text-[hsl(var(--mobile-text-secondary))]', MOBILE_TYPE_TOKENS.caption)}>
              {unansweredCount} quick question{unansweredCount === 1 ? '' : 's'} could sharpen your checklist
            </p>
            <Button size="sm" variant="outline" onClick={() => setExpanded(true)}>Answer now</Button>
          </MobileCard>
        )
      ) : null}
    </MobileSection>
  );
}

function PresentationItemCard({
  item,
  onJumpToQuestion,
}: {
  item: SaleReadinessItem;
  onJumpToQuestion: (categoryKey: string) => void;
}) {
  const generic = isGenericFallback(item);
  const confirmSignal = isConfirmKnownSignal(item);
  const categoryTitle = generic ? CATEGORY_QUESTION_TITLES[item.sourceEntityId] : null;

  return (
    <MobileCard className={cn('space-y-2', confirmSignal && 'border-sky-200 bg-sky-50/50')}>
      {generic ? (
        <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
          General guidance — not verified against your records
        </span>
      ) : confirmSignal ? (
        <span className="inline-block rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-800">
          Based on your records
        </span>
      ) : null}
      <p className={cn('mb-0.5 font-medium text-[hsl(var(--mobile-text-primary))]', MOBILE_TYPE_TOKENS.body)}>
        {item.title}
      </p>
      {item.detail ? (
        <p className={cn('mb-0 text-[hsl(var(--mobile-text-secondary))]', MOBILE_TYPE_TOKENS.caption)}>
          {item.detail}
        </p>
      ) : null}
      {generic && categoryTitle ? (
        <button
          type="button"
          onClick={() => onJumpToQuestion(item.sourceEntityId)}
          className="text-xs font-medium text-sky-700 hover:underline"
        >
          Tell us your {categoryTitle} →
        </button>
      ) : null}
    </MobileCard>
  );
}

function QuestionCard({
  status,
  unansweredConditions,
  upgradeCandidates,
  fieldRefs,
  focusKey,
  saving,
  onAnswerCondition,
  onAnswerBudget,
  onConfirmUpgrades,
  onCollapse,
}: {
  status: { budgetRange: SalePrepBudgetRange | null } | null;
  unansweredConditions: typeof CONDITION_QUESTIONS;
  upgradeCandidates: NotableUpgradeCandidate[];
  fieldRefs: React.MutableRefObject<Partial<Record<string, HTMLDivElement | null>>>;
  focusKey: string | null;
  saving: boolean;
  onAnswerCondition: (factKey: string, value: string) => void;
  onAnswerBudget: (value: SalePrepBudgetRange) => void;
  onConfirmUpgrades: (keys: string[]) => void;
  onCollapse: () => void;
}) {
  const unconfirmed = upgradeCandidates.filter((candidate) => !candidate.confirmed);
  const [selectedUpgrades, setSelectedUpgrades] = React.useState<string[]>([]);

  return (
    <MobileCard className="mt-2 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={cn('mb-0.5 font-medium text-[hsl(var(--mobile-text-primary))]', MOBILE_TYPE_TOKENS.body)}>
            A few quick questions to personalize your checklist
          </p>
          <p className={cn('mb-0 text-[hsl(var(--mobile-text-secondary))]', MOBILE_TYPE_TOKENS.caption)}>
            Answering these swaps out general suggestions for advice based on your actual home.
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={onCollapse}>Skip for now</Button>
      </div>

      {unansweredConditions.map((question) => (
        <div
          key={question.key}
          ref={(node) => { fieldRefs.current[question.categoryKey] = node; }}
          className={cn('space-y-1.5 rounded-lg p-1 transition-colors', focusKey === question.categoryKey && 'bg-sky-50 ring-1 ring-sky-200')}
        >
          <p className={cn('mb-0 font-medium text-[hsl(var(--mobile-text-primary))]', MOBILE_TYPE_TOKENS.caption)}>
            {question.question}
          </p>
          <div className="flex flex-wrap gap-2">
            {question.options.map((option) => (
              <Button
                key={option.value}
                type="button"
                size="sm"
                variant="outline"
                disabled={saving}
                onClick={() => onAnswerCondition(question.factKey, option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>
      ))}

      {status?.budgetRange == null ? (
        <div className="space-y-1.5">
          <p className={cn('mb-0 font-medium text-[hsl(var(--mobile-text-primary))]', MOBILE_TYPE_TOKENS.caption)}>
            What&apos;s your budget for pre-sale prep work?
          </p>
          <div className="flex flex-wrap gap-2">
            {BUDGET_OPTIONS.map((option) => (
              <Button
                key={option}
                type="button"
                size="sm"
                variant="outline"
                disabled={saving}
                onClick={() => onAnswerBudget(option)}
              >
                {BUDGET_RANGE_LABELS[option]}
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      {unconfirmed.length > 0 ? (
        <div className="space-y-1.5">
          <p className={cn('mb-0 font-medium text-[hsl(var(--mobile-text-primary))]', MOBILE_TYPE_TOKENS.caption)}>
            Any recent upgrades worth highlighting to buyers?
          </p>
          <div className="space-y-1.5">
            {unconfirmed.map((candidate) => {
              const key = `${candidate.sourceEntityType}:${candidate.sourceEntityId}`;
              const checked = selectedUpgrades.includes(key);
              return (
                <label key={key} className="flex items-start gap-2 rounded-lg border border-[hsl(var(--mobile-border-subtle))] p-2">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={checked}
                    onChange={(event) => {
                      setSelectedUpgrades((current) => event.target.checked
                        ? [...current, key]
                        : current.filter((existing) => existing !== key));
                    }}
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
          <div className="flex justify-end">
            <Button
              size="sm"
              disabled={saving || selectedUpgrades.length === 0}
              onClick={() => onConfirmUpgrades(selectedUpgrades)}
            >
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Confirm selected
            </Button>
          </div>
        </div>
      ) : null}
    </MobileCard>
  );
}
