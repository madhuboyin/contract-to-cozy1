'use client';

import React from 'react';
import { ShieldCheck, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ConfidenceBadge } from './ConfidenceBadge';
import { SourceChip } from './SourceChip';
import { TrustMetadata } from '@/lib/types/trust';
import { formatDistanceToNow } from 'date-fns';

interface TrustMetadataBarProps {
  metadata: TrustMetadata;
  className?: string;
  showLastUpdated?: boolean;
}

export function TrustMetadataBar({ metadata, className, showLastUpdated = true }: TrustMetadataBarProps) {
  return (
    <div className={cn(
      "flex flex-wrap items-center gap-3 py-2 border-t border-slate-100",
      className
    )}>
      <ConfidenceBadge level={metadata.confidence} score={metadata.confidenceScore} />
      
      <SourceChip source={metadata.source} />
      
      {showLastUpdated && metadata.lastUpdated && (
        <div className="flex items-center gap-1.5 text-[10px] font-medium text-slate-400">
          <Clock className="h-3 w-3" />
          <span>
            Updated {formatDistanceToNow(new Date(metadata.lastUpdated), { addSuffix: true })}
          </span>
        </div>
      )}
    </div>
  );
}
