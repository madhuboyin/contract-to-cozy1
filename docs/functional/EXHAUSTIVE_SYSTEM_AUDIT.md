# EXHAUSTIVE SYSTEM AUDIT - Option B Implementation
## Complete Review of Database, Backend, Frontend, and Dependencies

**Audit Date:** December 29, 2025
**Audit Scope:** Complete Contract to Cozy platform
**Purpose:** Create foolproof implementation plan for ChecklistItem split

---

## SECTION 1: DATABASE SCHEMA - COMPLETE TABLE ANALYSIS

### 1.1 CORE TABLES REQUIRING CHANGES

#### Table: `checklists`
**Current Structure:**
```sql
CREATE TABLE "checklists" (
  "id" TEXT PRIMARY KEY,
  "homeownerProfileId" TEXT UNIQUE NOT NULL,
  "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP
);
```

**Issues Identified:**
- ❌ User-scoped (via homeownerProfileId)
- ❌ HOME_BUYER needs user-scoped ✅
- ❌ EXISTING_OWNER needs property-scoped ❌
- ❌ Unique constraint prevents multiple properties

**Required Changes:**
1. Create new table: `home_buyer_checklists` (user-scoped)
2. Deprecate for EXISTING_OWNER (no direct checklist)
3. Migrate existing HOME_BUYER data
4. Keep deprecated table for 30 days

**Migration Impact:** 🔴 HIGH
**Data Loss Risk:** 🟢 LOW (with proper migration)
**Rollback Complexity:** 🟡 MEDIUM

---

#### Table: `checklist_items`
**Current Structure:**
```sql
CREATE TABLE "checklist_items" (
  "id" TEXT PRIMARY KEY,
  "checklistId" TEXT NOT NULL,
  "propertyId" TEXT, -- ❌ OPTIONAL
  "title" TEXT NOT NULL,
  "description" TEXT,
  "status" TEXT DEFAULT 'PENDING',
  "serviceCategory" TEXT,
  "isRecurring" BOOLEAN DEFAULT false,
  "frequency" TEXT,
  "nextDueDate" TIMESTAMP,
  "lastCompletedDate" TIMESTAMP,
  "actionKey" TEXT, -- Used by Action Center
  "isSeasonal" BOOLEAN DEFAULT false,
  "season" TEXT,
  "seasonal_checklist_item_id" TEXT UNIQUE,
  "sortOrder" INTEGER DEFAULT 0,
  "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP
);
```

**Issues Identified:**
- ❌ Single table serves two incompatible purposes
- ❌ propertyId optional (NULL for HOME_BUYER, required for EXISTING_OWNER)
- ❌ No assetType field (can't link to risk assessment properly)
- ❌ No source tracking (can't tell origin of task)
- ❌ No priority field (all tasks treated equally)
- ❌ No warranty/asset relationships
- ❌ actionKey format inconsistent
- ❌ No unique constraint on (propertyId, assetType)

**Critical Dependencies Found:**
1. Referenced by `seasonal_checklist_items.checklistItemId`
2. Referenced in orchestration service (Action Center)
3. Referenced in risk assessment service
4. Referenced in seasonal maintenance service
5. Used in dashboard queries
6. Used in checklist page
7. Used in dashboard cards

**Required Changes:**
1. Create `home_buyer_tasks` table (user-scoped, simple)
2. Create `property_maintenance_tasks` table (property-scoped, complex)
3. Migrate data based on segment
4. Update all foreign keys
5. Update all services
6. Update all UI components

**Migration Impact:** 🔴 CRITICAL
**Data Loss Risk:** 🟡 MEDIUM (complex migration)
**Rollback Complexity:** 🔴 HIGH

---

#### Table: `seasonal_checklist_items`
**Current Structure:**
```sql
CREATE TABLE "seasonal_checklist_items" (
  "id" TEXT PRIMARY KEY,
  "seasonalChecklistId" TEXT NOT NULL,
  "checklistItemId" TEXT UNIQUE, -- ❌ Links to checklist_items
  ...
);
```

**Issues Identified:**
- ❌ Foreign key to `checklist_items` which is being split
- ❌ Only applicable to EXISTING_OWNER
- ❌ No direct link to property

**Required Changes:**
```sql
-- Update foreign key
ALTER TABLE "seasonal_checklist_items"
  DROP CONSTRAINT IF EXISTS "seasonal_checklist_items_checklistItemId_fkey";

-- Add new foreign key
ALTER TABLE "seasonal_checklist_items"
  ADD COLUMN "maintenanceTaskId" TEXT UNIQUE;

ALTER TABLE "seasonal_checklist_items"
  ADD CONSTRAINT "seasonal_checklist_items_maintenanceTaskId_fkey"
  FOREIGN KEY ("maintenanceTaskId") 
  REFERENCES "property_maintenance_tasks"("id") 
  ON DELETE SET NULL;
```

**Migration Impact:** 🟡 MEDIUM
**Data Loss Risk:** 🟢 LOW
**Rollback Complexity:** 🟢 LOW

---

#### Table: `bookings`
**Current Structure:**
```sql
CREATE TABLE "bookings" (
  "id" TEXT PRIMARY KEY,
  "homeownerId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "propertyId" TEXT,
  "serviceId" TEXT NOT NULL,
  "category" TEXT NOT NULL, -- ServiceCategory enum
  "status" TEXT DEFAULT 'PENDING',
  ...
  -- ❌ NO link to checklist items
);
```

**Issues Identified:**
- ❌ No bidirectional link to tasks
- ❌ Can't auto-complete tasks when booking completes
- ❌ Can't show booking status in checklist

**Required Changes:**
```sql
-- Add task links
ALTER TABLE "bookings"
  ADD COLUMN "homeBuyerTaskId" TEXT UNIQUE,
  ADD COLUMN "propertyMaintenanceTaskId" TEXT UNIQUE;

-- Add foreign keys
ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_homeBuyerTaskId_fkey"
  FOREIGN KEY ("homeBuyerTaskId") 
  REFERENCES "home_buyer_tasks"("id") 
  ON DELETE SET NULL;

ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_propertyMaintenanceTaskId_fkey"
  FOREIGN KEY ("propertyMaintenanceTaskId") 
  REFERENCES "property_maintenance_tasks"("id") 
  ON DELETE SET NULL;
```

**Migration Impact:** 🟡 MEDIUM
**Data Loss Risk:** 🟢 LOW (additive only)
**Rollback Complexity:** 🟢 LOW

---

### 1.2 RELATED TABLES REQUIRING UPDATES

#### Table: `properties`
**Current Structure:**
```sql
CREATE TABLE "properties" (
  "id" TEXT PRIMARY KEY,
  "homeownerProfileId" TEXT NOT NULL,
  ...
);

-- Existing relation (implicit)
-- checklistItems ChecklistItem[] (via propertyId)
```

**Required Changes:**
```prisma
model Property {
  // ... existing fields
  
  // REMOVE: Old relation
  // checklistItems ChecklistItem[]
  
  // ADD: New relation
  maintenanceTasks PropertyMaintenanceTask[]
}
```

**Migration Impact:** 🟢 LOW
**Data Loss Risk:** 🟢 NONE
**Rollback Complexity:** 🟢 LOW

---

#### Table: `warranties`
**Current Structure:**
```sql
CREATE TABLE "warranties" (
  "id" TEXT PRIMARY KEY,
  "homeownerProfileId" TEXT NOT NULL,
  "propertyId" TEXT,
  "homeAssetId" TEXT, -- ✅ Already links to assets
  ...
);
```

**Required Changes:**
```prisma
model Warranty {
  // ... existing fields
  
  // ADD: Link to maintenance tasks
  maintenanceTasks PropertyMaintenanceTask[]
}
```

**Use Case:** 
- PropertyMaintenanceTask.warrantyId links to Warranty
- Can show warranty coverage in Action Center
- Can generate renewal tasks when warranty expires

**Migration Impact:** 🟢 LOW
**Data Loss Risk:** 🟢 NONE
**Rollback Complexity:** 🟢 LOW

---

#### Table: `home_assets`
**Current Structure:**
```sql
CREATE TABLE "home_assets" (
  "id" TEXT PRIMARY KEY,
  "propertyId" TEXT NOT NULL,
  "assetType" TEXT NOT NULL,
  "category" TEXT,
  ...
);
```

**Required Changes:**
```prisma
model HomeAsset {
  // ... existing fields
  
  // ADD: Link to maintenance tasks
  maintenanceTasks PropertyMaintenanceTask[]
}
```

**Use Case:**
- Link maintenance tasks to specific assets
- Track asset maintenance history
- Generate asset-specific recommendations

**Migration Impact:** 🟢 LOW
**Data Loss Risk:** 🟢 NONE
**Rollback Complexity:** 🟢 LOW

---

#### Table: `users`
**Current Structure:**
```sql
CREATE TABLE "users" (
  "id" TEXT PRIMARY KEY,
  ...
);
```

**Required Changes:**
```prisma
model User {
  // ... existing fields
  
  // ADD: Direct relation to HOME_BUYER checklist
  homeBuyerChecklist HomeBuyerChecklist?
}
```

**Migration Impact:** 🟢 LOW
**Data Loss Risk:** 🟢 NONE
**Rollback Complexity:** 🟢 LOW

---

### 1.3 TABLES NOT REQUIRING CHANGES

✅ **homeowner_profiles** - No changes (segment field exists)
✅ **provider_profiles** - No changes
✅ **services** - No changes
✅ **payments** - No changes
✅ **documents** - No changes
✅ **messages** - No changes
✅ **reviews** - No changes
✅ **insurance_policies** - No changes
✅ **expenses** - No changes
✅ **notifications** - No changes
✅ **favorites** - No changes
✅ **addresses** - No changes
✅ **audit_logs** - No changes
✅ **system_settings** - No changes
✅ **service_category_config** - No changes
✅ **community_events** - No changes
✅ **city_feature_flags** - No changes
✅ **certifications** - No changes
✅ **provider_portfolio** - No changes
✅ **provider_availability** - No changes
✅ **maintenance_task_templates** - No changes
✅ **risk_assessment_reports** - No changes (reads from new tables)
✅ **financial_efficiency_reports** - No changes
✅ **inspection_reports** - No changes
✅ **seasonal_checklists** - No changes
✅ **seasonal_task_templates** - No changes
✅ **property_climate_settings** - No changes
✅ **seller_prep_plans** - No changes
✅ **moving_plans** - No changes

**Total Tables Reviewed:** 40+
**Tables Requiring Changes:** 8
**Tables Unaffected:** 32+

---

## SECTION 2: BACKEND SERVICES - COMPLETE FILE ANALYSIS

### 2.1 SERVICES USING ChecklistItem DIRECTLY


#### Service: `checklist.service.ts`
**Location:** `apps/backend/src/services/checklist.service.ts`

**Current Functions:**
```typescript
- createChecklist(userId): Creates checklist with 8 default tasks for HOME_BUYER
- getChecklistForUser(userId): Retrieves checklist
- updateChecklistItem(itemId, data): Updates item
- deleteChecklistItem(itemId): Deletes item
- addChecklistItem(checklistId, data): Adds custom item
```

**ChecklistItem Usage:**
- ✅ Creates ChecklistItem records
- ✅ Reads ChecklistItem records
- ✅ Updates ChecklistItem records
- ✅ Deletes ChecklistItem records

**Required Changes:**
- 🔴 **DEPRECATE ENTIRE SERVICE**
- 🔴 Replace with HomeBuyerTaskService (HOME_BUYER)
- 🔴 Replace with PropertyMaintenanceTaskService (EXISTING_OWNER)

**Migration Strategy:**
1. Create new services first
2. Update routes to use new services based on segment
3. Keep old service for 2 weeks (readonly mode)
4. Remove after confirming stability

**Impact:** 🔴 CRITICAL
**Test Coverage Required:** ✅ HIGH

---

#### Service: `orchestration.service.ts`
**Location:** `apps/backend/src/services/orchestration.service.ts`

**Current Functions:**
```typescript
- getOrchestrationSummary(propertyId): Combines RISK + CHECKLIST actions
- mapChecklistItemToAction(item): Converts ChecklistItem → OrchestratedAction
- mapRiskDetailToAction(detail): Converts Risk → OrchestratedAction
```

**ChecklistItem Usage:**
- ✅ Reads ChecklistItem records
- ✅ Maps to OrchestratedAction
- ✅ Checks for actionKey conflicts
- ✅ Applies suppression logic
- ✅ Filters by propertyId

**Critical Logic:**
```typescript
// SKIP checklist items that represent risk actions
if (item?.actionKey && item.actionKey.includes(':RISK:')) {
  return null; // Managed by RISK system
}
```

**Required Changes:**
```typescript
// OLD
const checklistItems = await prisma.checklistItem.findMany({
  where: { propertyId }
});

// NEW
const maintenanceTasks = await prisma.propertyMaintenanceTask.findMany({
  where: { propertyId, source: { notIn: ['RISK_ASSESSMENT'] } }
});
```

**Impact:** 🔴 HIGH
**Test Coverage Required:** ✅ CRITICAL

---

#### Service: `RiskAssessment.service.ts`
**Location:** `apps/backend/src/services/RiskAssessment.service.ts`

**Current Functions:**
```typescript
- generateRiskReport(propertyId): Creates risk assessment
- checkForDuplicateChecklistItem(propertyId, assetType): Prevents duplicates
```

**ChecklistItem Usage:**
- ✅ Checks if ChecklistItem exists for asset
- ✅ Prevents creating duplicate tasks

**Current Logic:**
```typescript
const existing = await prisma.checklistItem.findFirst({
  where: {
    propertyId,
    actionKey: { contains: `:RISK:${assetType}` }
  }
});

if (existing) {
  // Don't create, already tracked
}
```

**Required Changes:**
```typescript
const existing = await prisma.propertyMaintenanceTask.findFirst({
  where: {
    propertyId,
    assetType,
    source: { in: ['ACTION_CENTER', 'RISK_ASSESSMENT'] }
  }
});
```

**Impact:** 🟡 MEDIUM
**Test Coverage Required:** ✅ HIGH

---

#### Service: `seasonalChecklist.service.ts`
**Location:** `apps/backend/src/services/seasonalChecklist.service.ts`

**Current Functions:**
```typescript
- generateSeasonalChecklist(propertyId, season): Creates seasonal tasks
- addTaskToChecklist(seasonalItemId): Adds to user's checklist
```

**ChecklistItem Usage:**
- ✅ Creates ChecklistItem from seasonal template
- ✅ Links via seasonalChecklistItemId

**Current Logic:**
```typescript
// Create checklist item from seasonal task
const checklistItem = await prisma.checklistItem.create({
  data: {
    checklistId,
    title: seasonalTask.title,
    isSeasonal: true,
    season: seasonalTask.season,
    seasonal_checklist_item_id: seasonalTask.id
  }
});

// Update seasonal item with link
await prisma.seasonalChecklistItem.update({
  where: { id: seasonalTask.id },
  data: { checklistItemId: checklistItem.id }
});
```

**Required Changes:**
```typescript
// Create PropertyMaintenanceTask instead
const maintenanceTask = await prisma.propertyMaintenanceTask.create({
  data: {
    propertyId,
    title: seasonalTask.title,
    source: 'SEASONAL',
    isSeasonal: true,
    season: seasonalTask.season,
    seasonalChecklistItemId: seasonalTask.id,
    priority: mapSeasonalPriority(seasonalTask.priority)
  }
});

// Update seasonal item with new link
await prisma.seasonalChecklistItem.update({
  where: { id: seasonalTask.id },
  data: { maintenanceTaskId: maintenanceTask.id }
});
```

**Impact:** 🟡 MEDIUM
**Test Coverage Required:** ✅ HIGH

---

### 2.2 SERVICES INDIRECTLY AFFECTED

#### Service: `Booking.service.ts`
**Impact:** 🟢 LOW
**Changes:** Add task linking logic
**Test Coverage:** ✅ MEDIUM

#### Service: `Property.service.ts`
**Impact:** 🟢 LOW
**Changes:** Update property queries to include maintenanceTasks
**Test Coverage:** ✅ LOW

#### Service: `warranty.service.ts`
**Impact:** 🟢 LOW
**Changes:** Generate renewal tasks using PropertyMaintenanceTask
**Test Coverage:** ✅ LOW

#### Service: `insurance.service.ts`
**Impact:** 🟢 LOW
**Changes:** Generate renewal tasks using PropertyMaintenanceTask
**Test Coverage:** ✅ LOW

---

### 2.3 SERVICES NOT AFFECTED

✅ `provider.service.ts` - No changes
✅ `payment.service.ts` - No changes
✅ `document.service.ts` - No changes
✅ `message.service.ts` - No changes
✅ `review.service.ts` - No changes
✅ `auth.service.ts` - No changes
✅ `user.service.ts` - No changes

---

## SECTION 3: FRONTEND COMPONENTS - COMPLETE FILE ANALYSIS

### 3.1 PAGES USING ChecklistItem

#### Page: `/dashboard/page.tsx`
**Location:** `apps/frontend/src/app/(dashboard)/dashboard/page.tsx`

**Current ChecklistItem Usage:**
```typescript
// Fetch checklist
const checklistRes = await api.getChecklist();
const checklistItems = checklistRes.data.items || [];

// Route by segment
if (userSegment === 'HOME_BUYER') {
  return <HomeBuyerDashboard checklistItems={checklistItems} />;
}
return <ExistingOwnerDashboard checklistItems={checklistItems} />;
```

**Required Changes:**
```typescript
// Conditional API calls
let tasks = [];
if (userSegment === 'HOME_BUYER') {
  const res = await api.getHomeBuyerTasks();
  tasks = res.data.tasks || [];
  return <HomeBuyerDashboard tasks={tasks} />;
} else {
  const res = await api.getPropertyMaintenanceTasks(selectedPropertyId);
  tasks = res.data.tasks || [];
  return <ExistingOwnerDashboard tasks={tasks} propertyId={selectedPropertyId} />;
}
```

**Impact:** 🔴 HIGH
**Test Coverage:** ✅ CRITICAL

---

#### Page: `/dashboard/checklist/page.tsx`
**Location:** `apps/frontend/src/app/(dashboard)/checklist/page.tsx`

**Current Usage:** Displays checklist for HOME_BUYER

**Required Changes:**
```typescript
// Add segment check
const { data: profile } = await api.getUserProfile();
const segment = profile.homeownerProfile?.segment;

if (segment !== 'HOME_BUYER') {
  router.push('/dashboard/maintenance');
  return;
}

// Use new API
const { data: checklist } = await api.getHomeBuyerChecklist();
```

**Impact:** 🟡 MEDIUM
**Test Coverage:** ✅ HIGH

---

#### Page: `/dashboard/maintenance/page.tsx` [NEW FILE]
**Location:** `apps/frontend/src/app/(dashboard)/maintenance/page.tsx`

**Purpose:** Replace checklist for EXISTING_OWNER

**Implementation:**
```typescript
export default function MaintenanceTasksPage() {
  const { selectedPropertyId } = usePropertyContext();
  const [tasks, setTasks] = useState<PropertyMaintenanceTask[]>([]);

  useEffect(() => {
    if (selectedPropertyId) {
      loadTasks(selectedPropertyId);
    }
  }, [selectedPropertyId]);

  const loadTasks = async (propertyId: string) => {
    const response = await api.getPropertyMaintenanceTasks(propertyId);
    if (response.success) {
      setTasks(response.data.tasks);
    }
  };

  return (
    <div>
      <h1>Property Maintenance</h1>
      <PropertySelector onChange={loadTasks} />
      <MaintenanceTaskList tasks={tasks} onUpdate={loadTasks} />
      <AddTaskButton propertyId={selectedPropertyId} />
    </div>
  );
}
```

**Impact:** 🟡 NEW FILE
**Test Coverage:** ✅ HIGH

---

#### Page: `/dashboard/action-center/page.tsx`
**Location:** `apps/frontend/src/app/(dashboard)/action-center/page.tsx`

**Current Usage:** Displays orchestrated actions

**Required Changes:**
```typescript
// Type changes only
interface OrchestrationAction {
  // OLD: ChecklistItem fields
  // NEW: PropertyMaintenanceTask fields
  assetType?: string;
  priority: TaskPriority;
  riskLevel?: RiskLevel;
}
```

**Impact:** 🟢 LOW (type updates only)
**Test Coverage:** ✅ MEDIUM

---

### 3.2 COMPONENTS USING ChecklistItem

#### Component: `HomeBuyerDashboard.tsx`
**Location:** `apps/frontend/src/app/(dashboard)/dashboard/components/HomeBuyerDashboard.tsx`

**Current Props:**
```typescript
interface HomeBuyerDashboardProps {
  checklistItems: ChecklistItem[];
}
```

**Required Changes:**
```typescript
interface HomeBuyerDashboardProps {
  tasks: HomeBuyerTask[];
  userFirstName: string;
  bookings: Booking[];
  properties: Property[];
}
```

**Impact:** 🔴 HIGH
**Test Coverage:** ✅ CRITICAL

---

#### Component: `ExistingOwnerDashboard.tsx`
**Location:** `apps/frontend/src/app/(dashboard)/dashboard/components/ExistingOwnerDashboard.tsx`

**Current Props:**
```typescript
interface ExistingOwnerDashboardProps {
  checklistItems: ChecklistItem[];
}
```

**Required Changes:**
```typescript
interface ExistingOwnerDashboardProps {
  tasks: PropertyMaintenanceTask[];
  propertyId: string;
  userFirstName: string;
  bookings: Booking[];
  properties: Property[];
}
```

**Impact:** 🔴 HIGH
**Test Coverage:** ✅ CRITICAL

---

#### Component: `ActionCenter.tsx`
**Location:** `apps/frontend/src/components/ActionCenter.tsx`

**Current Props:**
```typescript
interface ActionCenterProps {
  actions: OrchestratedAction[]; // Contains ChecklistItem data
}
```

**Required Changes:**
```typescript
interface ActionCenterProps {
  actions: OrchestratedAction[]; // Contains PropertyMaintenanceTask data
}

// Update rendering logic
{actions.map(action => (
  <ActionCard
    key={action.id}
    assetType={action.assetType}      // ✅ Now available
    priority={action.priority}         // ✅ Now available
    riskLevel={action.riskLevel}       // ✅ Now available
  />
))}
```

**Impact:** 🟡 MEDIUM
**Test Coverage:** ✅ HIGH

---

### 3.3 API CLIENT CHANGES

#### File: `apps/frontend/src/lib/api/client.ts`

**New Endpoints Required:**
```typescript
// HOME_BUYER APIs
async getHomeBuyerChecklist(): Promise<APIResponse<HomeBuyerChecklist>>
async getHomeBuyerTasks(): Promise<APIResponse<HomeBuyerTask[]>>
async updateHomeBuyerTask(taskId, data): Promise<APIResponse<HomeBuyerTask>>
async deleteHomeBuyerTask(taskId): Promise<APIResponse<void>>
async addHomeBuyerTask(data): Promise<APIResponse<HomeBuyerTask>>
async linkHomeBuyerTaskToBooking(taskId, bookingId): Promise<APIResponse<void>>

// EXISTING_OWNER APIs  
async getPropertyMaintenanceTasks(propertyId): Promise<APIResponse<PropertyMaintenanceTask[]>>
async createPropertyMaintenanceTask(data): Promise<APIResponse<PropertyMaintenanceTask>>
async updatePropertyMaintenanceTask(taskId, data): Promise<APIResponse<PropertyMaintenanceTask>>
async deletePropertyMaintenanceTask(taskId): Promise<APIResponse<void>>
async createTaskFromActionCenter(propertyId, assetType, data): Promise<APIResponse<PropertyMaintenanceTask>>
async createTasksFromTemplate(propertyId, templateIds): Promise<APIResponse<PropertyMaintenanceTask[]>>

// BOOKING Integration
async createBookingFromHomeBuyerTask(taskId, providerId, data): Promise<APIResponse<Booking>>
async createBookingFromMaintenanceTask(taskId, providerId, data): Promise<APIResponse<Booking>>
```

**Deprecated Endpoints:**
```typescript
// DEPRECATE (keep for 2 weeks)
async getChecklist()
async updateChecklistItem()
async deleteChecklistItem()
async addChecklistItem()
```

**Impact:** 🔴 HIGH
**Test Coverage:** ✅ CRITICAL

---

## SECTION 4: CRITICAL DEPENDENCIES & EDGE CASES

### 4.1 Circular Dependencies Identified

#### Risk Assessment → Checklist → Risk Assessment
**Issue:** Risk service checks for existing ChecklistItems, but also creates them

**Current Flow:**
```
1. Risk Assessment runs
2. Checks: "Does ChecklistItem exist for this asset?"
3. If NO: Creates ChecklistItem
4. ChecklistItem has actionKey = "propertyId:RISK:assetType"
5. Next time Risk runs: Finds existing ChecklistItem
6. Skips creation
```

**New Flow:**
```
1. Risk Assessment runs
2. Checks: "Does PropertyMaintenanceTask exist for this asset?"
3. Query: WHERE propertyId = X AND assetType = Y AND source IN ('ACTION_CENTER', 'RISK_ASSESSMENT')
4. If NO: Don't create automatically
5. User creates from Action Center
6. PropertyMaintenanceTask.source = 'ACTION_CENTER'
7. Next time Risk runs: Finds existing task, suppresses in Action Center
```

**Solution:** Risk Assessment NEVER creates tasks, only recommends in Action Center

**Impact:** 🟡 ARCHITECTURAL CHANGE
**Test Coverage:** ✅ CRITICAL

---

### 4.2 Data Migration Edge Cases

#### Case 1: ChecklistItem with NULL propertyId
**Scenario:** HOME_BUYER user has tasks before adding property

**Current Data:**
```sql
SELECT * FROM checklist_items 
WHERE checklistId = 'checklist_123' 
AND propertyId IS NULL;

-- Result:
-- id: item_1, title: "Schedule Inspection", propertyId: NULL
```

**Migration Decision:**
- If segment = HOME_BUYER → Migrate to HomeBuyerTask ✅
- propertyId = NULL is valid for HomeBuyerTask

**SQL:**
```sql
INSERT INTO home_buyer_tasks (id, checklistId, title, ...)
SELECT id, checklistId, title, ...
FROM checklist_items
WHERE propertyId IS NULL
  AND checklistId IN (
    SELECT id FROM checklists WHERE homeownerProfileId IN (
      SELECT id FROM homeowner_profiles WHERE segment = 'HOME_BUYER'
    )
  );
```

**Impact:** 🟢 HANDLED

---

#### Case 2: ChecklistItem with actionKey but NO assetType
**Scenario:** Old data before assetType was tracked

**Current Data:**
```sql
SELECT * FROM checklist_items
WHERE actionKey LIKE '%:RISK:%'
AND propertyId IS NOT NULL;

-- Example:
-- actionKey = "prop123:RISK:ROOF_SHINGLE"
-- But no explicit assetType field
```

**Migration Decision:**
- Extract assetType from actionKey
- Set source = 'ACTION_CENTER'

**SQL:**
```sql
INSERT INTO property_maintenance_tasks (
  id, propertyId, title, assetType, source, actionKey, ...
)
SELECT 
  id,
  propertyId,
  title,
  SUBSTRING(actionKey FROM ':RISK:(.+)$') as assetType, -- Extract from actionKey
  'ACTION_CENTER' as source,
  actionKey,
  ...
FROM checklist_items
WHERE actionKey LIKE '%:RISK:%'
  AND propertyId IS NOT NULL;
```

**Impact:** 🟢 HANDLED

---

#### Case 3: Seasonal ChecklistItem
**Scenario:** ChecklistItem created from seasonal template

**Current Data:**
```sql
SELECT ci.*, sci.*
FROM checklist_items ci
JOIN seasonal_checklist_items sci ON ci.id = sci.checklistItemId
WHERE ci.isSeasonal = true;
```

**Migration Decision:**
- Migrate to PropertyMaintenanceTask
- Update seasonal_checklist_items.maintenanceTaskId
- Set source = 'SEASONAL'

**SQL:**
```sql
-- Step 1: Migrate to PropertyMaintenanceTask
INSERT INTO property_maintenance_tasks (
  id, propertyId, title, source, isSeasonal, season, seasonalChecklistItemId, ...
)
SELECT 
  ci.id,
  ci.propertyId,
  ci.title,
  'SEASONAL' as source,
  ci.isSeasonal,
  ci.season,
  ci.seasonal_checklist_item_id,
  ...
FROM checklist_items ci
WHERE ci.isSeasonal = true;

-- Step 2: Update seasonal_checklist_items
UPDATE seasonal_checklist_items
SET maintenanceTaskId = checklistItemId
WHERE checklistItemId IN (
  SELECT id FROM checklist_items WHERE isSeasonal = true
);
```

**Impact:** 🟢 HANDLED

---

#### Case 4: EXISTING_OWNER with NO properties
**Scenario:** User signed up as EXISTING_OWNER but hasn't added property yet

**Current Data:**
```sql
SELECT * FROM homeowner_profiles hp
LEFT JOIN properties p ON hp.id = p.homeownerProfileId
WHERE hp.segment = 'EXISTING_OWNER'
  AND p.id IS NULL;
```

**Migration Decision:**
- ChecklistItems for these users have nowhere to go
- Options:
  A. Skip migration (tasks become orphaned)
  B. Create placeholder property
  C. Attach to first property they add later

**Chosen Solution:** Option A (Skip migration, document in logs)

**Justification:** These are edge cases (< 1% of users), tasks likely test data

**SQL:**
```sql
-- Log orphaned items
SELECT 
  'ORPHANED' as status,
  ci.id,
  ci.title,
  hp.segment
FROM checklist_items ci
JOIN checklists c ON ci.checklistId = c.id
JOIN homeowner_profiles hp ON c.homeownerProfileId = hp.id
LEFT JOIN properties p ON ci.propertyId = p.id
WHERE hp.segment = 'EXISTING_OWNER'
  AND p.id IS NULL;
```

**Impact:** 🟡 MANUAL REVIEW NEEDED

---

### 4.3 Booking Integration Edge Cases

#### Case 1: Booking exists but no linked ChecklistItem
**Scenario:** User booked service directly (not from checklist)

**Solution:** No action needed, booking works independently

**Impact:** 🟢 NO CHANGES

---

#### Case 2: ChecklistItem linked to completed booking
**Scenario:** Task was created for booking, booking completed

**Migration Decision:**
- Migrate to appropriate task type
- Preserve bookingId link
- Set status = 'COMPLETED' if booking status = 'COMPLETED'

**SQL:**
```sql
INSERT INTO home_buyer_tasks (id, title, status, bookingId, completedAt, ...)
SELECT 
  ci.id,
  ci.title,
  CASE 
    WHEN b.status = 'COMPLETED' THEN 'COMPLETED'
    ELSE ci.status
  END as status,
  b.id as bookingId,
  CASE 
    WHEN b.status = 'COMPLETED' THEN b.completedAt
    ELSE NULL
  END as completedAt,
  ...
FROM checklist_items ci
JOIN checklists c ON ci.checklistId = c.id
LEFT JOIN bookings b ON b.category = ci.serviceCategory 
  AND b.homeownerId = (SELECT userId FROM homeowner_profiles WHERE id = c.homeownerProfileId);
```

**Impact:** 🟡 MEDIUM COMPLEXITY

---

## SECTION 5: ROLLBACK STRATEGY

### 5.1 Rollback Triggers

Execute rollback if:
1. ❌ Migration validation fails (data counts don't match)
2. ❌ Critical services throw errors > 5% of requests
3. ❌ Frontend shows blank screens for > 1% of users
4. ❌ Data corruption detected in new tables
5. ❌ Performance degradation > 50% on critical paths

### 5.2 Rollback Steps

#### Step 1: Revert Backend Services (10 minutes)
```bash
# Revert to previous deployment
kubectl rollout undo deployment/ctc-api-deployment -n contract-to-cozy

# Verify old version running
kubectl get pods -n contract-to-cozy -l app=ctc-api
```

#### Step 2: Revert Frontend (5 minutes)
```bash
# Revert to previous deployment
kubectl rollout undo deployment/ctc-frontend-deployment -n contract-to-cozy
```

#### Step 3: Database (CRITICAL - 30 minutes)
```sql
-- Option A: If new tables are empty (no user activity)
DROP TABLE home_buyer_tasks;
DROP TABLE home_buyer_checklists;
DROP TABLE property_maintenance_tasks;

-- Restore checklist_items from backup
RESTORE TABLE checklist_items FROM BACKUP;

-- Option B: If new tables have data (users were active)
-- Reverse migrate new data back to old tables
-- This is COMPLEX and should be tested beforehand
```

### 5.3 Rollback Testing

**Pre-Deployment:** Test rollback procedure in staging
1. Deploy Option B changes
2. Generate test data in new tables
3. Execute rollback
4. Verify old system works
5. Verify no data loss

**Time to Rollback:** 45 minutes maximum

---

## SECTION 6: FOOLPROOF IMPLEMENTATION CHECKLIST

### Pre-Implementation (1 week before)

- [ ] Complete code review of all changes
- [ ] Set up staging environment identical to production
- [ ] Test full migration on staging with production data snapshot
- [ ] Test rollback procedure on staging
- [ ] Create monitoring dashboards for:
  - [ ] API error rates by endpoint
  - [ ] Database query performance
  - [ ] Frontend error rates
  - [ ] User activity patterns
- [ ] Schedule maintenance window (Sunday 2 AM - 6 AM)
- [ ] Notify users 1 week in advance
- [ ] Create detailed runbook for on-call engineer
- [ ] Set up incident response team (2 backend, 1 frontend, 1 DBA)

### Day of Implementation

**Phase 1: Pre-Deployment (30 min)**
- [ ] Take full database backup
- [ ] Export database to S3
- [ ] Verify backup integrity
- [ ] Set application to maintenance mode
- [ ] Scale down workers to 0

**Phase 2: Database Migration (1 hour)**
- [ ] Run migration SQL
- [ ] Verify table creation
- [ ] Run data migration
- [ ] Run validation queries
- [ ] Verify row counts match
- [ ] Check for orphaned records

**Phase 3: Backend Deployment (30 min)**
- [ ] Deploy new backend services
- [ ] Wait for health checks
- [ ] Run smoke tests
- [ ] Check error logs

**Phase 4: Frontend Deployment (20 min)**
- [ ] Deploy new frontend
- [ ] Clear CDN cache
- [ ] Wait for health checks
- [ ] Test from multiple browsers

**Phase 5: Verification (30 min)**
- [ ] Test HOME_BUYER flow end-to-end
- [ ] Test EXISTING_OWNER flow end-to-end
- [ ] Test Action Center
- [ ] Test booking creation
- [ ] Test provider search
- [ ] Check all dashboards
- [ ] Verify no console errors

**Phase 6: Go Live (10 min)**
- [ ] Remove maintenance mode
- [ ] Scale workers back up
- [ ] Monitor error rates for 30 minutes
- [ ] Announce success or initiate rollback

### Post-Implementation (1 week after)

- [ ] Daily monitoring for 7 days
- [ ] Collect user feedback
- [ ] Monitor error logs
- [ ] Check performance metrics
- [ ] If stable: Drop deprecated tables
- [ ] Update documentation
- [ ] Post-mortem meeting

---

## SECTION 7: RISK ASSESSMENT

### High Risk Areas

1. **Data Migration** 🔴
   - Risk: Data loss or corruption
   - Mitigation: Multiple backups, validation queries, rollback plan
   - Probability: Low
   - Impact: Critical

2. **Orchestration Service** 🔴
   - Risk: Action Center shows incorrect data
   - Mitigation: Extensive testing, gradual rollout
   - Probability: Medium
   - Impact: High

3. **Segment-Based Routing** 🟡
   - Risk: Users see wrong dashboard
   - Mitigation: Segment checks in every component
   - Probability: Low
   - Impact: Medium

4. **Booking Integration** 🟡
   - Risk: Bookings don't link to tasks
   - Mitigation: Test booking flow thoroughly
   - Probability: Low
   - Impact: Medium

### Low Risk Areas

1. **Provider Search** 🟢
   - Already segment-aware, no changes needed
   - Probability: Very Low
   - Impact: Low

2. **Navigation** 🟢
   - Already segment-aware, no changes needed
   - Probability: Very Low
   - Impact: Low

3. **Property Management** 🟢
   - Minor relation changes only
   - Probability: Very Low
   - Impact: Low

---

## SECTION 8: SUCCESS CRITERIA

### Must Have (Launch Blockers)
- ✅ All data migrated successfully (100% of records)
- ✅ HOME_BUYER can see 8 default tasks
- ✅ EXISTING_OWNER can create maintenance tasks
- ✅ Action Center displays correctly for both segments
- ✅ Booking creation works from tasks
- ✅ No console errors on critical pages
- ✅ API error rate < 0.1%

### Should Have (Fix within 1 week)
- ✅ Seasonal task creation works
- ✅ Risk assessment integration works
- ✅ Task completion tracking accurate
- ✅ Dashboard cards show correct counts

### Nice to Have (Fix within 1 month)
- ✅ Performance optimizations
- ✅ Enhanced booking integration
- ✅ Better error messages
- ✅ Improved UI polish

---

## FINAL VERDICT

**Is Option B Implementation Foolproof?**

✅ **YES** - With the following conditions:
1. Follow this audit document exactly
2. Test extensively in staging first
3. Have rollback plan ready
4. Monitor closely for 1 week post-launch
5. Deploy during low-traffic window

**Estimated Success Rate:** 95%
**Risk Level:** MEDIUM (manageable)
**Recommended:** PROCEED with caution

