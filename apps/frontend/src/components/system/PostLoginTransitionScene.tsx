'use client';

import { motion } from 'framer-motion';
import { Shield, CheckSquare, FileText, Cloud } from 'lucide-react';
import { SignalChip } from './PostLoginTransitionSignals';

type Props = {
  reducedMotion: boolean;
};

function HouseIllustration() {
  return (
    <svg
      viewBox="0 0 120 110"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="w-24 h-24 md:w-28 md:h-28 drop-shadow-sm"
      aria-hidden="true"
    >
      {/* Chimney */}
      <rect
        x="79" y="15" width="12" height="26" rx="1.5"
        className="fill-slate-300 dark:fill-slate-500"
      />
      <rect
        x="76" y="13" width="18" height="5" rx="1.5"
        className="fill-slate-300 dark:fill-slate-500"
      />

      {/* Roof */}
      <polygon
        points="6,57 60,10 114,57"
        className="fill-teal-500 dark:fill-teal-600"
      />
      {/* Roof depth shading */}
      <polygon
        points="6,57 60,16 114,57 110,57 60,19 10,57"
        className="fill-teal-700/20 dark:fill-black/20"
      />

      {/* House body */}
      <rect
        x="16" y="57" width="88" height="48" rx="2"
        className="fill-white dark:fill-slate-700"
      />

      {/* Left window */}
      <rect
        x="24" y="67" width="22" height="18" rx="2.5"
        className="fill-sky-50 dark:fill-sky-950/50"
      />
      <line
        x1="35" y1="67" x2="35" y2="85"
        className="stroke-sky-200 dark:stroke-sky-800/60"
        strokeWidth="1"
      />
      <line
        x1="24" y1="76" x2="46" y2="76"
        className="stroke-sky-200 dark:stroke-sky-800/60"
        strokeWidth="1"
      />

      {/* Right window */}
      <rect
        x="74" y="67" width="22" height="18" rx="2.5"
        className="fill-sky-50 dark:fill-sky-950/50"
      />
      <line
        x1="85" y1="67" x2="85" y2="85"
        className="stroke-sky-200 dark:stroke-sky-800/60"
        strokeWidth="1"
      />
      <line
        x1="74" y1="76" x2="96" y2="76"
        className="stroke-sky-200 dark:stroke-sky-800/60"
        strokeWidth="1"
      />

      {/* Door */}
      <path
        d="M46 105 L46 74 Q46 70 50 70 L70 70 Q74 70 74 74 L74 105 Z"
        className="fill-teal-600 dark:fill-teal-500"
      />
      {/* Door panel inset */}
      <rect
        x="50" y="74" width="20" height="12" rx="1.5"
        className="fill-teal-500/40 dark:fill-teal-400/25"
      />
      {/* Door knob */}
      <circle
        cx="70" cy="91" r="2.5"
        className="fill-amber-400 dark:fill-amber-300"
      />
    </svg>
  );
}

export function PostLoginTransitionScene({ reducedMotion }: Props) {
  return (
    <div className="relative mx-auto flex items-center justify-center w-full max-w-[360px] h-[330px] md:max-w-[480px] md:h-[420px]">

      {/* Ambient glow behind stage */}
      <div
        className="absolute rounded-full blur-3xl opacity-30 dark:opacity-20 pointer-events-none"
        style={{
          width: '55%',
          height: '55%',
          background: 'radial-gradient(circle, hsl(175 84% 32% / 0.5) 0%, transparent 70%)',
        }}
      />

      {/* Rotating orbit ring */}
      {!reducedMotion && (
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 30, repeat: Infinity, ease: 'linear' }}
          className="absolute w-[240px] h-[240px] md:w-[300px] md:h-[300px] rounded-full
            border border-dashed border-slate-200/60 dark:border-slate-700/40
            pointer-events-none"
        />
      )}

      {/* Central stage */}
      <motion.div
        animate={reducedMotion ? undefined : { scale: [1, 1.013, 1] }}
        transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
        className="relative w-[180px] h-[180px] md:w-[220px] md:h-[220px] rounded-full z-10
          flex items-center justify-center
          bg-white/85 dark:bg-slate-800/60
          border border-white/95 dark:border-slate-700/50
          backdrop-blur-sm
          shadow-[0_6px_32px_-6px_rgba(13,148,136,0.22),0_2px_8px_-2px_rgba(0,0,0,0.06)]
          dark:shadow-[0_6px_40px_-8px_rgba(0,0,0,0.55),0_2px_12px_-4px_rgba(0,0,0,0.3)]"
      >
        {/* Breathing glow ring */}
        <motion.div
          animate={reducedMotion ? undefined : { opacity: [0.35, 0.7, 0.35] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
          className="absolute inset-[-1px] rounded-full border border-teal-300/50 dark:border-teal-600/40 pointer-events-none"
        />

        {/* House illustration */}
        <motion.div
          initial={{ opacity: 0, scale: 0.82 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.55, delay: 0.2, ease: [0.23, 1, 0.32, 1] }}
        >
          <HouseIllustration />
        </motion.div>
      </motion.div>

      {/* ── Signal chips — absolute corners ── */}

      {/* Protections — top left */}
      <div className="absolute top-[10%] left-0">
        <SignalChip
          icon={Shield}
          label="Protections"
          delay={0.55}
          reducedMotion={reducedMotion}
        />
      </div>

      {/* Tasks — top right */}
      <div className="absolute top-[10%] right-0">
        <SignalChip
          icon={CheckSquare}
          label="Tasks"
          delay={0.7}
          reducedMotion={reducedMotion}
        />
      </div>

      {/* Documents — bottom left */}
      <div className="absolute bottom-[10%] left-0">
        <SignalChip
          icon={FileText}
          label="Documents"
          delay={0.85}
          reducedMotion={reducedMotion}
        />
      </div>

      {/* Weather — bottom right */}
      <div className="absolute bottom-[10%] right-0">
        <SignalChip
          icon={Cloud}
          label="Weather"
          delay={1.0}
          reducedMotion={reducedMotion}
        />
      </div>
    </div>
  );
}
