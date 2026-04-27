# Incident Auto-Resolve Fix - Preventing Duplicate Incidents

## Problem Statement

### Issue Reported by User
"Even after clicking 'resolve now', incidents are still showing. If there is an open incident for any day, no new incident should be created for that day. Before creating a new incident for next day, we should resolve the previously opened incident if it is not actioned by user."

### Root Cause Analysis

The deduplication logic in `upsertIncident()` had a critical flaw:

**Before Fix**:
```typescript
// Only looked for incidents in "open" states
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

**What This Caused**:
1. Day 1: Freeze risk incident created (status: DETECTED)
2. Day 2: Same freeze event → Updates existing incident ✅
3. Day 3: User resolves incident (status: RESOLVED)
4. Day 4: Freeze still happening → **NEW incident created** ❌
5. Result: Multiple incidents for the same ongoing event

### Why Banners Still Showed After Resolution

**Issue**: After clicking "Resolve now", the incident was marked as RESOLVED in the database, but:
1. The banner visibility logic didn't check incident status
2. The page didn't reload to reflect the new status
3. Success feedback wasn't shown to the user

**Fix Applied** (in previous iteration):
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

## Solution Implemented

### Auto-Resolve Old Incidents Before Creating New Ones

**Location**: `apps/backend/src/services/incidents/incident.service.ts` (line ~318)

**New Logic**:
```typescript
// Step 1: Auto-resolve old unactioned incidents before creating new ones
const oldUnactionedIncidents = await prisma.incident.findMany({
  where: {
    propertyId: input.propertyId,
    fingerprint: input.fingerprint,
    status: { 
      in: [IncidentStatus.DETECTED, IncidentStatus.EVALUATED, IncidentStatus.ACTIVE] 
    },
    createdAt: {
      lt: new Date(Date.now() - 24 * 60 * 60 * 1000) // Older than 24 hours
    }
  },
});

// Auto-resolve old incidents
for (const oldIncident of oldUnactionedIncidents) {
  await prisma.incident.update({
    where: { id: oldIncident.id },
    data: {
      status: IncidentStatus.RESOLVED,
      resolvedAt: now,
    },
  });
  
  await logIncidentEvent({
    incidentId: oldIncident.id,
    propertyId: oldIncident.propertyId,
    userId: oldIncident.userId,
    type: IncidentEventType.RESOLVED,
    message: 'Auto-resolved due to new incident creation (no user action taken)',
    payload: { 
      autoResolved: true, 
      reason: 'new_incident_created',
      newIncidentFingerprint: input.fingerprint 
    },
  });

  // Archive guidance for auto-resolved incidents
  try {
    await archiveIncidentGuidance(oldIncident.id);
  } catch (guidanceError) {
    logger.warn({ guidanceError }, '[GUIDANCE] auto-resolve archive hook failed');
  }
}

// Step 2: Prefer updating an existing incident with same fingerprint if it's still "open-ish"
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

## How It Works

### Scenario 1: Normal Flow (No Duplicates)
1. **Day 1, 8 AM**: Freeze risk incident created (fingerprint: `property123_FREEZE_RISK`)
   - Status: DETECTED
   - No old incidents found
   - New incident created

2. **Day 1, 2 PM**: Same freeze event triggers again
   - Finds existing incident from 8 AM (status: DETECTED)
   - Updates existing incident instead of creating new one ✅

3. **Day 2, 8 AM**: Freeze still happening
   - Finds incident from Day 1 (now 24+ hours old, status: DETECTED)
   - Auto-resolves Day 1 incident
   - Creates new incident for Day 2 ✅

### Scenario 2: User Resolves Manually
1. **Day 1, 8 AM**: Freeze risk incident created
   - Status: DETECTED

2. **Day 1, 10 AM**: User clicks "Resolve now"
   - Status: RESOLVED
   - resolvedAt: Day 1, 10 AM

3. **Day 2, 8 AM**: Freeze still happening
   - Looks for old unactioned incidents (DETECTED/EVALUATED/ACTIVE)
   - Finds none (Day 1 incident is RESOLVED)
   - Creates new incident for Day 2 ✅

### Scenario 3: User Takes Action
1. **Day 1, 8 AM**: Freeze risk incident created
   - Status: DETECTED

2. **Day 1, 10 AM**: User acknowledges or takes action
   - Status: ACTIONED or MITIGATED

3. **Day 2, 8 AM**: Freeze still happening
   - Finds incident from Day 1 (status: ACTIONED, 24+ hours old)
   - **Does NOT auto-resolve** (user took action, incident is important)
   - Updates existing incident instead ✅

### Scenario 4: Pinned Incidents
1. **Day 1, 8 AM**: Freeze risk incident created
   - Status: DETECTED

2. **Day 1, 10 AM**: User pins incident
   - isPinned: true
   - Status: DETECTED

3. **Day 2, 8 AM**: Freeze still happening
   - Finds incident from Day 1 (status: DETECTED, 24+ hours old)
   - Auto-resolves it (pinning doesn't prevent auto-resolve in upsert)
   - Creates new incident for Day 2

**Note**: Pinning prevents auto-resolution by the background job, but not by the upsert logic. This is intentional - if a new incident is being created, the old one should be resolved.

## Key Design Decisions

### 1. Only Auto-Resolve Unactioned Incidents
**Statuses Auto-Resolved**:
- DETECTED (no user interaction)
- EVALUATED (system processed, no user action)
- ACTIVE (system activated, no user action)

**Statuses NOT Auto-Resolved**:
- ACTIONED (user took action)
- MITIGATED (user mitigated)
- SUPPRESSED (user suppressed)
- RESOLVED (already resolved)
- EXPIRED (already expired)

**Rationale**: If a user has taken any action on an incident, it's important enough to keep visible.

### 2. 24-Hour Threshold
**Why 24 hours?**
- Prevents aggressive auto-resolution within the same day
- Allows multiple signals to update the same incident
- Balances freshness with stability

**Example**:
- 8 AM: Incident created
- 2 PM: Same event → Updates incident (not 24 hours yet)
- Next day 8 AM: New event → Auto-resolves old, creates new

### 3. Event Logging
Every auto-resolution creates an event:
```typescript
{
  type: IncidentEventType.RESOLVED,
  message: 'Auto-resolved due to new incident creation (no user action taken)',
  payload: { 
    autoResolved: true, 
    reason: 'new_incident_created',
    newIncidentFingerprint: input.fingerprint 
  }
}
```

**Benefits**:
- Audit trail for debugging
- User can see why incident was resolved
- Analytics can track auto-resolution rate

### 4. Guidance Archiving
When an incident is auto-resolved, its guidance signals are also archived:
```typescript
await archiveIncidentGuidance(oldIncident.id);
```

**What This Does**:
- Marks GuidanceSignal as ARCHIVED
- Marks GuidanceJourney as ARCHIVED
- Prevents stale guidance from showing in UI

## Testing Scenarios

### Test 1: Basic Auto-Resolve
```bash
# Day 1: Create incident
POST /api/incidents
{
  "propertyId": "prop123",
  "fingerprint": "prop123_FREEZE_RISK",
  "typeKey": "FREEZE_RISK",
  "title": "Freeze risk detected"
}
# Response: incident1 (status: DETECTED)

# Wait 25 hours

# Day 2: Create same incident
POST /api/incidents
{
  "propertyId": "prop123",
  "fingerprint": "prop123_FREEZE_RISK",
  "typeKey": "FREEZE_RISK",
  "title": "Freeze risk detected"
}
# Response: incident2 (status: DETECTED)

# Verify:
GET /api/properties/prop123/incidents/incident1
# Should show status: RESOLVED, resolvedAt: Day 2
```

### Test 2: User Resolves Manually
```bash
# Day 1: Create incident
POST /api/incidents
# Response: incident1 (status: DETECTED)

# Day 1: User resolves
PATCH /api/properties/prop123/incidents/incident1/status
{ "status": "RESOLVED" }

# Day 2: Create same incident
POST /api/incidents
# Response: incident2 (status: DETECTED)

# Verify:
GET /api/properties/prop123/incidents
# Should show 2 incidents:
# - incident1 (RESOLVED, resolvedAt: Day 1)
# - incident2 (DETECTED, createdAt: Day 2)
```

### Test 3: User Takes Action
```bash
# Day 1: Create incident
POST /api/incidents
# Response: incident1 (status: DETECTED)

# Day 1: User acknowledges
POST /api/properties/prop123/incidents/incident1/ack
{ "type": "ACKNOWLEDGED" }

# Day 2: Create same incident
POST /api/incidents
# Response: incident1 (updated, status: ACTIONED)

# Verify:
GET /api/properties/prop123/incidents
# Should show 1 incident (incident1 updated, not auto-resolved)
```

### Test 4: Multiple Properties
```bash
# Property A: Create incident
POST /api/incidents
{
  "propertyId": "propA",
  "fingerprint": "propA_FREEZE_RISK",
  ...
}

# Property B: Create incident with same type
POST /api/incidents
{
  "propertyId": "propB",
  "fingerprint": "propB_FREEZE_RISK",
  ...
}

# Verify: Incidents are isolated per property
GET /api/properties/propA/incidents
# Should show only propA incidents

GET /api/properties/propB/incidents
# Should show only propB incidents
```

## Monitoring and Alerts

### Metrics to Track
1. **Auto-Resolution Rate**
   - Number of incidents auto-resolved per day
   - Percentage of incidents auto-resolved vs manually resolved
   - Target: <20% auto-resolved (most should be actioned by users)

2. **Duplicate Incident Rate**
   - Number of incidents with same fingerprint created within 24 hours
   - Target: 0 duplicates

3. **Incident Age at Auto-Resolution**
   - Average age of incidents when auto-resolved
   - Target: ~24-48 hours

4. **User Action Rate**
   - Percentage of incidents where user takes action before auto-resolve
   - Target: >80% (users should act on most incidents)

### Alerts to Configure
1. **High Auto-Resolution Rate**
   - Alert if >50 incidents auto-resolved in 1 hour
   - Possible cause: Bug in incident creation logic

2. **Duplicate Incidents Detected**
   - Alert if same fingerprint appears twice within 24 hours
   - Possible cause: Auto-resolve logic not working

3. **Old Incidents Not Auto-Resolved**
   - Alert if incidents >7 days old still in DETECTED status
   - Possible cause: Auto-resolve logic skipped

## Rollback Plan

### If Issues Arise

#### 1. Disable Auto-Resolve Logic
```typescript
// In incident.service.ts, comment out auto-resolve block:
/*
const oldUnactionedIncidents = await prisma.incident.findMany({
  ...
});

for (const oldIncident of oldUnactionedIncidents) {
  ...
}
*/
```

#### 2. Manually Resolve Stuck Incidents
```sql
-- Find incidents that should have been auto-resolved
SELECT id, propertyId, fingerprint, status, createdAt
FROM Incident
WHERE status IN ('DETECTED', 'EVALUATED', 'ACTIVE')
  AND createdAt < NOW() - INTERVAL '7 days';

-- Manually resolve them
UPDATE Incident
SET status = 'RESOLVED', resolvedAt = NOW()
WHERE id IN (...);
```

#### 3. Monitor for Duplicates
```sql
-- Find duplicate incidents (same fingerprint, created within 24 hours)
SELECT fingerprint, propertyId, COUNT(*) as count
FROM Incident
WHERE createdAt > NOW() - INTERVAL '24 hours'
GROUP BY fingerprint, propertyId
HAVING COUNT(*) > 1;
```

## Success Criteria

✅ **Implemented**:
1. Auto-resolve logic added to upsertIncident
2. Event logging for auto-resolutions
3. Guidance archiving for auto-resolved incidents
4. 24-hour threshold prevents aggressive resolution
5. Only unactioned incidents are auto-resolved

⏳ **To Verify**:
1. No duplicate incidents created for same event
2. Old unactioned incidents auto-resolved before new creation
3. User-actioned incidents NOT auto-resolved
4. Event timeline shows auto-resolution events
5. Guidance signals archived for auto-resolved incidents

## Next Steps

1. **Deploy to Staging** ✅
   - Code changes deployed
   - Ready for testing

2. **Test Scenarios**
   - Create incident, wait 25 hours, create same incident
   - Verify old incident auto-resolved
   - Verify new incident created
   - Check event timeline shows auto-resolution

3. **Monitor Metrics**
   - Track auto-resolution rate
   - Alert on duplicates
   - Monitor user feedback

4. **Deploy to Production**
   - After 48 hours of successful staging testing
   - Monitor closely for first week

## Related Documentation

- `INCIDENT_DEDUPLICATION_LOGIC_REVIEW.md` - Original analysis and recommendations
- `INCIDENT_LIFECYCLE_IMPLEMENTATION_COMPLETE.md` - Overall lifecycle management status
- `DATABASE_SCHEMA_INCIDENT_LIFECYCLE.md` - Database schema documentation

## Summary

The auto-resolve fix ensures that:
1. **No duplicate incidents** for the same event
2. **Old unactioned incidents** are automatically resolved before creating new ones
3. **User-actioned incidents** are preserved and updated
4. **Clear audit trail** via event logging
5. **Guidance signals** are archived to prevent stale data

This fix addresses the user's concern: "If there is an open incident for any day, no new incident should be created for that day. Before creating a new incident for next day, we should resolve the previously opened incident if it is not actioned by user."
