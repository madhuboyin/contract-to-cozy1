# Incident Lifecycle Enhancements Implementation

## Overview
This document outlines the implementation of advanced incident lifecycle management features including type-specific thresholds, auto-resolution, user notifications, archive views, and manual pinning.

## 1. Type-Specific Staleness Thresholds

### Configuration
Different incident types have different relevance windows:

```typescript
// apps/frontend/src/lib/incidents/stalenessConfig.ts
export type IncidentTypeCategory = 
  | 'WEATHER'           // Short-lived: storms, floods
  | 'SEASONAL'          // Medium-lived: winterization, summer prep
  | 'MAINTENANCE'       // Medium-lived: routine repairs
  | 'STRUCTURAL'        // Long-lived: foundation, roof issues
  | 'FINANCIAL'         // Long-lived: tax, insurance
  | 'COMPLIANCE'        // Long-lived: permits, violations
  | 'DEFAULT';          // Fallback

export interface StalenessThreshold {
  category: IncidentTypeCategory;
  warningDays: number;    // Show warning banner
  staleDays: number;      // Consider stale
  autoResolveDays: number; // Auto-resolve if no action
  description: string;
}

export const STALENESS_THRESHOLDS: Record<IncidentTypeCategory, StalenessThreshold> = {
  WEATHER: {
    category: 'WEATHER',
    warningDays: 3,
    staleDays: 7,
    autoResolveDays: 14,
    description: 'Weather events are time-sensitive and typically resolve quickly'
  },
  SEASONAL: {
    category: 'SEASONAL',
    warningDays: 14,
    staleDays: 30,
    autoResolveDays: 60,
    description: 'Seasonal tasks have moderate urgency within their season'
  },
  MAINTENANCE: {
    category: 'MAINTENANCE',
    warningDays: 21,
    staleDays: 45,
    autoResolveDays: 90,
    description: 'Maintenance issues should be addressed within weeks'
  },
  STRUCTURAL: {
    category: 'STRUCTURAL',
    warningDays: 30,
    staleDays: 60,
    autoResolveDays: 180,
    description: 'Structural issues are long-term concerns requiring careful planning'
  },
  FINANCIAL: {
    category: 'FINANCIAL',
    warningDays: 30,
    staleDays: 60,
    autoResolveDays: 120,
    description: 'Financial matters have specific deadlines but longer planning windows'
  },
  COMPLIANCE: {
    category: 'COMPLIANCE',
    warningDays: 30,
    staleDays: 60,
    autoResolveDays: 120,
    description: 'Compliance issues have regulatory deadlines'
  },
  DEFAULT: {
    category: 'DEFAULT',
    warningDays: 14,
    staleDays: 30,
    autoResolveDays: 90,
    description: 'Default threshold for uncategorized incidents'
  }
};

/**
 * Map incident typeKey or category to a staleness category
 */
export function categorizeIncident(incident: { typeKey: string; category?: string | null }): IncidentTypeCategory {
  const key = (incident.category || incident.typeKey).toLowerCase();
  
  // Weather patterns
  if (key.includes('weather') || key.includes('storm') || key.includes('flood') || 
      key.includes('hurricane') || key.includes('tornado')) {
    return 'WEATHER';
  }
  
  // Seasonal patterns
  if (key.includes('seasonal') || key.includes('winter') || key.includes('summer') ||
      key.includes('hvac_seasonal') || key.includes('gutter_cleaning')) {
    return 'SEASONAL';
  }
  
  // Structural patterns
  if (key.includes('structural') || key.includes('foundation') || key.includes('roof') ||
      key.includes('framing') || key.includes('load_bearing')) {
    return 'STRUCTURAL';
  }
  
  // Financial patterns
  if (key.includes('financial') || key.includes('tax') || key.includes('insurance') ||
      key.includes('cost') || key.includes('savings')) {
    return 'FINANCIAL';
  }
  
  // Compliance patterns
  if (key.includes('compliance') || key.includes('permit') || key.includes('violation') ||
      key.includes('code') || key.includes('regulation')) {
    return 'COMPLIANCE';
  }
  
  // Maintenance patterns
  if (key.includes('maintenance') || key.includes('repair') || key.includes('service') ||
      key.includes('inspection')) {
    return 'MAINTENANCE';
  }
  
  return 'DEFAULT';
}

/**
 * Get staleness threshold for an incident
 */
export function getStalenessThreshold(incident: { typeKey: string; category?: string | null }): StalenessThreshold {
  const category = categorizeIncident(incident);
  return STALENESS_THRESHOLDS[category];
}

/**
 * Calculate staleness status for an incident
 */
export interface StalenessStatus {
  ageInDays: number;
  category: IncidentTypeCategory;
  threshold: StalenessThreshold;
  isWarning: boolean;
  isStale: boolean;
  shouldAutoResolve: boolean;
  daysUntilAutoResolve: number;
  message: string;
}

export function calculateStalenessStatus(
  incident: { typeKey: string; category?: string | null; createdAt: string }
): StalenessStatus {
  const threshold = getStalenessThreshold(incident);
  const ageInDays = Math.floor(
    (Date.now() - new Date(incident.createdAt).getTime()) / (1000 * 60 * 60 * 24)
  );
  
  const isWarning = ageInDays >= threshold.warningDays;
  const isStale = ageInDays >= threshold.staleDays;
  const shouldAutoResolve = ageInDays >= threshold.autoResolveDays;
  const daysUntilAutoResolve = Math.max(0, threshold.autoResolveDays - ageInDays);
  
  let message = '';
  if (shouldAutoResolve) {
    message = `This ${threshold.category.toLowerCase()} incident is ${ageInDays} days old and will be auto-resolved soon.`;
  } else if (isStale) {
    message = `This ${threshold.category.toLowerCase()} incident is ${ageInDays} days old. It will auto-resolve in ${daysUntilAutoResolve} days if no action is taken.`;
  } else if (isWarning) {
    message = `This ${threshold.category.toLowerCase()} incident is ${ageInDays} days old. Consider taking action soon.`;
  }
  
  return {
    ageInDays,
    category: threshold.category,
    threshold,
    isWarning,
    isStale,
    shouldAutoResolve,
    daysUntilAutoResolve,
    message
  };
}
```

## 2. Extended Incident Types with Pinning and Archiving

```typescript
// apps/frontend/src/types/incidents.types.ts - ADD THESE TYPES

/**
 * User preferences for incident visibility
 */
export type IncidentUserPreference = {
  id: string;
  incidentId: string;
  userId: string;
  isPinned: boolean;
  pinnedAt?: string | null;
  pinnedNote?: string | null;
  isArchived: boolean;
  archivedAt?: string | null;
  archivedReason?: string | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * Extended incident DTO with user preferences
 */
export type IncidentWithPreferencesDTO = IncidentDTO & {
  userPreference?: IncidentUserPreference | null;
};

/**
 * Auto-resolution notification
 */
export type AutoResolutionNotification = {
  id: string;
  incidentId: string;
  propertyId: string;
  userId: string;
  scheduledFor: string;
  notifiedAt?: string | null;
  canceledAt?: string | null;
  executedAt?: string | null;
  createdAt: string;
};
```

## 3. Incident Pinning Component

```typescript
// apps/frontend/src/app/(dashboard)/dashboard/components/incidents/IncidentPinButton.tsx
'use client';

import React, { useState } from 'react';
import { Pin, PinOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { track } from '@/lib/analytics/events';

interface IncidentPinButtonProps {
  incidentId: string;
  propertyId: string;
  isPinned: boolean;
  onToggle: (pinned: boolean) => Promise<void>;
  disabled?: boolean;
}

export default function IncidentPinButton({
  incidentId,
  propertyId,
  isPinned,
  onToggle,
  disabled = false
}: IncidentPinButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleToggle = async () => {
    setLoading(true);
    try {
      await onToggle(!isPinned);
      track('incident_pin_toggled', {
        incidentId,
        propertyId,
        isPinned: !isPinned
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      className="min-h-[36px]"
      disabled={disabled || loading}
      onClick={handleToggle}
      title={isPinned ? 'Unpin incident' : 'Pin incident to keep it visible'}
    >
      {isPinned ? (
        <>
          <PinOff className="h-4 w-4 mr-1.5" />
          Unpin
        </>
      ) : (
        <>
          <Pin className="h-4 w-4 mr-1.5" />
          Pin
        </>
      )}
    </Button>
  );
}
```

## 4. Archive View Component

```typescript
// apps/frontend/src/app/(dashboard)/dashboard/components/incidents/IncidentArchiveView.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { Archive, ArchiveRestore, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow, parseISO } from 'date-fns';
import type { IncidentWithPreferencesDTO } from '@/types/incidents.types';
import IncidentSeverityBadge from './IncidentSeverityBadge';
import IncidentStatusBadge from './IncidentStatusBadge';
import { MobileCard, EmptyStateCard } from '@/components/mobile/dashboard/MobilePrimitives';

interface IncidentArchiveViewProps {
  propertyId: string;
  onRestore: (incidentId: string) => Promise<void>;
  onPermanentDelete?: (incidentId: string) => Promise<void>;
}

export default function IncidentArchiveView({
  propertyId,
  onRestore,
  onPermanentDelete
}: IncidentArchiveViewProps) {
  const [archivedIncidents, setArchivedIncidents] = useState<IncidentWithPreferencesDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadArchivedIncidents();
  }, [propertyId]);

  async function loadArchivedIncidents() {
    setLoading(true);
    setError(null);
    try {
      // TODO: Implement API call to fetch archived incidents
      // const response = await fetch(`/api/properties/${propertyId}/incidents?archived=true`);
      // const data = await response.json();
      // setArchivedIncidents(data.items);
      
      // Placeholder for now
      setArchivedIncidents([]);
    } catch (ex: any) {
      setError(ex?.message ?? 'Failed to load archived incidents');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <MobileCard variant="compact" className="text-sm text-slate-600">
        Loading archived incidents...
      </MobileCard>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border bg-red-50 p-4 text-sm text-red-700">
        {error}
      </div>
    );
  }

  if (archivedIncidents.length === 0) {
    return (
      <EmptyStateCard
        icon={Archive}
        title="No archived incidents"
        description="Archived incidents will appear here. You can restore them at any time."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-slate-600">
        <Archive className="h-4 w-4" />
        <span>{archivedIncidents.length} archived incident{archivedIncidents.length !== 1 ? 's' : ''}</span>
      </div>

      {archivedIncidents.map((incident) => (
        <MobileCard key={incident.id}>
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-slate-900 line-clamp-2">
                  {incident.title}
                </h3>
                {incident.summary && (
                  <p className="mt-1 text-xs text-slate-600 line-clamp-2">
                    {incident.summary}
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <IncidentSeverityBadge severity={incident.severity} />
              <IncidentStatusBadge status={incident.status} />
            </div>

            {incident.userPreference?.archivedAt && (
              <p className="text-xs text-slate-500">
                Archived {formatDistanceToNow(parseISO(incident.userPreference.archivedAt), { addSuffix: true })}
                {incident.userPreference.archivedReason && (
                  <span className="block mt-0.5 italic">
                    Reason: {incident.userPreference.archivedReason}
                  </span>
                )}
              </p>
            )}

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="min-h-[36px] flex-1"
                onClick={() => onRestore(incident.id)}
              >
                <ArchiveRestore className="h-4 w-4 mr-1.5" />
                Restore
              </Button>
              
              {onPermanentDelete && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="min-h-[36px] text-red-600 hover:text-red-700 hover:bg-red-50"
                  onClick={() => {
                    if (confirm('Permanently delete this incident? This cannot be undone.')) {
                      onPermanentDelete(incident.id);
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </MobileCard>
      ))}
    </div>
  );
}
```

## 5. Auto-Resolution Notification Component

```typescript
// apps/frontend/src/app/(dashboard)/dashboard/components/incidents/AutoResolutionNotificationBanner.tsx
'use client';

import React from 'react';
import { Clock, Pin, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow, parseISO } from 'date-fns';
import type { StalenessStatus } from '@/lib/incidents/stalenessConfig';

interface AutoResolutionNotificationBannerProps {
  stalenessStatus: StalenessStatus;
  scheduledResolutionDate: string;
  onPin: () => Promise<void>;
  onDismiss: () => Promise<void>;
  onResolveNow: () => Promise<void>;
}

export default function AutoResolutionNotificationBanner({
  stalenessStatus,
  scheduledResolutionDate,
  onPin,
  onDismiss,
  onResolveNow
}: AutoResolutionNotificationBannerProps) {
  if (!stalenessStatus.shouldAutoResolve && !stalenessStatus.isStale) {
    return null;
  }

  const severity = stalenessStatus.shouldAutoResolve ? 'critical' : 'warning';
  const bgColor = severity === 'critical' ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200';
  const textColor = severity === 'critical' ? 'text-red-800' : 'text-amber-800';
  const iconColor = severity === 'critical' ? 'text-red-600' : 'text-amber-600';

  return (
    <div className={`rounded-xl border p-4 ${bgColor}`}>
      <div className="flex items-start gap-3">
        <Clock className={`h-5 w-5 flex-shrink-0 ${iconColor}`} />
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold ${textColor}`}>
            {stalenessStatus.shouldAutoResolve 
              ? 'Auto-Resolution Scheduled' 
              : 'Incident Will Auto-Resolve Soon'}
          </p>
          <p className={`mt-1 text-sm ${textColor}`}>
            {stalenessStatus.message}
          </p>
          <p className={`mt-1 text-xs ${textColor} opacity-80`}>
            Scheduled for: {formatDistanceToNow(parseISO(scheduledResolutionDate), { addSuffix: true })}
          </p>
          
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              className="min-h-[32px] bg-white"
              onClick={onPin}
            >
              <Pin className="h-3.5 w-3.5 mr-1.5" />
              Pin to keep visible
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              className="min-h-[32px] bg-white"
              onClick={onResolveNow}
            >
              Resolve now
            </Button>
            
            <Button
              variant="ghost"
              size="sm"
              className="min-h-[32px]"
              onClick={onDismiss}
            >
              <X className="h-3.5 w-3.5 mr-1.5" />
              Dismiss notification
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

## 6. API Integration Layer

```typescript
// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/incidents/incidentsApi.ts - ADD THESE FUNCTIONS

/**
 * Toggle incident pin status
 */
export async function toggleIncidentPin(params: {
  propertyId: string;
  incidentId: string;
  isPinned: boolean;
  note?: string;
}): Promise<{ success: boolean }> {
  const { propertyId, incidentId, isPinned, note } = params;
  
  const response = await fetch(
    `/api/properties/${propertyId}/incidents/${incidentId}/preferences`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isPinned, pinnedNote: note })
    }
  );
  
  if (!response.ok) {
    throw new Error('Failed to update incident pin status');
  }
  
  return response.json();
}

/**
 * Archive an incident
 */
export async function archiveIncident(params: {
  propertyId: string;
  incidentId: string;
  reason?: string;
}): Promise<{ success: boolean }> {
  const { propertyId, incidentId, reason } = params;
  
  const response = await fetch(
    `/api/properties/${propertyId}/incidents/${incidentId}/archive`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason })
    }
  );
  
  if (!response.ok) {
    throw new Error('Failed to archive incident');
  }
  
  return response.json();
}

/**
 * Restore an archived incident
 */
export async function restoreIncident(params: {
  propertyId: string;
  incidentId: string;
}): Promise<{ success: boolean }> {
  const { propertyId, incidentId } = params;
  
  const response = await fetch(
    `/api/properties/${propertyId}/incidents/${incidentId}/restore`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }
  );
  
  if (!response.ok) {
    throw new Error('Failed to restore incident');
  }
  
  return response.json();
}

/**
 * Cancel auto-resolution for an incident
 */
export async function cancelAutoResolution(params: {
  propertyId: string;
  incidentId: string;
}): Promise<{ success: boolean }> {
  const { propertyId, incidentId } = params;
  
  const response = await fetch(
    `/api/properties/${propertyId}/incidents/${incidentId}/auto-resolution/cancel`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }
  );
  
  if (!response.ok) {
    throw new Error('Failed to cancel auto-resolution');
  }
  
  return response.json();
}

/**
 * List archived incidents
 */
export async function listArchivedIncidents(params: {
  propertyId: string;
  limit?: number;
  cursor?: string | null;
}): Promise<ListIncidentsResponse> {
  const { propertyId, limit = 20, cursor } = params;
  
  const queryParams = new URLSearchParams({
    limit: String(limit),
    archived: 'true'
  });
  
  if (cursor) {
    queryParams.set('cursor', cursor);
  }
  
  const response = await fetch(
    `/api/properties/${propertyId}/incidents?${queryParams.toString()}`
  );
  
  if (!response.ok) {
    throw new Error('Failed to fetch archived incidents');
  }
  
  return response.json();
}
```

## 7. Analytics Events

```typescript
// apps/frontend/src/lib/analytics/events.ts - ADD THESE EVENT TYPES

export type CtcEventName =
  // ... existing events ...
  | 'incident_pin_toggled'
  | 'incident_archived'
  | 'incident_restored'
  | 'incident_auto_resolution_canceled'
  | 'incident_auto_resolution_notification_dismissed'
  | 'incident_resolved_manually_before_auto'
  | 'incident_archive_view_opened';
```

## 8. Backend Requirements

### Database Schema Changes

```sql
-- User preferences for incidents
CREATE TABLE incident_user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_pinned BOOLEAN DEFAULT FALSE,
  pinned_at TIMESTAMP,
  pinned_note TEXT,
  is_archived BOOLEAN DEFAULT FALSE,
  archived_at TIMESTAMP,
  archived_reason TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(incident_id, user_id)
);

CREATE INDEX idx_incident_user_prefs_user ON incident_user_preferences(user_id);
CREATE INDEX idx_incident_user_prefs_pinned ON incident_user_preferences(is_pinned) WHERE is_pinned = TRUE;
CREATE INDEX idx_incident_user_prefs_archived ON incident_user_preferences(is_archived) WHERE is_archived = TRUE;

-- Auto-resolution notifications
CREATE TABLE incident_auto_resolution_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scheduled_for TIMESTAMP NOT NULL,
  notified_at TIMESTAMP,
  canceled_at TIMESTAMP,
  executed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(incident_id)
);

CREATE INDEX idx_auto_resolution_scheduled ON incident_auto_resolution_notifications(scheduled_for) 
  WHERE executed_at IS NULL AND canceled_at IS NULL;
```

### API Endpoints

```
PATCH /api/properties/:propertyId/incidents/:incidentId/preferences
POST  /api/properties/:propertyId/incidents/:incidentId/archive
POST  /api/properties/:propertyId/incidents/:incidentId/restore
POST  /api/properties/:propertyId/incidents/:incidentId/auto-resolution/cancel
GET   /api/properties/:propertyId/incidents?archived=true
```

### Background Job

```typescript
// Cron job to check for incidents that should be auto-resolved
// Run every hour

async function processAutoResolutions() {
  const incidents = await db.incidents.findMany({
    where: {
      status: { in: ['ACTIVE', 'DETECTED', 'EVALUATED'] },
      userPreference: {
        isPinned: false,
        isArchived: false
      }
    },
    include: {
      userPreference: true,
      autoResolutionNotification: true
    }
  });
  
  for (const incident of incidents) {
    const stalenessStatus = calculateStalenessStatus(incident);
    
    // Send notification 7 days before auto-resolution
    if (stalenessStatus.daysUntilAutoResolve === 7 && !incident.autoResolutionNotification?.notifiedAt) {
      await sendAutoResolutionNotification(incident);
    }
    
    // Auto-resolve if threshold reached
    if (stalenessStatus.shouldAutoResolve) {
      await autoResolveIncident(incident);
    }
  }
}
```

## 9. Usage Example

```typescript
// In IncidentDetailClient.tsx

import { calculateStalenessStatus } from '@/lib/incidents/stalenessConfig';
import IncidentPinButton from '@/app/(dashboard)/dashboard/components/incidents/IncidentPinButton';
import AutoResolutionNotificationBanner from '@/app/(dashboard)/dashboard/components/incidents/AutoResolutionNotificationBanner';
import { toggleIncidentPin, cancelAutoResolution } from '../incidentsApi';

// In component:
const stalenessStatus = incident ? calculateStalenessStatus(incident) : null;

// Render:
{stalenessStatus && stalenessStatus.isStale && (
  <AutoResolutionNotificationBanner
    stalenessStatus={stalenessStatus}
    scheduledResolutionDate={/* from API */}
    onPin={async () => {
      await toggleIncidentPin({ propertyId, incidentId, isPinned: true });
      await load();
    }}
    onDismiss={async () => {
      // Dismiss notification (store in user preferences)
    }}
    onResolveNow={async () => {
      // Resolve incident manually
    }}
  />
)}
```

## 10. Testing Checklist

- [ ] Type-specific thresholds correctly categorize incidents
- [ ] Warning banners show at appropriate thresholds
- [ ] Pin functionality prevents auto-resolution
- [ ] Archive view shows only archived incidents
- [ ] Restore functionality works correctly
- [ ] Auto-resolution notifications sent 7 days before
- [ ] Auto-resolution can be canceled
- [ ] Pinned incidents never auto-resolve
- [ ] Analytics events fire correctly
- [ ] Mobile responsive design works
- [ ] Accessibility (keyboard navigation, screen readers)

## 11. Rollout Plan

### Phase 1: Foundation (Week 1)
- Implement staleness configuration
- Add database schema
- Create API endpoints

### Phase 2: UI Components (Week 2)
- Build pin button component
- Build archive view
- Build auto-resolution notification banner

### Phase 3: Integration (Week 3)
- Integrate into incident detail page
- Integrate into incidents list
- Add analytics tracking

### Phase 4: Background Jobs (Week 4)
- Implement auto-resolution cron job
- Implement notification system
- Add monitoring and alerts

### Phase 5: Testing & Launch (Week 5)
- QA testing
- User acceptance testing
- Gradual rollout with feature flag
- Monitor metrics and user feedback
