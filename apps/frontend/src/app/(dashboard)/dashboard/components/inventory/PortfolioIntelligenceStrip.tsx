'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { formatCurrency } from '@/lib/utils/format';

type InventoryPortfolioFilter = 'gaps' | 'no-value' | null;

export type PortfolioStats = {
  totalValue: number;
  coveredValue: number;
  coverageRate: number;
  gapCount: number;
  missingValueCount: number;
  docCount: number;
  totalItems: number;
};

type PortfolioIntelligenceStripProps = {
  stats: PortfolioStats;
  activeFilter: InventoryPortfolioFilter;
  onToggleFilter: (filter: Exclude<InventoryPortfolioFilter, null>) => void;
};

function useCountUp(target: number, duration = 800) {
  const [value, setValue] = React.useState(target);
  const fromRef = React.useRef(target);
  const frameRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    const start = performance.now();
    const from = fromRef.current;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = from + (target - from) * eased;
      setValue(next);

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
      }
    };

    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(tick);

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [duration, target]);

  return value;
}

export default function PortfolioIntelligenceStrip({
  stats,
  activeFilter,
  onToggleFilter,
}: PortfolioIntelligenceStripProps) {
  const animatedTotalValue = useCountUp(stats.totalValue);
  const animatedCoverageRate = useCountUp(stats.coverageRate);
  const animatedGapCount = useCountUp(stats.gapCount);
  const animatedMissingValueCount = useCountUp(stats.missingValueCount);

  return (
    <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.0 }}
        className="cursor-default rounded-xl border border-gray-200 bg-white p-4 transition-colors hover:border-teal-200 hover:bg-teal-50/30"
      >
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Portfolio Value</p>
        <p className="text-2xl font-display font-bold text-gray-900">{formatCurrency(Math.round(animatedTotalValue))}</p>
        <p className="mt-0.5 text-xs text-gray-400">{stats.totalItems} items tracked</p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.06 }}
        className="cursor-default rounded-xl border border-gray-200 bg-white p-4 transition-colors hover:border-emerald-200 hover:bg-emerald-50/30"
      >
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Coverage Rate</p>
        <p
          className={`text-2xl font-display font-bold ${
            stats.coverageRate >= 80 ? 'text-emerald-600' : stats.coverageRate >= 50 ? 'text-amber-500' : 'text-red-500'
          }`}
        >
          {Math.round(animatedCoverageRate)}%
        </p>
        <p className="mt-0.5 text-xs text-gray-400">{formatCurrency(stats.coveredValue)} protected</p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.12 }}
      >
        <button
          type="button"
          onClick={() => onToggleFilter('gaps')}
          className={[
            'w-full rounded-xl border bg-white p-4 text-left transition-all',
            activeFilter === 'gaps'
              ? 'border-red-300 bg-red-50 ring-1 ring-red-200'
              : 'border-gray-200 hover:border-red-200 hover:bg-red-50/30',
          ].join(' ')}
        >
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Coverage Gaps</p>
          <p className={`text-2xl font-display font-bold ${stats.gapCount > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
            {Math.round(animatedGapCount)}
          </p>
          <p className="mt-0.5 text-xs text-gray-400">
            {stats.gapCount === 0 ? 'All items protected' : 'items need coverage'}
          </p>
        </button>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.18 }}
      >
        <button
          type="button"
          onClick={() => onToggleFilter('no-value')}
          className={[
            'w-full rounded-xl border bg-white p-4 text-left transition-all',
            activeFilter === 'no-value'
              ? 'border-amber-300 bg-amber-50 ring-1 ring-amber-200'
              : 'border-gray-200 hover:border-amber-200 hover:bg-amber-50/30',
          ].join(' ')}
        >
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Missing Values</p>
          <p
            className={`text-2xl font-display font-bold ${
              stats.missingValueCount > 0 ? 'text-amber-500' : 'text-emerald-600'
            }`}
          >
            {Math.round(animatedMissingValueCount)}
          </p>
          <p className="mt-0.5 text-xs text-gray-400">
            {stats.missingValueCount === 0 ? 'All values set' : 'items need a value'}
          </p>
        </button>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.24 }}
        className="cursor-default rounded-xl border border-gray-200 bg-white p-4 transition-colors hover:border-gray-300"
      >
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Documents</p>
        <p className="text-2xl font-display font-bold text-gray-900">{stats.docCount}</p>
        <p className="mt-0.5 text-xs text-gray-400">receipts and warranties</p>
      </motion.div>
    </div>
  );
}

export type { InventoryPortfolioFilter };
