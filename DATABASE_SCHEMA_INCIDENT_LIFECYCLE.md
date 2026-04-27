# Database Schema Changes: Incident Lifecycle Management

## Overview
Added two new tables to support incident lifecycle management with type-specific staleness thresholds, user pinning, archiving, and auto-resolution notifications.

## Schema Changes

### 1. IncidentUserPreference Table

Tracks user-specific preferences for incident visibility and lifecycle management.

```prisma
model IncidentUserPreference {
  id         String  @id @default(cuid())
  incidentId String
  userId     String

  // Pinning: Prevents auto-resolution and keeps incident visible
  isPinned   Boolean   @default(false)
  pinnedAt   DateTime?
  pinnedNote String?

  // Archiving: Hides incident from main views but allows restoration
  isArchived     Boolean   @default(false)
  archivedAt     DateTime?
  archivedReason String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  incident Incident @relation(fields: [incidentId], references: [id], onDelete: Cascade)
  user     User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([incidentId, userId])
  @@index([userId])
  @@index([isPinned])
  @@index([isArchived])
  @@map("incident_user_preferences")
}
```

**Key Features:**
- One preference record per user per incident
- `isPinned`: When true, prevents auto-resolution and keeps incident visible in dashboard
- `isArchived`: When true, hides incident from main views but allows restoration
- Cascading delete when incident or user is deleted
- Optimized indexes for filtering pinned/archived incidents

### 2. IncidentAutoResolutionNotification Table

Schedules and tracks auto-resolution of stale incidents based on type-specific thresholds.

```prisma
model IncidentAutoResolutionNotification {
  id         String @id @default(cuid())
  incidentId String
  propertyId String
  userId     String

  // Scheduling
  scheduledFor DateTime // When the incident should be auto-resolved

  // Execution tracking
  notifiedAt DateTime? // When user was notified (7 days before)
  canceledAt DateTime? // If user canceled auto-resolution
  executedAt DateTime? // When auto-resolution was executed

  createdAt DateTime @default(now())

  incident Incident @relation(fields: [incidentId], references: [id], onDelete: Cascade)
  property Property @relation(fields: [propertyId], references: [id], onDelete: Cascade)
  user     User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([incidentId])
  @@index([scheduledFor])
  @@index([propertyId])
  @@index([userId])
  @@map("incident_auto_resolution_notifications")
}
```

**Key Features:**
- One notification per incident (unique constraint)
- `scheduledFor`: Calculated based on incident type and staleness threshold
- `notifiedAt`: Set when user receives 7-day warning notification
- `canceledAt`: Set if user pins incident or manually cancels auto-resolution
- `executedAt`: Set when auto-resolution is executed by background job
- Optimized index on `scheduledFor` for efficient cron job queries

## Relations Added

### Incident Model
```prisma
model Incident {
  // ... existing fields ...
  
  userPreferences             IncidentUserPreference[]
  autoResolutionNotifications IncidentAutoResolutionNotification[]
}
```

### User Model
```prisma
model User {
  // ... existing fields ...
  
  incidentUserPreferences             IncidentUserPreference[]
  incidentAutoResolutionNotifications IncidentAutoResolutionNotification[]
}
```

### Property Model
```prisma
model Property {
  // ... existing fields ...
  
  incidentAutoResolutionNotifications IncidentAutoResolutionNotification[]
}
```

## Migration Instructions

### Step 1: Generate Migration
```bash
cd apps/backend
npx prisma migrate dev --name add_incident_lifecycle_management
```

### Step 2: Review Migration SQL
The migration will create:
- `incident_user_preferences` table with indexes
- `incident_auto_resolution_notifications` table with indexes
- Foreign key constraints to `incidents`, `users`, and `properties` tables

### Step 3: Apply to Production
```bash
npx prisma migrate deploy
```

### Step 4: Verify Schema
```bash
npx prisma validate
npx prisma format
```

## Usage Examples

### Query Pinned Incidents
```typescript
const pinnedIncidents = await prisma.incident.findMany({
  where: {
    propertyId: propertyId,
    userPreferences: {
      some: {
        userId: userId,
        isPinned: true
      }
    }
  },
  include: {
    userPreferences: {
      where: { userId: userId }
    }
  }
});
```

### Query Incidents Scheduled for Auto-Resolution
```typescript
const scheduledIncidents = await prisma.incidentAutoResolutionNotification.findMany({
  where: {
    scheduledFor: {
      lte: new Date()
    },
    executedAt: null,
    canceledAt: null
  },
  include: {
    incident: {
      include: {
        userPreferences: true
      }
    }
  }
});
```

### Pin an Incident
```typescript
await prisma.incidentUserPreference.upsert({
  where: {
    incidentId_userId: {
      incidentId: incidentId,
      userId: userId
    }
  },
  create: {
    incidentId: incidentId,
    userId: userId,
    isPinned: true,
    pinnedAt: new Date(),
    pinnedNote: 'Important - do not auto-resolve'
  },
  update: {
    isPinned: true,
    pinnedAt: new Date(),
    pinnedNote: 'Important - do not auto-resolve'
  }
});

// Cancel any pending auto-resolution
await prisma.incidentAutoResolutionNotification.updateMany({
  where: {
    incidentId: incidentId,
    executedAt: null
  },
  data: {
    canceledAt: new Date()
  }
});
```

### Archive an Incident
```typescript
await prisma.incidentUserPreference.upsert({
  where: {
    incidentId_userId: {
      incidentId: incidentId,
      userId: userId
    }
  },
  create: {
    incidentId: incidentId,
    userId: userId,
    isArchived: true,
    archivedAt: new Date(),
    archivedReason: 'No longer relevant'
  },
  update: {
    isArchived: true,
    archivedAt: new Date(),
    archivedReason: 'No longer relevant'
  }
});
```

### Schedule Auto-Resolution
```typescript
import { calculateStalenessStatus } from '@/lib/incidents/stalenessConfig';

const incident = await prisma.incident.findUnique({
  where: { id: incidentId }
});

const stalenessStatus = calculateStalenessStatus(incident);
const scheduledDate = new Date();
scheduledDate.setDate(scheduledDate.getDate() + stalenessStatus.daysUntilAutoResolve);

await prisma.incidentAutoResolutionNotification.create({
  data: {
    incidentId: incident.id,
    propertyId: incident.propertyId,
    userId: incident.userId,
    scheduledFor: scheduledDate
  }
});
```

## Background Job Requirements

### Cron Job: Process Auto-Resolutions
Run every hour to check for incidents that should be auto-resolved.

```typescript
// apps/workers/src/jobs/processIncidentAutoResolution.ts

export async function processIncidentAutoResolution() {
  const now = new Date();
  
  // Find notifications scheduled for now or earlier
  const notifications = await prisma.incidentAutoResolutionNotification.findMany({
    where: {
      scheduledFor: { lte: now },
      executedAt: null,
      canceledAt: null
    },
    include: {
      incident: {
        include: {
          userPreferences: true
        }
      }
    }
  });
  
  for (const notification of notifications) {
    // Skip if incident is pinned
    const isPinned = notification.incident.userPreferences.some(
      pref => pref.isPinned && pref.userId === notification.userId
    );
    
    if (isPinned) {
      await prisma.incidentAutoResolutionNotification.update({
        where: { id: notification.id },
        data: { canceledAt: now }
      });
      continue;
    }
    
    // Auto-resolve the incident
    await prisma.incident.update({
      where: { id: notification.incidentId },
      data: {
        status: 'RESOLVED',
        resolvedAt: now
      }
    });
    
    // Create event
    await prisma.incidentEvent.create({
      data: {
        incidentId: notification.incidentId,
        propertyId: notification.propertyId,
        type: 'RESOLVED',
        message: 'Auto-resolved due to staleness',
        payload: {
          autoResolved: true,
          notificationId: notification.id
        }
      }
    });
    
    // Mark notification as executed
    await prisma.incidentAutoResolutionNotification.update({
      where: { id: notification.id },
      data: { executedAt: now }
    });
  }
}
```

### Cron Job: Send 7-Day Warnings
Run daily to send notifications 7 days before auto-resolution.

```typescript
// apps/workers/src/jobs/sendAutoResolutionWarnings.ts

export async function sendAutoResolutionWarnings() {
  const sevenDaysFromNow = new Date();
  sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
  
  const notifications = await prisma.incidentAutoResolutionNotification.findMany({
    where: {
      scheduledFor: {
        gte: new Date(),
        lte: sevenDaysFromNow
      },
      notifiedAt: null,
      canceledAt: null,
      executedAt: null
    },
    include: {
      incident: true,
      user: true,
      property: true
    }
  });
  
  for (const notification of notifications) {
    // Send email/push notification to user
    await sendNotification({
      userId: notification.userId,
      type: 'INCIDENT_AUTO_RESOLUTION_WARNING',
      title: 'Incident will be auto-resolved soon',
      message: `"${notification.incident.title}" will be auto-resolved in 7 days. Pin it to keep it visible.`,
      data: {
        incidentId: notification.incidentId,
        propertyId: notification.propertyId,
        scheduledFor: notification.scheduledFor
      }
    });
    
    // Mark as notified
    await prisma.incidentAutoResolutionNotification.update({
      where: { id: notification.id },
      data: { notifiedAt: new Date() }
    });
  }
}
```

## Performance Considerations

### Indexes
All critical query paths are indexed:
- `incident_user_preferences(userId)` - Fast lookup of user's preferences
- `incident_user_preferences(isPinned)` - Fast filtering of pinned incidents
- `incident_user_preferences(isArchived)` - Fast filtering of archived incidents
- `incident_auto_resolution_notifications(scheduledFor)` - Fast cron job queries
- `incident_auto_resolution_notifications(propertyId)` - Fast property-level queries
- `incident_auto_resolution_notifications(userId)` - Fast user-level queries

### Unique Constraints
- `incident_user_preferences(incidentId, userId)` - Prevents duplicate preferences
- `incident_auto_resolution_notifications(incidentId)` - One notification per incident

## Testing Checklist

- [ ] Create incident user preference (pin)
- [ ] Create incident user preference (archive)
- [ ] Update existing preference
- [ ] Query pinned incidents for user
- [ ] Query archived incidents for user
- [ ] Create auto-resolution notification
- [ ] Query notifications scheduled for today
- [ ] Cancel notification when incident is pinned
- [ ] Execute auto-resolution via background job
- [ ] Send 7-day warning notifications
- [ ] Verify cascading deletes work correctly
- [ ] Test unique constraints prevent duplicates
- [ ] Verify indexes improve query performance

## Rollback Plan

If issues arise, rollback with:

```bash
npx prisma migrate resolve --rolled-back <migration_name>
```

Then manually drop tables:

```sql
DROP TABLE IF EXISTS incident_auto_resolution_notifications CASCADE;
DROP TABLE IF EXISTS incident_user_preferences CASCADE;
```

## Related Documentation

- Frontend implementation: `INCIDENT_LIFECYCLE_ENHANCEMENTS.md`
- Staleness configuration: `apps/frontend/src/lib/incidents/stalenessConfig.ts`
- UI components: `apps/frontend/src/app/(dashboard)/dashboard/components/incidents/`
