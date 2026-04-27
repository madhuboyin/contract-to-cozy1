# Incident Deduplication Logic Review & Recommendations

## Current Behavior Analysis

### Deduplication Logic (Line 318-320 in incident.service.ts)
```typescript
const existing = await prisma.incident.findFirst({
  where: {
    propertyId: input.propertyId,
    fingerprint: input.fingerprint,
    status: { 
      in: [
        IncidentStatus.DETECTED, 
        IncidentStatus.EVALUATED, 
        IncidentStatus.ACTIVE, 
        IncidentStatus.ACTIONED, 
        IncidentStatus.MITIGATED, 
        IncidentStatus.SUPPRESSED
      ] 
    },
  },
  orderBy: { createdAt: 'desc' },
});
```

### What This Means:
1. **If an incident with the same fingerprint exists in an "open" state** → Update it
2. **If the incident is RESOLVED or EXPIRED** → Create a new incident
3. **No automatic resolution of old incidents** before creating new ones

## Issues Identified

### Issue 1: Resolved Incidents Still Show Warnings ✅ FIXED
**Problem**: After clicking "Resolve now", the incident is marked as RESOLVED but warning banners still appear.

**Root Cause**: Banner visibility logic didn't check incident status.

**Fix Applied**:
```typescript
// Only show banners for non-resolved incidents
{stalenessStatus && 
 stalenessStatus.isWarning && 
 !isPinned && 
 incident.status !== 'RESOLVED' && 
 incident.status !== 'EXPIRED' && 
 incident.status !== 'SUPPRESSED' && (
  <AutoResolutionNotificationBanner ... />
)}
```

### Issue 2: Multiple Incidents for Same Event
**Problem**: If a freeze risk incident is created today, and the user doesn't act on it, a new incident might be created tomorrow for the same freeze event.

**Current Behavior**:
- Day 1: Incident created (status: DETECTED)
- Day 2: Same freeze event → Updates existing incident ✅
- Day 3: User resolves incident (status: RESOLVED)
- Day 4: Freeze still happening → **NEW incident created** ❌

**Expected Behavior**:
- Should NOT create duplicate incidents for the same ongoing event
- Should auto-resolve stale incidents before creating new ones

## Recommendations

### Option 1: Auto-Resolve Before Creating New (RECOMMENDED)
Before creating a new incident, auto-resolve any old incidents with the same fingerprint that haven't been actioned.

```typescript
// In upsertIncident, before creating new incident:
const oldIncidents = await prisma.incident.findMany({
  where: {
    propertyId: input.propertyId,
    fingerprint: input.fingerprint,
    status: { 
      in: [
        IncidentStatus.DETECTED, 
        IncidentStatus.EVALUATED, 
        IncidentStatus.ACTIVE
      ] 
    },
    createdAt: {
      lt: new Date(Date.now() - 24 * 60 * 60 * 1000) // Older than 24 hours
    }
  },
});

// Auto-resolve old incidents
for (const oldIncident of oldIncidents) {
  await prisma.incident.update({
    where: { id: oldIncident.id },
    data: {
      status: IncidentStatus.RESOLVED,
      resolvedAt: new Date(),
    },
  });
  
  await logIncidentEvent({
    incidentId: oldIncident.id,
    propertyId: oldIncident.propertyId,
    userId: null,
    type: IncidentEventType.RESOLVED,
    message: 'Auto-resolved due to new incident creation',
    payload: { autoResolved: true, reason: 'new_incident_created' },
  });
}
```

### Option 2: Extend Deduplication Window
Instead of creating a new incident, extend the existing one if it's within a certain time window.

```typescript
const existing = await prisma.incident.findFirst({
  where: {
    propertyId: input.propertyId,
    fingerprint: input.fingerprint,
    status: { 
      in: [
        IncidentStatus.DETECTED, 
        IncidentStatus.EVALUATED, 
        IncidentStatus.ACTIVE, 
        IncidentStatus.ACTIONED, 
        IncidentStatus.MITIGATED, 
        IncidentStatus.SUPPRESSED,
        IncidentStatus.RESOLVED, // Include resolved
        IncidentStatus.EXPIRED,  // Include expired
      ] 
    },
    createdAt: {
      gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Within last 7 days
    }
  },
  orderBy: { createdAt: 'desc' },
});

// If found and resolved, reopen it
if (existing && existing.status === IncidentStatus.RESOLVED) {
  // Reopen the incident instead of creating new
  await prisma.incident.update({
    where: { id: existing.id },
    data: {
      status: IncidentStatus.ACTIVE,
      activatedAt: new Date(),
      resolvedAt: null,
    },
  });
}
```

### Option 3: Smart Fingerprinting with Date
Include date in fingerprint to allow one incident per day per event type.

```typescript
// When creating incident fingerprint:
const fingerprint = `${propertyId}_${typeKey}_${format(new Date(), 'yyyy-MM-dd')}`;
```

**Pros**: Simple, one incident per day guaranteed
**Cons**: Could create too many incidents if event spans multiple days

## Recommended Implementation

### Phase 1: Fix Banner Display ✅ DONE
- Hide warning banners for RESOLVED/EXPIRED/SUPPRESSED incidents
- Show success message after resolution

### Phase 2: Auto-Resolve Old Incidents (HIGH PRIORITY)
Implement Option 1 - auto-resolve old incidents before creating new ones.

**Logic**:
1. When creating a new incident with fingerprint X
2. Find any incidents with same fingerprint that are:
   - Status: DETECTED, EVALUATED, or ACTIVE (not actioned)
   - Created more than 24 hours ago
3. Auto-resolve those old incidents
4. Create the new incident
5. Log event explaining auto-resolution

**Benefits**:
- Prevents duplicate incidents
- Keeps incident list clean
- User sees only current, relevant incidents
- Old unactioned incidents don't clutter dashboard

### Phase 3: Background Job for Stale Incidents (MEDIUM PRIORITY)
Implement the auto-resolution background job we designed earlier.

**Schedule**: Daily at 2 AM
**Logic**:
- Find incidents older than their type-specific threshold
- Not pinned by user
- Not already resolved
- Auto-resolve them
- Send notification if configured

## Testing Checklist

- [ ] Resolve incident → banners disappear immediately
- [ ] Create incident with same fingerprint next day → old one auto-resolved
- [ ] User pins incident → NOT auto-resolved when new one created
- [ ] User takes action on incident → NOT auto-resolved
- [ ] Incident older than 24 hours, no action → auto-resolved before new creation
- [ ] Multiple properties with same incident type → isolated per property
- [ ] Analytics events fire for auto-resolution

## Database Impact

### New Event Type Needed
```typescript
// In IncidentEventType enum
RESOLVED // Already exists
AUTO_RESOLVED // Add this for clarity
```

### Query Performance
- Existing query already filters by fingerprint + status
- Adding createdAt filter is indexed
- No performance impact expected

## Rollout Plan

1. **Deploy Phase 1** (Banner fix) ✅ DONE
2. **Test in staging** - Create incidents, resolve, verify banners hide
3. **Deploy Phase 2** (Auto-resolve logic) - Monitor for 48 hours
4. **Verify** - Check that old incidents are being auto-resolved
5. **Deploy Phase 3** (Background job) - After Phase 2 is stable

## Monitoring

### Metrics to Track
- Number of incidents auto-resolved per day
- Number of duplicate incidents created (should be 0)
- User complaints about missing incidents (should be 0)
- Average incident age at resolution

### Alerts
- Alert if >10 incidents auto-resolved in 1 hour (possible bug)
- Alert if duplicate incidents detected (fingerprint collision)
