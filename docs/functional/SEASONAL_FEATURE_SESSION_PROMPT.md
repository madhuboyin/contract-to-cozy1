# CONTRACT TO COZY - SEASONAL MAINTENANCE FEATURE CONTEXT

Use this prompt to brief a new Claude session about the seasonal maintenance feature implementation.

---

## SYSTEM CONTEXT

**Project:** Contract to Cozy - Property Management Platform  
**Tech Stack:** Next.js/React, Node.js/Express, PostgreSQL, Kubernetes (Raspberry Pi cluster)  
**Deployment:** Self-managed K8s, GitHub Container Registry, Cloudflare Tunnel  
**Current Status:** ✅ Core feature deployed, ❌ Task completion sync broken

---

## FEATURE OVERVIEW

**What We Built:**
A comprehensive seasonal maintenance system that automatically generates climate-specific home maintenance checklists for homeowners. Think "Mint.com for home maintenance" - proactive property intelligence rather than reactive service booking.

**Key Capabilities:**
- ✅ Automated checklist generation based on climate and season
- ✅ State-based climate detection (VERY_COLD, COLD, MODERATE, WARM, TROPICAL)
- ✅ Dashboard card showing current season critical tasks
- ✅ Full seasonal page with 3 tabs (Current Season, All Seasons, Completed)
- ✅ Detailed task modal with priority categorization (Critical/Recommended/Optional)
- ✅ "Add to my tasks" integration with Action Center
- ✅ Settings page for climate and notification preferences
- ✅ Worker cron jobs (1 AM expire, 2 AM generate, 9 AM notify)
- ✅ Email notification system (HTML templates ready)

**User Flow:**
1. Worker generates seasonal checklist (2 AM daily, 14 days before season)
2. User sees "6 Critical Tasks - Winter 2025" card on dashboard
3. User clicks "View Full Checklist" → lands on `/dashboard/seasonal?propertyId=xxx`
4. User clicks "View Details" → modal opens with tasks grouped by priority
5. User clicks "Add to my tasks" → creates Action Center item
6. User goes to Action Center → completes task
7. **❌ BROKEN:** Progress bar should update but doesn't

---

## DATABASE SCHEMA

### Core Tables Created

**1. `seasonal_checklists`** - Main checklist records
```sql
- id (PK)
- property_id (FK → properties)
- season (WINTER/SPRING/SUMMER/FALL)
- year (2025)
- climate_region (VERY_COLD/COLD/MODERATE/WARM/TROPICAL)
- season_start_date, season_end_date
- status (PENDING/IN_PROGRESS/COMPLETED/DISMISSED)
- total_tasks, tasks_added, tasks_completed
- generated_at, first_viewed_at, notification_sent_at, dismissed_at
- UNIQUE(property_id, season, year)
```

**2. `seasonal_checklist_items`** - Individual tasks
```sql
- id (PK)
- seasonal_checklist_id (FK → seasonal_checklists)
- seasonal_task_template_id (FK → templates)
- property_id (FK → properties)
- checklist_item_id (FK → checklist_items) -- Links to Action Center
- task_key (e.g., "WINTER_FURNACE_FILTER_CHANGE")
- title, description
- priority (CRITICAL/RECOMMENDED/OPTIONAL)
- status (RECOMMENDED/ADDED/COMPLETED/DISMISSED/SNOOZED)
- recommended_date, added_at, completed_at, dismissed_at, snoozed_until
```

**3. `seasonal_task_templates`** - Reusable task definitions (30+ seeded)
```sql
- id (PK)
- task_key (unique)
- season, title, description, why_it_matters
- typical_cost_min, typical_cost_max
- is_diy_possible, estimated_hours
- priority, service_category
- climate_regions (array: ['COLD', 'MODERATE'])
- timing_offset_days (-14 = generate 14 days before)
- recurrence_pattern, is_active
```

**4. `property_climate_settings`** - Per-property configuration
```sql
- id (PK)
- property_id (FK, unique)
- climate_region
- climate_region_source (AUTO_DETECTED/USER_SELECTED)
- notification_enabled (bool)
- notification_timing (STANDARD/EARLY/LATE)
- auto_generate_checklists (bool)
```

**Relationships:**
```
properties → seasonal_checklists → seasonal_checklist_items → seasonal_task_templates
                                                ↓
                                         checklist_items (Action Center)
```

---

## FILES CREATED/UPDATED

### Frontend (Next.js/React + TypeScript)

**Created:**
1. `apps/frontend/src/app/(dashboard)/dashboard/seasonal/page.tsx`
   - Main seasonal page with 3 tabs
   - **Critical fix:** `const propertyId = searchParams.get('propertyId') || selectedPropertyId;`
   - **Critical fix:** `const checklists = checklistsData?.checklists || [];` (NO .data!)
   - **Critical fix:** `const currentSeason = climateInfo?.currentSeason;` (NO .data!)

2. `apps/frontend/src/app/(dashboard)/dashboard/seasonal/settings/page.tsx`
   - Climate and notification settings page

3. `apps/frontend/src/components/seasonal/SeasonalChecklistModal.tsx`
   - Detailed task modal with priority tabs
   - **Critical fix:** `if (error || !data) return null;` then `const { checklist, tasks } = data;` (NO .data!)

4. `apps/frontend/src/components/seasonal/SeasonalTaskCard.tsx`
   - Individual task card with "Add to my tasks" button

5. `apps/frontend/src/components/dashboard/SeasonalChecklistCard.tsx`
   - Dashboard summary card

6. `apps/frontend/src/lib/hooks/useSeasonalChecklists.ts`
   - React Query hooks: useSeasonalChecklists, useSeasonalChecklistDetails, useClimateInfo, etc.

7. `apps/frontend/src/lib/api/seasonal.api.ts`
   - API client functions

8. `apps/frontend/src/lib/utils/seasonHelpers.ts`
   - Helper functions for formatting

9. `apps/frontend/src/types/seasonal.types.ts`
   - TypeScript definitions

**Updated:**
- `apps/frontend/src/app/(dashboard)/dashboard/page.tsx` - Added seasonal card

### Backend (Node.js/Express + Prisma)

**Created:**
1. `apps/backend/src/routes/seasonalChecklist.routes.ts`
   - Routes: GET /properties/:id/seasonal-checklists, GET /seasonal-checklists/:id, etc.

2. `apps/backend/src/controllers/seasonalChecklist.controller.ts`
   - Controllers for all seasonal operations

3. `apps/backend/src/services/seasonalChecklist.service.ts`
   - Business logic: generateChecklistForProperty, getSeasonalTaskTemplates, etc.

**Updated:**
- `apps/backend/src/index.ts` - Added route mounting: `app.use('/api', seasonalChecklistRoutes);`
- `apps/backend/prisma/schema.prisma` - Added 4 new models

### Workers (Background Jobs)

**Created:**
1. `apps/workers/src/jobs/seasonalChecklistGeneration.job.ts`
   - Runs daily 2 AM EST
   - **Fixed:** Range check (not exact day), state-based climate (no file), current season fallback

2. `apps/workers/src/jobs/seasonalNotification.job.ts`
   - Runs daily 9 AM EST
   - **Fixed:** Batch processing (25/batch), rate limiting (2s delay), HTML escaping

3. `apps/workers/src/jobs/seasonalChecklistExpiration.job.ts`
   - Runs daily 1 AM EST
   - Marks expired checklists as COMPLETED/IN_PROGRESS
   - Cleanup function: deletes 2+ year old data (monthly 1st at 2 AM)

**Updated:**
- `apps/workers/src/worker.ts` - Added cron scheduling with timezone and error handling

---

## KEY IMPLEMENTATION DETAILS

### Climate Detection Logic (No External APIs)
```javascript
const stateToClimate = {
  'AK': 'VERY_COLD', 'MN': 'VERY_COLD', 'ND': 'VERY_COLD', // etc.
  'MI': 'COLD', 'NY': 'COLD', 'PA': 'COLD', // etc.
  'NJ': 'MODERATE', 'MD': 'MODERATE', 'VA': 'MODERATE', // etc.
  'NC': 'WARM', 'SC': 'WARM', 'TX': 'WARM', // etc.
  'FL': 'TROPICAL', 'HI': 'TROPICAL', 'PR': 'TROPICAL'
};
```

### Task Generation Logic
1. Worker queries properties with `segment = 'EXISTING_OWNER'`
2. Detects climate from property.state
3. Gets templates where season matches AND climate in template.climate_regions
4. Creates checklist 14 days before season starts
5. Instantiates template tasks into seasonal_checklist_items

### Critical Frontend Data Access Pattern
❌ **WRONG:** `checklistsData?.data?.checklists`  
✅ **CORRECT:** `checklistsData?.checklists`

React Query hooks return unwrapped data, NOT `{success, data}` wrapper.

### Worker Cron Schedule
```
1:00 AM EST - Expire old checklists
2:00 AM EST - Generate new checklists  
9:00 AM EST - Send notification emails
2:00 AM EST (1st of month) - Delete 2+ year old data
```

---

## KNOWN ISSUES (CRITICAL)

### 🔴 Issue #1: Task Completion Sync Broken

**Problem:**
When user completes a seasonal task in Action Center, the seasonal checklist progress doesn't update.

**Evidence:**
```sql
-- After user completes 2 tasks:
SELECT 
  ci.status as action_status,
  sci.status as seasonal_status,
  sc.tasks_completed
FROM checklist_items ci
JOIN seasonal_checklist_items sci ON ci.id = sci.checklist_item_id
JOIN seasonal_checklists sc ON sci.seasonal_checklist_id = sc.id
WHERE ci.id = 'COMPLETED_TASK_ID';

-- Returns:
-- action_status: COMPLETED ✅
-- seasonal_status: ADDED ❌ (should be COMPLETED)
-- tasks_completed: 0 ❌ (should be 2)
```

**Root Cause:**
`completeChecklistItem` controller in `apps/backend/src/controllers/checklistItem.controller.ts` doesn't sync back to seasonal tables.

**Impact:**
- Progress bar always shows 0%
- Users can't track completion
- Feature feels broken

**Fix Required:**
```typescript
// In completeChecklistItem function:
const updatedItem = await prisma.checklistItem.update({
  where: { id },
  data: { status: 'COMPLETED', completedAt: new Date() },
  include: { seasonalChecklistItems: true }, // Add this
});

// Add this logic:
if (updatedItem.seasonalChecklistItems?.length > 0) {
  for (const seasonalItem of updatedItem.seasonalChecklistItems) {
    // Update seasonal item
    await prisma.seasonalChecklistItem.update({
      where: { id: seasonalItem.id },
      data: { status: 'COMPLETED', completedAt: new Date() }
    });
    
    // Increment counter
    await prisma.seasonalChecklist.update({
      where: { id: seasonalItem.seasonalChecklistId },
      data: { tasksCompleted: { increment: 1 } }
    });
  }
}
```

**Also need:** Uncomplete handler (decrement counter, revert status to ADDED)

---

### 🟡 Issue #2: React Query Cache Not Invalidating

**Problem:**
After completing task, returning to seasonal page shows stale progress.

**Fix:**
Add to completion mutation:
```typescript
onSuccess: () => {
  queryClient.invalidateQueries(['seasonal-checklists']);
  queryClient.invalidateQueries(['seasonal-checklist-details']);
}
```

---

### 🟡 Issue #3: No Settings Link on Seasonal Page

**Problem:**
Users can't navigate to settings from seasonal page.

**Fix:**
Add Settings button to page header (code provided in handoff doc).

---

## PENDING ENHANCEMENTS

### High Priority

**1. Uncomplete Task Flow**
- Allow unchecking completed tasks
- Decrement seasonal counter
- Revert seasonal item status to ADDED

**2. Task Snooze**
- UI: Snooze dropdown (1 day, 3 days, 1 week, 2 weeks)
- Backend: Update `snoozed_until` timestamp
- Worker: Un-snooze expired tasks

**3. Visual Confirmation After Adding Task**
- Show checkmark or success state in modal
- Prevent duplicate adds

### Medium Priority

**4. Task Notes/Comments**
- Schema: Add `notes` TEXT column to seasonal_checklist_items
- UI: Text area in task card

**5. Notification Timing Options**
- Implement EARLY (21 days), STANDARD (14 days), LATE (7 days)
- Currently all notifications at 14 days

**6. Service Provider Integration**
- "Book a Pro" button on tasks
- Pre-fill service request with task details

### Low Priority

**7. Task History & Analytics**
- Past checklists tab
- Completion rate trends
- Cost tracking per season

**8. Photo Upload for Completed Tasks**
- Before/after photos
- Requires file upload system

**9. Custom Tasks**
- Allow users to add own tasks
- Save as templates for next year

---

## FUTURE ENHANCEMENTS

**Long-term Ideas:**
- Gamification (badges, streaks, points)
- Home buyer segment integration (pre-move-in checklists)
- Multi-property aggregate view
- Family collaboration (assign tasks)
- Warranty tracking integration
- Budget planning with cost estimates
- Educational content (how-to guides)
- Weather-based urgent alerts
- Smart recommendations based on completion history
- Mobile push notifications

---

## DEPLOYMENT GUIDE

### Quick Deploy

**Backend:**
```bash
cd ~/git/contract-to-cozy1/apps/backend
npm run build
docker build -t ghcr.io/madhuboyina/contract-to-cozy-backend:latest .
docker push ghcr.io/madhuboyina/contract-to-cozy-backend:latest
kubectl rollout restart deployment backend -n production
```

**Workers:**
```bash
cd ~/git/contract-to-cozy1/apps/workers
npm run build
docker build -t ghcr.io/madhuboyina/contract-to-cozy-workers:latest .
docker push ghcr.io/madhuboyina/contract-to-cozy-workers:latest
kubectl rollout restart deployment workers -n production
```

**Frontend:**
```bash
cd ~/git/contract-to-cozy1/apps/frontend
npm run build
docker build -t ghcr.io/madhuboyina/contract-to-cozy-frontend:latest .
docker push ghcr.io/madhuboyina/contract-to-cozy-frontend:latest
kubectl rollout restart deployment frontend -n production
# Force cache clear:
kubectl delete pods -n production -l app=frontend
```

### Manual Trigger (Testing)
```bash
# Via API
curl -X POST https://api.contracttocozy.com/api/seasonal-checklists/generate \
  -H "Authorization: Bearer TOKEN"

# Or exec into worker pod
kubectl exec -it deployment/workers -n production -- sh
node dist/jobs/seasonalChecklistGeneration.job.js
```

---

## TESTING CHECKLIST

**After Any Deployment:**

✓ Visit dashboard → Seasonal card visible  
✓ Click "View Full Checklist" → Page loads  
✓ Current Season tab shows tasks  
✓ All Seasons tab shows tasks  
✓ Click "View Details" → Modal opens and stays open  
✓ Tasks grouped by Critical/Recommended/Optional  
✓ Click "Add to my tasks" → Success  
✓ Go to Action Center → Task appears  
✓ Complete task → Checkbox works  
✓ Return to seasonal page → **Progress should update (broken)**  
✓ Reload page (Cmd+Shift+R) → Page still works  
✓ Settings link → Opens settings page  
✓ Change climate → Saves successfully  

**Database Verification:**
```sql
-- Check checklists generated
SELECT season, year, COUNT(*) FROM seasonal_checklists GROUP BY season, year;

-- Check completion sync (should be empty after fix)
SELECT * FROM seasonal_checklist_items sci
JOIN checklist_items ci ON sci.checklist_item_id = ci.id
WHERE ci.status = 'COMPLETED' AND sci.status != 'COMPLETED';

-- Check worker ran today
SELECT * FROM seasonal_checklists 
WHERE generated_at > CURRENT_DATE 
ORDER BY generated_at DESC;
```

---

## DEBUGGING QUERIES

**Property Climate:**
```sql
SELECT p.name, p.state, pcs.climate_region, pcs.notification_enabled
FROM properties p
LEFT JOIN property_climate_settings pcs ON p.id = pcs.property_id
WHERE p.id = 'xxx';
```

**Checklist Tasks:**
```sql
SELECT sci.title, sci.priority, sci.status, sci.added_at, sci.completed_at,
       ci.id as action_id, ci.status as action_status
FROM seasonal_checklist_items sci
LEFT JOIN checklist_items ci ON sci.checklist_item_id = ci.id
WHERE sci.seasonal_checklist_id = 'xxx'
ORDER BY CASE sci.priority WHEN 'CRITICAL' THEN 1 WHEN 'RECOMMENDED' THEN 2 ELSE 3 END;
```

**Completion Sync Issue:**
```sql
SELECT ci.id, ci.title, ci.status as action_status,
       sci.status as seasonal_status, sc.tasks_completed
FROM checklist_items ci
JOIN seasonal_checklist_items sci ON ci.id = sci.checklist_item_id
JOIN seasonal_checklists sc ON sci.seasonal_checklist_id = sc.id
WHERE ci.status = 'COMPLETED' AND sci.status != 'COMPLETED';
-- This should return ZERO rows after fix!
```

---

## COMMON TROUBLESHOOTING

**"No checklists yet" on seasonal page:**
- Check: `property_climate_settings` exists for property
- Check: Worker has run (`generated_at` timestamps)
- Solution: Manually trigger generation

**Modal opens then closes:**
- Check: Browser console for errors
- Check: Data access pattern (no `.data.data`)
- Solution: Verify all hooks return unwrapped data

**Progress bar stuck at 0%:**
- Check: Completion sync (Issue #1)
- Solution: Apply backend fix to `completeChecklistItem`

**Worker jobs not running:**
- Check: `kubectl logs deployment/workers -n production | grep SEASONAL`
- Check: Timezone in cron config (`America/New_York`)
- Solution: Redeploy workers

**Emails not sending:**
- Check: `notification_enabled` in property_climate_settings
- Check: SMTP credentials in worker env vars
- Check: Worker logs for errors

---

## ARCHITECTURAL DECISIONS

**Why No External APIs:**
- Climate detection uses state-based lookup (no API costs/failures)
- All data self-contained in database
- No third-party dependencies for core feature

**Why Separate seasonal_checklist_items:**
- Allows customization per property (modify task, add notes)
- Links to Action Center without duplicating data
- Tracks per-property completion history

**Why Worker Jobs:**
- Automated generation ensures consistent experience
- Notifications at optimal time (9 AM)
- Cleanup prevents database bloat

**Why React Query:**
- Automatic caching and refetching
- Optimistic updates for better UX
- Centralized loading/error states

---

## DEVELOPER NOTES

**Frontend Patterns:**
```typescript
// ✅ CORRECT property ID handling
const searchParams = useSearchParams();
const { selectedPropertyId } = usePropertyContext();
const propertyId = searchParams.get('propertyId') || selectedPropertyId;

// ✅ CORRECT data access (no .data wrapper)
const checklists = checklistsData?.checklists || [];
const currentSeason = climateInfo?.currentSeason;

// ❌ WRONG (will break)
const checklists = checklistsData?.data?.checklists; // undefined!
```

**Backend Patterns:**
```typescript
// Always include seasonal link when updating checklist_items
const item = await prisma.checklistItem.update({
  where: { id },
  data: { /* ... */ },
  include: { seasonalChecklistItems: true } // Important!
});
```

**Worker Patterns:**
```typescript
// Always use try-catch per property
for (const property of properties) {
  try {
    await generateChecklist(property);
  } catch (error) {
    console.error(`Failed for ${property.id}:`, error);
    // Continue to next property
  }
}
```

---

## MADDY'S PREFERENCES

**Development Style:**
- Practical implementation over comprehensive docs
- Step-by-step guidance, not multiple options
- Focused fixes with clear deployment steps
- Minimal README overhead

**Code Review:**
- Prefer working solutions to perfect architecture
- Debug systematically: API → Frontend → Database
- Use kubectl + console logs for debugging
- Hard refresh after frontend deploys (cache issues)

**Communication:**
- Technical and detailed
- React Query specifics matter
- TypeScript type safety important
- Database-first thinking

---

## NEXT STEPS

**Immediate Priority:**
1. Fix task completion sync (Issue #1) - CRITICAL
2. Add cache invalidation (Issue #2)
3. Test completion flow end-to-end
4. Add Settings button to seasonal page

**This Week:**
1. Implement uncomplete flow
2. Add visual confirmation after adding task
3. Test email notifications when triggered

**This Month:**
1. Task snooze functionality
2. Service provider integration
3. Task history and analytics

---

## ENVIRONMENT INFO

**Production URLs:**
- Frontend: https://contracttocozy.com
- Backend API: https://api.contracttocozy.com
- Database: PostgreSQL on K8s cluster

**Tech Versions:**
- Next.js 14+
- React 18+
- Node.js 18+
- PostgreSQL 14+
- Prisma 5+

**Deployment:**
- Kubernetes on Raspberry Pi cluster
- Cloudflare Tunnel for external access
- GitHub Container Registry for images
- ConfigMaps for configuration

---

## SAMPLE DATA

**Test Property:**
- ID: `f27f66e8-9c22-406b-aeef-f67c98681768`
- Name: "Main Home"
- State: NJ (MODERATE climate)
- Current checklist: WINTER 2025, 4 tasks

**Test Checklist:**
- ID: `cmjoz3a03007rqpzv5sltkpb8`
- Season: WINTER 2025
- Tasks: 2 Critical, 2 Recommended, 0 Optional
- Status: 2 tasks added to Action Center, 0 completed

---

**END OF CONTEXT**

This document contains everything needed to continue development on the seasonal maintenance feature. The most critical issue is task completion sync (Issue #1), which breaks the core value proposition of progress tracking.

For detailed implementation guidance, refer to the full handoff document at `/mnt/user-data/outputs/SEASONAL_MAINTENANCE_HANDOFF.md`.
