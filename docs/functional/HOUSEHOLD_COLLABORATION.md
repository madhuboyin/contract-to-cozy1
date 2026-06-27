# Household Collaboration Layer

## Overview

Household Collaboration Layer adds multi-user access to properties. Every feature in the platform — risk assessment, maintenance tasks, guidance journeys, financial tools, claims, inventory — is currently accessible to exactly one person per property. Homes are not single-person operations: couples co-own, adult children help aging parents manage remotely, and domestic partners share maintenance responsibility.

This feature introduces:
- **Household membership** with three distinct roles per property
- **Pending invitations** via email (invitees do not need an existing account to be invited)
- **Task assignment** so any household task can be delegated to a specific member
- **Per-member notification preferences** scoped to a property
- **Activity feed** giving all members visibility into who did what
- **Role-aware access control** wired into the existing `propertyAuth.middleware`

The primary owner (the user who created the property) retains full administrative control and is the only member who can invite, change roles, and remove other members.

---

## Feature Goals

- Allow a second adult in the household to access the full property without sharing login credentials
- Enable task delegation so maintenance responsibilities can be split between household members
- Give every member relevant notifications based on their own preferences, not just the primary owner's
- Provide an activity trail so all members know what has been done and by whom
- Keep auth changes minimal — roles are property-scoped addenda to the existing JWT/RBAC system, not a replacement

---

## Roles

| Role | Who | Capabilities |
|---|---|---|
| `OWNER` | The user who created the property (and any user the primary owner promotes) | Full access — all reads, all writes, invite/remove members, change roles, delete property |
| `CONTRIBUTOR` | Active household member (spouse, partner, adult child living at home) | All reads, create/update/complete tasks, log home events, add inventory, update incidents — cannot invite members or change property settings |
| `VIEWER` | Remote or passive member (adult child checking on aging parent's home, trusted contact) | All reads — no writes. Cannot create tasks, cannot add inventory |

> **Primary owner:** The first `OWNER` on a property is the account that created it. The primary owner cannot be removed or demoted by any other member — only a platform admin can action a primary owner change request.

---

## Database

### Enums

```prisma
enum HouseholdRole {
  OWNER
  CONTRIBUTOR
  VIEWER
}

enum HouseholdInviteStatus {
  PENDING    // Sent, awaiting acceptance
  ACCEPTED   // Invitee accepted and is now a HouseholdMember
  EXPIRED    // Invite link expired (7-day TTL)
  REVOKED    // Owner revoked before acceptance
}

enum HouseholdActivityType {
  MEMBER_INVITED
  MEMBER_JOINED
  MEMBER_REMOVED
  MEMBER_ROLE_CHANGED
  TASK_ASSIGNED
  TASK_COMPLETED
  TASK_CREATED
  HOME_EVENT_LOGGED
  INVENTORY_ITEM_ADDED
  INCIDENT_UPDATED
  CLAIM_FILED
  DOCUMENT_UPLOADED
  GUIDANCE_STEP_COMPLETED
  NOTE_ADDED
}
```

---

### Models

#### `HouseholdMember` — Property-Scoped User Role

One row per (user, property) pair. The primary owner's row is created automatically when the property is created.

| Column | Type | Notes |
|---|---|---|
| `id` | String (cuid) | PK |
| `propertyId` | String | FK → Property |
| `userId` | String | FK → User |
| `role` | `HouseholdRole` | OWNER / CONTRIBUTOR / VIEWER |
| `isPrimaryOwner` | Boolean | True only for the account that created the property. Cannot be changed via API. |
| `displayName` | String? | Overrides the user's global display name within this household (e.g. "Dad") |
| `notifyOnRiskChange` | Boolean | Default true for OWNER, false for others |
| `notifyOnTaskDue` | Boolean | Default true |
| `notifyOnTaskAssigned` | Boolean | Default true |
| `notifyOnGuidanceUpdate` | Boolean | Default true for OWNER |
| `notifyOnIncident` | Boolean | Default true |
| `notifyOnHomeEvent` | Boolean | Default false |
| `notifyOnAlerts` | Boolean | Default true |
| `joinedAt` | DateTime | When the member accepted the invite (equals `createdAt` for the primary owner) |
| `createdAt` | DateTime | |
| `updatedAt` | DateTime | |

**Unique constraint:** `propertyId + userId`
**Indexes:** `propertyId`, `userId`, `role`

---

#### `HouseholdInvite` — Pending Invitation

| Column | Type | Notes |
|---|---|---|
| `id` | String (cuid) | PK |
| `propertyId` | String | FK → Property |
| `invitedByUserId` | String | FK → User (must be OWNER) |
| `inviteeEmail` | String | Email address the invite was sent to |
| `inviteeUserId` | String? | Set if the invitee already has an account at invite time |
| `role` | `HouseholdRole` | The role the invitee will receive on acceptance |
| `status` | `HouseholdInviteStatus` | |
| `token` | String (unique) | Secure random token embedded in the invite link (32-byte hex) |
| `expiresAt` | DateTime | `createdAt + 7 days` |
| `acceptedAt` | DateTime? | |
| `revokedAt` | DateTime? | |
| `createdAt` | DateTime | |

**Indexes:** `propertyId`, `inviteeEmail`, `token`, `status`

---

#### `HouseholdActivityLog` — Append-Only Member Action Audit

| Column | Type | Notes |
|---|---|---|
| `id` | String (cuid) | PK |
| `propertyId` | String | FK → Property |
| `actorUserId` | String | FK → User (who performed the action) |
| `activityType` | `HouseholdActivityType` | |
| `targetUserId` | String? | FK → User (who was affected, for member-management events) |
| `entityType` | String? | The affected entity type (e.g. `PropertyMaintenanceTask`, `InventoryItem`) |
| `entityId` | String? | The affected entity ID |
| `summaryText` | String | Pre-rendered human-readable summary for the activity feed (e.g. "Sarah completed HVAC filter replacement") |
| `metaJson` | Json? | Additional context (e.g. previous role, task name) |
| `createdAt` | DateTime | |

**Indexes:** `propertyId + createdAt`, `actorUserId`, `entityType + entityId`

---

### Changes to Existing Models

The following existing models gain an `assignedToUserId` field to support task delegation:

```prisma
// PropertyMaintenanceTask — add:
assignedToUserId  String?
assignedTo        User?     @relation("MaintenanceTaskAssignee", fields: [assignedToUserId], references: [id])

// SeasonalTask — add:
assignedToUserId  String?
assignedTo        User?     @relation("SeasonalTaskAssignee", fields: [assignedToUserId], references: [id])

// HomeBuyerTask — add:
assignedToUserId  String?
assignedTo        User?     @relation("HomeBuyerTaskAssignee", fields: [assignedToUserId], references: [id])
```

---

## Auth Changes

### `propertyAuth.middleware`

Currently validates that `req.user.id` is the owner of the requested property. Updated to also accept any active `HouseholdMember` for that property. The resolved role is attached to `req.householdRole` for downstream permission checks.

```typescript
// New logic in propertyAuth.middleware:
const member = await prisma.householdMember.findUnique({
  where: { propertyId_userId: { propertyId, userId: req.user.id } }
})
if (!member) throw new ForbiddenError('Not a member of this property')
req.householdRole = member.role
```

### Write-guard helper

A `requireRole(minRole: HouseholdRole)` middleware is added for routes that require CONTRIBUTOR or OWNER access. Applied per-route:

```typescript
// CONTRIBUTOR or OWNER only:
router.patch('/tasks/:taskId', requireRole('CONTRIBUTOR'), ...)

// OWNER only:
router.post('/members/invite', requireRole('OWNER'), ...)
router.delete('/members/:memberId', requireRole('OWNER'), ...)
```

---

## Backend

### Files

| File | Purpose |
|---|---|
| `backend/src/routes/household.routes.ts` | Express route definitions |
| `backend/src/controllers/household.controller.ts` | Request/response handling |
| `backend/src/services/household.service.ts` | Membership CRUD, invite lifecycle, activity logging |
| `backend/src/services/householdNotification.service.ts` | Dispatches notifications to all eligible members |
| `backend/src/middleware/householdRole.middleware.ts` | `requireRole()` write-guard middleware |
| `backend/src/validators/household.validators.ts` | Zod v4 input schemas |
| `backend/src/index.ts` | Route mounting |

---

### API Endpoints

All endpoints require `Authorization: Bearer <token>` and `propertyAuth.middleware`.

#### Members

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/properties/:propertyId/household/members` | List all active household members |
| `GET` | `/api/properties/:propertyId/household/members/me` | Get the calling user's member record and role for this property |
| `PATCH` | `/api/properties/:propertyId/household/members/:memberId` | Update a member's role or display name (OWNER only) |
| `DELETE` | `/api/properties/:propertyId/household/members/:memberId` | Remove a member (OWNER only; cannot remove primary owner) |
| `PATCH` | `/api/properties/:propertyId/household/members/me/notifications` | Update calling user's notification preferences for this property |

#### Invitations

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/properties/:propertyId/household/invites` | Send an invite (OWNER only) |
| `GET` | `/api/properties/:propertyId/household/invites` | List pending and recent invites (OWNER only) |
| `DELETE` | `/api/properties/:propertyId/household/invites/:inviteId` | Revoke a pending invite (OWNER only) |
| `POST` | `/api/household/invites/:token/accept` | Accept an invite (public endpoint; token in path) |
| `GET` | `/api/household/invites/:token` | Preview invite details before accepting (public) |

#### Activity Feed

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/properties/:propertyId/household/activity` | Paginated activity feed for this property |

#### Task Assignment (additions to existing task routes)

| Method | Path | Description |
|---|---|---|
| `PATCH` | `/api/properties/:propertyId/tasks/:taskId/assign` | Assign or reassign a task to a household member |

---

### Service Layer

#### `HouseholdService` (`household.service.ts`)

- **`listMembers(propertyId)`** — Returns all active `HouseholdMember` rows joined with user display name and email.
- **`getMyMembership(propertyId, userId)`** — Returns the calling user's member record; throws 403 if not a member.
- **`updateMemberRole(propertyId, targetMemberId, newRole, actorUserId)`** — Validates actor is OWNER; validates target is not primary owner; updates role; logs `MEMBER_ROLE_CHANGED`.
- **`removeMember(propertyId, targetMemberId, actorUserId)`** — Validates actor is OWNER; validates target is not primary owner; deletes `HouseholdMember`; logs `MEMBER_REMOVED`; sends removal notification to removed user.
- **`updateNotificationPreferences(propertyId, userId, prefs)`** — Updates notification flag fields on the member row.
- **`sendInvite(propertyId, actorUserId, payload)`** — Validates actor is OWNER; checks invitee is not already a member; generates secure 32-byte hex token; creates `HouseholdInvite`; sends invite email via notification service; logs `MEMBER_INVITED`.
- **`revokeInvite(propertyId, inviteId, actorUserId)`** — Validates actor is OWNER; sets invite status to `REVOKED`.
- **`previewInvite(token)`** — Returns property address snippet and invited role; validates token is `PENDING` and not expired. Public (no auth required).
- **`acceptInvite(token, acceptingUserId)`** — Validates token; creates `HouseholdMember` with the specified role; marks invite `ACCEPTED`; logs `MEMBER_JOINED`; sends welcome notification to all existing members.
- **`getActivityFeed(propertyId, params)`** — Cursor-paginated activity log, most recent first.
- **`assignTask(propertyId, taskId, taskType, assigneeUserId, actorUserId)`** — Updates `assignedToUserId` on the appropriate task model; validates assignee is an active member; logs `TASK_ASSIGNED`; sends assignment notification to assignee.
- **`logActivity(propertyId, actorUserId, type, meta?)`** — Internal method called by this service and by other services (task completion, inventory add, etc.) to write activity log entries.

#### `HouseholdNotificationService` (`householdNotification.service.ts`)

Extends the existing notification system to fan out to multiple members.

- **`notifyEligibleMembers(propertyId, eventType, payload)`** — Queries all active `HouseholdMember` rows for the property; filters to those with the relevant notification preference enabled; calls `NotificationService.send()` for each.
- **`notifyAssignee(memberId, taskTitle, taskType)`** — Sends a targeted push + in-app notification to a specific member: "You've been assigned: [taskTitle]".
- **`notifyAllOnCritical(propertyId, payload)`** — Sends to all OWNER and CONTRIBUTOR members regardless of notification preferences. Used for CRITICAL smart home alerts and HIGH risk incidents.

---

### Validators (`household.validators.ts`)

| Schema | Used By |
|---|---|
| `SendInviteSchema` | `POST .../invites` |
| `UpdateMemberRoleSchema` | `PATCH .../members/:memberId` |
| `UpdateNotificationPrefsSchema` | `PATCH .../members/me/notifications` |
| `AssignTaskSchema` | `PATCH .../tasks/:taskId/assign` |
| `ActivityFeedSchema` | `GET .../activity` (query params) |

---

## Invite Flow

```
Owner opens Members panel → taps "Invite Someone"
        │
        ▼
POST /api/properties/:propertyId/household/invites
  { email: "partner@example.com", role: "CONTRIBUTOR" }
        │
        ▼
HouseholdService.sendInvite()
  ├─ Generates 32-byte hex token
  ├─ Creates HouseholdInvite (status: PENDING, expiresAt: +7 days)
  ├─ Sends email: "You've been invited to [Property Address] on Contract to Cozy"
  │     Link: https://app.contracttocozy.com/invite/{token}
  └─ Logs MEMBER_INVITED to HouseholdActivityLog
        │
        ▼
Invitee clicks link → GET /api/household/invites/:token (public)
  └─ Returns { propertyAddressSnippet, role, invitedByName }
  └─ Frontend shows: "John invited you to 123 Main St as a Contributor"
        │
        ▼
Invitee taps "Accept"
  ├─ If not logged in → redirect to signup/login with return URL
  └─ POST /api/household/invites/:token/accept
        ├─ Creates HouseholdMember row
        ├─ Sets invite status ACCEPTED
        ├─ Logs MEMBER_JOINED
        └─ Notifies all existing OWNER members: "Sarah joined 123 Main St"
        │
        ▼
Invitee is redirected to /dashboard?propertyId=<id>
  └─ Property appears in their property selector
  └─ Their role determines which actions are available
```

---

## Frontend

### Files

| File | Purpose |
|---|---|
| `frontend/src/app/(dashboard)/dashboard/properties/[id]/household/page.tsx` | Household member management page |
| `frontend/src/app/(dashboard)/dashboard/properties/[id]/household/activity/page.tsx` | Activity feed page |
| `frontend/src/app/invite/[token]/page.tsx` | Public invite acceptance page (outside auth wrapper) |
| `frontend/src/components/features/household/MemberList.tsx` | Member cards with role badges and actions |
| `frontend/src/components/features/household/InviteMemberSheet.tsx` | Bottom sheet for sending an invite |
| `frontend/src/components/features/household/ActivityFeed.tsx` | Scrollable activity log |
| `frontend/src/components/features/household/ActivityFeedItem.tsx` | Single activity log entry |
| `frontend/src/components/features/household/AssignTaskSheet.tsx` | Member picker for task assignment |
| `frontend/src/components/features/household/HouseholdUtils.ts` | Role labels, icons, color maps |
| `frontend/src/lib/api/client.ts` | API client method additions |
| `frontend/src/types/index.ts` | TypeScript interface additions |

---

### Household Management Page

**Route:** `/dashboard/properties/:id/household`

**Sections:**
1. **Members list** — `MemberList`: each card shows avatar, display name, email, role badge, "last active" relative time. OWNER-only actions: change role (dropdown), remove (with confirm dialog).
2. **Pending invites** — Collapsible section listing unsettled invites with email, invited role, expiry, and "Revoke" action.
3. **"Invite Someone" button** — Opens `InviteMemberSheet`.
4. **"View Activity" link** — navigates to the activity feed page.

---

### Activity Feed Page

**Route:** `/dashboard/properties/:id/household/activity`

Cursor-paginated list of `ActivityFeedItem` components, most recent first. Each item shows:
- Actor avatar + name
- Activity description (e.g. "completed HVAC filter replacement", "invited sarah@example.com as Contributor")
- Relative timestamp
- Link to the affected entity (task, incident, inventory item) where applicable

---

### Invite Acceptance Page (`/invite/[token]`)

Public page (no auth required to view). Shows:
- Property address snippet
- Inviting member's name
- Proposed role with a short explanation ("Contributors can view and complete tasks, add inventory, and log home events")
- "Accept Invite" button (redirects to login/signup if not authenticated)
- "Decline" link (no API call; just navigates away)
- Expiry notice if < 24 hours remain

---

### Task Assignment

`AssignTaskSheet` is a bottom sheet triggered from any task card. Shows a list of current household members with their role and avatar. Selecting a member calls `PATCH .../assign`. The task card updates to show the assignee's avatar and name. Assigned tasks appear in a "Assigned to me" filter on the task list page.

---

### Property Selector (Existing Component — Updated)

The existing property selector in the top navigation shows all properties the user owns. It is updated to show all properties where the user has an active `HouseholdMember` row (regardless of role), with a role badge next to properties where they are CONTRIBUTOR or VIEWER.

---

### API Client Methods

```typescript
// Members
listHouseholdMembers(propertyId: string): Promise<HouseholdMemberSummary[]>
getMyHouseholdMembership(propertyId: string): Promise<HouseholdMemberSummary>
updateHouseholdMemberRole(propertyId: string, memberId: string, role: HouseholdRole): Promise<HouseholdMemberSummary>
removeHouseholdMember(propertyId: string, memberId: string): Promise<void>
updateMyNotificationPreferences(propertyId: string, prefs: HouseholdNotificationPrefs): Promise<void>

// Invites
sendHouseholdInvite(propertyId: string, payload: SendInvitePayload): Promise<HouseholdInviteSummary>
listHouseholdInvites(propertyId: string): Promise<HouseholdInviteSummary[]>
revokeHouseholdInvite(propertyId: string, inviteId: string): Promise<void>
previewInvite(token: string): Promise<InvitePreview>
acceptInvite(token: string): Promise<{ propertyId: string }>

// Activity
getHouseholdActivity(propertyId: string, params?: ActivityFeedParams): Promise<{ items: ActivityFeedItem[]; nextCursor?: string }>

// Task assignment
assignTask(propertyId: string, taskId: string, taskType: 'MAINTENANCE' | 'SEASONAL' | 'BUYER', assigneeUserId: string | null): Promise<void>
```

---

### TypeScript Interfaces

```typescript
type HouseholdRole = 'OWNER' | 'CONTRIBUTOR' | 'VIEWER'
type HouseholdInviteStatus = 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED'
type HouseholdActivityType = 'MEMBER_INVITED' | 'MEMBER_JOINED' | 'MEMBER_REMOVED' | 'MEMBER_ROLE_CHANGED' | 'TASK_ASSIGNED' | 'TASK_COMPLETED' | 'TASK_CREATED' | 'HOME_EVENT_LOGGED' | 'INVENTORY_ITEM_ADDED' | 'INCIDENT_UPDATED' | 'CLAIM_FILED' | 'DOCUMENT_UPLOADED' | 'GUIDANCE_STEP_COMPLETED' | 'NOTE_ADDED'

interface HouseholdMemberSummary {
  id: string
  userId: string
  displayName: string
  email: string
  role: HouseholdRole
  isPrimaryOwner: boolean
  joinedAt: string
  lastActiveAt?: string
  notificationPrefs: HouseholdNotificationPrefs
}

interface HouseholdNotificationPrefs {
  notifyOnRiskChange: boolean
  notifyOnTaskDue: boolean
  notifyOnTaskAssigned: boolean
  notifyOnGuidanceUpdate: boolean
  notifyOnIncident: boolean
  notifyOnHomeEvent: boolean
  notifyOnAlerts: boolean
}

interface HouseholdInviteSummary {
  id: string
  inviteeEmail: string
  role: HouseholdRole
  status: HouseholdInviteStatus
  expiresAt: string
  createdAt: string
}

interface InvitePreview {
  propertyAddressSnippet: string
  invitedByName: string
  role: HouseholdRole
  roleDescription: string
  expiresAt: string
  isExpired: boolean
}

interface ActivityFeedItem {
  id: string
  actorUserId: string
  actorDisplayName: string
  activityType: HouseholdActivityType
  summaryText: string
  entityType?: string
  entityId?: string
  entityLabel?: string
  createdAt: string
}

interface SendInvitePayload {
  email: string
  role: HouseholdRole
}

interface ActivityFeedParams {
  limit?: number
  cursor?: string
  activityTypes?: HouseholdActivityType[]
}
```

---

## Integration Points with Existing Features

### Notification System

`HouseholdNotificationService.notifyEligibleMembers()` wraps all existing notification calls that are property-scoped. The existing `NotificationService.send(userId, ...)` signature is unchanged — the household layer adds a fan-out step before it.

Features that gain multi-member notifications:
- Risk Assessment: risk level change → all members with `notifyOnRiskChange`
- Maintenance Tasks: due-date reminders → assignee + members with `notifyOnTaskDue`
- Incidents: new incident → all members with `notifyOnIncident`
- Smart Home Hub: CRITICAL alerts → all OWNER and CONTRIBUTOR members regardless of prefs
- Guidance Engine: new recommendation → OWNER members with `notifyOnGuidanceUpdate`

### Guidance Engine

Guidance steps that involve a discrete action (booking, document upload, task completion) can be assigned to a household member. The step card shows the assignee avatar. Step completion by any member marks the step complete for all.

### Home Digital Will

The trusted contact management in Home Digital Will can now pull from the property's `HouseholdMember` list as pre-populated options, rather than requiring manual email entry.

### Property Selector

Updated to show all properties where the user is a `HouseholdMember`. The property selector chip shows a role badge for non-owner properties: "123 Main St (Contributor)".

---

## Mobile Navigation

Household management is accessible from the property settings menu, not the main tool catalog. It is not a standalone tool — it is property administration.

**Entry point:** Property detail page → "Household Members" link in the settings section.
**Activity feed entry:** Household management page → "View all activity" link.

---

## Data Flow

```
Owner opens property → taps gear icon → "Household Members"
        │
        ▼
GET /household/members → MemberList renders (1 member initially: the owner)
        │
        ▼
Owner taps "Invite Someone" → InviteMemberSheet
        └─ POST /household/invites → invite email sent
        │
        ▼
Invitee receives email → opens /invite/:token
        └─ POST /household/invites/:token/accept
        └─ HouseholdMember created, MEMBER_JOINED logged
        │
        ▼
New member logs in → property appears in their property selector
        └─ All property-scoped routes accept their requests (CONTRIBUTOR role)
        └─ Write-guard blocks: invite others, delete property, change settings
        │
        ▼
Owner assigns a task to member
        └─ PATCH /tasks/:taskId/assign { assigneeUserId }
        └─ AssignedTo shown on task card
        └─ Member receives push: "You've been assigned: [task]"
        │
        ▼
Member completes the task
        └─ PATCH .../tasks/:taskId { status: COMPLETED }
        └─ HouseholdActivityLog entry: "Sarah completed HVAC filter replacement"
        └─ Owner receives notification (if notifyOnTaskDue pref enabled)
        │
        ▼
Any member opens activity feed
        └─ GET /household/activity → ActivityFeed renders full log
```

---

## Current Limitations

- A user can be a member of multiple properties simultaneously (e.g. their own home as OWNER and their parent's home as CONTRIBUTOR). The property selector handles this; there is no limit on how many properties a user can be a member of.
- Invite acceptance requires the invitee to create an account if they don't already have one. A friction-reduced "magic link auto-signup" flow is Phase 2.
- The activity log does not currently capture all platform actions — only the types enumerated in `HouseholdActivityType`. Actions in features that do not call `logActivity()` are not visible in the feed. Each feature team is expected to call `HouseholdService.logActivity()` as part of their write paths.
- Role changes take effect immediately with no grace period. If an OWNER demotes themselves (e.g. they are co-owners and the other OWNER demotes them), they lose OWNER capabilities immediately.
- No per-feature permission granularity in Phase 1. All contributors have the same write scope. Fine-grained per-feature permission is Phase 2.

---

## Phase 2 Roadmap

| Item | Description |
|---|---|
| Magic-link auto-signup | Invitee clicks the link, enters a display name and password in one step without a full registration flow |
| Per-feature permissions | CONTRIBUTOR role splits into configurable permissions (e.g. can manage inventory but not file claims) |
| Guest access | Time-limited VIEWER access for house-sitters, property managers, or Airbnb guests |
| Mobile push to all members | Native push tokens stored per-user; all members receive critical alerts on their personal devices |
| Activity feed digest | Weekly email digest of household activity, similar to the Home Gazette but focused on who did what |

---

## File Index

### Backend

| Path | Role |
|---|---|
| `apps/backend/src/routes/household.routes.ts` | Route definitions |
| `apps/backend/src/controllers/household.controller.ts` | Request handlers |
| `apps/backend/src/services/household.service.ts` | Membership and invite logic |
| `apps/backend/src/services/householdNotification.service.ts` | Multi-member notification fan-out |
| `apps/backend/src/middleware/householdRole.middleware.ts` | `requireRole()` write-guard |
| `apps/backend/src/validators/household.validators.ts` | Zod v4 schemas |
| `apps/backend/prisma/schema.prisma` | New models + task assignment fields |

### Frontend

| Path | Role |
|---|---|
| `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/household/page.tsx` | Member management page |
| `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/household/activity/page.tsx` | Activity feed page |
| `apps/frontend/src/app/invite/[token]/page.tsx` | Public invite acceptance page |
| `apps/frontend/src/components/features/household/MemberList.tsx` | Member cards |
| `apps/frontend/src/components/features/household/InviteMemberSheet.tsx` | Invite bottom sheet |
| `apps/frontend/src/components/features/household/ActivityFeed.tsx` | Activity feed |
| `apps/frontend/src/components/features/household/ActivityFeedItem.tsx` | Single activity item |
| `apps/frontend/src/components/features/household/AssignTaskSheet.tsx` | Task assignment member picker |
| `apps/frontend/src/components/features/household/HouseholdUtils.ts` | UI helpers |
| `apps/frontend/src/lib/api/client.ts` | API client methods |
| `apps/frontend/src/types/index.ts` | TypeScript interfaces |
