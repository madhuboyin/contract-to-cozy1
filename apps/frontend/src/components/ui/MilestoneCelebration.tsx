'use client';

/**
 * MilestoneCelebration — Delight System overlay
 *
 * Renders a full-screen modal with a backdrop-blur when a major milestone is hit.
 * Each milestone type has its own Framer Motion SVG animation matched to the brand palette.
 * Auto-dismisses after 2.5s. Entry/exit driven by Framer Motion springs.
 *
 * Usage:
 *   const { celebration, celebrate, dismiss } = useCelebration(dedupKey);
 *   celebrate('success'); // trigger once
 *   <MilestoneCelebration {...celebration} onClose={dismiss} />
 */

import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { MilestoneType } from '@/hooks/useCelebration';

// ─── Animation scenes ──────────────────────────────────────────────────────

/** Home Shield Pulse — Inspection Success (Primary Blue #2563eb) */
function ShieldPulse() {
  return (
    <svg width="160" height="160" viewBox="0 0 160 160" aria-hidden="true">
      {/* Expanding ripple rings */}
      {[0, 1, 2].map((i) => (
        <motion.circle
          key={i}
          cx="80"
          cy="80"
          r="32"
          fill="none"
          stroke="#2563eb"
          strokeWidth="2.5"
          initial={{ scale: 0.5, opacity: 0.7 }}
          animate={{ scale: [0.5, 2.2], opacity: [0.7, 0] }}
          transition={{
            duration: 1.8,
            repeat: Infinity,
            delay: i * 0.55,
            ease: 'easeOut',
          }}
          style={{ transformOrigin: '80px 80px' }}
        />
      ))}

      {/* Solid blue center disc */}
      <motion.circle
        cx="80"
        cy="80"
        r="34"
        fill="#2563eb"
        initial={{ scale: 0 }}
        animate={{ scale: [0, 1.15, 1] }}
        transition={{ duration: 0.55, ease: 'backOut' }}
        style={{ transformOrigin: '80px 80px' }}
      />

      {/* Shield silhouette (white) */}
      <motion.path
        d="M80 52C80 52 62 59 62 70V83C62 93 80 102 80 102C80 102 98 93 98 83V70C98 59 80 52 80 52Z"
        fill="white"
        fillOpacity="0.92"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.3, duration: 0.4, ease: 'backOut' }}
        style={{ transformOrigin: '80px 77px' }}
      />

      {/* Checkmark drawn on success */}
      <motion.path
        d="M72 77L78 83L89 70"
        fill="none"
        stroke="#2563eb"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ delay: 0.65, duration: 0.45, ease: 'easeOut' }}
      />
    </svg>
  );
}

/** Financial Bloom — Savings Achievement (Success Green #16a34a) */
function FinancialBloom() {
  const confetti = [
    { x: 38, y: 48, r: 5, color: '#f59e0b', delay: 1.0 },
    { x: 122, y: 42, r: 4, color: '#2563eb', delay: 1.1 },
    { x: 32, y: 70, r: 4, color: '#16a34a', delay: 1.15 },
    { x: 128, y: 72, r: 5, color: '#f59e0b', delay: 1.2 },
    { x: 54, y: 32, r: 3, color: '#2563eb', delay: 1.25 },
    { x: 108, y: 30, r: 4, color: '#16a34a', delay: 1.3 },
    { x: 45, y: 100, r: 3, color: '#f59e0b', delay: 1.35 },
    { x: 118, y: 98, r: 3, color: '#2563eb', delay: 1.4 },
  ];

  return (
    <svg width="160" height="160" viewBox="0 0 160 160" aria-hidden="true">
      {/* Stem */}
      <motion.line
        x1="80"
        y1="122"
        x2="80"
        y2="62"
        stroke="#16a34a"
        strokeWidth="5"
        strokeLinecap="round"
        initial={{ scaleY: 0 }}
        animate={{ scaleY: 1 }}
        transition={{ duration: 0.55, ease: 'easeOut' }}
        style={{ transformOrigin: '80px 122px' }}
      />

      {/* Left leaf */}
      <motion.ellipse
        cx="63"
        cy="92"
        rx="15"
        ry="8"
        fill="#16a34a"
        transform="rotate(-30 63 92)"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.45, duration: 0.38, ease: 'backOut' }}
        style={{ transformOrigin: '63px 92px' }}
      />

      {/* Right leaf */}
      <motion.ellipse
        cx="97"
        cy="78"
        rx="15"
        ry="8"
        fill="#16a34a"
        transform="rotate(30 97 78)"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.62, duration: 0.38, ease: 'backOut' }}
        style={{ transformOrigin: '97px 78px' }}
      />

      {/* Bloom circle */}
      <motion.circle
        cx="80"
        cy="58"
        r="20"
        fill="#16a34a"
        initial={{ scale: 0 }}
        animate={{ scale: [0, 1.2, 1] }}
        transition={{ delay: 0.82, duration: 0.4, ease: 'backOut' }}
        style={{ transformOrigin: '80px 58px' }}
      />

      {/* Dollar sign */}
      <motion.text
        x="80"
        y="65"
        textAnchor="middle"
        fontSize="18"
        fontWeight="bold"
        fill="white"
        initial={{ opacity: 0, scale: 0 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 1.05, duration: 0.3 }}
        style={{ transformOrigin: '80px 58px' }}
      >
        $
      </motion.text>

      {/* Confetti burst */}
      {confetti.map((dot, i) => (
        <motion.circle
          key={i}
          cx={dot.x}
          cy={dot.y}
          r={dot.r}
          fill={dot.color}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: [0, 1.5, 1], opacity: [0, 1, 0.85] }}
          transition={{ delay: dot.delay, duration: 0.42, ease: 'backOut' }}
          style={{ transformOrigin: `${dot.x}px ${dot.y}px` }}
        />
      ))}
    </svg>
  );
}

/** Pulse of Health — Room Scan (Primary Blue #2563eb + Warning #f59e0b) */
function RadarSweep() {
  const pings = [
    { x: 112, y: 50, delay: 0.5 },
    { x: 52, y: 44, delay: 1.1 },
    { x: 108, y: 104, delay: 1.7 },
  ];

  return (
    <svg width="160" height="160" viewBox="0 0 160 160" aria-hidden="true">
      {/* Concentric range rings */}
      {[60, 44, 28].map((r, i) => (
        <motion.circle
          key={r}
          cx="80"
          cy="80"
          r={r}
          fill="none"
          stroke="#2563eb"
          strokeOpacity={0.25 - i * 0.06}
          strokeWidth="1.5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: i * 0.1, duration: 0.3 }}
        />
      ))}

      {/* Centre dot */}
      <circle cx="80" cy="80" r="4" fill="#2563eb" />

      {/* Sweep sector fill */}
      <motion.path
        d="M80 80 L80 20 A60 60 0 0 1 140 80 Z"
        fill="#2563eb"
        fillOpacity="0.07"
        animate={{ rotate: 360 }}
        transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
        style={{ transformOrigin: '80px 80px' }}
      />

      {/* Sweep line */}
      <motion.line
        x1="80"
        y1="80"
        x2="80"
        y2="20"
        stroke="#2563eb"
        strokeWidth="2.5"
        strokeLinecap="round"
        animate={{ rotate: 360 }}
        transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
        style={{ transformOrigin: '80px 80px' }}
      />

      {/* Ping blips */}
      {pings.map((p, i) => (
        <motion.circle
          key={i}
          cx={p.x}
          cy={p.y}
          r="5"
          fill="#f59e0b"
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: [0, 1, 0], scale: [0, 1.6, 1] }}
          transition={{
            delay: p.delay,
            duration: 0.55,
            repeat: Infinity,
            repeatDelay: 1.9,
          }}
          style={{ transformOrigin: `${p.x}px ${p.y}px` }}
        />
      ))}
    </svg>
  );
}

/** Path to Cozy — Checklist Complete (Warning Orange #f59e0b) */
function CozyHouse() {
  const starAngles = [0, 45, 90, 135, 180, 225, 270, 315];

  return (
    <svg width="160" height="160" viewBox="0 0 160 160" aria-hidden="true">
      {/* House body */}
      <motion.rect
        x="44"
        y="86"
        width="72"
        height="46"
        rx="3"
        fill="#f59e0b"
        initial={{ scaleY: 0, opacity: 0 }}
        animate={{ scaleY: 1, opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.45, ease: 'easeOut' }}
        style={{ transformOrigin: '80px 132px' }}
      />

      {/* Roof */}
      <motion.path
        d="M36 88L80 48L124 88Z"
        fill="#d97706"
        initial={{ scaleY: 0, opacity: 0 }}
        animate={{ scaleY: 1, opacity: 1 }}
        transition={{ delay: 0.1, duration: 0.4, ease: 'easeOut' }}
        style={{ transformOrigin: '80px 88px' }}
      />

      {/* Door */}
      <motion.rect
        x="68"
        y="106"
        width="24"
        height="26"
        rx="2"
        fill="#92400e"
        initial={{ scaleY: 0 }}
        animate={{ scaleY: 1 }}
        transition={{ delay: 0.5, duration: 0.3 }}
        style={{ transformOrigin: '80px 132px' }}
      />

      {/* Left window glow */}
      <motion.rect
        x="50"
        y="93"
        width="18"
        height="15"
        rx="2"
        fill="#fef3c7"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 0.75, 1] }}
        transition={{ delay: 0.65, duration: 0.6 }}
      />

      {/* Right window glow */}
      <motion.rect
        x="92"
        y="93"
        width="18"
        height="15"
        rx="2"
        fill="#fef3c7"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 0.75, 1] }}
        transition={{ delay: 0.75, duration: 0.6 }}
      />

      {/* Starburst rays */}
      {starAngles.map((angle, i) => {
        const rad = (angle * Math.PI) / 180;
        return (
          <motion.line
            key={i}
            x1="80"
            y1="34"
            x2={80 + Math.cos(rad) * 54}
            y2={34 + Math.sin(rad) * 54}
            stroke="#f59e0b"
            strokeWidth="2"
            strokeLinecap="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: [0, 1, 0] }}
            transition={{ delay: 0.9 + i * 0.04, duration: 0.85, ease: 'easeOut' }}
          />
        );
      })}

      {/* Centre star */}
      <motion.circle
        cx="80"
        cy="34"
        r="12"
        fill="#f59e0b"
        initial={{ scale: 0 }}
        animate={{ scale: [0, 1.35, 1] }}
        transition={{ delay: 0.88, duration: 0.48, ease: 'backOut' }}
        style={{ transformOrigin: '80px 34px' }}
      />

      {/* Check in star */}
      <motion.path
        d="M74 34L79 39L87 27"
        fill="none"
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ delay: 1.15, duration: 0.4, ease: 'easeOut' }}
      />
    </svg>
  );
}

// ─── Config ────────────────────────────────────────────────────────────────

const MILESTONE_CONFIG: Record<
  MilestoneType,
  { title: string; subtitle: string; accent: string; ring: string }
> = {
  success: {
    title: 'Inspection Complete!',
    subtitle: 'Your home has been analyzed and protected.',
    accent: 'bg-blue-50 border-blue-100',
    ring: 'ring-blue-200',
  },
  savings: {
    title: 'Savings Unlocked!',
    subtitle: 'A financial opportunity has been identified for your property.',
    accent: 'bg-green-50 border-green-100',
    ring: 'ring-green-200',
  },
  scan: {
    title: 'Room Scanned!',
    subtitle: 'Your Room Health Score is ready to view.',
    accent: 'bg-blue-50 border-blue-100',
    ring: 'ring-blue-200',
  },
  cozy: {
    title: 'Checklist Complete!',
    subtitle: 'Your home is fully ready for the season. Great work!',
    accent: 'bg-amber-50 border-amber-100',
    ring: 'ring-amber-200',
  },
};

const ANIMATION_MAP: Record<MilestoneType, () => JSX.Element> = {
  success: ShieldPulse,
  savings: FinancialBloom,
  scan: RadarSweep,
  cozy: CozyHouse,
};

// ─── Component ─────────────────────────────────────────────────────────────

interface MilestoneCelebrationProps {
  /** Which milestone animation to show */
  type: MilestoneType | null;
  /** Controls visibility */
  isOpen: boolean;
  /** Called on dismiss (user click or auto-timeout) */
  onClose: () => void;
}

export function MilestoneCelebration({ type, isOpen, onClose }: MilestoneCelebrationProps) {
  // Auto-dismiss after 2.5 seconds
  useEffect(() => {
    if (!isOpen) return;
    const id = setTimeout(onClose, 2500);
    return () => clearTimeout(id);
  }, [isOpen, onClose]);

  const config = type ? MILESTONE_CONFIG[type] : null;
  const AnimationScene = type ? ANIMATION_MAP[type] : null;

  return (
    <AnimatePresence>
      {isOpen && type && config && AnimationScene && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label={config.title}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/25 backdrop-blur-sm" />

          {/* Card */}
          <motion.div
            className={`relative z-10 flex flex-col items-center gap-5 rounded-2xl border shadow-2xl ring-1 ${config.accent} ${config.ring} max-w-xs w-full p-8`}
            initial={{ scale: 0.72, y: 24, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.82, y: -12, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 310, damping: 26 }}
            onClick={(e) => e.stopPropagation()}
          >
            <AnimationScene />

            <div className="text-center space-y-1">
              <h2 className="text-[17px] font-bold text-gray-900 leading-tight">
                {config.title}
              </h2>
              <p className="text-sm text-gray-500 leading-snug">{config.subtitle}</p>
            </div>

            <button
              onClick={onClose}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              Dismiss
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
