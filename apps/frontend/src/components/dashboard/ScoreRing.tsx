import { cn } from '@/lib/utils';

interface ScoreRingProps {
  value: number;
  maxValue?: number;
  size?: number;
  strokeWidth?: number;
  colorScheme: 'teal' | 'amber' | 'red' | 'auto';
  label: string;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
}

function clampRatio(value: number, maxValue: number) {
  if (!Number.isFinite(value) || !Number.isFinite(maxValue) || maxValue <= 0) return 0;
  return Math.max(0, Math.min(value / maxValue, 1));
}

function ringColor(colorScheme: ScoreRingProps['colorScheme'], ratio: number): string {
  if (colorScheme === 'auto') {
    if (ratio > 0.7) return '#1DBFAA';
    if (ratio >= 0.3) return '#E0943A';
    return '#E05050';
  }
  if (colorScheme === 'teal') return '#1DBFAA';
  if (colorScheme === 'amber') return '#E0943A';
  return '#E05050';
}

export function ScoreRing({
  value,
  maxValue = 100,
  size = 52,
  strokeWidth = 5,
  colorScheme,
  label,
  animate = true,
  className,
  ariaLabel,
}: ScoreRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = clampRatio(value, maxValue);
  const dashArray = ratio * circumference;
  const dashOffset = circumference * 0.25;
  const color = ringColor(colorScheme, ratio);

  return (
    <svg
      role="img"
      aria-label={ariaLabel ?? label}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={cn(animate ? 'score-ring-animated' : '', className)}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--score-ring-track, #e2e8f0)"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={`${dashArray} ${circumference}`}
        strokeDashoffset={dashOffset}
        style={{
          transition: animate ? 'stroke-dasharray 0.7s cubic-bezier(0.4,0,0.2,1)' : 'none',
        }}
      />
      <text
        x={size / 2}
        y={size / 2 + 4}
        textAnchor="middle"
        fontSize={size > 50 ? 12 : 10}
        fontWeight="600"
        fill={color}
      >
        {label}
      </text>
    </svg>
  );
}
