'use client';

import { motion } from 'framer-motion';
import { type LucideIcon } from 'lucide-react';

type SignalChipProps = {
  icon: LucideIcon;
  label: string;
  delay?: number;
  reducedMotion?: boolean;
};

export function SignalChip({
  icon: Icon,
  label,
  delay = 0,
  reducedMotion = false,
}: SignalChipProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.82, y: 6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.23, 1, 0.32, 1] }}
    >
      <motion.div
        animate={reducedMotion ? undefined : { y: [0, -4, 0] }}
        transition={{
          duration: 3.5,
          repeat: Infinity,
          ease: 'easeInOut',
          delay: delay + 0.5,
        }}
        className="flex items-center gap-1.5 rounded-xl px-2 py-1.5
          bg-white/90 border border-slate-100/80 shadow-sm backdrop-blur-sm
          dark:bg-slate-800/70 dark:border-slate-700/50 dark:shadow-slate-900/20"
      >
        <Icon
          className="h-3 w-3 flex-shrink-0 text-teal-500 dark:text-teal-400"
          strokeWidth={2.5}
        />
        <span className="text-[10.5px] font-semibold tracking-normal whitespace-nowrap text-slate-600 dark:text-slate-300">
          {label}
        </span>
      </motion.div>
    </motion.div>
  );
}
