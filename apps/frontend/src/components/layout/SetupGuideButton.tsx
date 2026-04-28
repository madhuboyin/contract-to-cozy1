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
      {/* Desktop: text + ring */}
      <button
        type="button"
        onClick={handleClick}
        title={`Setup guide: ${completed}/${total} steps complete`}
        className={cn(
          "hidden lg:flex items-center gap-2 h-12 rounded-lg px-3",
          "border border-slate-200 bg-slate-50/50 hover:bg-slate-50",
          "transition-all duration-200 text-sm font-medium text-slate-700",
          "focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400",
          className
        )}
      >
        <span>Setup guide</span>
        <ProgressRing fraction={fraction} size={20} />
      </button>

      {/* Mobile: ring-only, same dimensions as NotificationsButton */}
      <button
        type="button"
        onClick={handleClick}
        title={`Setup guide: ${completed}/${total} steps complete`}
        className={cn(
          "lg:hidden relative flex items-center justify-center h-12 w-12 rounded-lg",
          "border border-slate-200 bg-slate-50/50 hover:bg-slate-50",
          "transition-all duration-200",
          "focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400",
          className
        )}
      >
        <ProgressRing fraction={fraction} size={22} />
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
