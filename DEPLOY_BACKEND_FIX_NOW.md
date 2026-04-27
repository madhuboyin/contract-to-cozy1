# CRITICAL: Deploy Backend Fix Immediately

## Issue Found
The **backend API** was returning RESOLVED incidents, which is why the dashboard still showed them even after frontend filtering.

## Root Cause
The `listIncidents` API method didn't filter out terminal states (RESOLVED, EXPIRED, SUPPRESSED) by default. It only filtered if a specific status was provided.

## Fix Applied
Modified `apps/backend/src/services/incidents/incident.service.ts`:
- Added default filter to exclude RESOLVED/EXPIRED/SUPPRESSED incidents
- Only applies when no specific status is requested
- Explicit status filters still work (e.g., `?status=RESOLVED`)

## Deploy Backend NOW

### Step 1: Navigate to Backend
```bash
cd apps/backend
```

### Step 2: Pull Latest Changes
```bash
git pull origin main
```

### Step 3: Install Dependencies (if needed)
```bash
npm install
```

### Step 4: Build Backend
```bash
npm run build
```

### Step 5: Restart Backend Server

**Option A: Using PM2**
```bash
pm2 restart backend
```

**Option B: Using npm**
```bash
# Stop current process (Ctrl+C if running in terminal)
# Then start:
npm run start
```

**Option C: Using Docker**
```bash
docker-compose restart backend
```

### Step 6: Verify Backend is Running
```bash
# Check if backend is accessible
curl http://localhost:8080/health

# Check PM2 status (if using PM2)
pm2 status

# Check logs for errors
pm2 logs backend --lines 50
```

## Verify the Fix

### Test 1: Check API Response
```bash
# Call the incidents API
curl http://localhost:8080/api/properties/f27f66e8-9c22-406b-aeef-f67c98681768/incidents \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected**: Response should NOT include incidents with `status: 'RESOLVED'`

### Test 2: Check Dashboard
1. Open dashboard in browser
2. Refresh page (Cmd+R or Ctrl+R)
3. **Expected**: "Freeze Risk Detected" should NOT appear

### Test 3: Verify Resolved Incidents Can Still Be Viewed
```bash
# Call API with explicit status filter
curl http://localhost:8080/api/properties/f27f66e8-9c22-406b-aeef-f67c98681768/incidents?status=RESOLVED \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected**: Response SHOULD include RESOLVED incidents

## What Changed

### Before:
```typescript
static async listIncidents(q: ListIncidentsQuery) {
  const where: any = {
    propertyId: q.propertyId,
  };
  if (q.status) where.status = q.status;
  // ... rest of code
}
```

**Problem**: If no status provided, returns ALL incidents including RESOLVED

### After:
```typescript
static async listIncidents(q: ListIncidentsQuery) {
  const where: any = {
    propertyId: q.propertyId,
  };
  
  if (q.status) {
    where.status = q.status;
  } else {
    // By default, exclude terminal states
    where.status = {
      notIn: ['RESOLVED', 'EXPIRED', 'SUPPRESSED'],
    };
  }
  // ... rest of code
}
```

**Solution**: If no status provided, excludes RESOLVED/EXPIRED/SUPPRESSED by default

## Expected Results After Deployment

### Dashboard
- ✅ No "Freeze Risk Detected" (it's RESOLVED)
- ✅ Only active incidents visible
- ✅ "Priority actions: 0" (if no other incidents)

### API Response
```json
{
  "items": [
    // Only incidents with status: DETECTED, EVALUATED, ACTIVE, ACTIONED, MITIGATED
    // NO incidents with status: RESOLVED, EXPIRED, SUPPRESSED
  ],
  "nextCursor": null
}
```

### Incident Detail Page
- ✅ Still accessible via direct URL
- ✅ Shows "Resolved" badge
- ✅ All data visible

## Troubleshooting

### Issue: Backend won't start
**Check logs**:
```bash
pm2 logs backend --lines 100
```

**Common causes**:
- Port already in use
- Database connection error
- TypeScript compilation error

**Fix**:
```bash
# Kill process on port 8080
lsof -i :8080
kill -9 <PID>

# Restart
pm2 restart backend
```

### Issue: Dashboard still shows resolved incident
**Possible causes**:
1. Backend not restarted
2. Browser cache
3. API not using new code

**Verify backend is using new code**:
```bash
cd apps/backend
grep -A 5 "notIn.*RESOLVED" src/services/incidents/incident.service.ts
```

**Expected**: Should find the new filtering code

**If NOT FOUND**: Code wasn't deployed. Repeat deployment steps.

### Issue: Can't view resolved incidents anymore
**This is expected behavior!**

To view resolved incidents, use explicit status filter:
- API: `?status=RESOLVED`
- Or create a separate "Resolved Incidents" view in the UI

## Success Criteria

✅ Backend builds successfully
✅ Backend restarts without errors
✅ Dashboard no longer shows resolved incidents
✅ API returns only active incidents by default
✅ Explicit status filter still works

## Summary

**The Problem**: Backend API returned ALL incidents, including RESOLVED ones
**The Fix**: Backend now excludes RESOLVED/EXPIRED/SUPPRESSED by default
**Action Required**: Deploy backend immediately

**Deploy the backend and the issue will be resolved!**
