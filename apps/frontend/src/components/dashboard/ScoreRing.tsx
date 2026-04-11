import { cn } from '@/lib/utils';

interface ScoreRingProps {
  value: number;
  maxValue?: number;
  size?: number;
  strokeWidth?: number;
  ringPadding?: number;
  colorScheme: 'teal' | 'amber' | 'red' | 'auto';
  label: string;
  subLabel?: string;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  labelFontSize?: number;
  labelFontWeight?: number | string;
  labelY?: number;
  subLabelFontSize?: number;
  subLabelFontWeight?: number | string;
  subLabelOpacity?: number;
  subLabelY?: number;
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

function centerFontSize(size: number, label: string): number {
  if (size >= 110) return 26;
  if (size >= 96) return 22;
  if (size >= 72 && label.includes("%")) return 13;
  if (size >= 72) return 15;
  if (size >= 64) return 14;
  if (size > 50) return 12;
  return 10;
}

export function ScoreRing({
  value,
  maxValue = 100,
  size = 52,
  strokeWidth = 5,
  ringPadding = 0,
  colorScheme,
  label,
  subLabel,
  animate = true,
  className,
  ariaLabel,
  labelFontSize,
  labelFontWeight,
  labelY,
  subLabelFontSize,
  subLabelFontWeight,
  subLabelOpacity = 0.65,
  subLabelY,
}: ScoreRingProps) {
  const radius = Math.max(0, size / 2 - strokeWidth / 2 - ringPadding);
  const circumference = 2 * Math.PI * radius;
  const ratio = clampRatio(value, maxValue);
  const dashArray = ratio * circumference;
  const dashOffset = circumference * 0.25;
  const color = ringColor(colorScheme, ratio);
  const resolvedFontSize = labelFontSize ?? centerFontSize(size, label);
  const resolvedFontWeight = labelFontWeight ?? 600;
  const resolvedLabelY = labelY ?? (subLabel ? size / 2 + 3 : size / 2 + 4);
  const resolvedSubLabelY = subLabelY ?? size / 2 + 17;
  const resolvedSubLabelFontSize = subLabelFontSize ?? (size >= 72 ? 10 : 8);
  const resolvedSubLabelFontWeight = subLabelFontWeight ?? 500;

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
        y={resolvedLabelY}
        textAnchor="middle"
        fontSize={resolvedFontSize}
        fontWeight={resolvedFontWeight}
        fill={color}
      >
        {label}
      </text>
      {subLabel ? (
        <text
          x={size / 2}
          y={resolvedSubLabelY}
          textAnchor="middle"
          fontSize={resolvedSubLabelFontSize}
          fontWeight={resolvedSubLabelFontWeight}
          fill={color}
          opacity={subLabelOpacity}
        >
          {subLabel}
        </text>
      ) : null}
    </svg>
  );
}
