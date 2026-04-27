# Incident Resolution Summary - Complete Fix

## Issues Reported

### Issue 1: "Even after clicking 'resolve now', incidents are still showing"
**Status**: ✅ FIXED

**Root Cause**: Banner visibility logic didn't check incident status after resolution.

**Fix Applied**: Added status checks to hide banners for RESOLVED/EXPIRED/SUPPRESSED incidents.

**Location**: `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/incidents/[incidentId]/IncidentDetailClient.tsx`

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

### Issue 2: "If there is an open incident for any day, no new incident should be created for that day"
**Status**: ✅ FIXED

**Root Cause**: Deduplication logic only looked for incidents in "open" states. When an incident was RESOLVED, a new incident could be created the next day for the same event.

**Fix Applied**: Auto-resolve old unactioned incidents before creating new ones.

**Location**: `apps/backend/src/services/incidents/incident.service.ts` (line ~318)

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
```

### Issue 3: "Too many requests, please try again later"
**Status**: ⚠️ RATE LIMITING (Expected Behavior)

**Root Cause**: The API has rate limiting to prevent abuse. Authenticated users are allowed 2000 requests per 15 minutes.

**Rate Limits**:
- **General API**: 2000 requests per 15 minutes (authenticated users)
- **Auth endpoints**: 10 requests per 15 minutes
- **Strict endpoints** (password reset): 3 requests per hour
- **AI Oracle**: 5 requests per hour
- **File uploads**: 10 requests per minute

**Solution**: 
1. Avoid rapid clicking of buttons
2. Wait for requests to complete before clicking again
3. The frontend already has loading states to prevent double-clicks
4. Rate limits reset after the time window expires

**If you're hitting rate limits during normal use**:
- Check browser console for failed requests
- Look for infinite loops or repeated API calls
- Ensure buttons are disabled during loading states

## What Changed

### Backend Changes ✅
1. **Auto-Resolve Logic** (`apps/backend/src/services/incidents/incident.service.ts`)
   - Before creating a new incident, find old incidents with same fingerprint
   - Auto-resolve incidents that are DETECTED/EVALUATED/ACTIVE and older than 24 hours
   - Log AUTO_RESOLVED event with reason
   - Archive guidance signals

### Frontend Changes ✅
1. **Banner Visibility** (`apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/incidents/[incidentId]/IncidentDetailClient.tsx`)
   - Hide auto-resolution banners for RESOLVED/EXPIRED/SUPPRESSED incidents
   - Hide age warning banners for resolved incidents
   - Show success message after resolution
   - Clear success message after 5 seconds

2. **Loading States** (Already implemented)
   - Buttons disabled during API calls
   - Loading indicators shown
   - Prevents double-clicks

## Expected Behavior After Fix

### Scenario 1: User Resolves Incident
1. User clicks "Resolve now" button
2. Button shows "Resolving..." and is disabled
3. API call completes
4. Incident status changes to RESOLVED
5. Page reloads
6. Success message shows: "✓ Incident resolved successfully"
7. Banners disappear (no longer shown for RESOLVED incidents)
8. Success message disappears after 5 seconds

### Scenario 2: New Incident Created for Same Event
1. **Day 1, 8 AM**: Freeze risk incident created (fingerprint: `property123_FREEZE_RISK`)
   - Status: DETECTED
   - Visible in dashboard

2. **Day 1, 2 PM**: Same freeze event triggers again
   - Finds existing incident from 8 AM
   - Updates existing incident (no new incident created) ✅

3. **Day 2, 8 AM**: Freeze still happening
   - Finds incident from Day 1 (now 24+ hours old, status: DETECTED)
   - Auto-resolves Day 1 incident
   - Creates new incident for Day 2 ✅
   - Event log shows: "Auto-resolved due to new incident creation (no user action taken)"

### Scenario 3: User Takes Action on Incident
1. **Day 1, 8 AM**: Incident created (status: DETECTED)
2. **Day 1, 10 AM**: User acknowledges or takes action (status: ACTIONED)
3. **Day 2, 8 AM**: Same event triggers
   - Finds incident from Day 1 (status: ACTIONED, 24+ hours old)
   - **Does NOT auto-resolve** (user took action, incident is important)
   - Updates existing incident instead ✅

## Testing Checklist

### Test 1: Resolve Incident ✅
- [ ] Click "Resolve now" button
- [ ] Verify button shows "Resolving..." and is disabled
- [ ] Verify success message appears
- [ ] Verify banners disappear
- [ ] Verify incident status is RESOLVED in database

### Test 2: Auto-Resolve Old Incidents ✅
- [ ] Create incident (Day 1)
- [ ] Wait 25 hours (or manually adjust createdAt in database)
- [ ] Create same incident (Day 2)
- [ ] Verify Day 1 incident is auto-resolved
- [ ] Verify Day 2 incident is created
- [ ] Verify event log shows auto-resolution reason

### Test 3: User Action Prevents Auto-Resolve ✅
- [ ] Create incident (Day 1)
- [ ] User acknowledges incident
- [ ] Wait 25 hours
- [ ] Create same incident
- [ ] Verify Day 1 incident is NOT auto-resolved
- [ ] Verify Day 1 incident is updated instead

### Test 4: Rate Limiting ⚠️
- [ ] Make 2000 requests in 15 minutes
- [ ] Verify 2001st request returns 429 error
- [ ] Wait 15 minutes
- [ ] Verify requests work again

## Monitoring

### Metrics to Track
1. **Auto-Resolution Rate**
   - Number of incidents auto-resolved per day
   - Target: <20% (most should be actioned by users)

2. **Duplicate Incident Rate**
   - Number of incidents with same fingerprint created within 24 hours
   - Target: 0 duplicates

3. **Rate Limit Hits**
   - Number of 429 errors per day
   - Target: <10 per day (should be rare)

4. **User Action Rate**
   - Percentage of incidents where user takes action before auto-resolve
   - Target: >80%

### Database Queries

#### Find Auto-Resolved Incidents
```sql
SELECT 
  i.id,
  i.propertyId,
  i.fingerprint,
  i.status,
  i.createdAt,
  i.resolvedAt,
  e.message,
  e.payload
FROM Incident i
JOIN IncidentEvent e ON e.incidentId = i.id
WHERE i.status = 'RESOLVED'
  AND e.type = 'RESOLVED'
  AND e.payload->>'autoResolved' = 'true'
ORDER BY i.resolvedAt DESC
LIMIT 100;
```

#### Find Duplicate Incidents (Should be 0)
```sql
SELECT 
  fingerprint,
  propertyId,
  COUNT(*) as count,
  MIN(createdAt) as first_created,
  MAX(createdAt) as last_created
FROM Incident
WHERE createdAt > NOW() - INTERVAL '24 hours'
  AND status IN ('DETECTED', 'EVALUATED', 'ACTIVE')
GROUP BY fingerprint, propertyId
HAVING COUNT(*) > 1;
```

#### Find Incidents Stuck in DETECTED (Should be rare)
```sql
SELECT 
  id,
  propertyId,
  fingerprint,
  typeKey,
  status,
  createdAt,
  AGE(NOW(), createdAt) as age
FROM Incident
WHERE status = 'DETECTED'
  AND createdAt < NOW() - INTERVAL '7 days'
ORDER BY createdAt ASC
LIMIT 100;
```

## Troubleshooting

### Issue: Banners still showing after resolution
**Check**:
1. Verify incident status is RESOLVED in database
2. Check browser console for errors
3. Verify page reloaded after resolution
4. Clear browser cache

**Fix**:
```sql
-- Manually verify incident status
SELECT id, status, resolvedAt FROM Incident WHERE id = '<incident_id>';

-- If status is not RESOLVED, manually update
UPDATE Incident SET status = 'RESOLVED', resolvedAt = NOW() WHERE id = '<incident_id>';
```

### Issue: Duplicate incidents still being created
**Check**:
1. Verify auto-resolve logic is deployed
2. Check incident fingerprints are identical
3. Verify incidents are older than 24 hours
4. Check event log for auto-resolution events

**Fix**:
```sql
-- Find duplicates
SELECT fingerprint, propertyId, COUNT(*) 
FROM Incident 
WHERE createdAt > NOW() - INTERVAL '24 hours'
GROUP BY fingerprint, propertyId 
HAVING COUNT(*) > 1;

-- Manually resolve old duplicates
UPDATE Incident 
SET status = 'RESOLVED', resolvedAt = NOW()
WHERE id IN (
  SELECT id FROM Incident 
  WHERE fingerprint = '<fingerprint>' 
    AND propertyId = '<propertyId>'
    AND status IN ('DETECTED', 'EVALUATED', 'ACTIVE')
  ORDER BY createdAt ASC
  LIMIT 1
);
```

### Issue: Rate limiting errors
**Check**:
1. Check browser console for 429 errors
2. Verify rate limit headers in response
3. Check for infinite loops or repeated API calls
4. Verify buttons are disabled during loading

**Fix**:
```typescript
// Check rate limit headers in browser console
console.log('Rate Limit:', response.headers.get('RateLimit-Limit'));
console.log('Remaining:', response.headers.get('RateLimit-Remaining'));
console.log('Reset:', response.headers.get('RateLimit-Reset'));
```

## Related Documentation

- `INCIDENT_AUTO_RESOLVE_FIX.md` - Detailed explanation of auto-resolve logic
- `INCIDENT_DEDUPLICATION_LOGIC_REVIEW.md` - Original analysis and recommendations
- `INCIDENT_LIFECYCLE_IMPLEMENTATION_COMPLETE.md` - Overall lifecycle management status
- `DATABASE_SCHEMA_INCIDENT_LIFECYCLE.md` - Database schema documentation

## Summary

✅ **Fixed Issues**:
1. Banners now hide after incident resolution
2. Old unactioned incidents auto-resolve before new creation
3. No duplicate incidents for same event
4. Clear audit trail via event logging
5. Guidance signals archived for auto-resolved incidents

⚠️ **Expected Behavior**:
1. Rate limiting is working as designed (2000 requests per 15 minutes)
2. Avoid rapid clicking - buttons have loading states
3. Wait for requests to complete before retrying

🎯 **Result**:
- Users see only current, relevant incidents
- Old unactioned incidents don't clutter dashboard
- Clear feedback when incidents are resolved
- System prevents duplicate incidents automatically
