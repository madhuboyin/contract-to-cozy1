# Deploy Frontend Fix - Step by Step

## Issue
Dashboard still showing "Freeze Risk" incident even though it's RESOLVED.

## Root Cause
The frontend code changes have been committed but **not deployed**. The running frontend application is still using the old code that doesn't filter out RESOLVED incidents.

## Solution: Deploy Frontend Changes

### Step 1: Navigate to Frontend Directory
```bash
cd apps/frontend
```

### Step 2: Pull Latest Changes (if not already done)
```bash
git pull origin main
```

### Step 3: Install Dependencies (if needed)
```bash
npm install
```

### Step 4: Build Frontend
```bash
npm run build
```

**Expected output**: Build should complete successfully without errors.

### Step 5: Restart Frontend Server

**Option A: Using PM2**
```bash
pm2 restart frontend
```

**Option B: Using npm**
```bash
# Stop current process (Ctrl+C if running in terminal)
# Then start:
npm run start
```

**Option C: Using Docker**
```bash
docker-compose restart frontend
```

### Step 6: Verify Frontend is Running
```bash
# Check if frontend is accessible
curl http://localhost:3000

# Check PM2 status (if using PM2)
pm2 status

# Check logs for errors
pm2 logs frontend --lines 50
```

### Step 7: Clear Browser Cache

**Option A: Hard Refresh**
- **Chrome/Edge**: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
- **Firefox**: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
- **Safari**: Cmd+Option+R (Mac)

**Option B: Clear Cache Manually**
1. Open browser DevTools (F12)
2. Right-click the refresh button
3. Select "Empty Cache and Hard Reload"

**Option C: Incognito/Private Window**
- Open a new incognito/private window
- Navigate to the dashboard
- This bypasses all cache

### Step 8: Verify Fix

1. **Navigate to Dashboard**
   - Go to: `http://localhost:3000/dashboard` (or your domain)

2. **Check Priority Alerts Section**
   - Should NOT see "Freeze Risk Detected" if incident is RESOLVED
   - Should only see active incidents

3. **Check Incident Detail Page**
   - Navigate to the incident detail page
   - Verify "Resolved" badge is showing
   - Verify no banners are visible

4. **Check Browser Console**
   - Open DevTools (F12)
   - Check Console tab for errors
   - Should see no errors related to incidents

## Verification Checklist

- [ ] Frontend build completed successfully
- [ ] Frontend server restarted
- [ ] Browser cache cleared (hard refresh)
- [ ] Dashboard loads without errors
- [ ] RESOLVED incidents do NOT show in priority alerts
- [ ] Only active incidents appear
- [ ] Incident detail page shows formatted data (no raw JSON)

## If Still Showing After Deployment

### Check 1: Verify Incident Status in Database
```sql
SELECT id, title, status, resolvedAt 
FROM "Incident" 
WHERE title LIKE '%Freeze Risk%' 
  AND propertyId = 'f27f66e8-9c22-406b-aeef-f67c98681768'
ORDER BY createdAt DESC 
LIMIT 1;
```

**Expected**: `status` should be `'RESOLVED'`

**If NOT RESOLVED**: The incident needs to be resolved first:
```sql
UPDATE "Incident" 
SET status = 'RESOLVED', resolvedAt = NOW() 
WHERE id = '<incident_id>';
```

### Check 2: Verify Frontend Code is Updated
```bash
# Check if the fix is in the deployed code
cd apps/frontend
grep -n "isTerminalState" src/app/\(dashboard\)/dashboard/page.tsx
```

**Expected**: Should find the line with `isTerminalState` check

**If NOT FOUND**: The code wasn't deployed. Repeat deployment steps.

### Check 3: Check API Response
Open browser DevTools → Network tab → Refresh dashboard → Look for incidents API call:

**Request**: `GET /api/properties/{propertyId}/incidents`

**Response**: Should NOT include incidents with `status: 'RESOLVED'`

**If RESOLVED incidents in response**: Backend filtering issue (shouldn't happen with our fix)

### Check 4: Clear All Caches
```bash
# Clear Next.js cache
cd apps/frontend
rm -rf .next
npm run build
pm2 restart frontend
```

## Common Issues

### Issue 1: "Build Failed"
**Solution**: Check for TypeScript errors
```bash
npm run type-check
```

### Issue 2: "Port Already in Use"
**Solution**: Kill the process using the port
```bash
# Find process on port 3000
lsof -i :3000

# Kill the process
kill -9 <PID>

# Restart
npm run start
```

### Issue 3: "Module Not Found"
**Solution**: Reinstall dependencies
```bash
rm -rf node_modules package-lock.json
npm install
npm run build
```

### Issue 4: "Still Showing Old Code"
**Solution**: 
1. Check if you're on the correct branch: `git branch`
2. Check if latest commit is deployed: `git log -1`
3. Verify build is using latest code: `cat .next/BUILD_ID`

## Success Criteria

✅ Dashboard loads successfully
✅ No RESOLVED incidents in priority alerts
✅ Only active incidents visible
✅ Incident detail page shows formatted data
✅ No errors in browser console
✅ No errors in server logs

## Rollback (If Needed)

If deployment causes issues:

```bash
cd apps/frontend

# Checkout previous commit
git checkout HEAD~1

# Rebuild
npm run build

# Restart
pm2 restart frontend
```

## Summary

The fix is in the code, but you need to:
1. **Build** the frontend with the new code
2. **Restart** the frontend server
3. **Clear** browser cache

After these steps, RESOLVED incidents will no longer appear on the dashboard.
