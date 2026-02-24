'use client';

import React, { useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import { titleCase } from '@/lib/utils/string';

type RoomType =
  | 'KITCHEN'
  | 'LIVING'
  | 'BEDROOM'
  | 'BATHROOM'
  | 'DINING'
  | 'LAUNDRY'
  | 'GARAGE'
  | 'OFFICE'
  | 'BASEMENT'
  | 'OTHER';

type InsightFrequency = 'ONCE' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'SEASONAL' | null;

export type RoomInsight = {
  text: string;
  action: string | null;
  frequency: InsightFrequency;
};

type QuickInsightsPanelProps = {
  roomType: RoomType;
  profileData: Record<string, any>;
  onAddInsightTask?: (insight: RoomInsight) => void;
};

const FIELD_LABELS: Record<string, string> = {
  style: 'Style',
  flooring: 'Floor',
  countertops: 'Countertops',
  cabinets: 'Cabinets',
  backsplash: 'Backsplash',
  ventHood: 'Vent',
  primaryUse: 'Primary use',
  tvMount: 'TV mount',
  lighting: 'Lighting',
  bathroomType: 'Bathroom type',
  showerType: 'Shower type',
  exhaustFan: 'Exhaust fan',
  gfciPresent: 'GFCI',
  ventingType: 'Venting',
};

const INSIGHTS_RULES: Record<string, Record<string, Record<string, RoomInsight[]>>> = {
  KITCHEN: {
    ventHood: {
      CHIMNEY: [{ text: 'Chimney hoods need filter cleaning every 3 months.', action: 'Add reminder ->', frequency: 'QUARTERLY' }],
      UNDER_CABINET: [{ text: 'Under-cabinet filters should be replaced or cleaned every quarter.', action: 'Add reminder ->', frequency: 'QUARTERLY' }],
      MICROWAVE: [{ text: 'Microwave hood filters should be degreased monthly.', action: 'Add reminder ->', frequency: 'MONTHLY' }],
    },
    countertops: {
      GRANITE: [{ text: 'Granite should be resealed every 1-2 years to prevent staining.', action: 'Add sealing task ->', frequency: 'SEASONAL' }],
      MARBLE: [{ text: 'Marble is porous. Seal yearly and avoid acidic cleaners.', action: 'Add sealing task ->', frequency: 'SEASONAL' }],
      QUARTZ: [{ text: 'Quartz typically needs gentle cleaning only, no sealing.', action: null, frequency: null }],
    },
    flooring: {
      HARDWOOD: [{ text: 'Hardwood benefits from a condition check before humid seasons.', action: 'Add annual check ->', frequency: 'SEASONAL' }],
      TILE: [{ text: 'Inspect grout and reseal problem spots once a year.', action: 'Add grout check ->', frequency: 'SEASONAL' }],
      VINYL: [{ text: 'Avoid standing water on vinyl seams to reduce lift risk.', action: 'Add monthly check ->', frequency: 'MONTHLY' }],
    },
  },
  BATHROOM: {
    exhaustFan: {
      YES: [{ text: 'Clean bathroom exhaust fan covers every season.', action: 'Add fan cleaning task ->', frequency: 'SEASONAL' }],
      NO: [{ text: 'No exhaust fan detected. Increase ventilation checks for moisture control.', action: 'Add moisture check ->', frequency: 'MONTHLY' }],
    },
    showerType: {
      SHOWER_TUB: [{ text: 'Re-caulk shower-tub seams annually to prevent leaks.', action: 'Add caulk check ->', frequency: 'SEASONAL' }],
      SHOWER_ONLY: [{ text: 'Inspect shower drain flow monthly to catch clogs early.', action: 'Add drain check ->', frequency: 'MONTHLY' }],
    },
  },
  LAUNDRY: {
    ventingType: {
      RIGID: [{ text: 'Rigid venting is safer. Keep lint path checks quarterly.', action: 'Add vent check ->', frequency: 'QUARTERLY' }],
      FLEX: [{ text: 'Flex venting needs frequent lint checks to reduce fire risk.', action: 'Add lint check ->', frequency: 'MONTHLY' }],
    },
    leakPan: {
      YES: [{ text: 'Leak pan present. Confirm drain path is clear every season.', action: 'Add drain check ->', frequency: 'SEASONAL' }],
      NO: [{ text: 'Consider adding a washer leak pan for overflow protection.', action: 'Add improvement task ->', frequency: 'ONCE' }],
    },
  },
};

function normalizeKey(value: unknown): string {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');
}

function formatDisplayValue(value: unknown): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return titleCase(raw.replace(/_/g, ' '));
}

function getActiveInsights(roomType: RoomType, profileData: Record<string, any>): RoomInsight[] {
  const roomRules = INSIGHTS_RULES[roomType] || {};
  const active: RoomInsight[] = [];

  for (const [field, rawValue] of Object.entries(profileData || {})) {
    const value = normalizeKey(rawValue);
    const byField = roomRules[field];
    if (!value || !byField || !byField[value]) continue;
    active.push(...byField[value]);
  }

  if (active.length > 0) return active;

  if (roomType === 'KITCHEN') {
    return [
      { text: 'Replace or clean hood filters every quarter.', action: 'Add reminder ->', frequency: 'QUARTERLY' },
      { text: 'Check under-sink area for leaks monthly.', action: 'Add reminder ->', frequency: 'MONTHLY' },
      { text: 'Test nearby GFCI outlets every season.', action: 'Add reminder ->', frequency: 'SEASONAL' },
    ];
  }

  if (roomType === 'BATHROOM') {
    return [
      { text: 'Clean exhaust fan covers every season.', action: 'Add reminder ->', frequency: 'SEASONAL' },
      { text: 'Check sink cabinet for moisture monthly.', action: 'Add reminder ->', frequency: 'MONTHLY' },
      { text: 'Inspect grout and caulk condition every season.', action: 'Add reminder ->', frequency: 'SEASONAL' },
    ];
  }

  return [
    { text: 'Review this room monthly for wear and tear.', action: 'Add reminder ->', frequency: 'MONTHLY' },
    { text: 'Keep one preventive task active each season.', action: 'Add reminder ->', frequency: 'SEASONAL' },
    { text: 'Document repairs as they happen for claim readiness.', action: null, frequency: null },
  ];
}

export default function QuickInsightsPanel({ roomType, profileData, onAddInsightTask }: QuickInsightsPanelProps) {
  const activeInsights = useMemo(() => getActiveInsights(roomType, profileData), [roomType, profileData]);

  const snapshotItems = useMemo(
    () =>
      Object.entries(profileData || {})
        .filter(([, value]) => String(value || '').trim().length > 0)
        .slice(0, 8),
    [profileData],
  );

  const hasProfileSnapshot = snapshotItems.length > 0;

  return (
    <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-5">
      <div>
        <h3 className="text-sm font-semibold text-gray-800">Quick Insights</h3>
        <p className="mt-0.5 text-xs text-gray-500">Based on your room&apos;s materials and setup.</p>
      </div>

      {hasProfileSnapshot ? (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Your room</p>
          <div className="flex flex-wrap gap-1.5">
            {snapshotItems.map(([field, value]) => (
              <span key={field} className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-600">
                {FIELD_LABELS[field] ?? titleCase(field)}: {formatDisplayValue(value)}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="space-y-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
          {hasProfileSnapshot ? 'Personalized tips' : 'General tips for this room type'}
        </p>

        <AnimatePresence mode="popLayout">
          {activeInsights.map((insight, index) => (
            <motion.div
              key={insight.text}
              layout
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.2, delay: index * 0.04 }}
              className="flex items-start gap-2.5"
            >
              <div className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-teal-500" />
              <div className="flex-1">
                <p className="text-sm leading-relaxed text-gray-700">{insight.text}</p>
                {insight.action ? (
                  <button
                    type="button"
                    onClick={() => onAddInsightTask?.(insight)}
                    className="mt-0.5 inline-flex items-center gap-1 text-xs text-teal-600 transition-colors hover:text-teal-700 hover:underline"
                  >
                    {insight.action}
                  </button>
                ) : null}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <p className="border-t border-gray-100 pt-3 text-[10px] text-gray-400">Small habits {'->'} fewer incidents and better claims readiness.</p>
    </div>
  );
}
