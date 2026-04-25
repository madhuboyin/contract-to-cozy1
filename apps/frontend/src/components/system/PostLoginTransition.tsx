'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { PostLoginTransitionScene } from './PostLoginTransitionScene';
import { ROTATING_MESSAGES } from '@/lib/loading/postLoginTransitionMessages';

type ProgressMode = 'bar' | 'dots';

export type PostLoginTransitionProps = {
  progressMode?: ProgressMode;
  className?: string;
};

function ProgressBar({ reducedMotion }: { reducedMotion: boolean }) {
  return (
    <div className="h-[3px] w-full rounded-full overflow-hidden bg-slate-100 dark:bg-slate-700/60">
      <motion.div
        className="h-full w-[45%] rounded-full bg-gradient-to-r from-teal-400 to-cyan-400 dark:from-teal-500 dark:to-cyan-400"
        animate={reducedMotion ? undefined : { x: ['-115%', '260%'] }}
        transition={{ duration: 1.7, repeat: Infinity, ease: 'easeInOut' }}
        style={reducedMotion ? { width: '100%' } : undefined}
      />
    </div>
  );
}

function ProgressDots({ reducedMotion }: { reducedMotion: boolean }) {
  return (
    <div className="flex items-center gap-2">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className={[
            'rounded-full',
            i === 1
              ? 'w-2.5 h-2.5 bg-teal-500 dark:bg-teal-400'
              : 'w-2 h-2 bg-slate-300 dark:bg-slate-600',
          ].join(' ')}
          animate={reducedMotion ? undefined : { opacity: i === 1 ? [0.6, 1, 0.6] : [0.4, 0.7, 0.4] }}
          transition={{ duration: 1.8, repeat: Infinity, delay: i * 0.3, ease: 'easeInOut' }}
        />
      ))}
    </div>
  );
}

export default function PostLoginTransition({
  progressMode = 'dots',
  className,
}: PostLoginTransitionProps) {
  const prefersReducedMotion = useReducedMotion();
  const reducedMotion = prefersReducedMotion ?? false;

  const [messageIndex, setMessageIndex] = useState(0);
  const [messageVisible, setMessageVisible] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (reducedMotion) return;

    intervalRef.current = setInterval(() => {
      setMessageVisible(false);
      setTimeout(() => {
        setMessageIndex((i) => (i + 1) % ROTATING_MESSAGES.length);
        setMessageVisible(true);
      }, 340);
    }, 2800);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [reducedMotion]);

  return (
    <motion.div
      key="post-login-transition"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.4, ease: 'easeInOut' } }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className={[
        'fixed inset-0 z-[9999]',
        'flex flex-col items-center justify-center',
        'bg-gradient-to-br from-slate-50 via-white to-cyan-50/40',
        'dark:from-[#08142a] dark:via-[#0c1a2e] dark:to-[#081220]',
        'px-6 py-8',
        className ?? '',
      ].join(' ')}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Preparing your home command center"
    >
      {/* Main visual — image carries the logo, orbit, house, and signal cards */}
      <PostLoginTransitionScene reducedMotion={reducedMotion} />

      {/* Status copy */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.4, ease: 'easeOut' }}
        className="mt-5 md:mt-6 text-center w-full max-w-[300px] md:max-w-[380px]"
      >
        <p
          className="text-[14px] md:text-[15px] font-semibold tracking-tight text-slate-900 dark:text-slate-50"
          style={{ fontFamily: 'var(--font-heading)' }}
        >
          Preparing your home command center…
        </p>
        <p className="mt-1 text-[11.5px] md:text-[12.5px] leading-relaxed text-slate-500 dark:text-slate-400">
          Syncing your property, protections, and next best actions.
        </p>

        {/* Rotating tertiary status */}
        <div className="mt-2 h-[18px] flex items-center justify-center">
          <AnimatePresence mode="wait">
            {messageVisible && (
              <motion.p
                key={messageIndex}
                initial={{ opacity: 0, y: 3 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -3 }}
                transition={{ duration: 0.28, ease: 'easeInOut' }}
                className="text-[10.5px] font-medium tracking-normal text-teal-600/75 dark:text-teal-400/65"
              >
                {ROTATING_MESSAGES[messageIndex]}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Progress indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.55 }}
        className="mt-4 flex items-center justify-center w-full max-w-[200px] md:max-w-[240px]"
      >
        {progressMode === 'bar' ? (
          <ProgressBar reducedMotion={reducedMotion} />
        ) : (
          <ProgressDots reducedMotion={reducedMotion} />
        )}
      </motion.div>
    </motion.div>
  );
}
