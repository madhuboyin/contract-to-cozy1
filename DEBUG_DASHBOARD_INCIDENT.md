# Debug: Dashboard Still Showing Resolved Incident

## Problem
Dashboard shows "Freeze Risk Detected" even though the incident detail page shows "Resolved" badge.

## Evidence from Screenshots
1. **Incident Detail Page**: Shows "Resolved" badge (green) ✅
2. **Dashboard Page**: Shows "Freeze Risk Detected" in Priority alert ❌

## Possible Causes

### 1. Frontend Code Not Deployed
The dashboard filtering code may not have been deployed.

**Check**:
```bash
cd apps/frontend
grep -n "isTerminalState" src/app/\(dashboard\)/dashboard/page.tsx
```

**Expected**: Should find the line with `isTerminalState` check around line 280-290

**If NOT FOUND**: The code wasn't deployed. Redeploy:
```bash
npm run build
pm2 restart frontend
```

### 2. Browser Cache
The browser may be serving cached JavaScript.

**Fix**:
1. Hard refresh: `Cmd + Shift + R` (Mac) or `Ctrl + Shift + R` (Windows)
2. Clear cache: DevTools → Application → Clear storage
3. Try incognito/private window

### 3. Incident Status Mismatch
The incident may show "Resolved" badge but have a different status in the database.

**Check Database**:
```sql
SELECT 
  id,
  title,
  status,
  severity,
  createdAt,
  resolvedAt,
  EXTRACT(DAY FROM (NOW() - createdAt)) as age_in_days
FROM "Incident"
WHERE title LIKE '%Freeze Risk%'
  AND propertyId = 'f27f66e8-9c22-406b-aeef-f67c98681768'
ORDER BY createdAt DESC
LIMIT 1;
```

**Expected**: `status = 'RESOLVED'`

**If NOT RESOLVED**: Manually resolve it:
```sql
UPDATE "Incident"
SET status = 'RESOLVED', resolvedAt = NOW()
WHERE id = '<incident_id>';
```

### 4. API Response Caching
The incidents API may be returning cached data.

**Check API Response**:
1. Open browser DevTools (F12)
2. Go to Network tab
3. Refresh dashboard
4. Find request: `GET /api/properties/{propertyId}/incidents`
5. Check response body

**Expected**: Should NOT include incidents with `status: 'RESOLVED'`

**If RESOLVED incidents in response**: Backend filtering not working

### 5. React State Not Updating
The dashboard component may be using stale state.

**Fix**:
1. Click "Run full scan" button on dashboard
2. This should force a fresh data fetch
3. Check if incident disappears

## Step-by-Step Debugging

### Step 1: Verify Incident Status
Run this SQL query:

```sql
SELECT id, title, status, resolvedAt 
FROM "Incident" 
WHERE title LIKE '%Freeze Risk%' 
  AND propertyId = 'f27f66e8-9c22-406b-aeef-f67c98681768'
ORDER BY createdAt DESC 
LIMIT 1;
```

**Result**: 
- If `status = 'RESOLVED'` → Go to Step 2
- If `status != 'RESOLVED'` → Manually resolve it, then refresh dashboard

### Step 2: Check API Response
1. Open dashboard in browser
2. Open DevTools (F12) → Network tab
3. Refresh page
4. Find: `GET /api/properties/{propertyId}/incidents`
5. Click on it → Preview tab
6. Look at `items` array

**Check**:
- Does it include the Freeze Risk incident?
- What is the `status` field value?

**If incident is in response with status='RESOLVED'**:
- Backend filtering is not working
- The dashboard code changes weren't deployed to backend

**If incident is NOT in response**:
- Backend filtering is working ✅
- Frontend is using cached data → Go to Step 3

### Step 3: Clear Frontend Cache
```bash
cd apps/frontend

# Clear Next.js cache
rm -rf .next

# Rebuild
npm run build

# Restart
pm2 restart frontend
```

### Step 4: Clear Browser Cache
1. Open DevTools (F12)
2. Right-click refresh button
3. Select "Empty Cache and Hard Reload"
4. OR open incognito/private window

### Step 5: Force Data Refresh
On the dashboard:
1. Click "Run full scan" button
2. Wait for it to complete
3. Check if incident disappears

## Quick Fix Script

Run this to force a complete refresh:

```bash
# 1. Clear frontend cache and rebuild
cd apps/frontend
rm -rf .next
npm run build
pm2 restart frontend

# 2. Clear browser cache
# (Do this manually in browser)

# 3. Verify incident status in database
psql -d your_database -c "
SELECT id, title, status, resolvedAt 
FROM \"Incident\" 
WHERE title LIKE '%Freeze Risk%' 
ORDER BY createdAt DESC 
LIMIT 1;
"
```

## Expected Behavior After Fix

### Dashboard Should Show:
- ✅ "Priority actions: 0" (if no other incidents)
- ✅ No "Freeze Risk Detected" card
- ✅ Only active incidents (not RESOLVED/SUPPRESSED/EXPIRED)

### Incident Detail Page Should Show:
- ✅ "Resolved" badge (green)
- ✅ No auto-resolution banners
- ✅ No age warning banners

## If Still Not Working

### Check Console for Errors
1. Open DevTools (F12) → Console tab
2. Look for errors related to:
   - API calls
   - React rendering
   - Data fetching

### Check Network Requests
1. DevTools → Network tab
2. Filter: XHR
3. Look for incidents API call
4. Check:
   - Status code (should be 200)
   - Response data
   - Request headers

### Verify Code Deployment
```bash
# Check if the fix is in the deployed code
cd apps/frontend
git log -1 --oneline

# Should show: "fix: filter resolved incidents from dashboard..."

# Check if the code is actually in the file
grep -A 10 "isTerminalState" src/app/\(dashboard\)/dashboard/page.tsx
```

## Most Likely Cause

Based on the symptoms, the most likely cause is:

**Browser cache is serving old JavaScript**

The incident detail page shows the new formatting (compact layout, no raw JSON), which means the frontend WAS deployed. But the dashboard logic might be cached.

**Solution**:
1. Hard refresh: `Cmd + Shift + R` (Mac) or `Ctrl + Shift + R` (Windows)
2. If that doesn't work, open incognito/private window
3. If that works, clear browser cache completely

## Alternative: Force Incident Resolution

If the incident is somehow not actually RESOLVED in the database:

```sql
-- Find the incident
SELECT id, status FROM "Incident" 
WHERE title LIKE '%Freeze Risk%' 
ORDER BY createdAt DESC 
LIMIT 1;

-- Force resolve it
UPDATE "Incident" 
SET status = 'RESOLVED', resolvedAt = NOW() 
WHERE id = '<incident_id_from_above>';

-- Verify
SELECT id, status, resolvedAt FROM "Incident" 
WHERE id = '<incident_id>';
```

Then refresh the dashboard.

## Summary

The incident detail page shows "Resolved" badge, which means:
- ✅ Frontend code is deployed
- ✅ Incident has resolved status (at least in the detail view)

But dashboard still shows it, which means:
- ❌ Dashboard is using cached data OR
- ❌ Dashboard filtering logic not applied OR
- ❌ API returning stale data

**Most likely fix**: Hard refresh browser (Cmd+Shift+R)
