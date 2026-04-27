# Incident Lifecycle Filtering Implementation

## Issue
**Severity**: Medium

**The Problem**: Stale incidents (3+ months old) were appearing on the dashboard as "Priority alerts", even though the underlying risk (e.g., freeze warning from February) was no longer relevant. This created confusion and reduced trust in the dashboard's recommendations.

**User Impact**: 
- Users see outdated alerts that are no longer actionable
- Dashboard appears to show irrelevant information
- Reduces confidence in the system's intelligence
- Clutters the priority actions list with stale items

## Root Cause

The `consolidateUrgentActions()` function in `dashboard/page.tsx` filtered incidents by status (excluding RESOLVED and SUPPRESSED) but did not consider the age of the incident:

```typescript
// OLD: No age filtering
incidents
  .filter(inc => inc.status !== 'RESOLVED' && inc.status !== 'SUPPRESSED')
  .forEach(inc => {
    actions.push({
      id: inc.id,
      type: 'INCIDENT',
      title: inc.title,
      // ...
    });
  });
```

This meant that any incident that wasn't explicitly resolved would remain on the dashboard indefinitely, regardless of how old it was.

## Solution

Added a **30-day staleness threshold** to filter out old incidents from the dashboard's urgent actions list:

```typescript
// NEW: Filter by status AND age
const incidentStaleThresholdDays = 30; // Only show incidents from last 30 days

incidents
  .filter(inc => inc.status !== 'RESOLVED' && inc.status !== 'SUPPRESSED')
  .filter(inc => {
    // Filter out stale incidents
    if (!inc.createdAt) return true; // Keep if no createdAt (shouldn't happen)
    const createdDate = parseISO(inc.createdAt);
    const daysSinceCreated = differenceInDays(today, createdDate);
    return daysSinceCreated <= incidentStaleThresholdDays;
  })
  .forEach(inc => {
    actions.push({
      id: inc.id,
      type: 'INCIDENT',
      title: inc.title,
      description: inc.summary || 'Critical home event detected.',
      propertyId: inc.propertyId,
      severity: inc.severity || 'WARNING',
    });
  });
```

## Implementation Details

### File Changed
- `apps/frontend/src/app/(dashboard)/dashboard/page.tsx`

### Key Changes

1. **Added staleness threshold constant**
   ```typescript
   const incidentStaleThresholdDays = 30; // Only show incidents from last 30 days
   ```

2. **Added age-based filtering**
   - Uses `parseISO()` to parse the incident's `createdAt` timestamp
   - Uses `differenceInDays()` to calculate age
   - Filters out incidents older than 30 days

3. **Graceful handling of missing timestamps**
   - If `createdAt` is missing, the incident is kept (fail-safe)
   - This prevents breaking if data is incomplete

### Why 30 Days?

The 30-day threshold was chosen because:

1. **Weather incidents**: Most weather events (freeze, storm, etc.) are resolved within days
2. **Seasonal incidents**: Even seasonal issues should be addressed within a month
3. **User attention span**: After 30 days, an unresolved incident likely needs manual review
4. **Balance**: Not too aggressive (7 days) but not too lenient (90 days)

This threshold can be adjusted based on:
- Incident type (weather vs. structural)
- User feedback
- Analytics on incident resolution times

## Benefits

### User Experience
1. ✅ **Relevant alerts only**: Dashboard shows only recent, actionable incidents
2. ✅ **Reduced clutter**: Priority actions list is cleaner and more focused
3. ✅ **Increased trust**: Users see that the system understands time-sensitivity
4. ✅ **Better prioritization**: Recent incidents naturally rank higher

### System Behavior
1. ✅ **Automatic cleanup**: No manual intervention needed to hide old incidents
2. ✅ **Consistent logic**: Same 30-day threshold across all incident types
3. ✅ **Fail-safe**: Missing timestamps don't break the dashboard
4. ✅ **Performance**: Filtering happens in-memory, no additional API calls

## Testing Scenarios

### Scenario 1: Recent Incident (< 30 days)
- **Input**: Incident created 5 days ago, status = ACTIVE
- **Expected**: ✅ Shows on dashboard as priority alert
- **Result**: ✅ Passes filter, appears in urgent actions

### Scenario 2: Stale Incident (> 30 days)
- **Input**: Incident created 90 days ago, status = ACTIVE
- **Expected**: ❌ Does NOT show on dashboard
- **Result**: ✅ Filtered out, does not appear in urgent actions

### Scenario 3: Resolved Incident (any age)
- **Input**: Incident created 5 days ago, status = RESOLVED
- **Expected**: ❌ Does NOT show on dashboard
- **Result**: ✅ Filtered out by status check

### Scenario 4: Missing Timestamp
- **Input**: Incident with no `createdAt` field
- **Expected**: ✅ Shows on dashboard (fail-safe)
- **Result**: ✅ Passes filter due to graceful handling

### Scenario 5: Edge Case (exactly 30 days)
- **Input**: Incident created exactly 30 days ago
- **Expected**: ✅ Shows on dashboard (inclusive threshold)
- **Result**: ✅ Passes filter (`daysSinceCreated <= 30`)

## Future Enhancements

### 1. Type-Specific Thresholds

Different incident types could have different staleness thresholds:

```typescript
function getIncidentStaleThreshold(incident: IncidentDTO): number {
  switch (incident.typeKey) {
    case 'WEATHER_FREEZE':
    case 'WEATHER_STORM':
      return 7; // Weather events: 7 days
    
    case 'STRUCTURAL_DAMAGE':
    case 'WATER_LEAK':
      return 60; // Structural issues: 60 days
    
    case 'SEASONAL_MAINTENANCE':
      return 90; // Seasonal: 90 days
    
    default:
      return 30; // Default: 30 days
  }
}
```

### 2. Auto-Resolution

Instead of just hiding old incidents, automatically resolve them:

```typescript
// Backend service
async function autoResolveStaleIncidents() {
  const staleIncidents = await db.incident.findMany({
    where: {
      status: { notIn: ['RESOLVED', 'SUPPRESSED'] },
      createdAt: { lt: subDays(new Date(), 30) }
    }
  });
  
  for (const incident of staleIncidents) {
    await resolveIncident(incident.id, {
      reason: 'AUTO_RESOLVED',
      note: 'Automatically resolved due to age (30+ days)'
    });
  }
}
```

### 3. User Notification

Notify users before incidents are hidden:

```typescript
// 7 days before hiding (at 23 days old)
if (daysSinceCreated === 23) {
  sendNotification({
    type: 'INCIDENT_EXPIRING',
    message: `Incident "${incident.title}" will be archived in 7 days if not resolved.`,
    ctaLabel: 'Review incident',
    ctaUrl: `/dashboard/properties/${incident.propertyId}/incidents/${incident.id}`
  });
}
```

### 4. Archive View

Add a view to see archived/hidden incidents:

```typescript
// New route: /dashboard/properties/:id/incidents/archived
// Shows incidents older than 30 days that are still ACTIVE
```

### 5. Manual Override

Allow users to "pin" important incidents to keep them visible:

```typescript
type IncidentDTO = {
  // ... existing fields
  isPinned: boolean; // User can pin to keep visible
};

// In filter logic
.filter(inc => {
  if (inc.isPinned) return true; // Always show pinned incidents
  
  const daysSinceCreated = differenceInDays(today, parseISO(inc.createdAt));
  return daysSinceCreated <= incidentStaleThresholdDays;
})
```

## Monitoring & Analytics

### Metrics to Track

1. **Incident age distribution**
   - How many incidents are 0-7 days old?
   - How many are 7-30 days old?
   - How many are 30+ days old?

2. **Filter effectiveness**
   - How many incidents are filtered out daily?
   - What types of incidents are most commonly filtered?

3. **User behavior**
   - Do users resolve incidents faster after this change?
   - Are there fewer "stale incident" support tickets?

### Logging

Add logging to track filtered incidents:

```typescript
const filteredIncidents = incidents.filter(inc => {
  const daysSinceCreated = differenceInDays(today, parseISO(inc.createdAt));
  const isStale = daysSinceCreated > incidentStaleThresholdDays;
  
  if (isStale) {
    console.log(`[Dashboard] Filtered stale incident: ${inc.id} (${daysSinceCreated} days old)`);
  }
  
  return !isStale;
});
```

## Related Issues

This implementation addresses:
- **User feedback**: "Why am I seeing a freeze warning from February?"
- **Dashboard trust**: Ensures only relevant, actionable items are shown
- **System intelligence**: Demonstrates time-awareness and context understanding

## Rollout Strategy

### Phase 1: Soft Launch (Current)
- ✅ Filter incidents on dashboard only
- ✅ Incidents still visible on incidents list page
- ✅ No user-facing changes to incident detail pages

### Phase 2: Enhanced Filtering
- Add type-specific thresholds
- Add visual indicators for incident age
- Add "archived incidents" view

### Phase 3: Auto-Resolution
- Implement backend auto-resolution service
- Add user notifications before resolution
- Add manual override (pinning)

## Conclusion

This implementation provides an immediate improvement to dashboard relevance by filtering out stale incidents. The 30-day threshold is a sensible default that can be refined based on user feedback and analytics.

**Key Takeaway**: Time-sensitive alerts should have time-based filtering. This change ensures the dashboard shows only recent, actionable incidents, improving user trust and system intelligence.
