# Incident Fix Deployment Guide

## What Was Fixed

### 1. Auto-Resolve Old Incidents ✅
**File**: `apps/backend/src/services/incidents/incident.service.ts`

**Change**: Added logic to auto-resolve old unactioned incidents before creating new ones.

**Impact**: 
- Prevents duplicate incidents for the same event
- Old incidents (>24 hours, no user action) are automatically resolved
- Event log shows reason: "Auto-resolved due to new incident creation (no user action taken)"

### 2. Banner Visibility After Resolution ✅
**File**: `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/incidents/[incidentId]/IncidentDetailClient.tsx`

**Change**: Added status checks to hide banners for RESOLVED/EXPIRED/SUPPRESSED incidents.

**Impact**:
- Banners disappear immediately after resolution
- Success message shows: "✓ Incident resolved successfully"
- No more confusion about resolved incidents still showing warnings

## Deployment Steps

### Backend Deployment
```bash
cd apps/backend

# 1. Pull latest changes
git pull origin main

# 2. Install dependencies (if needed)
npm install

# 3. Build
npm run build

# 4. Restart server
pm2 restart backend
# OR
npm run start:prod
```

### Frontend Deployment
```bash
cd apps/frontend

# 1. Pull latest changes
git pull origin main

# 2. Install dependencies (if needed)
npm install

# 3. Build
npm run build

# 4. Restart server
pm2 restart frontend
# OR
npm run start
```

### Verification
```bash
# 1. Check backend is running
curl http://localhost:8080/health

# 2. Check frontend is running
curl http://localhost:3000

# 3. Check logs for errors
pm2 logs backend --lines 50
pm2 logs frontend --lines 50
```

## Testing After Deployment

### Test 1: Resolve Incident
1. Navigate to any incident detail page
2. Click "Resolve now" button in the banner
3. **Expected**:
   - Button shows "Resolving..." and is disabled
   - Success message appears: "✓ Incident resolved successfully"
   - Banners disappear
   - Incident status shows "RESOLVED"

### Test 2: Auto-Resolve Logic
**Option A: Wait 24 Hours (Recommended)**
1. Create an incident (or find existing one)
2. Wait 24 hours
3. Trigger the same incident type again
4. **Expected**:
   - Old incident is auto-resolved
   - New incident is created
   - Event log shows auto-resolution reason

**Option B: Manual Testing (Database)**
```sql
-- 1. Find an incident
SELECT id, propertyId, fingerprint, status, createdAt 
FROM Incident 
WHERE status = 'DETECTED' 
LIMIT 1;

-- 2. Manually set createdAt to 25 hours ago
UPDATE Incident 
SET createdAt = NOW() - INTERVAL '25 hours'
WHERE id = '<incident_id>';

-- 3. Trigger same incident type (via API or worker job)
-- The old incident should be auto-resolved

-- 4. Verify auto-resolution
SELECT 
  i.id,
  i.status,
  i.resolvedAt,
  e.message,
  e.payload
FROM Incident i
JOIN IncidentEvent e ON e.incidentId = i.id
WHERE i.id = '<incident_id>'
  AND e.type = 'RESOLVED'
ORDER BY e.createdAt DESC
LIMIT 1;
```

### Test 3: Rate Limiting
1. Open browser console (F12)
2. Click "Resolve now" button rapidly 10 times
3. **Expected**:
   - First click: Button disabled, shows "Resolving..."
   - Subsequent clicks: Ignored (button is disabled)
   - No rate limit errors (button prevents rapid clicks)

## Common Issues and Solutions

### Issue 1: "Too many requests" Error

**Symptoms**:
- 429 error in browser console
- Error message: "Too many requests, please try again later"

**Causes**:
1. Rapid clicking of buttons
2. Infinite loop in code
3. Multiple browser tabs making requests
4. Background jobs making too many requests

**Solutions**:
1. **Wait 15 minutes** - Rate limit resets after window expires
2. **Check browser console** - Look for repeated API calls
3. **Close duplicate tabs** - Each tab counts toward rate limit
4. **Check loading states** - Buttons should be disabled during requests

**Rate Limits**:
- General API: 2000 requests per 15 minutes (authenticated users)
- Auth endpoints: 10 requests per 15 minutes
- Password reset: 3 requests per hour

### Issue 2: Banners Still Showing After Resolution

**Symptoms**:
- Clicked "Resolve now"
- Success message appeared
- Banners still visible

**Causes**:
1. Page didn't reload
2. Browser cache
3. Incident not actually resolved in database

**Solutions**:
1. **Hard refresh** - Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
2. **Clear cache** - Browser settings → Clear browsing data
3. **Check database**:
```sql
SELECT id, status, resolvedAt 
FROM Incident 
WHERE id = '<incident_id>';
```
4. **Manually resolve** (if needed):
```sql
UPDATE Incident 
SET status = 'RESOLVED', resolvedAt = NOW() 
WHERE id = '<incident_id>';
```

### Issue 3: Duplicate Incidents Still Being Created

**Symptoms**:
- Multiple incidents with same fingerprint
- Created within 24 hours of each other
- All in DETECTED/ACTIVE status

**Causes**:
1. Auto-resolve logic not deployed
2. Fingerprints not matching exactly
3. Incidents created by different processes

**Solutions**:
1. **Verify deployment**:
```bash
# Check if auto-resolve code is present
grep -n "oldUnactionedIncidents" apps/backend/src/services/incidents/incident.service.ts
```

2. **Check fingerprints**:
```sql
SELECT id, fingerprint, status, createdAt 
FROM Incident 
WHERE propertyId = '<property_id>'
  AND typeKey = '<type_key>'
  AND createdAt > NOW() - INTERVAL '24 hours'
ORDER BY createdAt DESC;
```

3. **Manually resolve duplicates**:
```sql
-- Find duplicates
WITH duplicates AS (
  SELECT 
    fingerprint,
    propertyId,
    ARRAY_AGG(id ORDER BY createdAt ASC) as incident_ids
  FROM Incident
  WHERE status IN ('DETECTED', 'EVALUATED', 'ACTIVE')
    AND createdAt > NOW() - INTERVAL '24 hours'
  GROUP BY fingerprint, propertyId
  HAVING COUNT(*) > 1
)
-- Resolve all but the most recent
UPDATE Incident
SET status = 'RESOLVED', resolvedAt = NOW()
WHERE id IN (
  SELECT UNNEST(incident_ids[1:ARRAY_LENGTH(incident_ids, 1)-1])
  FROM duplicates
);
```

## Monitoring Queries

### Check Auto-Resolved Incidents
```sql
SELECT 
  i.id,
  i.propertyId,
  i.typeKey,
  i.createdAt,
  i.resolvedAt,
  e.message,
  e.payload->>'reason' as reason
FROM Incident i
JOIN IncidentEvent e ON e.incidentId = i.id
WHERE i.status = 'RESOLVED'
  AND e.type = 'RESOLVED'
  AND e.payload->>'autoResolved' = 'true'
  AND i.resolvedAt > NOW() - INTERVAL '24 hours'
ORDER BY i.resolvedAt DESC;
```

### Check for Duplicate Incidents
```sql
SELECT 
  fingerprint,
  propertyId,
  COUNT(*) as count,
  ARRAY_AGG(id ORDER BY createdAt) as incident_ids,
  MIN(createdAt) as first_created,
  MAX(createdAt) as last_created
FROM Incident
WHERE createdAt > NOW() - INTERVAL '24 hours'
  AND status IN ('DETECTED', 'EVALUATED', 'ACTIVE')
GROUP BY fingerprint, propertyId
HAVING COUNT(*) > 1;
```

### Check Rate Limit Errors
```bash
# Backend logs
pm2 logs backend | grep "429\|rate limit"

# Or check application logs
tail -f /var/log/backend/error.log | grep "rate limit"
```

### Check Incident Resolution Rate
```sql
SELECT 
  DATE(resolvedAt) as date,
  COUNT(*) as total_resolved,
  SUM(CASE WHEN EXISTS (
    SELECT 1 FROM IncidentEvent e 
    WHERE e.incidentId = i.id 
      AND e.type = 'RESOLVED'
      AND e.payload->>'autoResolved' = 'true'
  ) THEN 1 ELSE 0 END) as auto_resolved,
  SUM(CASE WHEN EXISTS (
    SELECT 1 FROM IncidentEvent e 
    WHERE e.incidentId = i.id 
      AND e.type = 'RESOLVED'
      AND e.payload->>'autoResolved' IS NULL
  ) THEN 1 ELSE 0 END) as manually_resolved
FROM Incident i
WHERE status = 'RESOLVED'
  AND resolvedAt > NOW() - INTERVAL '7 days'
GROUP BY DATE(resolvedAt)
ORDER BY date DESC;
```

## Rollback Plan

### If Issues Arise

#### 1. Rollback Backend
```bash
cd apps/backend

# Checkout previous commit
git log --oneline -10  # Find previous commit hash
git checkout <previous_commit_hash>

# Rebuild and restart
npm run build
pm2 restart backend
```

#### 2. Rollback Frontend
```bash
cd apps/frontend

# Checkout previous commit
git log --oneline -10  # Find previous commit hash
git checkout <previous_commit_hash>

# Rebuild and restart
npm run build
pm2 restart frontend
```

#### 3. Disable Auto-Resolve Logic (Temporary)
```typescript
// In apps/backend/src/services/incidents/incident.service.ts
// Comment out the auto-resolve block (lines ~318-360)

/*
const oldUnactionedIncidents = await prisma.incident.findMany({
  ...
});

for (const oldIncident of oldUnactionedIncidents) {
  ...
}
*/
```

## Success Criteria

✅ **Deployment Successful If**:
1. No errors in backend logs
2. No errors in frontend logs
3. Incidents can be resolved via UI
4. Banners disappear after resolution
5. Success message appears after resolution
6. No duplicate incidents created
7. Auto-resolved incidents show in event log

❌ **Rollback If**:
1. Backend crashes or won't start
2. Frontend crashes or won't start
3. Incidents can't be resolved
4. Database errors in logs
5. High rate of 500 errors
6. User reports critical issues

## Support

### Logs to Check
```bash
# Backend logs
pm2 logs backend --lines 100

# Frontend logs
pm2 logs frontend --lines 100

# Database logs (if accessible)
tail -f /var/log/postgresql/postgresql.log
```

### Useful Commands
```bash
# Check process status
pm2 status

# Restart processes
pm2 restart all

# View detailed process info
pm2 show backend
pm2 show frontend

# Monitor in real-time
pm2 monit
```

### Emergency Contacts
- Backend issues: Check backend logs and database
- Frontend issues: Check frontend logs and browser console
- Database issues: Check PostgreSQL logs and connection

## Summary

✅ **Changes Deployed**:
1. Auto-resolve old unactioned incidents (backend)
2. Hide banners for resolved incidents (frontend)
3. Show success message after resolution (frontend)

⚠️ **Known Limitations**:
1. Rate limiting is working as designed (2000 req/15min)
2. Auto-resolve only affects incidents >24 hours old
3. User-actioned incidents are NOT auto-resolved

🎯 **Expected Results**:
- No duplicate incidents for same event
- Clear feedback when incidents are resolved
- Old unactioned incidents automatically cleaned up
- Better user experience overall
