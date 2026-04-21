'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
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
          className="w-1.5 h-1.5 rounded-full bg-teal-400 dark:bg-teal-500"
          animate={reducedMotion ? undefined : { opacity: [0.25, 1, 0.25] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.22, ease: 'easeInOut' }}
        />
      ))}
    </div>
  );
}

export default function PostLoginTransition({
  progressMode = 'bar',
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
        'px-6',
        className ?? '',
      ].join(' ')}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Preparing your home command center"
    >
      {/* Logo */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.23, 1, 0.32, 1] }}
        className="flex items-center gap-2.5 mb-7 md:mb-9"
      >
        <Image
          src="/favicon.svg"
          alt="ContractToCozy"
          width={30}
          height={30}
          className="h-[30px] w-[30px] flex-shrink-0"
          priority
        />
        <span
          className="text-[16px] font-bold tracking-tight text-slate-900 dark:text-slate-50 select-none"
          style={{ fontFamily: 'var(--font-heading)' }}
        >
          ContractToCozy
        </span>
      </motion.div>

      {/* Central scene: stage + signals */}
      <motion.div
        initial={{ opacity: 0, scale: 0.93, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.55, delay: 0.08, ease: [0.23, 1, 0.32, 1] }}
      >
        <PostLoginTransitionScene reducedMotion={reducedMotion} />
      </motion.div>

      {/* Status copy block */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.32, ease: 'easeOut' }}
        className="mt-7 md:mt-9 text-center w-full max-w-[300px] md:max-w-[360px]"
      >
        <p
          className="text-[14.5px] md:text-[15px] font-semibold tracking-tight text-slate-900 dark:text-slate-50"
          style={{ fontFamily: 'var(--font-heading)' }}
        >
          Preparing your home command center…
        </p>
        <p className="mt-1.5 text-[12px] md:text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
          Syncing your property, protections, and next best actions.
        </p>

        {/* Rotating tertiary status — slow, subtle */}
        <div className="mt-2 h-[18px] flex items-center justify-center">
          <AnimatePresence mode="wait">
            {messageVisible && (
              <motion.p
                key={messageIndex}
                initial={{ opacity: 0, y: 3 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -3 }}
                transition={{ duration: 0.28, ease: 'easeInOut' }}
                className="text-[10.5px] font-medium tracking-wide text-teal-600/75 dark:text-teal-400/65"
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
        transition={{ duration: 0.4, delay: 0.5 }}
        className="mt-5 md:mt-6 w-full max-w-[200px] md:max-w-[240px] flex items-center justify-center"
      >
        {progressMode === 'dots' ? (
          <ProgressDots reducedMotion={reducedMotion} />
        ) : (
          <ProgressBar reducedMotion={reducedMotion} />
        )}
      </motion.div>
    </motion.div>
  );
}
