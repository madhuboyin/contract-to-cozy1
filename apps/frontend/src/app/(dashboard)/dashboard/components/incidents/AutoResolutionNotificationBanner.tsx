'use client';

import React, { useState } from 'react';
import { Clock, Pin, X, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { StalenessStatus } from '@/lib/incidents/stalenessConfig';

interface AutoResolutionNotificationBannerProps {
  stalenessStatus: StalenessStatus;
  onPin: () => Promise<void>;
  onDismiss: () => Promise<void>;
  onResolveNow: () => Promise<void>;
}

export default function AutoResolutionNotificationBanner({
  stalenessStatus,
  onPin,
  onDismiss,
  onResolveNow
}: AutoResolutionNotificationBannerProps) {
  const [loading, setLoading] = useState<'pin' | 'resolve' | 'dismiss' | null>(null);

  if (!stalenessStatus.isWarning) {
    return null;
  }

  const bgColor = stalenessStatus.severity === 'critical' 
    ? 'bg-red-50 border-red-200' 
    : 'bg-amber-50 border-amber-200';
  const textColor = stalenessStatus.severity === 'critical' 
    ? 'text-red-800' 
    : 'text-amber-800';
  const iconColor = stalenessStatus.severity === 'critical' 
    ? 'text-red-600' 
    : 'text-amber-600';

  const handlePin = async () => {
    setLoading('pin');
    try {
      await onPin();
    } finally {
      setLoading(null);
    }
  };

  const handleResolve = async () => {
    setLoading('resolve');
    try {
      await onResolveNow();
    } finally {
      setLoading(null);
    }
  };

  const handleDismiss = async () => {
    setLoading('dismiss');
    try {
      await onDismiss();
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className={`rounded-xl border p-4 ${bgColor}`}>
      <div className="flex items-start gap-3">
        <Clock className={`h-5 w-5 flex-shrink-0 ${iconColor}`} />
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold ${textColor}`}>
            {stalenessStatus.shouldAutoResolve 
              ? 'Auto-Resolution Imminent' 
              : 'Incident Will Auto-Resolve Soon'}
          </p>
          <p className={`mt-1 text-sm ${textColor}`}>
            {stalenessStatus.message}
          </p>
          {stalenessStatus.daysUntilAutoResolve > 0 && (
            <p className={`mt-1 text-xs ${textColor} opacity-80`}>
              {stalenessStatus.daysUntilAutoResolve} day{stalenessStatus.daysUntilAutoResolve !== 1 ? 's' : ''} remaining until auto-resolution
            </p>
          )}
          
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              className="min-h-[32px] bg-white"
              onClick={handlePin}
              disabled={loading !== null}
            >
              <Pin className="h-3.5 w-3.5 mr-1.5" />
              {loading === 'pin' ? 'Pinning...' : 'Pin to keep visible'}
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              className="min-h-[32px] bg-white"
              onClick={handleResolve}
              disabled={loading !== null}
            >
              <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
              {loading === 'resolve' ? 'Resolving...' : 'Resolve now'}
            </Button>
            
            <Button
              variant="ghost"
              size="sm"
              className="min-h-[32px]"
              onClick={handleDismiss}
              disabled={loading !== null}
            >
              <X className="h-3.5 w-3.5 mr-1.5" />
              Dismiss
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
