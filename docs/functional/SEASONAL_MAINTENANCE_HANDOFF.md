# Contract to Cozy - Seasonal Maintenance Feature Handoff Document

## Project Overview

**Feature:** Seasonal Maintenance System  
**Product:** Contract to Cozy - Property Management Platform  
**Tech Stack:** Next.js/React (Frontend), Node.js/Express (Backend), PostgreSQL (Database), Kubernetes (Deployment)  
**Status:** 🟡 Core feature deployed, completion sync pending  
**Last Updated:** December 28, 2024

---

## Table of Contents

1. [Feature Overview](#feature-overview)
2. [Architecture & Data Flow](#architecture--data-flow)
3. [Database Schema](#database-schema)
4. [Files Created/Updated](#files-createdupdated)
5. [Implementation Status](#implementation-status)
6. [Known Issues](#known-issues)
7. [Pending Fixes (High Priority)](#pending-fixes-high-priority)
8. [Pending Enhancements](#pending-enhancements)
9. [Future Enhancements](#future-enhancements)
10. [Deployment Guide](#deployment-guide)
11. [Testing & Verification](#testing--verification)

---

## Feature Overview

### Purpose
Provide homeowners with automated, climate-specific seasonal maintenance checklists to prevent expensive home damage and maintain property value. Differentiates from service marketplaces by focusing on proactive property intelligence rather than just service booking.

### Key Features Implemented
- ✅ Automatic checklist generation based on climate region and season
- ✅ Climate-based task filtering (VERY_COLD, COLD, MODERATE, WARM, TROPICAL)
- ✅ State-based automatic climate detection (no external APIs)
- ✅ Dashboard card showing current season tasks
- ✅ Full seasonal maintenance page with tabs (Current Season, All Seasons, Completed)
- ✅ Detailed task modal with priority-based categorization
- ✅ Integration with Action Center ("Add to my tasks" workflow)
- ✅ Settings page for climate and notification preferences
- ✅ Worker cron jobs for automated generation, notifications, and cleanup
- ✅ Email notification system (scheduled but not yet triggered)

### User Segments Served
- **EXISTING_OWNER:** Current homeowners - receive automated seasonal checklists
- **HOME_BUYER:** Not included in seasonal feature (future consideration)

---

## Architecture & Data Flow

### High-Level Flow

```
[Cron Job] → [Generation Worker] → [Create Checklist + Items] → [Database]
                                                                      ↓
[User] → [Dashboard] → [View Checklist] → [Add to Action Center] → [Complete Task]
                                                                      ↓
                                                              [Update Progress] ❌ BROKEN
```

### Component Interaction

```
Frontend (Next.js/React)
├── Dashboard Card (shows current season summary)
├── Seasonal Page (full checklist view with tabs)
├── Seasonal Modal (detailed task view)
└── Settings Page (climate & notification config)

Backend (Node.js/Express)
├── Routes: /api/seasonal-checklists/*
├── Routes: /api/properties/:id/climate
└── Controllers: Handle CRUD operations

Workers (Background Jobs)
├── Generation Job (2 AM EST daily) - Creates checklists
├── Notification Job (9 AM EST daily) - Sends emails
├── Expiration Job (1 AM EST daily) - Cleans up old checklists
└── Cleanup Job (1st of month 2 AM EST) - Removes 2+ year old data

Database (PostgreSQL)
├── seasonal_checklists (main checklist records)
├── seasonal_checklist_items (individual tasks)
├── seasonal_task_templates (reusable task definitions)
└── property_climate_settings (per-property config)
```

### Data Flow Details

**1. Checklist Generation (Automated)**
```
Worker runs daily at 2 AM EST
  ↓
Queries all EXISTING_OWNER properties
  ↓
For each property:
  - Detect climate region (state-based)
  - Check if current season checklist exists
  - Check if next season needs generation (14 days before)
  ↓
Generate checklist with climate-filtered tasks
  ↓
Store in seasonal_checklists + seasonal_checklist_items
```

**2. User Interaction Flow**
```
User views dashboard
  ↓
Dashboard card shows: "6 Critical Tasks - Winter 2025"
  ↓
User clicks "View Full Checklist"
  ↓
Seasonal page loads with current season tab active
  ↓
User clicks "View Details" on checklist
  ↓
Modal opens showing tasks by priority:
  - Critical (red)
  - Recommended (orange)
  - Optional (green)
  ↓
User clicks "Add to my tasks" on a task
  ↓
Creates checklist_item in Action Center
Links via seasonal_checklist_items.checklist_item_id
Updates seasonal_checklist_items.status = "ADDED"
  ↓
User goes to Action Center (/dashboard/actions)
  ↓
Completes task by checking box
  ↓
❌ BROKEN: Should update seasonal progress but doesn't
```

---

## Database Schema

### Core Tables

#### `seasonal_checklists`
Main checklist record per property/season/year.

```sql
CREATE TABLE seasonal_checklists (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id),
  season TEXT NOT NULL, -- WINTER, SPRING, SUMMER, FALL
  year INTEGER NOT NULL,
  climate_region TEXT NOT NULL, -- VERY_COLD, COLD, MODERATE, WARM, TROPICAL
  season_start_date TIMESTAMP NOT NULL,
  season_end_date TIMESTAMP NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING, IN_PROGRESS, COMPLETED, DISMISSED
  total_tasks INTEGER NOT NULL DEFAULT 0,
  tasks_added INTEGER NOT NULL DEFAULT 0,
  tasks_completed INTEGER NOT NULL DEFAULT 0,
  generated_at TIMESTAMP NOT NULL,
  first_viewed_at TIMESTAMP,
  notification_sent_at TIMESTAMP,
  dismissed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL,
  
  UNIQUE(property_id, season, year)
);

CREATE INDEX idx_seasonal_checklists_property ON seasonal_checklists(property_id);
CREATE INDEX idx_seasonal_checklists_status ON seasonal_checklists(status);
CREATE INDEX idx_seasonal_checklists_season ON seasonal_checklists(season, year);
```

#### `seasonal_checklist_items`
Individual tasks within a checklist.

```sql
CREATE TABLE seasonal_checklist_items (
  id TEXT PRIMARY KEY,
  seasonal_checklist_id TEXT NOT NULL REFERENCES seasonal_checklists(id) ON DELETE CASCADE,
  seasonal_task_template_id TEXT NOT NULL REFERENCES seasonal_task_templates(id),
  property_id TEXT NOT NULL REFERENCES properties(id),
  checklist_item_id TEXT REFERENCES checklist_items(id), -- Link to Action Center
  task_key TEXT NOT NULL, -- e.g., "WINTER_FURNACE_FILTER_CHANGE"
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL, -- CRITICAL, RECOMMENDED, OPTIONAL
  status TEXT NOT NULL DEFAULT 'RECOMMENDED', -- RECOMMENDED, ADDED, COMPLETED, DISMISSED, SNOOZED
  recommended_date TIMESTAMP NOT NULL,
  added_at TIMESTAMP,
  completed_at TIMESTAMP,
  dismissed_at TIMESTAMP,
  snoozed_until TIMESTAMP,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL
);

CREATE INDEX idx_seasonal_items_checklist ON seasonal_checklist_items(seasonal_checklist_id);
CREATE INDEX idx_seasonal_items_property ON seasonal_checklist_items(property_id);
CREATE INDEX idx_seasonal_items_status ON seasonal_checklist_items(status);
CREATE INDEX idx_seasonal_items_action ON seasonal_checklist_items(checklist_item_id);
```

#### `seasonal_task_templates`
Reusable task definitions that get instantiated into checklists.

```sql
CREATE TABLE seasonal_task_templates (
  id TEXT PRIMARY KEY,
  task_key TEXT UNIQUE NOT NULL,
  season TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  why_it_matters TEXT,
  typical_cost_min DECIMAL(10,2),
  typical_cost_max DECIMAL(10,2),
  is_diy_possible BOOLEAN DEFAULT true,
  estimated_hours DECIMAL(4,1),
  priority TEXT NOT NULL, -- CRITICAL, RECOMMENDED, OPTIONAL
  service_category TEXT, -- HVAC, PLUMBING, ELECTRICAL, etc.
  climate_regions TEXT[] NOT NULL, -- Array: ['COLD', 'MODERATE']
  required_asset_type TEXT,
  required_asset_check TEXT,
  timing_offset_days INTEGER DEFAULT -14, -- Days before season to generate
  recurrence_pattern TEXT DEFAULT 'ANNUAL',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL
);

CREATE INDEX idx_templates_season ON seasonal_task_templates(season);
CREATE INDEX idx_templates_priority ON seasonal_task_templates(priority);
CREATE INDEX idx_templates_active ON seasonal_task_templates(is_active);
```

#### `property_climate_settings`
Per-property climate and notification configuration.

```sql
CREATE TABLE property_climate_settings (
  id TEXT PRIMARY KEY,
  property_id TEXT UNIQUE NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  climate_region TEXT NOT NULL,
  climate_region_source TEXT NOT NULL, -- AUTO_DETECTED, USER_SELECTED
  notification_enabled BOOLEAN DEFAULT true,
  notification_timing TEXT DEFAULT 'STANDARD', -- STANDARD, EARLY, LATE
  auto_generate_checklists BOOLEAN DEFAULT true,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL
);

CREATE INDEX idx_climate_settings_property ON property_climate_settings(property_id);
```

### Relationships

```
properties
  ↓ (1:N)
seasonal_checklists
  ↓ (1:N)
seasonal_checklist_items
  ↓ (N:1)
seasonal_task_templates

seasonal_checklist_items
  ↓ (1:1)
checklist_items (Action Center)
```

### Sample Data

**Template Example:**
```json
{
  "taskKey": "WINTER_FURNACE_FILTER_CHANGE",
  "season": "WINTER",
  "title": "Replace furnace filters monthly",
  "description": "Check and replace HVAC filters every month during peak heating season",
  "whyItMatters": "Dirty filters reduce efficiency and can cause furnace failure in extreme cold.",
  "typicalCostMin": 15,
  "typicalCostMax": 40,
  "isDiyPossible": true,
  "estimatedHours": 0.3,
  "priority": "CRITICAL",
  "serviceCategory": "HVAC",
  "climateRegions": ["VERY_COLD", "COLD", "MODERATE"]
}
```

**Climate Detection Logic:**
```javascript
const stateToClimate = {
  'AK': 'VERY_COLD', 'MN': 'VERY_COLD', 'ND': 'VERY_COLD', 'SD': 'VERY_COLD',
  'WI': 'VERY_COLD', 'MT': 'VERY_COLD', 'WY': 'VERY_COLD', 'ME': 'VERY_COLD',
  'VT': 'VERY_COLD', 'NH': 'VERY_COLD', 'MI': 'COLD', 'NY': 'COLD',
  'PA': 'COLD', 'MA': 'COLD', 'CT': 'COLD', 'RI': 'COLD', 'OH': 'COLD',
  'IN': 'COLD', 'IL': 'COLD', 'IA': 'COLD', 'NE': 'COLD', 'ID': 'COLD',
  'NJ': 'MODERATE', 'MD': 'MODERATE', 'DE': 'MODERATE', 'WV': 'MODERATE',
  'VA': 'MODERATE', 'KY': 'MODERATE', 'MO': 'MODERATE', 'KS': 'MODERATE',
  'CO': 'MODERATE', 'UT': 'MODERATE', 'NV': 'MODERATE', 'OR': 'MODERATE',
  'WA': 'MODERATE', 'NC': 'WARM', 'SC': 'WARM', 'TN': 'WARM', 'AR': 'WARM',
  'OK': 'WARM', 'NM': 'WARM', 'AZ': 'WARM', 'CA': 'WARM', 'GA': 'WARM',
  'AL': 'WARM', 'MS': 'WARM', 'LA': 'WARM', 'TX': 'WARM', 'FL': 'TROPICAL',
  'HI': 'TROPICAL', 'PR': 'TROPICAL'
};
```

---

## Files Created/Updated

### Frontend Files

#### **Created:**

**1. `apps/frontend/src/app/(dashboard)/dashboard/seasonal/page.tsx`**
- Main seasonal maintenance page
- Tabs: Current Season, All Seasons, Completed
- Shows checklists grouped by season/year
- Expandable cards with progress bars
- **Key Features:**
  - Uses `useSearchParams()` + `usePropertyContext()` for property ID
  - Filters checklists by active tab
  - Groups checklists by season-year
  - Opens modal on "View Details" click
- **Critical Code:**
  ```typescript
  const searchParams = useSearchParams();
  const { selectedPropertyId } = usePropertyContext();
  const propertyId = searchParams.get('propertyId') || selectedPropertyId;
  
  const checklists = checklistsData?.checklists || []; // No .data!
  const currentSeason = climateInfo?.currentSeason; // No .data!
  ```

**2. `apps/frontend/src/app/(dashboard)/dashboard/seasonal/settings/page.tsx`**
- Climate and notification settings
- Radio buttons for climate region selection
- Toggle switches for notifications and auto-generation
- Shows auto-detected climate with banner
- **Key Features:**
  - Climate region override
  - Notification enable/disable
  - Auto-generate checklists toggle
- **Critical Code:**
  ```typescript
  const propertyId = searchParams.get('propertyId') || selectedPropertyId;
  await updateSettingsMutation.mutateAsync({ propertyId, data: formData });
  ```

**3. `apps/frontend/src/components/seasonal/SeasonalChecklistModal.tsx`**
- Detailed task view modal
- Tabs: Critical, Recommended, Optional
- Progress bar showing completion
- "Add all critical tasks" button
- Individual task cards with "Add to my tasks" button
- **Key Features:**
  - Fetches full checklist details
  - Groups tasks by priority
  - Shows "Why it matters" for critical tasks
  - Dismiss checklist option
- **Critical Code:**
  ```typescript
  if (error || !data) return null; // NOT data?.data!
  const { checklist, tasks } = data; // NOT data.data!
  ```

**4. `apps/frontend/src/components/seasonal/SeasonalTaskCard.tsx`**
- Individual task card component
- Shows title, description, why it matters
- Cost estimate range
- DIY indicator
- Estimated hours
- "Add to my tasks" button
- **Key Features:**
  - Priority-based styling
  - Service category badge
  - Handles add/remove from Action Center

**5. `apps/frontend/src/components/dashboard/SeasonalChecklistCard.tsx`**
- Dashboard summary card
- Shows current season and tasks
- Displays critical task count
- "View Full Checklist" link
- **Key Features:**
  - Compact view for dashboard
  - Shows only current season
  - Links to full seasonal page

**6. `apps/frontend/src/lib/hooks/useSeasonalChecklists.ts`**
- React Query hooks for seasonal data
- **Hooks:**
  - `useSeasonalChecklists(propertyId)` - Get all checklists for property
  - `useSeasonalChecklistDetails(checklistId)` - Get single checklist with tasks
  - `useClimateInfo(propertyId)` - Get climate and season info
  - `useUpdateClimateSettings()` - Update property climate settings
  - `useDismissChecklist()` - Dismiss a checklist
  - `useAddAllCriticalTasks()` - Add all critical tasks to Action Center

**7. `apps/frontend/src/lib/api/seasonal.api.ts`**
- API client functions
- **Functions:**
  - `fetchSeasonalChecklists(propertyId)`
  - `fetchSeasonalChecklistDetails(checklistId)`
  - `fetchClimateInfo(propertyId)`
  - `updateClimateSettings(propertyId, data)`
  - `dismissChecklist(checklistId)`
  - `addAllCriticalTasks(checklistId)`

**8. `apps/frontend/src/lib/utils/seasonHelpers.ts`**
- Helper functions for UI display
- **Functions:**
  - `getSeasonName(season)` - Format season name
  - `getSeasonIcon(season)` - Get emoji icon
  - `getSeasonColors(season)` - Get color scheme
  - `getClimateRegionName(region)` - Format climate name
  - `getClimateRegionIcon(region)` - Get emoji icon
  - `getCompletionPercentage(completed, total)` - Calculate %
  - `getProgressBarColor(percentage)` - Get color class
  - `formatDaysRemaining(days)` - Format time remaining

**9. `apps/frontend/src/types/seasonal.types.ts`**
- TypeScript type definitions
- **Types:**
  - `SeasonalChecklist` - Main checklist type
  - `SeasonalChecklistItem` - Individual task type
  - `SeasonalTaskTemplate` - Template type
  - `ClimateRegion` - Enum type
  - `Season` - Enum type
  - `SeasonalTaskPriority` - Enum type

#### **Updated:**

**10. `apps/frontend/src/app/(dashboard)/dashboard/page.tsx`**
- Added `<SeasonalChecklistCard />` component to dashboard

**11. `apps/frontend/src/app/(dashboard)/layout.tsx`**
- Wrapped with `<PropertyProvider>` if not already present

---

### Backend Files

#### **Created:**

**1. `apps/backend/src/routes/seasonalChecklist.routes.ts`**
- API routes for seasonal checklists
- **Routes:**
  ```typescript
  GET    /api/properties/:propertyId/seasonal-checklists
  GET    /api/seasonal-checklists/:checklistId
  GET    /api/properties/:propertyId/climate
  PUT    /api/properties/:propertyId/climate-settings
  POST   /api/seasonal-checklists/:checklistId/dismiss
  POST   /api/seasonal-checklists/:checklistId/add-all-critical
  POST   /api/seasonal-checklists/generate (manual trigger)
  ```

**2. `apps/backend/src/controllers/seasonalChecklist.controller.ts`**
- Business logic for seasonal operations
- **Functions:**
  - `getSeasonalChecklists(req, res)` - Get all checklists for property
  - `getSeasonalChecklistDetails(req, res)` - Get single checklist with tasks
  - `getClimateInfo(req, res)` - Get climate and season info
  - `updateClimateSettings(req, res)` - Update property settings
  - `dismissChecklist(req, res)` - Mark checklist as dismissed
  - `addAllCriticalTasks(req, res)` - Add all critical to Action Center
  - `generateChecklistManually(req, res)` - Manual generation endpoint

**3. `apps/backend/src/services/seasonalChecklist.service.ts`**
- Core service layer
- **Functions:**
  - `generateChecklistForProperty(propertyId, season, year, climateRegion)`
  - `getSeasonalTaskTemplates(season, climateRegion)`
  - `calculateSeasonDates(season, year)`
  - `getCurrentSeason()`
  - `getNextSeason(currentSeason)`

#### **Updated:**

**4. `apps/backend/src/index.ts`**
- Added route mounting:
  ```typescript
  app.use('/api', seasonalChecklistRoutes);
  ```

**5. `apps/backend/prisma/schema.prisma`**
- Added models:
  - `SeasonalChecklist`
  - `SeasonalChecklistItem`
  - `SeasonalTaskTemplate`
  - `PropertyClimateSetting`

---

### Worker Files

#### **Created:**

**1. `apps/workers/src/jobs/seasonalChecklistGeneration.job.ts`**
- Automated checklist generation
- **Logic:**
  - Runs daily at 2 AM EST
  - Finds all EXISTING_OWNER properties
  - Auto-detects climate region from state
  - Creates property_climate_settings if not exists
  - Generates current season checklist if missing
  - Generates next season checklist 14 days before
  - Filters tasks by climate region
- **Critical Fixes Applied:**
  - ✅ Range check instead of exact day match
  - ✅ State-based climate detection (no external file)
  - ✅ Current season fallback
  - ✅ Per-property error handling

**2. `apps/workers/src/jobs/seasonalNotification.job.ts`**
- Email notification system
- **Logic:**
  - Runs daily at 9 AM EST
  - Finds PENDING checklists not yet notified
  - Filters by notification_enabled = true
  - Sends beautiful HTML emails with task breakdown
  - Marks as notified
- **Email Content:**
  - Season header with emoji
  - Days until season starts
  - Critical tasks (red) with "Why it matters"
  - Recommended tasks (orange)
  - Optional tasks (green)
  - Links to checklist and settings
- **Enhancements Applied:**
  - ✅ Batch processing (25 emails per batch)
  - ✅ Rate limiting (2s delay between batches)
  - ✅ HTML escaping for security

**3. `apps/workers/src/jobs/seasonalChecklistExpiration.job.ts`**
- Cleanup expired checklists
- **Logic:**
  - Runs daily at 1 AM EST
  - Finds checklists past seasonEndDate
  - Updates status: 100% complete → COMPLETED
  - Updates status: <100% complete → IN_PROGRESS
  - Logs analytics
- **Additional Function:**
  - `cleanupOldSeasonalChecklists()` - Deletes 2+ year old checklists
  - Scheduled: Monthly on 1st at 2 AM EST

#### **Updated:**

**4. `apps/workers/src/worker.ts`**
- Added cron job scheduling
- **Schedule:**
  ```typescript
  // Fixed with timezone and error handling
  cron.schedule('0 1 * * *', expireSeasonalChecklists, { 
    timezone: 'America/New_York' 
  });
  cron.schedule('0 2 * * *', generateSeasonalChecklists, { 
    timezone: 'America/New_York' 
  });
  cron.schedule('0 9 * * *', sendSeasonalNotifications, { 
    timezone: 'America/New_York' 
  });
  cron.schedule('0 2 1 * *', cleanupOldSeasonalChecklists, { 
    timezone: 'America/New_York' 
  });
  ```

---

### Database Migration Files

**Created:**
- Migration for `seasonal_checklists` table
- Migration for `seasonal_checklist_items` table
- Migration for `seasonal_task_templates` table
- Migration for `property_climate_settings` table
- Seed data for seasonal_task_templates (30+ tasks)

---

## Implementation Status

### ✅ Completed Features

1. **Database Schema**
   - ✅ All tables created with proper indexes
   - ✅ Relationships established
   - ✅ Seed data loaded (30+ task templates)

2. **Backend API**
   - ✅ All endpoints functional
   - ✅ Controllers and services implemented
   - ✅ Climate detection logic
   - ✅ Task filtering by climate region
   - ✅ Manual generation endpoint

3. **Frontend UI**
   - ✅ Dashboard card
   - ✅ Seasonal maintenance page (3 tabs)
   - ✅ Detailed task modal
   - ✅ Settings page
   - ✅ All components styled and functional
   - ✅ URL param support for page reload

4. **Worker Jobs**
   - ✅ Generation job (with all bug fixes)
   - ✅ Notification job (with rate limiting)
   - ✅ Expiration job
   - ✅ Cleanup job
   - ✅ Proper cron scheduling with timezone

5. **Integration**
   - ✅ "Add to my tasks" creates Action Center item
   - ✅ Tasks appear in Action Center
   - ✅ React Query hooks and caching

### 🟡 Partially Working

1. **Task Completion Flow**
   - ✅ Tasks can be added to Action Center
   - ✅ Tasks can be completed in Action Center
   - ❌ Completion doesn't update seasonal progress
   - ❌ Progress bar doesn't refresh

2. **Email Notifications**
   - ✅ Job scheduled and runs daily
   - ✅ Email HTML template created
   - 🟡 Not yet triggered (no properties have reached 14-day window)
   - 🟡 Not tested in production

---

## Known Issues

### 🔴 Critical Issues

**1. Task Completion Sync Broken**
- **Issue:** Completing a task in Action Center doesn't update seasonal checklist progress
- **Impact:** Users complete tasks but progress bar stays at 0%, defeating the purpose
- **Root Cause:** `completeChecklistItem` controller doesn't update:
  - `seasonal_checklist_items.status` → Should become "COMPLETED"
  - `seasonal_checklist_items.completed_at` → Should get timestamp
  - `seasonal_checklists.tasks_completed` → Should increment
- **Evidence:**
  ```sql
  -- After completing 2 tasks:
  SELECT status FROM seasonal_checklist_items WHERE checklist_item_id IS NOT NULL;
  -- Returns: "ADDED" (should be "COMPLETED")
  
  SELECT tasks_completed FROM seasonal_checklists WHERE id = 'xxx';
  -- Returns: 0 (should be 2)
  ```
- **Fix Location:** `apps/backend/src/controllers/checklistItem.controller.ts`
- **Fix Required:** See [Pending Fixes](#pending-fixes-high-priority) section

---

### 🟡 Medium Priority Issues

**2. Frontend Cache Not Invalidating**
- **Issue:** After completing a task, returning to seasonal page shows stale data
- **Impact:** Must manually refresh page to see updated progress
- **Root Cause:** React Query cache not invalidated on task completion
- **Fix:** Add `queryClient.invalidateQueries(['seasonal-checklists'])` after completion

**3. React Query Response Unwrapping Inconsistency**
- **Issue:** Some hooks return `{data: {...}}` while others return just `{...}`
- **Impact:** Confusion about data access pattern, potential bugs
- **Evidence:**
  - `checklistsData?.checklists` (correct) vs `checklistsData?.data?.checklists` (wrong)
  - `climateInfo?.currentSeason` (correct) vs `climateInfo?.data?.currentSeason` (wrong)
- **Fix:** Standardize all API client functions to return unwrapped data

**4. No Settings Link on Seasonal Page**
- **Issue:** Users can't access settings from seasonal page
- **Impact:** Must manually type URL or navigate from dashboard
- **Fix:** Add Settings button to seasonal page header (partially done)

---

### 🟢 Low Priority Issues

**5. Notification Timing Not Configurable**
- **Issue:** "Notification timing" setting exists but isn't used
- **Impact:** All users get notifications 14 days before season
- **Fix:** Implement EARLY (21 days), STANDARD (14 days), LATE (7 days) logic

**6. No Visual Indication of Added Tasks**
- **Issue:** After adding task, no confirmation shown in modal
- **Impact:** Users might add same task multiple times
- **Fix:** Change button state after adding, show checkmark

**7. Climate Region Icons Could Be Better**
- **Issue:** Some climate regions use generic emojis
- **Impact:** Minor UX issue
- **Fix:** Find better icons or add custom SVGs

---

## Pending Fixes (High Priority)

### Fix #1: Task Completion Sync

**File:** `apps/backend/src/controllers/checklistItem.controller.ts`

**Current Code (Broken):**
```typescript
export async function completeChecklistItem(req: Request, res: Response) {
  try {
    const { id } = req.params;
    
    const updatedItem = await prisma.checklistItem.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
      },
    });

    res.json({ success: true, data: updatedItem });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to complete item' });
  }
}
```

**Fixed Code:**
```typescript
export async function completeChecklistItem(req: Request, res: Response) {
  try {
    const { id } = req.params;
    
    // Mark the checklist item as complete and include seasonal link
    const updatedItem = await prisma.checklistItem.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
      },
      include: {
        seasonalChecklistItems: true,
      },
    });

    // If this task is linked to a seasonal checklist, update it
    if (updatedItem.seasonalChecklistItems && updatedItem.seasonalChecklistItems.length > 0) {
      for (const seasonalItem of updatedItem.seasonalChecklistItems) {
        // Update the seasonal item status
        await prisma.seasonalChecklistItem.update({
          where: { id: seasonalItem.id },
          data: {
            status: 'COMPLETED',
            completedAt: new Date(),
          },
        });

        // Increment the seasonal checklist counter
        await prisma.seasonalChecklist.update({
          where: { id: seasonalItem.seasonalChecklistId },
          data: {
            tasksCompleted: { increment: 1 },
          },
        });

        console.log(`✅ Updated seasonal checklist ${seasonalItem.seasonalChecklistId}: tasks_completed++`);
      }
    }

    res.json({ success: true, data: updatedItem });
  } catch (error) {
    console.error('Error completing checklist item:', error);
    res.status(500).json({ success: false, error: 'Failed to complete item' });
  }
}
```

**Also Need to Handle Uncomplete:**
```typescript
export async function uncompleteChecklistItem(req: Request, res: Response) {
  try {
    const { id } = req.params;
    
    // Get item with seasonal link before updating
    const item = await prisma.checklistItem.findUnique({
      where: { id },
      include: { seasonalChecklistItems: true },
    });

    // Mark as incomplete
    const updatedItem = await prisma.checklistItem.update({
      where: { id },
      data: {
        status: 'PENDING',
        completedAt: null,
      },
    });

    // Update seasonal items if linked
    if (item?.seasonalChecklistItems && item.seasonalChecklistItems.length > 0) {
      for (const seasonalItem of item.seasonalChecklistItems) {
        // Revert seasonal item status
        await prisma.seasonalChecklistItem.update({
          where: { id: seasonalItem.id },
          data: {
            status: 'ADDED',
            completedAt: null,
          },
        });

        // Decrement the seasonal checklist counter
        await prisma.seasonalChecklist.update({
          where: { id: seasonalItem.seasonalChecklistId },
          data: {
            tasksCompleted: { decrement: 1 },
          },
        });
      }
    }

    res.json({ success: true, data: updatedItem });
  } catch (error) {
    console.error('Error uncompleting checklist item:', error);
    res.status(500).json({ success: false, error: 'Failed to uncomplete item' });
  }
}
```

**Testing Steps:**
1. Deploy backend with fix
2. Add a seasonal task to Action Center
3. Complete it in Action Center
4. Run query:
   ```sql
   SELECT 
     sci.status as seasonal_status,
     sci.completed_at,
     sc.tasks_completed
   FROM seasonal_checklist_items sci
   JOIN seasonal_checklists sc ON sci.seasonal_checklist_id = sc.id
   WHERE sci.checklist_item_id = 'COMPLETED_TASK_ID';
   ```
5. Should show: `seasonal_status: COMPLETED`, `completed_at: <timestamp>`, `tasks_completed: 1`
6. Go to seasonal page → Progress bar should show updated percentage

---

### Fix #2: React Query Cache Invalidation

**File:** `apps/frontend/src/lib/hooks/useChecklistItems.ts` (or wherever completion mutation is)

**Add to completion mutation:**
```typescript
const completeMutation = useMutation({
  mutationFn: (itemId: string) => apiClient.post(`/api/checklist-items/${itemId}/complete`),
  onSuccess: () => {
    // Invalidate checklist items
    queryClient.invalidateQueries(['checklist-items']);
    
    // Invalidate seasonal checklists (IMPORTANT!)
    queryClient.invalidateQueries(['seasonal-checklists']);
    queryClient.invalidateQueries(['seasonal-checklist-details']);
    
    // Show success toast
    toast.success('Task completed!');
  },
});
```

---

### Fix #3: Add Settings Button to Seasonal Page

**File:** `apps/frontend/src/app/(dashboard)/dashboard/seasonal/page.tsx`

**At top of file, add imports:**
```typescript
import { useRouter } from 'next/navigation';
import { Settings } from 'lucide-react';
```

**In component, add router:**
```typescript
export default function SeasonalMaintenancePage() {
  const router = useRouter();
  // ... rest of state
```

**Update header section (around line 93):**
```typescript
{/* Header */}
<div className="mb-8">
  <div className="flex items-center justify-between">
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Seasonal Maintenance</h1>
      <p className="text-gray-600">
        Stay on top of seasonal home maintenance tasks tailored to your climate
      </p>
    </div>
    <button
      onClick={() => router.push(`/dashboard/seasonal/settings?propertyId=${propertyId}`)}
      className="flex items-center space-x-2 px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
    >
      <Settings className="w-4 h-4" />
      <span>Settings</span>
    </button>
  </div>
</div>
```

---

## Pending Enhancements

### Enhancement #1: Uncomplete Task Flow

**Priority:** Medium  
**Effort:** Low  
**Description:** Allow users to uncheck completed tasks in Action Center and sync back to seasonal

**Required Changes:**
1. Add uncomplete endpoint to backend (see Fix #1)
2. Update Action Center checkbox to call uncomplete
3. Decrement `tasks_completed` counter
4. Update seasonal item status back to "ADDED"

---

### Enhancement #2: Task Snooze Functionality

**Priority:** Medium  
**Effort:** Medium  
**Description:** Allow users to snooze seasonal tasks for later

**UI Changes:**
- Add "Snooze" button to task card
- Show snooze dropdown: "1 day", "3 days", "1 week", "2 weeks"
- Hide snoozed tasks from active view
- Show "Snoozed tasks" section with countdown

**Backend Changes:**
- Update `seasonal_checklist_items.snoozed_until` timestamp
- Filter out snoozed tasks from active queries
- Worker job to un-snooze tasks when time expires

---

### Enhancement #3: Task Notes/Comments

**Priority:** Low  
**Effort:** Medium  
**Description:** Allow users to add notes to seasonal tasks

**Schema Change:**
```sql
ALTER TABLE seasonal_checklist_items ADD COLUMN notes TEXT;
ALTER TABLE seasonal_checklist_items ADD COLUMN notes_updated_at TIMESTAMP;
```

**UI:** Text area in task card to add/edit notes

---

### Enhancement #4: Photo Upload for Completed Tasks

**Priority:** Low  
**Effort:** High  
**Description:** Allow users to upload before/after photos when completing tasks

**Required:**
- File upload system
- S3/storage integration
- Image gallery in task details
- Link photos to completion event

---

### Enhancement #5: Service Provider Integration

**Priority:** Medium  
**Effort:** High  
**Description:** Link seasonal tasks to service marketplace

**Features:**
- "Book a Pro" button on tasks
- Pre-fill service request with task details
- Track which tasks were DIY vs hired
- Show recommended providers for task type

---

### Enhancement #6: Task History & Analytics

**Priority:** Low  
**Effort:** Medium  
**Description:** Show completion history across seasons

**Features:**
- "Past Checklists" tab showing previous years
- Completion rate trends over time
- Most/least completed tasks
- Cost tracking per season
- Time saved dashboard

---

### Enhancement #7: Custom Tasks

**Priority:** Medium  
**Effort:** Medium  
**Description:** Allow users to add custom seasonal tasks

**Features:**
- "Add custom task" button in modal
- Form: title, description, priority, due date
- Save as custom template for next year
- Share custom tasks with other users (community feature)

---

### Enhancement #8: Mobile App Push Notifications

**Priority:** High (for mobile launch)  
**Effort:** Medium  
**Description:** Send push notifications instead of/in addition to email

**Required:**
- Mobile app with push notification capability
- FCM/APNS token storage
- Worker job to send push notifications
- User preference: email vs push vs both

---

### Enhancement #9: Smart Recommendations

**Priority:** Low  
**Effort:** High  
**Description:** AI-powered task recommendations based on completion history

**Features:**
- Analyze which tasks user completes/ignores
- Suggest removing optional tasks they never do
- Recommend additional tasks based on property assets
- Learn from user behavior over time

---

### Enhancement #10: Weather-Based Alerts

**Priority:** Medium  
**Effort:** High  
**Description:** Send urgent alerts for weather-related tasks

**Example:**
- Freeze warning → Alert to drain pipes, cover plants
- Heat wave → Alert to check AC filter
- Heavy rain forecast → Alert to check gutters
- Requires weather API integration

---

## Future Enhancements

### Long-term Ideas (Low Priority)

1. **Gamification**
   - Badges for completing seasonal checklists
   - Streak counter for consecutive seasons
   - Leaderboard (optional, privacy-aware)
   - Points system redeemable for service discounts

2. **Home Buyer Segment Integration**
   - Generate pre-move-in checklist
   - Convert to homeowner checklist after closing
   - First year homeowner special tasks

3. **Property-Specific Customization**
   - Tasks based on property age (older homes need more)
   - Tasks based on home features (pool, fireplace, etc.)
   - Tasks based on past issues reported

4. **Multi-Property Dashboard**
   - Aggregate view of all properties
   - Bulk complete tasks across properties
   - Property comparison (which needs most attention)

5. **Family/Team Collaboration**
   - Assign tasks to family members
   - Shared checklist view
   - Task completion notifications to family

6. **Warranty Tracking Integration**
   - Link seasonal tasks to warranties
   - Alert when warranty service needed
   - Track warranty expirations

7. **Budget Planning**
   - Estimate seasonal maintenance costs
   - Track actual spending vs estimates
   - Budget alerts when overspending
   - Year-over-year cost comparison

8. **Seasonal Guides & Articles**
   - Educational content per season
   - How-to videos for common tasks
   - Regional best practices
   - Climate-specific tips

9. **API for Third-Party Integration**
   - Expose seasonal API to partners
   - Allow smart home devices to trigger tasks
   - Integration with home insurance (discounts for completing tasks)

10. **Predictive Maintenance**
    - ML model to predict when tasks actually needed
    - Dynamic scheduling based on usage patterns
    - Early warning system for potential issues

---

## Deployment Guide

### Prerequisites

```bash
# Required tools
- Docker
- kubectl configured for production cluster
- Access to ghcr.io/madhuboyina/contract-to-cozy-*
- Database migration access
```

### Full Deployment Process

#### 1. Database Migration

```bash
# Connect to database
psql $DATABASE_URL

# Run migrations via Kubernetes job
kubectl create job --from=cronjob/db-migrate seasonal-migration-$(date +%s) -n production

# Or run directly
cd apps/backend
npx prisma migrate deploy
npx prisma db seed # For task templates
```

#### 2. Backend Deployment

```bash
cd ~/git/contract-to-cozy1/apps/backend

# Build
npm run build

# Docker
docker build -t ghcr.io/madhuboyina/contract-to-cozy-backend:latest .
docker push ghcr.io/madhuboyina/contract-to-cozy-backend:latest

# Deploy
kubectl rollout restart deployment backend -n production
kubectl rollout status deployment backend -n production

# Verify
kubectl logs -f deployment/backend -n production | grep "Server running"
```

#### 3. Workers Deployment

```bash
cd ~/git/contract-to-cozy1/apps/workers

# Build
npm run build

# Docker
docker build -t ghcr.io/madhuboyina/contract-to-cozy-workers:latest .
docker push ghcr.io/madhuboyina/contract-to-cozy-workers:latest

# Deploy
kubectl rollout restart deployment workers -n production
kubectl rollout status deployment workers -n production

# Verify cron jobs scheduled
kubectl logs deployment/workers -n production | grep "Seasonal maintenance jobs scheduled"
# Should see:
# ✅ Seasonal maintenance jobs scheduled:
#    - Expiration: Daily at 1:00 AM EST
#    - Generation: Daily at 2:00 AM EST
#    - Notifications: Daily at 9:00 AM EST
#    - Cleanup: Monthly on 1st at 2:00 AM EST
```

#### 4. Frontend Deployment

```bash
cd ~/git/contract-to-cozy1/apps/frontend

# Build
npm run build

# Docker
docker build -t ghcr.io/madhuboyina/contract-to-cozy-frontend:latest .
docker push ghcr.io/madhuboyina/contract-to-cozy-frontend:latest

# Deploy
kubectl rollout restart deployment frontend -n production
kubectl rollout status deployment frontend -n production

# Force clear cache (important!)
# Delete pods to force fresh image pull
kubectl delete pods -n production -l app=frontend
```

#### 5. Manual Trigger (Optional)

```bash
# Trigger generation for all properties immediately
kubectl exec -it deployment/workers -n production -- sh
node dist/jobs/seasonalChecklistGeneration.job.js
exit

# Or via API
curl -X POST https://api.contracttocozy.com/api/seasonal-checklists/generate \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

### Rollback Procedure

```bash
# Backend
kubectl rollout undo deployment/backend -n production

# Workers
kubectl rollout undo deployment/workers -n production

# Frontend
kubectl rollout undo deployment/frontend -n production

# Database (more complex, requires manual SQL)
# Restore from backup or manually drop tables
```

---

## Testing & Verification

### Automated Testing

**Unit Tests (Not Yet Implemented):**
```bash
# Backend
cd apps/backend
npm run test

# Frontend
cd apps/frontend
npm run test

# Workers
cd apps/workers
npm run test
```

### Manual Testing Checklist

#### ✅ Pre-Deployment Testing (Local)

1. **Database Setup**
   ```bash
   # Verify tables exist
   psql $DATABASE_URL -c "\dt seasonal*"
   # Should show: seasonal_checklists, seasonal_checklist_items, seasonal_task_templates
   
   # Check seed data
   psql $DATABASE_URL -c "SELECT COUNT(*) FROM seasonal_task_templates;"
   # Should show: 30+
   ```

2. **Backend API**
   ```bash
   # Start backend locally
   cd apps/backend && npm run dev
   
   # Test endpoints
   curl http://localhost:5000/api/properties/PROPERTY_ID/seasonal-checklists
   curl http://localhost:5000/api/properties/PROPERTY_ID/climate
   ```

3. **Frontend UI**
   ```bash
   # Start frontend locally
   cd apps/frontend && npm run dev
   
   # Visit http://localhost:3000/dashboard
   # Check: Seasonal card visible
   
   # Visit http://localhost:3000/dashboard/seasonal?propertyId=PROPERTY_ID
   # Check: Checklists load, tabs work
   ```

4. **Worker Jobs**
   ```bash
   cd apps/workers && npm run dev
   
   # Check cron scheduling logs
   # Should see: "Seasonal maintenance jobs scheduled"
   ```

#### ✅ Post-Deployment Testing (Production)

1. **Database Verification**
   ```sql
   -- Check climate settings created
   SELECT COUNT(*) FROM property_climate_settings;
   
   -- Check checklists generated
   SELECT 
     season, 
     year, 
     COUNT(*) as checklist_count 
   FROM seasonal_checklists 
   GROUP BY season, year;
   
   -- Check tasks created
   SELECT 
     priority, 
     COUNT(*) as task_count 
   FROM seasonal_checklist_items 
   GROUP BY priority;
   ```

2. **Frontend Smoke Test**
   ```
   ✓ Visit https://contracttocozy.com/dashboard
   ✓ Seasonal card visible and shows tasks
   ✓ Click "View Full Checklist"
   ✓ Seasonal page loads without errors
   ✓ Current Season tab shows checklist
   ✓ All Seasons tab shows checklist
   ✓ Click "View Details" on a checklist
   ✓ Modal opens and stays open
   ✓ Tasks organized by priority (Critical, Recommended, Optional)
   ✓ Click "Add to my tasks" on a task
   ✓ Success message shows
   ✓ Go to /dashboard/actions
   ✓ Task appears in Action Center
   ✓ Complete the task (check checkbox)
   ✓ Return to seasonal page
   ✓ Reload page (with Cmd/Ctrl+Shift+R)
   ✗ Progress bar SHOULD update (currently broken)
   ```

3. **Settings Page Test**
   ```
   ✓ Visit /dashboard/seasonal/settings?propertyId=PROPERTY_ID
   ✓ Page loads climate settings
   ✓ Shows auto-detected climate (blue banner)
   ✓ Can select different climate region
   ✓ Can toggle notifications
   ✓ Can toggle auto-generate
   ✓ Click "Save Settings"
   ✓ Success message shows
   ✓ Refresh page
   ✓ Settings persisted
   ```

4. **Worker Job Verification**
   ```bash
   # Check logs for cron execution
   kubectl logs deployment/workers -n production --since=24h | grep SEASONAL
   
   # Should see entries like:
   # [SEASONAL-GEN] Running checklist generation job...
   # [SEASONAL-GEN] ✅ Job completed successfully
   
   # Check database for newly generated checklists
   psql $DATABASE_URL -c "
     SELECT id, season, year, generated_at 
     FROM seasonal_checklists 
     WHERE generated_at > NOW() - INTERVAL '1 day'
     ORDER BY generated_at DESC;
   "
   ```

5. **Email Notification Test** (When Triggered)
   ```bash
   # Check worker logs
   kubectl logs deployment/workers -n production | grep SEASONAL-NOTIFY
   
   # Should see:
   # [SEASONAL-NOTIFY] Running notification job...
   # [SEASONAL-NOTIFY] Found X checklists to notify
   # [SEASONAL-NOTIFY] ✅ Job completed successfully
   
   # Check database
   psql $DATABASE_URL -c "
     SELECT id, notification_sent_at 
     FROM seasonal_checklists 
     WHERE notification_sent_at IS NOT NULL;
   "
   ```

#### ✅ Regression Testing

**After Each Deployment:**

1. **Dashboard loads without errors**
2. **Actions page still works**
3. **Properties page still works**
4. **Other features unaffected**

#### ✅ Performance Testing

```bash
# Check API response times
curl -w "@curl-format.txt" -o /dev/null -s \
  https://api.contracttocozy.com/api/properties/PROPERTY_ID/seasonal-checklists

# Should be < 500ms

# Check database query performance
psql $DATABASE_URL -c "EXPLAIN ANALYZE 
  SELECT * FROM seasonal_checklists 
  WHERE property_id = 'xxx' AND status = 'PENDING';"
```

#### ✅ Load Testing (Optional)

```bash
# Use Apache Bench or similar
ab -n 1000 -c 10 https://contracttocozy.com/dashboard/seasonal

# Monitor:
# - Response times
# - Error rate
# - Database connection pool
# - Memory usage
```

---

## Database Queries for Debugging

### Common Queries

**1. Check Property Climate Settings**
```sql
SELECT 
  p.id,
  p.name,
  p.state,
  pcs.climate_region,
  pcs.climate_region_source,
  pcs.notification_enabled,
  pcs.auto_generate_checklists
FROM properties p
LEFT JOIN property_climate_settings pcs ON p.id = pcs.property_id
WHERE p.id = 'PROPERTY_ID';
```

**2. Check Checklists for Property**
```sql
SELECT 
  id,
  season,
  year,
  climate_region,
  status,
  total_tasks,
  tasks_added,
  tasks_completed,
  generated_at,
  notification_sent_at
FROM seasonal_checklists
WHERE property_id = 'PROPERTY_ID'
ORDER BY year DESC, 
  CASE season 
    WHEN 'WINTER' THEN 1 
    WHEN 'SPRING' THEN 2 
    WHEN 'SUMMER' THEN 3 
    WHEN 'FALL' THEN 4 
  END;
```

**3. Check Tasks in Checklist**
```sql
SELECT 
  sci.id,
  sci.title,
  sci.priority,
  sci.status,
  sci.added_at,
  sci.completed_at,
  ci.id as action_item_id,
  ci.status as action_status
FROM seasonal_checklist_items sci
LEFT JOIN checklist_items ci ON sci.checklist_item_id = ci.id
WHERE sci.seasonal_checklist_id = 'CHECKLIST_ID'
ORDER BY 
  CASE sci.priority 
    WHEN 'CRITICAL' THEN 1 
    WHEN 'RECOMMENDED' THEN 2 
    WHEN 'OPTIONAL' THEN 3 
  END,
  sci.title;
```

**4. Check Task Completion Sync Issue**
```sql
-- Find completed Action Center tasks linked to seasonal items
SELECT 
  ci.id as action_id,
  ci.title,
  ci.status as action_status,
  ci.completed_at as action_completed,
  sci.id as seasonal_id,
  sci.status as seasonal_status,
  sci.completed_at as seasonal_completed,
  sc.tasks_completed
FROM checklist_items ci
INNER JOIN seasonal_checklist_items sci ON ci.id = sci.checklist_item_id
INNER JOIN seasonal_checklists sc ON sci.seasonal_checklist_id = sc.id
WHERE ci.status = 'COMPLETED'
  AND sci.status != 'COMPLETED'; -- This should be empty after fix!
```

**5. Check Templates by Climate**
```sql
SELECT 
  season,
  climate_regions,
  priority,
  COUNT(*) as task_count
FROM seasonal_task_templates
WHERE is_active = true
GROUP BY season, climate_regions, priority
ORDER BY season, priority;
```

**6. Analytics: Completion Rates**
```sql
SELECT 
  season,
  year,
  AVG(CASE WHEN total_tasks > 0 
    THEN (tasks_completed::float / total_tasks) * 100 
    ELSE 0 
  END) as avg_completion_rate,
  COUNT(*) as checklist_count,
  SUM(tasks_completed) as total_tasks_completed
FROM seasonal_checklists
WHERE status != 'DISMISSED'
GROUP BY season, year
ORDER BY year DESC, 
  CASE season 
    WHEN 'WINTER' THEN 1 
    WHEN 'SPRING' THEN 2 
    WHEN 'SUMMER' THEN 3 
    WHEN 'FALL' THEN 4 
  END;
```

### Debug Queries

**1. Find Properties Without Climate Settings**
```sql
SELECT 
  p.id,
  p.name,
  p.state,
  hp.segment
FROM properties p
INNER JOIN homeowner_profiles hp ON p.id = hp.property_id
LEFT JOIN property_climate_settings pcs ON p.id = pcs.property_id
WHERE pcs.id IS NULL
  AND hp.segment = 'EXISTING_OWNER';
```

**2. Find Checklists Without Items**
```sql
SELECT 
  sc.id,
  sc.property_id,
  sc.season,
  sc.year,
  sc.total_tasks,
  COUNT(sci.id) as actual_items
FROM seasonal_checklists sc
LEFT JOIN seasonal_checklist_items sci ON sc.id = sci.seasonal_checklist_id
GROUP BY sc.id, sc.property_id, sc.season, sc.year, sc.total_tasks
HAVING COUNT(sci.id) = 0 OR COUNT(sci.id) != sc.total_tasks;
```

**3. Find Duplicate Checklists**
```sql
SELECT 
  property_id,
  season,
  year,
  COUNT(*) as duplicate_count
FROM seasonal_checklists
GROUP BY property_id, season, year
HAVING COUNT(*) > 1;
```

### Data Cleanup Queries

**1. Reset Completion for Testing**
```sql
-- Reset a specific checklist
UPDATE seasonal_checklists 
SET tasks_completed = 0 
WHERE id = 'CHECKLIST_ID';

UPDATE seasonal_checklist_items 
SET status = 'RECOMMENDED', completed_at = NULL 
WHERE seasonal_checklist_id = 'CHECKLIST_ID';
```

**2. Delete Test Checklists**
```sql
-- Delete checklists for a specific property
DELETE FROM seasonal_checklists 
WHERE property_id = 'TEST_PROPERTY_ID';

-- Cascade delete will remove items automatically
```

**3. Re-generate Checklist**
```sql
-- Delete existing checklist
DELETE FROM seasonal_checklists 
WHERE property_id = 'PROPERTY_ID' 
  AND season = 'WINTER' 
  AND year = 2025;

-- Then trigger generation via API or worker
```

---

## Environment Variables

### Backend

```bash
# Required
DATABASE_URL=postgresql://user:password@host:5432/database
PORT=5000
NODE_ENV=production

# Optional (for email)
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=SG.xxx
FROM_EMAIL=noreply@contracttocozy.com
```

### Workers

```bash
# Required
DATABASE_URL=postgresql://user:password@host:5432/database
NODE_ENV=production

# Required for emails
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=SG.xxx
FROM_EMAIL=noreply@contracttocozy.com
FRONTEND_URL=https://contracttocozy.com
```

### Frontend

```bash
# Required
NEXT_PUBLIC_API_URL=https://api.contracttocozy.com
NODE_ENV=production
```

---

## Monitoring & Alerts

### Key Metrics to Monitor

1. **Worker Job Success Rate**
   ```bash
   # Check logs daily
   kubectl logs deployment/workers -n production --since=24h | grep "Job completed successfully"
   ```

2. **Checklist Generation Rate**
   ```sql
   -- Daily generation count
   SELECT DATE(generated_at), COUNT(*) 
   FROM seasonal_checklists 
   WHERE generated_at > NOW() - INTERVAL '7 days'
   GROUP BY DATE(generated_at)
   ORDER BY DATE(generated_at) DESC;
   ```

3. **Task Completion Rate**
   ```sql
   -- Weekly completion percentage
   SELECT 
     AVG(CASE WHEN total_tasks > 0 
       THEN (tasks_completed::float / total_tasks) * 100 
       ELSE 0 
     END) as avg_completion
   FROM seasonal_checklists
   WHERE generated_at > NOW() - INTERVAL '7 days';
   ```

4. **API Response Times**
   ```bash
   # Monitor slow queries
   kubectl logs deployment/backend -n production | grep "SLOW QUERY"
   ```

### Alert Thresholds

- ❌ Worker job fails 2+ times in a row
- ❌ Zero checklists generated for 2+ days
- ❌ API response time > 2 seconds
- ⚠️ Completion rate < 20% after 7 days
- ⚠️ Email bounce rate > 5%

---

## Support & Troubleshooting

### Common Issues & Solutions

**Issue: "No checklists yet" on seasonal page**
- Check: Property has climate settings
- Check: Worker job has run
- Check: Database has checklists for property
- Solution: Manually trigger generation

**Issue: Modal opens then closes immediately**
- Check: Browser console for errors
- Check: API response structure
- Solution: Verify data unwrapping (no .data.data)

**Issue: Progress bar doesn't update**
- Check: Task completion sync (known bug)
- Solution: Apply Fix #1 from Pending Fixes

**Issue: Worker jobs not running**
- Check: Cron scheduling logs
- Check: Timezone configuration
- Solution: Redeploy workers with fixed cron

**Issue: Emails not sending**
- Check: SMTP credentials
- Check: notification_enabled setting
- Check: Worker logs for errors
- Solution: Verify email service config

---

## Contact & Resources

### Team Contacts
- **Technical Architect:** Maddy (@madhuboyina)
- **Product Owner:** Maddy
- **Database Admin:** Kubernetes cluster admin access required

### Documentation
- Backend API: `/apps/backend/README.md`
- Frontend: `/apps/frontend/README.md`
- Workers: `/apps/workers/README.md`
- Database Schema: `/apps/backend/prisma/schema.prisma`

### External Dependencies
- PostgreSQL Database
- Kubernetes Cluster (Raspberry Pi nodes)
- GitHub Container Registry
- Email Service (SendGrid/SMTP)
- Cloudflare Tunnel

---

## Appendix

### Seasonal Task Template Examples

**Critical Tasks:**
- Replace furnace filters monthly (WINTER, COLD climates)
- Test GFCI outlets (ALL seasons, ALL climates)
- Check for roof leaks (FALL, ALL climates)
- Drain outdoor faucets (WINTER, COLD climates)
- Test sump pump (SPRING, ALL climates)

**Recommended Tasks:**
- Clean gutters (FALL, ALL climates)
- Inspect insulation (WINTER, COLD climates)
- Service AC unit (SPRING, WARM climates)
- Check humidity levels (WINTER, COLD climates)
- Seal windows and doors (FALL, COLD climates)

**Optional Tasks:**
- Power wash deck (SPRING, ALL climates)
- Fertilize lawn (SPRING, non-TROPICAL)
- Store outdoor furniture (FALL, COLD climates)
- Clean chimney (FALL, if has fireplace)

### Climate Region Definitions

- **VERY_COLD:** Alaska, Northern states (MN, ND, SD, WI, ME, VT, NH)
- **COLD:** Northeast, Midwest (NY, PA, OH, IN, IL, MI, IA, NE, MT, WY, ID)
- **MODERATE:** Mid-Atlantic, Pacific Northwest (NJ, MD, DE, VA, KY, MO, KS, CO, UT, NV, OR, WA)
- **WARM:** Southeast, Southwest (NC, SC, GA, AL, MS, TN, AR, OK, TX, NM, AZ, CA, LA)
- **TROPICAL:** Florida, Hawaii, Puerto Rico

### Season Dates (Northern Hemisphere)

- **WINTER:** December 21 - March 19
- **SPRING:** March 20 - June 20
- **SUMMER:** June 21 - September 22
- **FALL:** September 23 - December 20

### Worker Cron Schedule Summary

| Job | Time (EST) | Frequency | Purpose |
|-----|-----------|-----------|---------|
| Expiration | 1:00 AM | Daily | Mark expired checklists |
| Generation | 2:00 AM | Daily | Create new checklists |
| Notification | 9:00 AM | Daily | Send emails |
| Cleanup | 2:00 AM | Monthly (1st) | Delete old data |

---

**End of Handoff Document**

*Last Updated: December 28, 2024*  
*Version: 1.0*  
*Status: Ready for continued development*
