# SERVICE_CATEGORY_CONFIG TABLE - COMPLETE IMPACT ANALYSIS

## ⚠️ CRITICAL IMPORTANCE

**This table was NOT mentioned in the original audit but is ESSENTIAL!**

The `service_category_config` table controls ALL segment-based service filtering across the entire platform. This is the **master control table** for what each user segment can see and access.

---

## TABLE STRUCTURE

### Current Schema
```prisma
model ServiceCategoryConfig {
  id            String          @id @default(uuid())
  category      ServiceCategory @unique
  
  // 🔑 SEGMENT TARGETING (Critical fields)
  availableForHomeBuyer     Boolean @default(true)
  availableForExistingOwner Boolean @default(true)
  
  // Display properties
  displayName   String
  description   String?
  icon          String?
  sortOrder     Int @default(0)
  isActive      Boolean @default(true)
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  @@unique([category])
  @@map("service_category_config")
}
```

### Current Seed Data (13 Categories)

#### HOME_BUYER ONLY (2 categories):
```typescript
{ category: 'INSPECTION', availableForHomeBuyer: true, availableForExistingOwner: false }
{ category: 'MOVING', availableForHomeBuyer: true, availableForExistingOwner: false }
```

#### EXISTING_OWNER ONLY (7 categories):
```typescript
{ category: 'HANDYMAN', availableForHomeBuyer: false, availableForExistingOwner: true }
{ category: 'PLUMBING', availableForHomeBuyer: false, availableForExistingOwner: true }
{ category: 'ELECTRICAL', availableForHomeBuyer: false, availableForExistingOwner: true }
{ category: 'LANDSCAPING', availableForHomeBuyer: false, availableForExistingOwner: true }
{ category: 'FINANCE', availableForHomeBuyer: false, availableForExistingOwner: true }
{ category: 'WARRANTY', availableForHomeBuyer: false, availableForExistingOwner: true }
{ category: 'ADMIN', availableForHomeBuyer: false, availableForExistingOwner: true }
```

#### BOTH SEGMENTS (4 categories):
```typescript
{ category: 'CLEANING', availableForHomeBuyer: true, availableForExistingOwner: true }
{ category: 'LOCKSMITH', availableForHomeBuyer: true, availableForExistingOwner: true }
{ category: 'PEST_CONTROL', availableForHomeBuyer: true, availableForExistingOwner: true }
{ category: 'HVAC', availableForHomeBuyer: true, availableForExistingOwner: true }
```

**Missing Categories:**
- INSURANCE (not in seed data but in enum)
- ATTORNEY (not in seed data but in enum)

---

## WHERE THIS TABLE IS USED

### 1. Provider Search Filtering
**File:** `apps/backend/src/services/provider.service.ts`

**Current Logic:**
```typescript
// Get user segment
const homeownerProfile = await prisma.homeownerProfile.findUnique({
  where: { userId },
  select: { segment: true },
});
const isHomeBuyer = homeownerProfile.segment === 'HOME_BUYER';

// Filter categories based on segment
const allowedCategories = await prisma.serviceCategoryConfig.findMany({
  where: {
    isActive: true,
    ...(isHomeBuyer
      ? { availableForHomeBuyer: true }
      : { availableForExistingOwner: true }),
  },
  select: { category: true },
});

// Use allowed categories to filter providers
```

**Impact:** 🔴 CRITICAL
- Controls which providers HOME_BUYER can see (only INSPECTION, MOVING, CLEANING, LOCKSMITH, PEST_CONTROL, HVAC)
- Controls which providers EXISTING_OWNER can see (all except INSPECTION, MOVING)
- If this breaks, users see wrong providers

---

### 2. Service Category Dropdown (Frontend)
**File:** `apps/frontend/src/app/(dashboard)/dashboard/providers/page.tsx`

**Current Logic:**
```typescript
// Fetch available categories for user's segment
const { data: categories } = await api.getAvailableServiceCategories();

// Filter dropdown options
const displayCategories = categories.filter(cat => 
  userSegment === 'HOME_BUYER' 
    ? cat.availableForHomeBuyer 
    : cat.availableForExistingOwner
);
```

**Impact:** 🔴 CRITICAL
- Controls what categories appear in provider search dropdown
- HOME_BUYER sees only 6 categories (INSPECTION, MOVING, CLEANING, LOCKSMITH, PEST_CONTROL, HVAC)
- EXISTING_OWNER sees 11 categories (everything except INSPECTION, MOVING)

---

### 3. Task Creation with ServiceCategory
**Current Usage in ChecklistItem:**
```typescript
// When creating a task
const task = await prisma.checklistItem.create({
  data: {
    title: 'Schedule a Home Inspection',
    serviceCategory: 'INSPECTION',  // ✅ Must be valid for segment
    ...
  }
});
```

**Impact on Option B:**
- HomeBuyerTask will have serviceCategory field
- PropertyMaintenanceTask will have serviceCategory field
- Must validate serviceCategory against ServiceCategoryConfig

---

### 4. Booking Creation from Tasks
**Current Logic:**
```typescript
// When booking from task
if (task.serviceCategory) {
  // Search providers with this category
  const providers = await providerService.searchProviders({
    category: task.serviceCategory,
    ...
  });
}
```

**Impact:** 🔴 CRITICAL
- Links tasks to provider search
- Must maintain segment-based filtering

---

## OPTION B IMPLEMENTATION IMPACT

### ✅ NO SCHEMA CHANGES NEEDED

**Good News:** The `service_category_config` table structure does NOT need changes!

**Why:**
- Already has segment-based filtering (availableForHomeBuyer, availableForExistingOwner)
- Already used by provider search
- Already used by frontend dropdowns
- Works with both HomeBuyerTask and PropertyMaintenanceTask

### ⚠️ VALIDATION REQUIRED

**When creating HomeBuyerTask:**
```typescript
// MUST validate serviceCategory
if (data.serviceCategory) {
  const config = await prisma.serviceCategoryConfig.findUnique({
    where: { category: data.serviceCategory }
  });
  
  if (!config || !config.availableForHomeBuyer) {
    throw new Error(`Category ${data.serviceCategory} not available for HOME_BUYER`);
  }
}
```

**When creating PropertyMaintenanceTask:**
```typescript
// MUST validate serviceCategory
if (data.serviceCategory) {
  const config = await prisma.serviceCategoryConfig.findUnique({
    where: { category: data.serviceCategory }
  });
  
  if (!config || !config.availableForExistingOwner) {
    throw new Error(`Category ${data.serviceCategory} not available for EXISTING_OWNER`);
  }
}
```

---

## REQUIRED CHANGES FOR OPTION B

### 1. HomeBuyerTaskService (NEW)
**File:** `apps/backend/src/services/HomeBuyerTask.service.ts`

**Add Validation:**
```typescript
static async validateServiceCategory(category: ServiceCategory): Promise<void> {
  const config = await prisma.serviceCategoryConfig.findUnique({
    where: { category },
  });
  
  if (!config || !config.isActive || !config.availableForHomeBuyer) {
    throw new Error(
      `Service category '${category}' is not available for home buyers`
    );
  }
}

static async create(userId: string, data: CreateHomeBuyerTaskInput) {
  // Validate serviceCategory if provided
  if (data.serviceCategory) {
    await this.validateServiceCategory(data.serviceCategory);
  }
  
  // Create task...
}
```

---

### 2. PropertyMaintenanceTaskService (NEW)
**File:** `apps/backend/src/services/PropertyMaintenanceTask.service.ts`

**Add Validation:**
```typescript
static async validateServiceCategory(category: ServiceCategory): Promise<void> {
  const config = await prisma.serviceCategoryConfig.findUnique({
    where: { category },
  });
  
  if (!config || !config.isActive || !config.availableForExistingOwner) {
    throw new Error(
      `Service category '${category}' is not available for existing homeowners`
    );
  }
}

static async create(propertyId: string, data: CreateMaintenanceTaskInput) {
  // Validate serviceCategory if provided
  if (data.serviceCategory) {
    await this.validateServiceCategory(data.serviceCategory);
  }
  
  // Create task...
}
```

---

### 3. Default Task Creation
**File:** `apps/backend/src/services/HomeBuyerTask.service.ts`

**8 Default Tasks for HOME_BUYER:**
```typescript
static async createDefaultTasks(userId: string) {
  const defaultTasks = [
    {
      title: 'Schedule a Home Inspection',
      serviceCategory: 'INSPECTION',  // ✅ Valid for HOME_BUYER
      sortOrder: 1,
    },
    {
      title: 'Secure Financing',
      serviceCategory: null,  // ✅ No category
      sortOrder: 2,
    },
    {
      title: 'Get a Home Appraisal',
      serviceCategory: null,
      sortOrder: 3,
    },
    {
      title: 'Obtain Homeowners Insurance',
      serviceCategory: 'INSURANCE',  // ❌ NOT IN ServiceCategoryConfig!
      sortOrder: 4,
    },
    // ... rest
  ];
  
  // Create all tasks
}
```

**⚠️ ISSUE FOUND:** INSURANCE category is used in default tasks but NOT in ServiceCategoryConfig seed data!

---

## 🚨 CRITICAL ISSUE: MISSING CATEGORIES

### Issue 1: INSURANCE Category
**Used In:**
- Default HOME_BUYER task #4: "Obtain Homeowners Insurance"

**Status:** ❌ NOT in ServiceCategoryConfig seed data

**Fix Required:**
```typescript
// Add to seed-service-categories.ts
{
  category: ServiceCategory.INSURANCE,
  availableForHomeBuyer: true,
  availableForExistingOwner: true,
  displayName: 'Insurance Services',
  description: 'Homeowners insurance quotes and policy management',
  icon: 'shield',
  sortOrder: 14,
}
```

---

### Issue 2: ATTORNEY Category
**Used In:**
- Potentially in HOME_BUYER workflow

**Status:** ❌ NOT in ServiceCategoryConfig seed data

**Fix Required:**
```typescript
// Add to seed-service-categories.ts
{
  category: ServiceCategory.ATTORNEY,
  availableForHomeBuyer: true,
  availableForExistingOwner: false,
  displayName: 'Real Estate Attorney',
  description: 'Legal services for home purchase',
  icon: 'scale',
  sortOrder: 15,
}
```

---

## DATA MIGRATION CONSIDERATIONS

### Validation During Migration

When migrating ChecklistItem → HomeBuyerTask/PropertyMaintenanceTask:

```sql
-- Check for invalid serviceCategory values
SELECT 
  ci.id,
  ci.title,
  ci.serviceCategory,
  hp.segment,
  scc.availableForHomeBuyer,
  scc.availableForExistingOwner
FROM checklist_items ci
JOIN checklists c ON ci.checklistId = c.id
JOIN homeowner_profiles hp ON c.homeownerProfileId = hp.id
LEFT JOIN service_category_config scc ON ci.serviceCategory = scc.category
WHERE ci.serviceCategory IS NOT NULL
  AND (
    (hp.segment = 'HOME_BUYER' AND (scc.availableForHomeBuyer = false OR scc.id IS NULL))
    OR
    (hp.segment = 'EXISTING_OWNER' AND (scc.availableForExistingOwner = false OR scc.id IS NULL))
  );
```

**If Invalid Data Found:**
1. Option A: Set serviceCategory to NULL
2. Option B: Skip migration of that task (log error)
3. Option C: Add missing categories to ServiceCategoryConfig

---

## TESTING REQUIREMENTS

### Test Cases for Option B

1. **HomeBuyerTask Creation:**
   - ✅ Create task with valid category (INSPECTION, MOVING, CLEANING, etc.)
   - ❌ Create task with invalid category (HANDYMAN, PLUMBING, etc.)
   - ✅ Create task with NULL category

2. **PropertyMaintenanceTask Creation:**
   - ✅ Create task with valid category (HANDYMAN, PLUMBING, ELECTRICAL, etc.)
   - ❌ Create task with invalid category (INSPECTION, MOVING)
   - ✅ Create task with NULL category

3. **Provider Search:**
   - ✅ HOME_BUYER sees only allowed categories in dropdown
   - ✅ EXISTING_OWNER sees only allowed categories in dropdown
   - ✅ Providers filtered correctly by segment

4. **Booking from Task:**
   - ✅ HOME_BUYER can book from INSPECTION task
   - ✅ EXISTING_OWNER can book from PLUMBING task
   - ❌ HOME_BUYER cannot book HANDYMAN (category not shown)

---

## IMPACT SUMMARY

### Changes Required: ✅ MINOR

**Schema:** ✅ NO CHANGES
**Seed Data:** 🟡 ADD 2 MISSING CATEGORIES (INSURANCE, ATTORNEY)
**Service Logic:** 🟡 ADD VALIDATION in new services
**Migration:** 🟡 VALIDATE serviceCategory during data migration

### Risk Level: 🟡 MEDIUM

**Risks:**
1. Invalid serviceCategory in existing data (check with SQL)
2. Missing INSURANCE/ATTORNEY in seed data (fix seed script)
3. Validation not enforced in new services (add validation)

**Mitigations:**
1. Run validation query before migration
2. Update seed script to include all categories
3. Add unit tests for validation logic
4. Run seed script before deployment

---

## UPDATED TABLE COUNT

### Tables Requiring Changes: **10** (not 9)

1. ✅ checklist_items (split)
2. ✅ checklists (deprecated)
3. ✅ homeowner_profiles (add HomeBuyerChecklist relation)
4. ✅ seasonal_checklist_items (foreign key update)
5. ✅ bookings (add task links)
6. ✅ properties (update relation)
7. ✅ warranties (add relation)
8. ✅ home_assets (add relation)
9. ~~users~~ (no changes)
10. ✅ **service_category_config** (seed data fixes only)

**Correction:** service_category_config needs seed data updates, not schema changes.

---

## FINAL VERDICT

### Is service_category_config a blocker? ❌ NO

**Good News:**
- ✅ Table structure is perfect (no schema changes)
- ✅ Already used by provider search
- ✅ Already segment-aware
- ✅ Works with both task types

**Action Items:**
1. 🟡 Add INSURANCE category to seed data
2. 🟡 Add ATTORNEY category to seed data
3. 🟡 Add validation to new services
4. 🟡 Run validation query on existing data
5. ✅ Run seed script before deployment

**Implementation Impact:** 🟢 LOW
**Timeline Impact:** +1 day (for seed data updates + testing)
**Risk Level:** 🟡 LOW-MEDIUM (manageable)

---

## RECOMMENDATION

✅ **PROCEED with Option B** - service_category_config is compatible

**Prerequisites:**
1. Update seed script to include INSURANCE and ATTORNEY
2. Run seed script in staging before deployment
3. Add validation logic to new services
4. Test all service categories with both segments

**No architectural changes required!**

