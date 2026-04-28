'use client';

import { useRouter } from 'next/navigation';
import { Property } from '@/types';
import { cn } from '@/lib/utils';

interface SetupStep {
  label: string;
  done: boolean;
}

function getSetupSteps(property: Property): SetupStep[] {
  return [
    {
      label: 'Basic details',
      done: !!(property.propertyType && property.yearBuilt),
    },
    {
      label: 'Home systems',
      done: !!(property.heatingType && property.coolingType),
    },
    {
      label: 'Roof & water heater',
      done: !!(property.roofType && property.waterHeaterType),
    },
    {
      label: 'Property size',
      done: !!property.propertySize,
    },
    {
      label: 'Safety',
      done: !!(property.hasSmokeDetectors || property.hasCoDetectors),
    },
    {
      label: 'Property photo',
      done: !!property.coverPhotoDocumentId,
    },
  ];
}

interface SetupGuideButtonProps {
  property: Property | null | undefined;
  className?: string;
}

export function SetupGuideButton({ property, className }: SetupGuideButtonProps) {
  const router = useRouter();

  if (!property) return null;

  const steps = getSetupSteps(property);
  const completed = steps.filter(s => s.done).length;
  const total = steps.length;

  if (completed >= total) return null;

  const fraction = completed / total;

  const handleClick = () => {
    router.push(`/dashboard/properties/${property.id}/edit`);
  };

  return (
    <>
      {/* Desktop: ghost text + ring */}
      <button
        type="button"
        onClick={handleClick}
        title={`Setup guide: ${completed}/${total} steps complete`}
        className={cn(
          "hidden lg:flex items-center gap-1.5 rounded-md px-2.5 py-2",
          "text-xs font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100/70",
          "transition-colors duration-150",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/30",
          className
        )}
      >
        <span>Setup guide</span>
        <ProgressRing fraction={fraction} size={18} />
      </button>

      {/* Mobile: ring-only, ghost */}
      <button
        type="button"
        onClick={handleClick}
        title={`Setup guide: ${completed}/${total} steps complete`}
        className={cn(
          "lg:hidden flex items-center justify-center h-10 w-10 rounded-md",
          "text-slate-400 hover:text-slate-600 hover:bg-slate-100/70",
          "transition-colors duration-150",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/30",
          className
        )}
      >
        <ProgressRing fraction={fraction} size={20} />
      </button>
    </>
  );
}

function ProgressRing({ fraction, size, strokeWidth = 2.5 }: { fraction: number; size: number; strokeWidth?: number }) {
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - fraction);
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="-rotate-90 shrink-0"
      aria-hidden="true"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="text-slate-200"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="text-teal-500 transition-[stroke-dashoffset] duration-500"
      />
    </svg>
  );
}
