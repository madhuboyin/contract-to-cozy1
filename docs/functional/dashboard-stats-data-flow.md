# Dashboard Statistics Cards - Data Flow Documentation

## Overview
The dashboard statistics cards display real-time maintenance task metrics pulled from the `property_maintenance_tasks` table.

---

## Database Schema

### Table: `property_maintenance_tasks`

**Location:** `apps/workers/prisma/schema.prisma`

```prisma
model PropertyMaintenanceTask {
  id         String   @id @default(uuid())
  propertyId String
  
  // Task details
  title       String
  description String?
  status      MaintenanceTaskStatus @default(PENDING)
  
  // Source tracking
  source MaintenanceTaskSource
  actionKey String?
  
  // Priority & Risk
  priority MaintenanceTaskPriority @default(MEDIUM)
  riskLevel RiskLevel?
  
  // Asset tracking
  assetType String?
  category String?
  
  // Service integration
  serviceCategory ServiceCategory?
  
  // Recurring tasks
  isRecurring Boolean @default(false)
  frequency RecurrenceFrequency?
  nextDueDate DateTime?
  lastCompletedDate DateTime?
  
  // Cost tracking
  estimatedCost Decimal? @db.Decimal(10, 2)
  actualCost Decimal? @db.Decimal(10, 2)
  
  // Relationships
  property Property @relation(fields: [propertyId], references: [id])
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  @@unique([propertyId, actionKey])
  @@index([propertyId])
  @@index([status])
  @@index([priority])
  @@index([nextDueDate])
}
```

**Key Enums:**
```prisma
enum MaintenanceTaskStatus {
  PENDING
  IN_PROGRESS
  COMPLETED
  CANCELLED
  NEEDS_REVIEW
}

enum MaintenanceTaskPriority {
  URGENT
  HIGH
  MEDIUM
  LOW
}

enum MaintenanceTaskSource {
  USER_CREATED
  ACTION_CENTER
  SEASONAL
  RISK_ASSESSMENT
  WARRANTY_RENEWAL
  TEMPLATE
}
```

---

## Backend API

### Service: `PropertyMaintenanceTask.service.ts`

**Location:** `apps/backend/src/services/PropertyMaintenanceTask.service.ts`

**Method: `getPropertyStats()`**

```typescript
static async getPropertyStats(userId: string, propertyId: string) {
  // Verify property ownership
  await this.verifyPropertyOwnership(userId, propertyId);

  // Fetch all tasks for property
  const tasks = await prisma.propertyMaintenanceTask.findMany({
    where: { propertyId },
  });

  const total = tasks.length;
  
  // Count by status
  const byStatus = {
    pending: tasks.filter((t) => t.status === 'PENDING').length,
    inProgress: tasks.filter((t) => t.status === 'IN_PROGRESS').length,
    completed: tasks.filter((t) => t.status === 'COMPLETED').length,
    cancelled: tasks.filter((t) => t.status === 'CANCELLED').length,
    needsReview: tasks.filter((t) => t.status === 'NEEDS_REVIEW').length,
  };

  // Count by priority
  const byPriority = {
    urgent: tasks.filter((t) => t.priority === 'URGENT').length,
    high: tasks.filter((t) => t.priority === 'HIGH').length,
    medium: tasks.filter((t) => t.priority === 'MEDIUM').length,
    low: tasks.filter((t) => t.priority === 'LOW').length,
  };

  // Count by source
  const bySource = {
    userCreated: tasks.filter((t) => t.source === 'USER_CREATED').length,
    actionCenter: tasks.filter((t) => t.source === 'ACTION_CENTER').length,
    seasonal: tasks.filter((t) => t.source === 'SEASONAL').length,
    riskAssessment: tasks.filter((t) => t.source === 'RISK_ASSESSMENT').length,
    warrantyRenewal: tasks.filter((t) => t.source === 'WARRANTY_RENEWAL').length,
    template: tasks.filter((t) => t.source === 'TEMPLATE').length,
  };

  // Calculate costs
  const totalEstimatedCost = tasks.reduce(
    (sum, t) => sum + Number(t.estimatedCost ?? 0),
    0
  );
  
  const totalActualCost = tasks.reduce(
    (sum, t) => sum + Number(t.actualCost ?? 0),
    0
  );

  return {
    total,
    byStatus,
    byPriority,
    bySource,
    totalEstimatedCost,
    totalActualCost,
  };
}
```

**Additional Calculated Fields (Not in DB):**

The service also calculates:
- `dueThisWeek` - Tasks with nextDueDate within 7 days
- `overdue` - Tasks with nextDueDate in the past

### Controller: `propertyMaintenanceTask.controller.ts`

**Location:** `apps/backend/src/controllers/propertyMaintenanceTask.controller.ts`

**Endpoint:** `GET /api/maintenance-tasks/property/:propertyId/stats`

```typescript
const handleGetPropertyStats = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    const { propertyId } = req.params;
    const stats = await PropertyMaintenanceTaskService.getPropertyStats(
      req.user.userId,
      propertyId
    );

    return res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error) {
    // Error handling
    next(error);
  }
};
```

**Route Registration:**

**Location:** `apps/backend/src/routes/propertyMaintenanceTask.routes.ts`

```typescript
router.get(
  '/property/:propertyId/stats', 
  propertyMaintenanceTaskController.handleGetPropertyStats
);
```

---

## Frontend API Client

### API Client: `client.ts`

**Location:** `apps/frontend/src/lib/api/client.ts`

```typescript
/**
 * Get maintenance task statistics for a property
 * 
 * @param propertyId - Property ID
 * @returns Task statistics (counts by status, priority, source, costs)
 */
async getMaintenanceTaskStats(
  propertyId: string
): Promise<APIResponse<MaintenanceTaskStats>> {
  return this.request<MaintenanceTaskStats>(
    `/api/maintenance-tasks/property/${propertyId}/stats`,
    {
      method: 'GET',
    }
  );
}
```

**Type Definition:**

```typescript
interface MaintenanceTaskStats {
  total: number;
  byStatus: {
    pending: number;
    inProgress: number;
    completed: number;
    cancelled: number;
    needsReview: number;
  };
  byPriority: {
    urgent: number;
    high: number;
    medium: number;
    low: number;
  };
  bySource: {
    userCreated: number;
    actionCenter: number;
    seasonal: number;
    riskAssessment: number;
    warrantyRenewal: number;
    template: number;
  };
  totalEstimatedCost: number;
  totalActualCost: number;
  dueThisWeek: number;
  overdue: number;
}
```

---

## Frontend Components

### Component: `ExistingOwnerDashboard.tsx`

**Location:** `apps/frontend/src/app/(dashboard)/dashboard/components/ExistingOwnerDashboard.tsx`

**Data Fetching:**

```typescript
const [stats, setStats] = useState<MaintenanceTaskStats | null>(null);

useEffect(() => {
  if (!selectedPropertyId) return;

  const fetchMaintenanceData = async () => {
    try {
      const statsResponse = await api.getMaintenanceTaskStats(selectedPropertyId);

      if (statsResponse.success) {
        setStats(statsResponse.data);
      }
    } catch (error) {
      console.error('Failed to fetch maintenance data:', error);
    }
  };

  fetchMaintenanceData();
}, [selectedPropertyId]);
```

**Rendering Statistics Cards:**

```typescript
// Calculate urgent tasks count
const urgentTasksCount = stats ? stats.byPriority.urgent + stats.byPriority.high : 0;

return (
  <div className="space-y-6 pb-8">
    {/* Main Statistics Cards */}
    {stats && (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Urgent Tasks */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Urgent Tasks
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-3xl font-bold text-red-600">
                {urgentTasksCount}
              </div>
              <AlertTriangle className="h-8 w-8 text-red-600 opacity-50" />
            </div>
            <p className="text-xs text-gray-600 mt-2">
              {stats.byPriority.urgent} urgent + {stats.byPriority.high} high priority
            </p>
          </CardContent>
        </Card>

        {/* Due Soon */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Due Soon
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-3xl font-bold text-orange-600">
                {stats.dueThisWeek}
              </div>
              <Calendar className="h-8 w-8 text-orange-600 opacity-50" />
            </div>
            <p className="text-xs text-gray-600 mt-2">
              Due within the next 7 days
            </p>
          </CardContent>
        </Card>

        {/* Estimated Costs */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Estimated Costs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-3xl font-bold text-blue-600">
                ${stats.totalEstimatedCost.toLocaleString()}
              </div>
              <DollarSign className="h-8 w-8 text-blue-600 opacity-50" />
            </div>
            <p className="text-xs text-gray-600 mt-2">
              For {stats.pending + stats.inProgress} active tasks
            </p>
          </CardContent>
        </Card>
      </div>
    )}

    {/* Task Status Overview */}
    {stats && (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Active Tasks (Pending + In Progress) */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Active Tasks</p>
                <p className="text-2xl font-bold text-blue-600">
                  {stats.pending + stats.inProgress}
                </p>
              </div>
              <Clock className="h-6 w-6 text-blue-600" />
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {stats.pending} pending, {stats.inProgress} in progress
            </p>
          </CardContent>
        </Card>

        {/* Completed */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Completed</p>
                <p className="text-2xl font-bold text-green-600">
                  {stats.completed}
                </p>
              </div>
              <CheckCircle2 className="h-6 w-6 text-green-600" />
            </div>
          </CardContent>
        </Card>

        {/* Total Tasks */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Tasks</p>
                <p className="text-2xl font-bold text-gray-900">
                  {stats.total}
                </p>
              </div>
              <Clock className="h-6 w-6 text-gray-400" />
            </div>
          </CardContent>
        </Card>
      </div>
    )}
  </div>
);
```

---

## Data Flow Summary

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. USER VISITS DASHBOARD                                       │
│    Component: ExistingOwnerDashboard.tsx                       │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. FRONTEND FETCHES STATS                                       │
│    API Call: api.getMaintenanceTaskStats(propertyId)           │
│    File: apps/frontend/src/lib/api/client.ts                   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3. HTTP REQUEST                                                 │
│    GET /api/maintenance-tasks/property/{propertyId}/stats      │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 4. BACKEND ROUTE HANDLER                                        │
│    File: apps/backend/src/routes/propertyMaintenanceTask.routes│
│    Controller: handleGetPropertyStats()                         │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 5. SERVICE LAYER PROCESSING                                     │
│    File: apps/backend/src/services/PropertyMaintenanceTask.svc │
│    Method: getPropertyStats(userId, propertyId)                │
│                                                                 │
│    Steps:                                                       │
│    a) Verify user owns property                                │
│    b) Query: SELECT * FROM property_maintenance_tasks          │
│              WHERE propertyId = {propertyId}                   │
│    c) Calculate statistics in memory:                          │
│       - Count by status (pending, in_progress, completed)      │
│       - Count by priority (urgent, high, medium, low)          │
│       - Count by source (action_center, seasonal, etc)         │
│       - Sum estimatedCost and actualCost                       │
│       - Calculate dueThisWeek and overdue                      │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 6. DATABASE QUERY                                               │
│    Table: property_maintenance_tasks                            │
│    Uses indexes:                                                │
│    - @@index([propertyId])                                     │
│    - @@index([status])                                         │
│    - @@index([priority])                                       │
│    - @@index([nextDueDate])                                    │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 7. RESPONSE SENT BACK                                           │
│    JSON: {                                                      │
│      success: true,                                             │
│      data: {                                                    │
│        total: 9,                                                │
│        byStatus: { pending: 3, inProgress: 2, ... },           │
│        byPriority: { urgent: 2, high: 3, ... },                │
│        totalEstimatedCost: 10300,                              │
│        dueThisWeek: 0,                                         │
│        overdue: 0                                              │
│      }                                                          │
│    }                                                            │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 8. FRONTEND RENDERS CARDS                                       │
│    Component: ExistingOwnerDashboard.tsx                       │
│                                                                 │
│    Cards displayed:                                             │
│    • Urgent Tasks: stats.byPriority.urgent + high = 5          │
│    • Due Soon: stats.dueThisWeek = 0                           │
│    • Estimated Costs: $10,300                                  │
│    • Active Tasks: stats.pending + inProgress = 5              │
│    • Completed: stats.completed = 0                            │
│    • Total Tasks: stats.total = 9                              │
└─────────────────────────────────────────────────────────────────┘
```

---

## Card-to-Field Mapping

| Card Name | Source Field(s) | Calculation |
|-----------|----------------|-------------|
| **Urgent Tasks** | `stats.byPriority.urgent` + `stats.byPriority.high` | Sum of urgent + high priority tasks |
| **Due Soon** | `stats.dueThisWeek` | Tasks with `nextDueDate` within 7 days |
| **Estimated Costs** | `stats.totalEstimatedCost` | Sum of all `estimatedCost` values |
| **Active Tasks** | `stats.byStatus.pending` + `stats.byStatus.inProgress` | Sum of pending + in_progress status |
| **Completed** | `stats.byStatus.completed` | Count of completed status |
| **Total Tasks** | `stats.total` | Total count of all tasks |

---

## Key Files Reference

### Backend
- **Schema**: `apps/workers/prisma/schema.prisma`
- **Service**: `apps/backend/src/services/PropertyMaintenanceTask.service.ts`
- **Controller**: `apps/backend/src/controllers/propertyMaintenanceTask.controller.ts`
- **Routes**: `apps/backend/src/routes/propertyMaintenanceTask.routes.ts`

### Frontend
- **API Client**: `apps/frontend/src/lib/api/client.ts`
- **Dashboard Component**: `apps/frontend/src/app/(dashboard)/dashboard/components/ExistingOwnerDashboard.tsx`
- **Types**: `apps/frontend/src/types/index.ts`

---

## Current Issue: NaN Values

**Problem:** Active Tasks and Estimated Costs showing "NaN"

**Root Cause:** `stats` object might have undefined/null values for `pending` or `inProgress`

**Fix:**
```typescript
// Current (breaks with undefined values)
{stats.pending + stats.inProgress}

// Fixed (handles undefined gracefully)
{(stats.pending || 0) + (stats.inProgress || 0)}
```
