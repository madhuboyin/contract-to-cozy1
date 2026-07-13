# 06 — API Design

## Conventions

Follow current `/api/properties/:propertyId/...` property-first routes, cookie authentication, CSRF for mutation, Zod validation, `{ success: true, data }`, `APIError`, and `propertyAuthMiddleware`. Do not expose internal household IDs when property context is enough. Version behavior through schema/content fields first; use `/v2` only for breaking contracts.

OWNER manages sensitive profile/consent by default. CONTRIBUTOR can read ordinary recommendations and create actions/feedback; VIEWER read access excludes sensitive evidence. All service methods recheck scope even when middleware is present.

## Endpoint specification

| Method/path | Purpose/auth | Request/validation | Response, pagination/cache | Errors/idempotency/audit |
|---|---|---|---|---|
| `GET /api/properties/:propertyId/personalization/profile` | profile summary; OWNER, restricted contributor view | UUID param | `HouseholdProfileDTO`; ETag/private no-store for sensitive raw data | 403/404; read audit only for sensitive view |
| `PATCH .../profile` | update composition/lifestyle/future plan; OWNER | partial typed DTO, explicit null semantics, version precondition | updated profile + affected traits + `evaluationQueued` | 409 version; `Idempotency-Key`; audit changed field keys, not values |
| `GET .../pets` | list home-relevant pet profiles; OWNER/authorized contributor | status cursor | page; no shared cache | 403/404 |
| `POST .../pets` | add pet aggregate | typed bands; no names/medical fields | 201 pet + affected traits | idempotency; audit |
| `PATCH .../pets/:petId` | correct pet context | UUID, version, allowed fields | updated pet | 404/409; audit |
| `DELETE .../pets/:petId` | remove/soft-delete then privacy purge policy | UUID/version | 204, recompute queued | idempotent; audit |
| `GET/PUT .../goals` | get/replace active goal set; OWNER | allowlisted codes, priority/horizon | active goals | PUT idempotent; version conflict; audit |
| `GET/PUT .../preferences` | get/replace service/budget/category preferences; OWNER | typed allowlists/cadence | active preferences | PUT idempotent; audit |
| `GET .../traits` | user-visible current traits; OWNER; contributor redacted | filters `source,key,privacyClass`, cursor | `TraitDTO[]`; ETag, max 100 | no raw evidence IDs without access |
| `PATCH .../traits/:traitKey/override` | correct/disable inference; OWNER | typed value or disabled flag/reason | effective trait + provenance | 409 incompatible type; audit |
| `DELETE .../traits/:traitKey/override` | resume derivation | key | recompute queued | idempotent/audit |
| `GET .../personalization-context` | debugging/controls summary, not raw internal snapshot | `include=freshness,completeness` | redacted `ContextSummaryDTO`; ETag 5 min | 403; access audit |
| `GET .../recommendations` | ranked channel/module list | `channel`, `module`, category/status, cursor, limit≤25, sort fixed to rank | page + snapshot freshness; ETag/Redis 5–15 min | 404 property; never evaluate external calls inline |
| `GET .../recommendations/:id` | detail/explanation/actions | UUID | full authorized detail | 404 for out-of-scope to avoid enumeration; view event deduped |
| `POST .../recommendations/:id/feedback` | explicit/implicit signal | event enum, reason code, optional bounded comment; eventId | 202/current state | eventId unique; audit explicit feedback |
| `POST .../:id/snooze` | time-bounded suppression | until or allowed duration, reason | state | idempotency; safety max snooze policy |
| `POST .../:id/dismiss` | dismiss/not relevant | reason and scope (`INSTANCE`, optional `DEFINITION`) | state | idempotency; audit |
| `POST .../:id/actions/convert-to-task` | invoke existing task adapter | recurrence/due date overrides, action template version | 201 action + task, or existing result | required idempotency; 409 unsupported/safety constraint |
| `GET .../profile/questions/next` | one contextual question | placement/module, exclude IDs | question or 204; private no-store | impression capped/deduped |
| `POST .../profile/questions/:code/answer` | answer/skip/ask later | answer union + action + question version | traits affected + queued flag | idempotency, 409 stale question; audit |
| `POST /api/internal/personalization/evaluations` | enqueue scoped evaluation; ADMIN/internal worker auth | propertyId, reason, definition codes optional | 202 run ID | not public; dedupe job key; admin audit |
| `GET /api/admin/personalization/evaluations/:id` | operational run diagnostics; ADMIN+MFA | UUID | counts/durations/reason codes, no raw sensitive context | admin audit |
| `POST /api/admin/personalization/definitions/:code/pause` | emergency kill switch; ADMIN+MFA | reason/version | new status | idempotent; immutable audit |
| `DELETE .../profile` | reset personalization | typed confirmation, scope | 202 erasure job | owner only, step-up confirmation; erasure audit |

List endpoints use opaque cursor (`score,lastEvaluatedAt,id`) and stable rank. Never offer arbitrary field sorting that defeats diversity. Recommendation list responses declare `generatedAt`, `stale`, `nextRefreshBy`, `modelVersion`.

## Representative DTOs

```ts
type LifeStage = 'INFANT_TODDLER'|'SCHOOL_AGE'|'TEEN'|'ADULT'|'SENIOR';
type FrequencyBand = 'NEVER'|'OCCASIONAL'|'MONTHLY'|'WEEKLY'|'DAILY';

interface HouseholdProfilePatchDTO {
  expectedVersion: number;
  composition?: Array<{ lifeStage: LifeStage; count: number }>;
  workFromHomeDaysBand?: 'NONE'|'ONE_TWO'|'THREE_FOUR'|'FULL_TIME';
  travelFrequency?: FrequencyBand;
  hostingFrequency?: FrequencyBand;
  futurePlans?: Array<{ code: 'SELL'|'REMODEL'|'RELOCATE'|'RETIRE'|'EXTENDED_TRAVEL'; horizonMonths?: number }>;
}

interface PetUpsertDTO {
  type: 'DOG'|'CAT'|'BIRD'|'SMALL_MAMMAL'|'OTHER_HOME_RELEVANT';
  count: number;
  sizeBand?: 'SMALL'|'MEDIUM'|'LARGE';
  shedding?: 'LOW'|'MODERATE'|'HIGH'|'UNKNOWN';
  indoorOutdoor?: 'INDOOR'|'OUTDOOR_ACCESS'|'MOSTLY_OUTDOOR';
  usesYard?: boolean;
  fenceDependent?: boolean;
  appliesToPropertyIds?: string[];
}

interface TraitDTO {
  key: string;
  value: boolean | number | string | string[];
  source: 'EXPLICIT'|'INFERRED'|'DERIVED'|'EXTERNAL'|'OVERRIDE';
  confidence: number;
  privacyClass: 'OPERATIONAL'|'PERSONAL'|'SENSITIVE';
  computedAt: string;
  validUntil?: string;
  canOverride: boolean;
  explanation: string;
}

interface RecommendationListItemDTO {
  id: string;
  code: string;
  category: string;
  modules: string[];
  title: string;
  summary: string;
  score: number;
  priority: 'URGENT'|'HIGH'|'MEDIUM'|'LOW';
  confidence: { score: number; band: 'HIGH'|'MEDIUM'|'LOW' };
  urgency?: { label: string; deadline?: string };
  benefits: Array<{ type: 'RISK'|'COST'|'COMFORT'|'VALUE'; label: string }>;
  reasonPreview: string[];
  actions: Array<{ type: string; label: string; enabled: boolean }>;
  expiresAt?: string;
}

interface RecommendationDetailDTO extends RecommendationListItemDTO {
  explanation: {
    reasons: Array<{ code: string; text: string }>;
    evidence: Array<{ label: string; observedAt?: string; correctionHref?: string }>;
    limitations: string[];
    ignoreImpact?: string;
  };
  cost?: { min?: number; max?: number; currency: 'USD'; confidence: string };
  effort?: { band: 'LOW'|'MEDIUM'|'HIGH'; hours?: number };
  status: 'ACTIVE'|'SNOOZED'|'DISMISSED'|'ACTED'|'EXPIRED';
}

type FeedbackDTO = {
  eventId: string;
  type: 'VIEWED'|'EXPANDED'|'SAVED'|'ACCEPTED'|'COMPLETED'|'DISMISSED'|'SNOOZED'|'NOT_RELEVANT'|'PROFILE_CORRECTED'|'VENDOR_CLICKED'|'NOTIFICATION_OPENED'|'NOTIFICATION_MUTED';
  explicit: boolean;
  reasonCode?: 'ALREADY_DONE'|'TOO_EXPENSIVE'|'NOT_APPLICABLE'|'BAD_TIMING'|'WRONG_PROFILE'|'OTHER';
  comment?: string;
};
```

## Errors and caching

Use stable codes: `PERSONALIZATION_NOT_CONFIGURED`, `PROFILE_VERSION_CONFLICT`, `TRAIT_TYPE_MISMATCH`, `QUESTION_NOT_ELIGIBLE`, `RECOMMENDATION_EXPIRED`, `ACTION_NOT_SUPPORTED`, `SNOOZE_NOT_ALLOWED`, `CONSENT_REQUIRED`, `ERASURE_IN_PROGRESS`. Validation returns field details without submitted sensitive values.

Profile and control endpoints are private/no-store. Recommendation reads support ETag keyed by snapshot version and optional Redis; mutations invalidate property/household keys after commit and enqueue recompute. Admin/internal endpoints are never CDN cached.

## Audit and privacy

Record actor, property/household IDs, action, entity/version, reason code, request ID and timestamp. Do not log answers, rule AST inputs, household details, addresses, comments, or explanation payloads. Sensitive detail access may be audited. Analytics receives definition/category/channel and outcome, not household traits.
