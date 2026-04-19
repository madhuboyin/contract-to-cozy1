import React from 'react';
import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface SourceChipProps {
  children: React.ReactNode;
  tooltip?: string;
  lastUpdated?: string;
  className?: string;
}

export function SourceChip({ children, tooltip, lastUpdated, className }: SourceChipProps) {
  const inner = (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-600 transition-colors cursor-default',
        className
      )}
    >
      <Info className="h-3 w-3 flex-shrink-0" />
      <span className="truncate max-w-[200px]">{children}</span>
      {lastUpdated && <span className="text-gray-300">· {lastUpdated}</span>}
    </span>
  );

  if (!tooltip) return inner;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{inner}</TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
