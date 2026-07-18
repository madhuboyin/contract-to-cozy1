# Contract-to-Cozy ADMIN Platform — Functional Requirements Document

**Version:** 2.0

**Last Updated:** 2026-07-17

**Status:** Target-state FRD — partially implemented, phased delivery required

**Audience:** Product, operations, customer support, trust and safety, content operations, finance operations, security, frontend engineering, backend engineering, platform engineering, QA

**Supersedes:** Version 1.2 of this document, which covered the initial dedicated ADMIN shell and session controls

**Related documents:**

- `docs/property-context/PROPERTY_CONTEXT_FRD.md`
- `docs/property-context/PROPERTY_CONTEXT_CATALOG_GOVERNANCE_FRD.md`
- `docs/personalization/08-personalization-frd.md`

---

## Table of contents

1. Executive summary
2. Status vocabulary
3. Product vision and operating principles
4. Current-state review
5. Goals, outcomes, and non-goals
6. Target ADMIN architecture
7. Target information architecture
8. Admin personas, roles, and capabilities
9. Cross-platform functional requirements
10. Domain requirements
11. Security, privacy, and compliance
12. Data and audit requirements
13. API and integration requirements
14. Non-functional requirements
15. Analytics and success measures
16. Testing strategy
17. Phased implementation roadmap
18. Rollout and operational readiness
19. Acceptance criteria
20. Decisions and open questions
21. Definition of done
22. Repository evidence map
23. Initial ADMIN implementation history

---

## 1. Executive summary

The ADMIN platform is the internal operating system for Contract-to-Cozy. It
must support the teams responsible for customers, providers, marketplace
transactions, content, configuration, platform health, privacy, and security
without exposing internal users to homeowner or provider product surfaces.

The first ADMIN implementation established a dedicated shell, consistent
navigation, route guards, MFA-protected operational pages, and an inactivity
timeout. It currently exposes six primary workspaces:

1. Provider Compliance
2. DIY Templates
3. Analytics
4. Knowledge Admin
5. Worker Jobs
6. Personalization

The backend also contains admin-only or admin-capable operations for shared-data
health, financing rates, permit data sources, release gates, booking visibility,
and provider data. These are not yet organized into a complete internal product.

This FRD defines the complete target-state ADMIN platform and clearly separates:

- **Current:** implemented and discoverable in the ADMIN module;
- **API-only/current foundation:** implemented backend/domain capability without
  a complete ADMIN experience;
- **Planned:** committed target capability in the phased roadmap;
- **Future:** target architecture capability that follows the core operating
  platform and requires a separate release decision.

The Property Context catalog is one section of the ADMIN platform, not the ADMIN
platform itself. Catalog governance follows the more detailed requirements in
`PROPERTY_CONTEXT_CATALOG_GOVERNANCE_FRD.md` while sharing the same shell,
permissions, audit, review, and operational foundations defined here.

---

## 2. Status vocabulary

Every capability in this FRD uses one of the following statuses.

| Status | Meaning |
|---|---|
| **CURRENT** | Implemented, reachable through the ADMIN UI, and protected as documented |
| **CURRENT — PARTIAL** | A usable ADMIN experience exists, but material target controls or workflows are missing |
| **API-ONLY** | Backend/domain capability exists, but no complete or discoverable ADMIN UI exists |
| **FOUNDATION** | Supporting schema/service behavior exists, but it is not an admin workflow |
| **PLANNED** | Required target-state capability assigned to the phased roadmap |
| **FUTURE** | Included in target architecture, but not required for the first complete ADMIN operating release |
| **OUT OF SCOPE** | Deliberately excluded from this target architecture |

“Underlying model exists” does not mean “admin functionality is implemented.” A
capability is only `CURRENT` when an authorized administrator can complete the
workflow safely through the ADMIN product.

---

## 3. Product vision and operating principles

### 3.1 Vision

An authorized internal operator should be able to understand platform health,
find the entity or case requiring attention, take only permitted actions, see
the expected impact before committing a sensitive change, and leave an
immutable explanation of what happened.

### 3.2 Principles

1. **ADMIN is a separate product surface.** It does not reuse homeowner or
   provider navigation as an internal shortcut.
2. **Least privilege beats a single super-admin.** Access is capability-based
   within the authenticated ADMIN population.
3. **Search before action.** Operators must find the correct user, provider,
   booking, payment, property, article, catalog entry, job, or case reliably.
4. **Context before mutation.** Sensitive actions include history, dependencies,
   warnings, and impact preview.
5. **Every consequential action is attributable.** Actor, reason, request,
   before/after state, and outcome are retained safely.
6. **Two-person control is proportional to risk.** Refunds, security actions,
   high-risk configuration, and break-glass operations receive stronger control.
7. **Operational workflows are explicit state machines.** Status must not be an
   unrestricted dropdown when transition rules matter.
8. **No routine direct database administration.** pgAdmin and direct SQL are for
   bootstrap, approved repair, and break-glass use only.
9. **Privacy by default.** Operators see the minimum customer data necessary for
   their assigned work.
10. **Automation assists; humans remain accountable.** Automated triage and
    recommendations never conceal the final actor or bypass required review.

---

## 4. Current-state review

### 4.1 Implemented platform foundation

| Capability | Status | Current behavior |
|---|---|---|
| Dedicated ADMIN shell | CURRENT | ADMIN receives dedicated navigation instead of homeowner navigation |
| Desktop and mobile ADMIN navigation | CURRENT | Admin workspaces are available across supported layouts |
| Admin command palette | CURRENT | Uses the ADMIN navigation set and excludes homeowner property shortcuts |
| Shared client route guard | CURRENT | `useAdminGuard` handles loading, unauthenticated, forbidden, and offline states |
| Frontend middleware protection | CURRENT | Known ADMIN page prefixes are restricted before page execution |
| Backend role protection | CURRENT | Existing admin APIs use ADMIN role checks |
| MFA | CURRENT | Applied to every ADMIN-role-gated route group found in the codebase, including the previously-missing DIY/financing/permit-source admin routes and an undocumented gap in `neighborhoodIntelligence.routes.ts` (Phase 0) |
| ADMIN capability enforcement | CURRENT — PARTIAL | Named-capability grants (`AdminCapabilityGrant`) enforced via `requireCapability` on every existing admin route group, layered on top of the ADMIN role check; grant/revoke API live at `/api/admin/capabilities` (self-grant blocked, audited); no frontend capability-management UI yet (Phase 0) |
| Structured admin audit contract | FOUNDATION | `adminAudit.service.ts` standardizes actor/action/entity/reason/capability/request-correlation for new admin actions (via a new `AuditLog.metadata` column); pre-existing bespoke audit paths (personalization, provider credential decisions, etc.) have not been migrated to it, and there is still no Audit Explorer UI (Phase 0) |
| Inactivity timeout | CURRENT | 15-minute ADMIN idle timeout with warning and cross-tab behavior |
| Admin console states | CURRENT | Shared loading, empty, error, forbidden, and offline UI components |

### 4.2 Implemented workspaces

| Workspace | Status | Implemented scope | Material target gaps |
|---|---|---|---|
| Provider Compliance | CURRENT — PARTIAL | Credential review queue, filtering, approve/reject/revoke, category eligibility recomputation | Full provider profile, risk history, SLA queue, assignments, notes, appeals, capability separation |
| DIY Templates | CURRENT — PARTIAL | List/filter/search, create, edit, duplicate, nested steps/materials/tools, lifecycle actions | Consistent MFA, revision history, independent review, publish/rollback, safety-tier approval |
| Analytics | CURRENT | Overview, trends, feature adoption, funnels, cohorts, top tools | Saved reports, exports, alerts, business/operations metrics, privacy controls |
| Knowledge Admin | CURRENT — PARTIAL | Article list, create/edit, sections, categories/tags selection, product tool/CTA linking, lifecycle field | Immutable revisions, separate submit/approve/publish actions, scheduling, preview, rollback, actor audit, taxonomy CRUD |
| Worker Jobs | CURRENT — PARTIAL | Registry, job metadata, recent runs, queue stats, supported manual trigger | Incident correlation, retry policies, run detail/log links, approvals for dangerous jobs, scheduled-change controls |
| Personalization | CURRENT — PARTIAL | Catalog visibility, aggregate quality, reviewed activation, question activation, definition pause/resume, kill switch | Structured review records, semantic diffs, content authoring decision, broader operational dashboard |
| User & Account Support (Phase 1) | CURRENT — PARTIAL | Search by name/email, support-safe summary (verification, MFA, session count, homeowner/provider profile summary), revoke sessions, governed status transitions (ACTIVE/SUSPENDED/INACTIVE) with required reason | Case linkage, communication history, deeper property/booking access via case reason, correction of identity fields, self-service parity for admins acting on their own account (deliberately blocked for now) |
| Audit Explorer v1 (Phase 1) | CURRENT — PARTIAL | Filtered/paginated read view over `AuditLog` (actor, entity, action, request ID, date range) | Only surfaces actions written via the standardized contract; pre-existing bespoke audit paths (personalization, provider credential decisions) are not aggregated; no saved views or export |
| Review Moderation Queue (Phase 2) | CURRENT — PARTIAL | Pending+flagged queue and per-status browse, moderation detail (review, booking context, author/provider history counts), governed APPROVE/REJECT/FLAG/RESTORE decisions with required reason, moderator attribution on the review, full audit incl. optional policy version; admins who are a party to a review cannot moderate it; "request investigation" opens a linked REVIEW_INVESTIGATION case | Automated abuse/fraud signals, policy-reference display, notifications to author/provider on decisions, bulk actions |
| Provider Operations (Phase 2) | CURRENT — PARTIAL | Directory search/filter under `PROVIDER_VIEW`, per-provider detail (credentials, open compliance alerts, listings, booking/review counts), governed marketplace-status transition under `PROVIDER_SUSPEND` (suspension deactivates listings; reinstatement does not auto-relist; self-action blocked) | Coverage zones, payments visibility, appeals-as-cases, risk scoring, affected-bookings preview on suspension, credential-queue integration |
| Booking Operations (Phase 2) | CURRENT — PARTIAL | Read-only search (booking number, status) and merged operational timeline (recorded transitions + derived milestones + review) under `BOOKING_VIEW`; support-safe scope excludes payments and internal notes | All governed mutations (`BOOKING_OPERATE`): corrections, cancel/reopen/dispute transitions, richer search dimensions, messages/documents/payments in timeline, linked-case requirement for overrides |
| Cases (Phase 2) | CURRENT — PARTIAL | `AdminCase`/`AdminCaseNote` under `SUPPORT_CASE_MANAGE`: SAFETY/ABUSE/REVIEW_INVESTIGATION/SUPPORT types, severity, governed lifecycle with required resolution, ADMIN-only assignment, linked entities, note trail, audited actions | SAFETY-specific workflow (containment, evidence, notification decision, post-incident review) under `SAFETY_INCIDENT_MANAGE`, SLA tracking, communication records, case links from other workspaces' actions |
| Work Queues (Phase 2) | CURRENT — PARTIAL | Aggregate counts of actionable queues (pending credentials, new compliance alerts, providers awaiting approval, review moderation queue, open/critical cases, disputed bookings, pending refund requests, open privacy requests) with links, under baseline `ADMIN_DASHBOARD_VIEW` | Pushed operational notifications, per-admin assignment views, SLA/aging indicators |
| Payment Operations (Phase 3) | CURRENT — PARTIAL | Local-ledger search + status summary under `PAYMENT_VIEW`; refund requests under `REFUND_REQUEST` (amount ≤ refundable remainder, one pending per payment); two-person decisions under `REFUND_APPROVE` (requester ≠ approver); fully audited | Refund execution + provider reconciliation (blocked on a payment-provider integration), amount/risk-sensitive approval thresholds, dispute evidence workflow, payout visibility |
| Privacy Requests (Phase 3) | CURRENT — PARTIAL | Intake by subject email (snapshot survives deletion), governed lifecycle with identity-verification attribution, due dates + overdue display, legal holds blocking DELETION completion, under `PRIVACY_REQUEST_MANAGE` | Systems-searched tracking, export artifacts, deletion-execution linkage to the account-deletion cascade, final communication, sensitive export controls |
| Pending Reviews (Phase 4) | CURRENT — PARTIAL | Knowledge editorial queues (REVIEW + APPROVED) with capability-separated transitions (`CONTENT_AUTHOR`/`CONTENT_REVIEW`/`CONTENT_PUBLISH`), required reasons, full audit; article upsert can no longer change lifecycle state | Immutable revisions, scheduling/Scheduled Releases, preview, rollback, DIY safety-tier queue, taxonomy management |

### 4.3 API-only and foundational capabilities

| Capability | Status | Current evidence | Required ADMIN direction |
|---|---|---|---|
| Shared-data readiness and diagnostics | API-ONLY | Backfill, readiness, consistency, signal health, operational diagnostics APIs | Add Shared Data Health workspace with dry-run and governed execution |
| Financing rate configuration | API-ONLY | List and patch rate configuration | Add effective-dated, MFA-protected, audited finance operations UI |
| Permit data sources | API-ONLY | List/create/update/status/test endpoints | Add integrations UI with sanitized diagnostics and secret references |
| Release gates | API-ONLY | Read all gates or one tool gate | Add release-readiness workspace and deployment correlation |
| Booking administration | FOUNDATION | Booking service recognizes ADMIN visibility/edit/cancel in places | Build dedicated booking operations workflow; do not expose homeowner UI as admin tooling |
| Payments and refunds | FOUNDATION | Payment status and refund fields exist | Build payment operations, refund approval, reconciliation, and dispute workflows |
| Review moderation | FOUNDATION | Review moderation status, moderator, and timestamp exist | Build moderation queue and actions |
| Account deletion | FOUNDATION | User-owned account deletion cascade exists | Build privacy case intake, verification, legal hold, execution, and audit |
| Generic audit storage | FOUNDATION | `AuditLog` supports actor, entity, before/after, request, trace, and signature fields | Standardize admin action audit contract and explorer — **DONE (Phase 0/1):** see `adminAudit.service.ts` and the Audit Explorer v1 row in §4.2; unifying pre-existing bespoke audit paths into it is still open |
| System settings | FOUNDATION | Generic `SystemSetting` model exists | Register allowed settings; never expose arbitrary key/value editing |
| Catalogs and configuration | MIXED | Code catalogs, Prisma catalogs, bootstrap data, and feature-specific admin behavior coexist | Add governed catalog section with explicit source ownership |

### 4.4 Current gaps

1. There is no ADMIN landing dashboard or unified work queue.
2. There is no global entity search across users, providers, properties,
   bookings, payments, cases, and catalog entries.
3. ~~ADMIN is a binary application role; internal responsibilities are not
   capability-scoped.~~ **RESOLVED (Phase 0):** named-capability grants now
   enforce internal responsibilities on top of the ADMIN role; see §8.2/§8.3.
4. ~~There is no user/account support workspace.~~ **PARTIALLY RESOLVED
   (Phase 1):** search, support-safe summary, session revocation, and
   governed status transitions now exist at `/dashboard/admin/users`. Case
   linkage, communication history, and deeper property/booking access via
   case reason are still open (§10.1).
5. There is no dedicated booking, payment, refund, dispute, or payout operations
   workspace.
6. There is no review/content-abuse moderation queue.
7. There is no cross-domain case-management model for assignments, notes,
   escalation, SLA, attachments, and resolution.
8. Admin API namespaces and MFA application are inconsistent across route groups.
   **PARTIALLY RESOLVED (Phase 0):** MFA is now applied consistently on every
   ADMIN-role-gated route found in the codebase. Namespace convergence is
   still open — `knowledgeHubAdmin.routes.ts` uses `/knowledge/admin/...`
   instead of `/admin/knowledge/...`, and most admin routes are still mounted
   via bare `app.use('/api', ...)` rather than an `/api/admin` prefix router
   (the URL paths already resolve correctly; only the Express mounting
   convention is inconsistent).
9. Auditing is fragmented across generic audit logs, structured domain events,
   application logging, and personalization-specific audit events.
   **PARTIALLY RESOLVED (Phase 0):** a standardized write-path contract
   (`adminAudit.service.ts`) now exists for new admin actions, but existing
   bespoke audit paths have not been migrated to it, and there is still no
   Audit Explorer.
10. Several operational APIs are undiscoverable from the ADMIN navigation.
11. Content and configuration publication controls are feature-specific rather
    than platform-standard.
12. Privacy and security operations have backend foundations but no cohesive
    internal workflow.

---

## 5. Goals, outcomes, and non-goals

### 5.1 Goals

- Provide one internal product for all approved operational domains.
- Distinguish Current, Planned, and Future functionality throughout delivery.
- Reduce direct database and ad hoc script use.
- Give operators safe, complete entity context without unrestricted data access.
- Standardize work queues, assignments, notes, approvals, and audit history.
- Support marketplace operations from provider onboarding through booking and
  payment resolution.
- Support governed editorial, catalog, personalization, and configuration work.
- Make platform health, jobs, integrations, release gates, and data consistency
  visible and actionable.
- Implement granular capability-based access and strong privileged-session
  controls.
- Support privacy, security, trust, and legal workflows with immutable evidence.

### 5.2 Desired outcomes

- Operators can resolve common cases without engineering intervention.
- Sensitive actions have predictable approval and audit behavior.
- Customer and provider support sees a unified timeline rather than querying
  separate tables.
- Finance operations can trace payment/refund state to bookings and providers.
- Content and configuration changes are reviewed, published, and reversible.
- Platform operators can diagnose jobs, integrations, data drift, and release
  readiness from one surface.
- Internal access is reviewable by capability, person, case, and data type.

### 5.3 Non-goals

- A general SQL or Prisma model editor.
- A replacement for GitHub, CI/CD, Kubernetes, Argo CD, observability vendors,
  Stripe, email delivery consoles, or the secret manager.
- Direct manipulation of third-party payment state without provider-confirmed
  idempotent operations.
- Unlogged user impersonation.
- Exposing administrator functionality to HOMEOWNER or PROVIDER roles.
- Automatically deciding legal, fraud, safety, or high-value refund outcomes.
- Creating database migration scripts. Schema changes may be made to the Prisma
  schema when implementation requires them; the user applies database changes.

---

## 6. Target ADMIN architecture

### 6.1 Layers

```text
ADMIN Web Application
  ├── Command Center and Global Search
  ├── Domain Workspaces
  ├── Work Queues and Case Management
  ├── Review / Approval / Publication UI
  └── Audit and Operational History

Admin API Boundary
  ├── Authentication + ADMIN role
  ├── MFA / step-up authentication
  ├── Capability and resource-scope checks
  ├── Validation + optimistic concurrency
  ├── Approval policy
  ├── Idempotency
  └── Structured audit context

Domain Services and Adapters
  ├── Users and Privacy
  ├── Providers and Marketplace
  ├── Bookings and Payments
  ├── Content and Catalogs
  ├── Personalization
  ├── Platform Operations
  └── Analytics and Reporting

Systems of Record
  ├── PostgreSQL / Prisma
  ├── Redis and worker queues
  ├── Git-managed contracts/configuration
  ├── Object/document storage
  └── Approved third-party services
```

### 6.2 Boundaries

- ADMIN pages use admin-specific view models; they do not depend on consumer
  pages to provide operational functionality.
- Domain services remain authoritative for business invariants.
- Admin APIs orchestrate authorized domain actions; they do not update arbitrary
  database fields.
- External systems remain authoritative for their own transaction state.
- Git remains authoritative for code-coupled contracts and high-risk rules.
- Read-only links may deep-link to external operational tools when replicating
  their full functionality would be unsafe or wasteful.

---

## 7. Target information architecture

### 7.1 Command Center

- Overview
- My Work
- Global Search
- Alerts and Incidents
- Recent Sensitive Actions

### 7.2 Customers and Support

- Users and Accounts
- Properties and Households
- Support Cases
- Privacy Requests
- Notifications and Delivery History

### 7.3 Providers and Marketplace

- Provider Directory
- Compliance Review
- Services and Coverage Areas
- Provider Risk and Performance
- Provider Appeals and Escalations

### 7.4 Bookings and Financial Operations

- Bookings
- Payments
- Refunds
- Disputes and Chargebacks
- Payout/Reconciliation Visibility
- Financing Rates

### 7.5 Trust, Safety, and Moderation

- Review Moderation
- Abuse and Fraud Signals
- Safety Incidents
- Access/Privacy Incidents
- Policy Enforcement History

### 7.6 Content, Catalogs, and Personalization

- Knowledge Articles
- DIY Templates
- Property Context Catalogs
- Service, Plant, Seasonal, and Habit Catalogs
- Knowledge Taxonomy and Product Presentation
- Personalization Catalog and Controls
- Pending Reviews and Scheduled Releases

### 7.7 Platform Operations

- Worker Jobs
- Shared Data Health
- Integrations and Permit Data Sources
- Release Gates
- Feature/Operational Controls
- System Health and Dependencies

### 7.8 Analytics and Governance

- Product Analytics
- Marketplace Analytics
- Support and Operations Analytics
- Financial Operations Analytics
- Audit Explorer
- Admin Access Reviews
- Reports and Exports

Navigation must be capability-filtered. Operators see only sections they are
authorized to use; hidden navigation is not a substitute for API authorization.

---

## 8. Admin personas, roles, and capabilities

### 8.1 Target personas

| Persona | Primary responsibilities | Target status |
|---|---|---|
| Platform Administrator | Admin access, security configuration, break-glass governance | PLANNED |
| Customer Support Operator | Users, properties, cases, notifications, guided recovery | CURRENT — PARTIAL (user/account actions only; no cases/notifications yet) |
| Provider Operations Reviewer | Provider onboarding, credentials, services, compliance | CURRENT — PARTIAL |
| Marketplace Operations Operator | Bookings, scheduling escalations, disputes, provider/customer coordination | PLANNED |
| Finance Operations Operator | Payments, refunds, reconciliation, financing configuration | PLANNED |
| Trust and Safety Reviewer | Reviews, abuse, fraud, safety and privacy incidents | PLANNED |
| Content Author | Knowledge, DIY, and catalog drafts | CURRENT — PARTIAL |
| Content/Catalog Reviewer | Independent review and approval | PLANNED |
| Content/Catalog Publisher | Publication, scheduling, rollback | PLANNED |
| Data/Platform Operator | Jobs, shared-data health, integrations, release readiness | CURRENT — PARTIAL |
| Analyst | Read-only analytics, reports, exports | CURRENT — PARTIAL |
| Auditor/Security Reviewer | Read-only access/audit evidence and reviews | FUTURE |

### 8.2 Capability model

The application role remains `ADMIN`. Internal access is expressed as named
capabilities with optional resource scope.

Examples:

```text
ADMIN_DASHBOARD_VIEW
ADMIN_ROLE_MANAGE
USER_VIEW
USER_STATUS_CHANGE
USER_SESSION_REVOKE
PROPERTY_SUPPORT_VIEW
SUPPORT_CASE_MANAGE
PRIVACY_REQUEST_MANAGE
PROVIDER_VIEW
PROVIDER_COMPLIANCE_REVIEW
PROVIDER_SUSPEND
BOOKING_VIEW
BOOKING_OPERATE
PAYMENT_VIEW
REFUND_REQUEST
REFUND_APPROVE
DISPUTE_MANAGE
FINANCING_CONFIG
REVIEW_MODERATE
SAFETY_INCIDENT_MANAGE
CONTENT_AUTHOR
CONTENT_REVIEW
CONTENT_PUBLISH
CATALOG_AUTHOR
CATALOG_REVIEW
CATALOG_PUBLISH
PERSONALIZATION_OPERATE
WORKER_JOB_VIEW
WORKER_JOB_TRIGGER
SHARED_DATA_OPERATE
INTEGRATION_MANAGE
RELEASE_GATE_VIEW
SYSTEM_SETTINGS_MANAGE
ANALYTICS_VIEW
AUDIT_VIEW
BREAK_GLASS
```

`ADMIN_ROLE_MANAGE`, `DISPUTE_MANAGE`, `FINANCING_CONFIG`,
`SAFETY_INCIDENT_MANAGE`, `SHARED_DATA_OPERATE`, and `SYSTEM_SETTINGS_MANAGE`
were not in the original example list but are required by domain requirements
already stated elsewhere in this document and had no named capability to
enforce them:

| Capability | Backed by |
|---|---|
| `ADMIN_ROLE_MANAGE` | §8.2 requirement that "role/capability changes require MFA and audit" needs a capability to gate the grant action itself |
| `DISPUTE_MANAGE` | §7.4 "Disputes and Chargebacks"; §10.4 dispute/chargeback case requirements |
| `FINANCING_CONFIG` | §4.3 financing rate configuration; §7.4 "Financing Rates" |
| `SAFETY_INCIDENT_MANAGE` | §10.5 safety incident severity/containment/evidence/notification workflow, which is materially richer than generic `SUPPORT_CASE_MANAGE` |
| `SHARED_DATA_OPERATE` | §4.3 shared-data readiness/diagnostics; §10.9 dry-run/backfill workflow |
| `SYSTEM_SETTINGS_MANAGE` | §4.3/§12.3 registered `SystemSetting` allow-list — "register allowed settings; never expose arbitrary key/value editing" |

Requirements:

- Capability enforcement is server-side.
- Capabilities can be bundled into internal roles.
- High-risk capabilities support resource or amount scope.
- Role/capability changes require MFA and audit.
- An administrator cannot grant themselves capabilities unless explicitly
  authorized through the highest-trust access workflow.
- Access is periodically reviewable and revocable.

### 8.3 Persona-to-capability bundle mapping

This mapping is the default internal role bundle for each persona in §8.1,
satisfying the §8.2 requirement that "capabilities can be bundled into
internal roles." Bundles are intentionally minimal, consistent with the
least-privilege principle (§3.2, principle 2): a capability needed outside a
persona's default bundle is granted individually and audited, not added to
the shared bundle. `ADMIN_DASHBOARD_VIEW` is granted to every persona as
baseline access to the Command Center (§9, FR-1) and is omitted from each row
below to avoid repetition. Capabilities marked "(read-only)" grant view access
to another domain's entities for context only — they never carry that
domain's mutation rights.

| Persona | Target status | Default capability bundle | Rationale |
|---|---|---|---|
| Platform Administrator | PLANNED | `ADMIN_ROLE_MANAGE`, `USER_SESSION_REVOKE`, `SYSTEM_SETTINGS_MANAGE`, `INTEGRATION_MANAGE`, `RELEASE_GATE_VIEW`, `AUDIT_VIEW`, `BREAK_GLASS`, `PERSONALIZATION_OPERATE` | Owns administration of the admin system and platform-wide safety controls, not routine domain casework. Excludes standing `USER_VIEW`/`PAYMENT_VIEW`/etc. — customer and financial data access should route through a case-holding persona, not the platform admin bundle, per §3.2 principle 9 (privacy by default). `PERSONALIZATION_OPERATE` is grouped here because kill-switch actions (§10.8) function as an emergency safety control akin to `BREAK_GLASS`; see open question below. |
| Customer Support Operator | PLANNED | `USER_VIEW`, `USER_STATUS_CHANGE`, `USER_SESSION_REVOKE`, `PROPERTY_SUPPORT_VIEW`, `SUPPORT_CASE_MANAGE` | Matches §10.1 target requirements directly. Excludes `PRIVACY_REQUEST_MANAGE` — assigned to Trust and Safety Reviewer below, pending the open question on a dedicated privacy persona. |
| Provider Operations Reviewer | CURRENT — PARTIAL | `PROVIDER_VIEW`, `PROVIDER_COMPLIANCE_REVIEW`, `PROVIDER_SUSPEND`, `BOOKING_VIEW` (read-only) | `BOOKING_VIEW` supports §10.2's requirement that "provider suspension shows affected future bookings" without granting booking mutation. |
| Marketplace Operations Operator | PLANNED | `BOOKING_VIEW`, `BOOKING_OPERATE`, `PROVIDER_VIEW` (read-only), `USER_VIEW` (read-only), `SUPPORT_CASE_MANAGE` | Booking-level "mark disputed" and escalation transitions (§10.3) are booking state changes under `BOOKING_OPERATE`. Financial chargebacks are a distinct workflow owned by Finance Operations Operator (next row), not this persona. |
| Finance Operations Operator | PLANNED | `PAYMENT_VIEW`, `REFUND_REQUEST`, `REFUND_APPROVE`, `DISPUTE_MANAGE`, `FINANCING_CONFIG`, `BOOKING_VIEW` (read-only) | `REFUND_APPROVE` must carry a resource/amount scope per §10.4 and §8.2; requester and approver must differ above the configured threshold (§20.2, open question 2). |
| Trust and Safety Reviewer | PLANNED | `REVIEW_MODERATE`, `SAFETY_INCIDENT_MANAGE`, `PRIVACY_REQUEST_MANAGE`, `USER_VIEW` (read-only), `PROVIDER_VIEW` (read-only) | §10.5 groups "safety and privacy incidents" under this persona, so `PRIVACY_REQUEST_MANAGE` is assigned here provisionally. A subject-rights privacy request (§11.4) is a distinct workflow from a privacy/safety incident — confirm ownership before Phase 3 (see new open question below). |
| Content Author | CURRENT — PARTIAL | `CONTENT_AUTHOR`, `CATALOG_AUTHOR` | Matches current Knowledge/DIY authoring scope. |
| Content/Catalog Reviewer | PLANNED | `CONTENT_REVIEW`, `CATALOG_REVIEW` | Deliberately excludes author/publish capabilities per the §10.6 separation-of-duties requirement. |
| Content/Catalog Publisher | PLANNED | `CONTENT_PUBLISH`, `CATALOG_PUBLISH` | Deliberately excludes author/review capabilities per §10.6. |
| Data/Platform Operator | CURRENT — PARTIAL | `WORKER_JOB_VIEW`, `WORKER_JOB_TRIGGER`, `SHARED_DATA_OPERATE`, `INTEGRATION_MANAGE`, `RELEASE_GATE_VIEW` | Matches current Worker Jobs scope plus the API-only shared-data/integration/release-gate capabilities named in §4.3 and §10.9. |
| Analyst | CURRENT — PARTIAL | `ANALYTICS_VIEW` | Read-only by persona definition (§8.1); no mutation capability. |
| Auditor/Security Reviewer | FUTURE | `AUDIT_VIEW` | Read-only by persona definition (§8.1). |

This table is a starting default for Phase 0 (§17) role-bundle
implementation, not a final access-control decision — it should be ratified
alongside the named-individual assignment question already open in §20.2
(open question 1).

---

## 9. Cross-platform functional requirements

### FR-1: ADMIN Command Center — PLANNED

- Provide an ADMIN landing page rather than redirecting to an arbitrary
  workspace.
- Show assigned work, queue counts, SLA risk, platform alerts, publication
  failures, job failures, integration degradation, and recent sensitive actions.
- Cards and alerts must respect capability scope.
- Support configurable deep links, not arbitrary action execution from summary
  cards.
- Distinguish system health from business workload.

### FR-2: Global search — PLANNED

- Search supported entities by stable identifiers and approved fields:
  user/email, provider/business, property/address, booking number, payment ID,
  case ID, article slug, catalog key, job key, and audit request/trace ID.
- Exact identifiers rank above fuzzy results.
- Search results show entity type and safe disambiguating context.
- Sensitive values such as password hashes, MFA secrets, tokens, full payment
  details, and private document contents are never searchable.
- Queries and record opens are access-checked and security-audited where
  required.

### FR-3: Unified entity page pattern — PLANNED

- User, provider, booking, payment, case, and catalog detail pages share a
  consistent summary/history/action layout.
- Show authoritative status, relationships, timeline, open cases, recent
  actions, and warnings.
- Sensitive actions live in a distinct action zone with reason, confirmation,
  impact, and approval requirements.
- Every displayed field identifies unavailable/redacted data honestly.

### FR-4: Work queues — PLANNED

- Queues support filtering, sorting, pagination, saved views, assignment,
  priority, SLA, bulk selection where safe, and export where permitted.
- Queue items have stable state machines and cannot be silently removed.
- Assignment and disposition changes are audited.
- Bulk actions are disabled for high-risk decisions unless explicitly designed.

### FR-5: Case management — PLANNED

- Create cases for customer support, provider escalation, booking dispute,
  payment/refund, privacy request, content escalation, safety incident, and
  technical operations.
- Cases include type, priority, status, assignee, watchers, SLA, linked entities,
  internal notes, approved attachments, actions, and resolution.
- Notes are immutable after a short correction window; corrections preserve the
  original.
- Cases distinguish internal notes from customer/provider-visible messages.
- Closing a case requires resolution code and summary.
- Reopening is audited.

### FR-6: Approval workflow — PLANNED

- High-risk actions create an approval request instead of executing immediately.
- Approval policy may depend on action, amount, safety class, environment, and
  actor capability.
- Requester cannot be sole approver where separation of duties applies.
- Approvals expire if the proposed action changes or its context becomes stale.
- Rejection requires a reason.
- Emergency execution follows break-glass requirements and post-action review.

### FR-7: Notifications and tasks — PLANNED

- Notify assigned operators of new work, SLA risk, approval requests, failed
  actions, and escalations.
- Support in-app notifications first; email/Slack/other delivery is integration
  dependent and must not contain sensitive data.
- Operators can acknowledge, snooze where allowed, or open the linked item.

### FR-8: Admin notes and communication — PLANNED

- Internal notes require actor and timestamp.
- Customer/provider communications use approved templates with editable,
  reviewed content where appropriate.
- Communication history records recipient, channel, template/version, delivery
  outcome, and related case/action.
- Sending as the customer or provider is prohibited.

### FR-9: Sensitive action pattern — PLANNED

Every sensitive action shall support, as applicable:

- capability and resource-scope check;
- step-up authentication;
- impact preview;
- explicit reason and structured disposition;
- second approval;
- idempotency key;
- atomic domain operation;
- safe audit record;
- user/provider notification;
- rollback or compensating action;
- post-action outcome display.

---

## 10. Domain requirements

### 10.1 Customers, accounts, properties, and support

#### Current state

- `User` has role, lifecycle status, verification, MFA, token version, legal
  acceptance, and last-login foundations.
- Authentication rejects suspended or inactive users.
- User-owned account deletion exists.
- No complete user/account ADMIN workspace exists.

#### Target requirements — PLANNED

- Search and view user account summary, status, role, verification, login and
  session metadata, household/property relationships, bookings, cases,
  notifications, and safe audit history.
- Show only support-safe property facts by default; deeper property access
  requires an explicit capability and case reason.
- Resend approved verification/recovery communications without revealing tokens.
- Revoke refresh sessions by account or selected session.
- Suspend, reactivate, or deactivate accounts through governed transitions.
- Require reason and impact preview for status changes.
- Prevent routine admin password setting or credential retrieval.
- Support correction of limited identity/contact fields only when policy permits;
  preserve before/after history.
- Show Terms/Privacy acceptance version and timestamp without enabling arbitrary
  edits.
- Link user and household data to privacy-request workflows.

#### Support-assisted session — FUTURE

- Prefer read-only “view as context” over unrestricted impersonation.
- Require an active support case, reason, explicit capability, step-up auth, time
  limit, persistent banner, and full audit.
- Block payment, password, MFA, privacy, deletion, publishing, and other
  high-risk actions while in assisted context.
- Never generate or expose the user's credential or reusable token.

### 10.2 Provider and marketplace operations

#### Current state

- Provider Compliance queue and credential decisions are CURRENT — PARTIAL.
- Provider and provider-credential services allow some ADMIN access.
- Compliance evaluation can affect provider/category eligibility and status.
- Provider Operations directory is CURRENT — PARTIAL (Phase 2 slice at
  `/dashboard/admin/providers`): search/filter directory under
  `PROVIDER_VIEW` (business/user name/email, status), per-provider
  operational detail (credentials, open compliance alerts, listings,
  booking/review counts, verification flags), and a governed
  marketplace-status transition (ACTIVE/SUSPENDED/INACTIVE) under
  `PROVIDER_SUSPEND` with required reason — suspension deactivates listings,
  reinstatement does not auto-relist, self-action blocked.

#### Target requirements — PLANNED

- Provider directory with identity, business profile, status, services,
  categories, coverage zones, credentials, performance, bookings, reviews,
  payments visibility, alerts, and cases. **PARTIAL** — directory + detail
  shipped (see current state); coverage zones, payments visibility, and case
  linkage not started.
- Queue credentials by risk, expiry, age, type, category, and assignment.
- Display document integrity metadata and sanitized verification evidence.
- Require structured reason for approve, reject, revoke, suspend, or reinstate.
- Support credential expiry alerts and renewal workflows.
- Show how each decision changes category eligibility before confirmation.
- Support provider appeals as cases with independent review.
- Manage provider service activation and coverage data through typed workflows.
- Provider suspension shows affected future bookings and communication plan.
- Performance/risk scoring must be explainable and must not automatically impose
  irreversible sanctions.

### 10.3 Booking and service operations

#### Current state

- Booking domain has statuses, timeline, parties, property, service, pricing,
  cancellation, completion, payment, document, message, and review relations.
- Some booking services recognize ADMIN permissions.
- Booking Operations workspace is CURRENT — PARTIAL (Phase 2 slice at
  `/dashboard/admin/bookings`, read-only, under `BOOKING_VIEW`): search by
  booking number + status filter, and a per-booking merged operational
  timeline (recorded BookingTimeline transitions + derived milestones +
  review). Support-safe scope: no payment amounts, no provider internal
  notes, property shown as city/state only. All governed mutations
  (`BOOKING_OPERATE`) remain PLANNED.

#### Target requirements — PLANNED

- Search by booking number, user, provider, property, date, category, and status.
  **PARTIAL** — booking number + status shipped; other dimensions not started.
- Display a unified booking timeline including scheduling, status, messages,
  documents, payments, disputes, and operator actions. **PARTIAL** —
  scheduling/status/review timeline shipped; messages, documents, payments,
  and operator actions not included yet.
- Support approved corrections to scheduling and operational metadata.
- Support cancel, reopen where valid, mark disputed, and resolve escalation via
  explicit state transitions.
- Protect completion and final-price changes with domain validation.
- Show downstream impact on payments, expenses, projects, maintenance tasks,
  guidance journeys, and reviews.
- Require a linked case for manual overrides after payment authorization or
  booking completion.
- Never hard-delete a booking.

### 10.4 Payments, refunds, disputes, and reconciliation

#### Current state

- Payment records support pending, authorized, captured, refunded, failed, and
  cancelled states with external payment identifiers and refund metadata.
- Payment Operations is CURRENT — PARTIAL (Phase 3 slice at
  `/dashboard/admin/payments`): local-ledger search (booking number /
  payment-intent id, status) with a count+amount-by-status summary under
  `PAYMENT_VIEW`; refund requests (`RefundRequest` model — requires
  `prisma db push`) with amount-vs-refundable validation and a
  one-pending-per-payment rule under `REFUND_REQUEST`; and two-person
  decisions under `REFUND_APPROVE` (the requester can never decide their
  own request). **Record-and-govern only: no payment-provider integration
  exists, so an APPROVED request is terminal and no money moves.**
- Dispute cases: the `AdminCase` DISPUTE type exists (§10.5); dispute
  evidence deadlines/documents are PLANNED.

#### Target requirements — PLANNED

- Read payment status from the payment provider and local ledger view without
  displaying prohibited card data.
- Search by booking, payment provider ID, user, provider, amount, status, and
  date.
- Display authorized/captured/refunded amounts, failure reason, timeline,
  reconciliation state, and linked case.
- Refund request captures amount, reason, evidence, policy basis, and expected
  booking/provider impact.
- Refund approval policy is amount- and risk-sensitive; requester and sole
  approver are separated above configured thresholds.
- Refund execution is idempotent and confirms provider response before local
  state finalization.
- Partial and full refunds are supported only when the payment integration does.
- Disputes/chargebacks have evidence deadlines, assignments, documents, and
  resolution state.
- Reconciliation view identifies provider/local mismatches and supports safe
  retry or escalation, not manual status fabrication.
- Payout visibility is FUTURE unless the provider-payment implementation becomes
  a platform responsibility.

### 10.5 Trust, safety, review moderation, and abuse

#### Current state

- Review moderation fields exist in the schema.
- Incident logging includes safety/privacy incident foundations.
- Review Moderation Queue is CURRENT — PARTIAL (Phase 2 slice at
  `/dashboard/admin/reviews`): pending+flagged queue, moderation detail with
  booking context and author/provider history counts, governed
  approve/reject/flag/restore with required reason and moderator attribution,
  audited under `REVIEW_MODERATE` with optional policy version, plus
  "request investigation" which opens a linked REVIEW_INVESTIGATION case.
  Automated signals and policy-reference display remain PLANNED below.
- Case management is CURRENT — PARTIAL (Phase 2 slice at
  `/dashboard/admin/cases` under `SUPPORT_CASE_MANAGE`): `AdminCase` +
  `AdminCaseNote` models with SAFETY/ABUSE/REVIEW_INVESTIGATION/SUPPORT
  types, severity, governed lifecycle (resolution text required to resolve;
  reopening clears timestamps but keeps resolution history), ADMIN-only
  assignment, linked entity references, and audited create/status/assign
  actions. The richer SAFETY-specific workflow (containment, evidence,
  notification decisions, post-incident review) remains PLANNED and will
  layer `SAFETY_INCIDENT_MANAGE` on top.

#### Target requirements — PLANNED

- Moderation queue for pending and flagged reviews. **SHIPPED** (see current
  state above).
- Show review, booking context, author/provider history, automated signals, and
  policy references without exposing unrelated private data. **PARTIAL** —
  booking context and history counts shipped; automated signals and policy
  references not started.
- Actions: approve, reject, flag/escalate, restore, and request investigation.
  **SHIPPED** — request investigation opens a REVIEW_INVESTIGATION case
  linked to the review (under `REVIEW_MODERATE`) without changing the
  review's moderation status.
- Moderation decisions require reason and moderator attribution. **SHIPPED.**
- Maintain policy version used for the decision. **PARTIAL** — the API accepts
  an optional `policyVersion` recorded in the audit trail, but no policy
  registry exists yet, so nothing enforces or suggests one.
- Abuse/fraud signals create reviewable cases; models/signals do not directly
  ban users or providers. **PARTIAL** — ABUSE-type cases exist and no signal
  automation acts directly; automated signal → case creation not started.
- Safety incidents support severity, containment, linked entities, evidence,
  notification decision, and post-incident review. **PARTIAL** — SAFETY-type
  cases carry severity, linked entities, and a note trail; containment,
  structured evidence, notification decisions, and post-incident review are
  not modeled yet.
- Legal/law-enforcement requests are FUTURE and require a separate restricted
  workflow and policy review.

### 10.6 Content and editorial operations

#### Current state

- Knowledge article authoring is CURRENT — PARTIAL.
- DIY template authoring is CURRENT — PARTIAL.
- Knowledge taxonomy is selectable but not administrable.
- Knowledge editorial lifecycle governance is CURRENT — PARTIAL (Phase 4
  slice): `KnowledgeArticleStatus` gained APPROVED; lifecycle transitions
  moved to capability-separated endpoints (CONTENT_AUTHOR submits/revives,
  CONTENT_REVIEW approves/returns, CONTENT_PUBLISH
  publishes/unpublishes/archives), each requiring a reason and fully
  audited; the article upsert can no longer change status or publishedAt;
  a Pending Reviews workspace at `/dashboard/admin/content-reviews` shows
  the review and awaiting-publish queues. **Requires `prisma db push`**
  (enum value). Note: the Knowledge Admin editor's status dropdown is now
  inert — lifecycle changes go through Pending Reviews.

#### Target requirements — PLANNED

- Standard lifecycle: Draft → Review → Approved → Scheduled/Published → Archived.
  **PARTIAL** — Draft → Review → Approved → Published → Archived shipped
  for knowledge articles (scheduling PLANNED; DIY templates PLANNED).
- Saving content must not directly publish it. **SHIPPED** for knowledge
  articles — create forces DRAFT; update preserves status/publishedAt.
- Published revisions are immutable; corrections create new revisions.
- Support semantic diff, preview, comments, assignments, scheduling, unpublish,
  archive, and rollback.
- Separate author, reviewer, and publisher capabilities.
- Knowledge revision includes sections, taxonomy links, tool links, and CTAs as
  one consistent snapshot.
- DIY revision includes steps, materials, tools, costs, safety level, and prompt
  metadata as one snapshot.
- High-safety DIY content receives stronger approval.
- Taxonomy management supports stable slugs, reference impact, and retirement.
- Rich content is sanitized before preview and publication.
- Localized editorial workflows are FUTURE after a supported locale strategy is
  approved.

### 10.7 Property Context catalogs and operational configuration

#### Current state

- Catalogs exist across TypeScript and Prisma storage.
- Personalization has an activation workflow; most other catalogs do not.
- Reference bootstrap SQL exists for initial data preparation.

#### Target requirements — PLANNED

- Property Context catalog governance is a section of Content, Catalogs, and
  Personalization.
- Use the requirements in
  `docs/property-context/PROPERTY_CONTEXT_CATALOG_GOVERNANCE_FRD.md`.
- Git-managed contracts and rules are read-only in ADMIN.
- Admin-managed reference/editorial catalogs use draft, validation, review,
  publish, retirement, rollback, and audit according to risk.
- Each field has one declared source of truth.
- Bootstrap never overwrites ADMIN-owned fields.
- Direct SQL is limited to bootstrap, approved repair, and break-glass recovery.
- In-scope catalogs include service categories, plant catalog, seasonal
  templates, habit templates, knowledge taxonomy, product presentation,
  personalization content/lifecycle, and selected operational configuration.

### 10.8 Personalization governance

#### Current state

- Supported definitions and questions are visible.
- MFA-protected activation, definition pause/resume, kill switch, and safe audit
  behavior exist.
- Aggregate quality is visible and online tuning remains disabled.

#### Target requirements — PLANNED

- Preserve code/Git ownership of rule AST and profile answer schemas.
- Add review records, semantic diffs, reviewer checklist, and activation history.
- Separate content-version authoring from rule authoring if ADMIN content
  authoring is approved.
- Display affected placements/modules and representative evaluation preview.
- Preserve global and per-definition emergency controls.
- Kill-switch actions require reason, MFA, audit, and prominent active-state
  visibility.
- No automatic activation or production weight tuning.

### 10.9 Platform operations, workers, data health, and integrations

#### Current state

- Worker Jobs is CURRENT — PARTIAL.
- Shared-data diagnostics, permit data-source operations, and release gates are
  API-ONLY.

#### Target requirements — PLANNED

- Unified Platform Operations overview for jobs, queues, data health,
  integrations, dependencies, and release readiness.
- Worker run detail shows trigger, initiator, correlation ID, timing, outcome,
  safe error summary, retry history, and related incident.
- Manual trigger capability is separate from job visibility.
- Dangerous or bulk jobs require dry-run, scope preview, approval, rate limit,
  and idempotency.
- Shared-data backfill defaults to dry-run and shows expected creates/updates,
  consistency impact, checkpoint, and completion summary.
- Integration configuration exposes status and sanitized diagnostics, not secret
  values.
- Permit source test actions are audited and rate-limited.
- Release gates correlate tool readiness, failed checks, deployed version, and
  relevant incidents.
- External operational tools may be linked for deep diagnostics.

### 10.10 Product, marketplace, support, and operations analytics

#### Current state

- Product Analytics is CURRENT with overview, trends, adoption, funnels,
  cohorts, and top tools.

#### Target requirements

- **PLANNED:** saved filters/views and controlled CSV export.
- **PLANNED:** marketplace metrics for provider activation, compliance SLA,
  booking conversion, completion, cancellation, dispute, and refund rates.
- **PLANNED:** support metrics for queue volume, first response, resolution time,
  reopen rate, backlog, and SLA.
- **PLANNED:** content/catalog metrics for draft age, review latency,
  publication failures, rollback, and adoption.
- **PLANNED:** operations metrics for job health, data consistency, integration
  availability, and incident volume.
- **FUTURE:** scheduled reports and threshold alerts.
- Analytics must apply minimum-cohort, access, and privacy rules.

---

## 11. Security, privacy, and compliance

### 11.1 Authentication and privileged sessions

- ADMIN requires MFA enrollment and successful challenge.
- Current 15-minute inactivity timeout remains the baseline.
- Sensitive actions may require recent step-up authentication even within an
  active session.
- Session and token revocation must be available to authorized platform admins.
- Concurrent privileged-session visibility is PLANNED.
- Hardware-backed/WebAuthn MFA is FUTURE.

### 11.2 Authorization

- Require authentication, ADMIN role, capability, resource scope, and action
  policy as separate checks.
- Backend enforcement is authoritative.
- Default deny applies to unregistered admin actions.
- Capability changes are audited and periodically reviewed.
- Production, staging, and development access are distinguishable.

### 11.3 Privacy

- Mask personal data in lists and reveal only when the operator has purpose and
  permission.
- Record access to highly sensitive records.
- Do not expose secrets, credentials, raw tokens, password hashes, MFA secrets,
  full payment instrument data, or unrestricted documents.
- Exports are scoped, watermarked where appropriate, access-controlled, and
  expire.
- Case notes must not become an uncontrolled copy of sensitive customer data.

### 11.4 Privacy requests — PARTIAL (Phase 3 slice shipped)

Shipped at `/dashboard/admin/privacy` under `PRIVACY_REQUEST_MANAGE`:
`PrivacyRequest` model (requires `prisma db push`) with intake by subject
email (snapshotted so the record survives account deletion; unmatched
subjects allowed), ACCESS_EXPORT/CORRECTION/DELETION/RESTRICTION types,
governed lifecycle (RECEIVED → VERIFYING → VERIFIED → IN_PROGRESS →
COMPLETED, or REJECTED/CANCELLED; terminal states immutable), identity-
verification attribution, 30-day default due date with overdue display,
and legal holds that block DELETION completion. Tracking only — data
operations stay in their authoritative flows.

- Intake and verify access, correction, deletion, and restriction requests.
  **SHIPPED** (see above).
- Track jurisdiction/policy, identity verification, due date, legal hold,
  systems searched, export artifacts, deletion execution, exceptions, and final
  communication. **PARTIAL** — jurisdiction, identity verification, due
  date, and legal hold shipped; systems-searched tracking, export
  artifacts, deletion-execution linkage, and final communication PLANNED.
- Account deletion must use the authoritative cascade/service and retain legally
  required audit records.
- An admin cannot silently delete an account outside the privacy workflow.

### 11.5 Break-glass access — PLANNED

- Separate capability with a small authorized group.
- Require reason, step-up authentication, bounded scope, and expiration.
- Notify security/owner immediately.
- Record all access and actions.
- Require post-action review and capability closure.
- Break-glass must not become a workaround for missing ordinary permissions.

---

## 12. Data and audit requirements

### 12.1 Admin action audit

Every consequential admin action records:

- actor user ID and effective internal role/capabilities;
- action and outcome;
- entity type and stable ID;
- related case, approval, revision, release, job, or payment ID;
- safe before/after values or semantic diff;
- reason and disposition code;
- IP/user agent where appropriate;
- request ID and trace ID;
- timestamp;
- external provider reference when relevant;
- signature/integrity metadata where supported.

Audit data is append-only. Corrections create new events.

### 12.2 Audit stores

- The generic `AuditLog` may back standard admin events.
- Privacy-constrained domains such as personalization may retain specialized
  audit stores.
- A unified Audit Explorer consumes a safe normalized projection; it does not
  require all domains to store arbitrary payloads in one table.
- Application logs alone are not a sufficient business audit trail.

### 12.3 Conceptual target data

Implementation may require focused models for:

- internal admin role and capability assignment;
- admin access review;
- admin case, assignment, note, link, attachment, SLA, and resolution;
- approval request and decision;
- sensitive action request/outcome;
- communication record;
- privacy request;
- moderation decision;
- content/catalog revision and release;
- export job and artifact;
- admin saved view.

Existing domain models remain authoritative. Avoid a generic EAV model for all
operational data.

### 12.4 Schema policy

- Schema changes are permitted when needed.
- Do not create database migration scripts.
- The user applies database schema changes separately.
- New required fields must account for existing data and greenfield/reset
  expectations explicitly.

---

## 13. API and integration requirements

### 13.1 API conventions

- New admin routes use `/api/admin/...` consistently.
- Existing routes may remain temporarily but must converge or be documented.
- All mutation routes require authentication, ADMIN role, MFA/step-up as
  appropriate, capability check, validation, audit context, and rate limiting.
- Use typed request/response schemas and stable error codes.
- List endpoints use bounded cursor or page pagination.
- Mutations that can be retried require idempotency keys.
- Optimistic concurrency prevents stale overwrites.
- High-cost exports, searches, simulations, and bulk actions run asynchronously.

### 13.2 External systems

- Payment provider: source of truth for external transaction state.
- Email/SMS/push providers: delivery state is visible but secrets are not.
- Object storage: document metadata and access are scoped and audited.
- Worker/queue infrastructure: job control is adapter-backed and capability
  checked.
- Git/CI/CD: code/config versions and release gates are visible read-only unless
  a separately approved deployment integration exists.
- Secret manager/environment: admin sees secret reference and health, not value.

### 13.3 Error behavior

Stable error classes include:

- unauthenticated;
- MFA/step-up required;
- capability denied;
- resource scope denied;
- validation failed;
- stale version/conflict;
- invalid state transition;
- approval required/expired;
- external provider conflict;
- idempotency conflict;
- rate limited;
- temporary dependency failure;
- irreversible action blocked.

---

## 14. Non-functional requirements

### 14.1 Performance

- Global exact-ID search p95 under 750 ms.
- Normal queue/list response p95 under 750 ms.
- Entity summary p95 under 1 second excluding external provider refresh.
- Sensitive action acknowledgment under 2 seconds when execution is queued.
- Large exports/imports/simulations run asynchronously with progress.

### 14.2 Reliability

- Sensitive mutations are atomic or use explicit compensating workflows.
- Retried external actions are idempotent.
- Failed actions do not display success or fabricate local completion.
- Queue assignments and approvals survive process restart.
- Scheduled publications/actions are retry-safe.

### 14.3 Accessibility

- Meet WCAG 2.1 AA for core workflows.
- All tables, filters, dialogs, diffs, and editors are keyboard accessible.
- Status is not communicated by color alone.
- Destructive/sensitive confirmation remains understandable with assistive
  technology.

### 14.4 Observability

- Every admin request has request and trace correlation.
- Metrics cover queue volume, latency, action success/failure, approvals,
  refunds, publication, job triggers, exports, and permission denials.
- Logs exclude protected payloads.
- Alerts cover repeated permission failures, failed sensitive actions, stale
  approvals, export anomalies, job/integration failures, and audit write failure.

### 14.5 Browser and responsive behavior

- Primary support and operations workflows target desktop first.
- Mobile supports triage, read-only review, acknowledgement, and safe limited
  actions.
- Complex publishing, bulk operations, refunds, and break-glass workflows may
  require desktop viewport.

---

## 15. Analytics and success measures

### 15.1 Initial measures without a mature admin user base

- Percentage of admin actions completed without direct SQL or engineering help
- Percentage of sensitive actions with valid audit and reason
- MFA and capability enforcement coverage across admin mutations
- Queue/state transition contract-test coverage
- Publication/refund/job-trigger idempotency test coverage
- Time to locate an entity in acceptance testing
- Accessibility test pass rate

### 15.2 Operational measures

- Median and p90 case resolution time by type
- Queue backlog and SLA breach rate
- Provider credential review time
- Booking escalation and dispute resolution time
- Refund approval and completion time
- Content/catalog review and publication time
- Worker/integration incident detection and resolution time
- Admin action failure and rollback rate
- Direct-production-data intervention count

### 15.3 Guardrail measures

- Unauthorized admin access attempts
- Sensitive record access without linked work/case where required
- Self-approval policy violations
- Duplicate external financial actions
- Audit-write failures
- Exports generated/accessed/expired
- Break-glass usage and post-review completion

---

## 16. Testing strategy

### 16.1 Authorization and security

- Role, capability, resource-scope, and environment checks
- MFA and step-up behavior
- Idle timeout and cross-tab behavior
- Session revocation
- Self-grant and self-approval prevention
- Break-glass lifecycle
- Sensitive field redaction
- Export authorization and expiry

### 16.2 Domain workflows

- User suspension/reactivation and session revocation
- Provider credential and appeal lifecycle
- Booking transition/override behavior
- Refund request/approval/provider confirmation/idempotency
- Review moderation
- Privacy request verification and deletion execution
- Content/catalog draft/review/publish/rollback
- Personalization activation and kill switch
- Worker dry-run/trigger/retry and integration test

### 16.3 Audit tests

- Successful and failed actions generate correct safe audit events
- Before/after diff excludes secrets and restricted data
- Request/trace/case/approval correlation is preserved
- Audit failure blocks actions where audit is mandatory
- Specialized audit stores expose a safe normalized projection

### 16.4 UI and accessibility

- Navigation is capability-filtered across desktop/mobile/command palette
- Global search disambiguation and authorization
- Queue filters, saved views, assignments, and empty/error/offline states
- Conflict and stale-edit resolution
- Keyboard and screen-reader use of sensitive-action dialogs
- Responsive triage behavior

### 16.5 End-to-end role matrix

Test at least:

- platform admin;
- customer support;
- provider operations;
- marketplace operations;
- finance operations;
- trust and safety;
- content author;
- content reviewer/publisher;
- platform operator;
- read-only analyst/auditor;
- HOMEOWNER and PROVIDER denial paths.

---

## 17. Phased implementation roadmap

### Phase 0 — Foundation hardening

**Status:** Mostly shipped (commit `2167d20` + a same-day MFA follow-up fix)

- [x] Preserve dedicated ADMIN shell, route guard, idle timeout, and command
      palette. *(pre-existing, unchanged)*
- [ ] Standardize `/api/admin` route conventions. **Not done.** URL paths
      already resolve to `/admin/...` for nearly every route, but the Express
      mounting convention and `knowledgeHubAdmin.routes.ts`'s
      `/knowledge/admin/...` ordering are still inconsistent — deferred, see
      §4.4 gap 8.
- [x] Apply MFA consistently to all admin mutations, including DIY, financing,
      and permit configuration. Also caught and fixed an undocumented gap in
      `neighborhoodIntelligence.routes.ts` found during verification.
- [x] Introduce capability enforcement and internal role bundles. 36-capability
      catalog + 12 persona bundles (`config/adminCapabilities.ts`), enforced via
      `requireCapability` on every existing admin route group, plus a
      grant/revoke API (`/api/admin/capabilities`, gated by `ADMIN_ROLE_MANAGE`,
      self-grant blocked).
- [x] Standardize structured admin audit contract. `adminAudit.service.ts`
      + new `AuditLog.metadata` column. Applies to newly-written admin
      actions only — pre-existing bespoke audit paths were not migrated.
- [~] Add action-risk classification, idempotency conventions, and approval
      policy. Per-capability risk level (`LOW`/`MEDIUM`/`HIGH`/`CRITICAL`)
      shipped as a foundation; idempotency conventions and the approval
      policy itself are **not built** — that's FR-6, tracked for Phase 1+.
- [x] Inventory and register every current/API-only admin capability. The
      capability catalog *is* the inventory; every current/API-only admin
      route group now enforces one of its capabilities.

### Phase 1 — Command Center, search, and support foundation

**Status:** Started — user/account support and Audit Explorer v1 shipped;
dashboard, search, unified entity pattern, and case management remain PLANNED

- [ ] ADMIN landing dashboard. **Not started.**
- [ ] Global search. **Not started.**
- [ ] Unified entity page pattern. **Not started** — the new User & Account
      Support page (below) uses a bespoke layout, not a shared pattern; the
      pattern should still be extracted once a second entity type (e.g.
      provider) needs an equivalent page.
- [x] User/account and property support workspace. **Property support is
      out of scope so far** — this shipped as user/account support only:
      search by name/email, support-safe summary (verification, MFA, active
      session count, homeowner/provider profile summary), at
      `/dashboard/admin/users`. No property-specific view yet.
- [x] Session revocation and governed account status actions. Both ship as
      part of the workspace above — `USER_SESSION_REVOKE` revokes all active
      refresh sessions and bumps `tokenVersion`; `USER_STATUS_CHANGE` supports
      ACTIVE/SUSPENDED/INACTIVE transitions, mirrors the existing
      self-service deactivation transaction (including deactivating a
      provider's footprint), and blocks an admin from targeting their own
      account. Reactivation deliberately does not auto-restore a provider's
      service listings.
- [ ] Cross-domain case management, assignment, notes, SLA, and communication
      records. **Not started.** Every governed action above requires a typed
      reason and is fully audited, but nothing yet creates a case record or
      links these actions to one.
- [x] Audit Explorer v1. Filtered/paginated read view at
      `/dashboard/admin/audit` over `AuditLog` (actor, entity type/id, action,
      request ID, date range). Only surfaces actions written through the new
      standardized contract — see §4.4 gap 9.

### Phase 2 — Provider, marketplace, booking, and trust operations

**Status:** All six items have a shipped v1 slice or partial coverage;
deeper target requirements per item remain PLANNED (see §10.2/§10.3/§10.5)

- [x] Expand Provider Compliance into full Provider Operations. First slice
      shipped: provider-centric directory + operational detail at
      `/dashboard/admin/providers` (`PROVIDER_VIEW`) with governed
      marketplace-status transitions (`PROVIDER_SUSPEND`). The credential
      queue remains its own workspace; deeper integration (appeals, risk
      scoring, coverage zones) still PLANNED.
- [x] Provider directory, renewal, expiry, appeals, risk/performance context.
      **PARTIAL** — directory with credential expiry visibility and
      compliance alerts shipped as part of the slice above; renewal
      workflows, appeals-as-cases, and risk/performance scoring PLANNED.
- [x] Booking operations and escalation timeline. Read-only v1 at
      `/dashboard/admin/bookings` (`BOOKING_VIEW`): search + merged
      operational timeline. Governed mutations (`BOOKING_OPERATE`) PLANNED.
- [x] Review moderation queue. Shipped at `/dashboard/admin/reviews` under
      `REVIEW_MODERATE`: pending+flagged queue (oldest first) plus per-status
      browse, detail view with booking context and author/provider history
      counts, governed APPROVE/REJECT/FLAG/RESTORE transitions with required
      reason, moderator attribution (`moderatedAt`/`moderatedBy`), and full
      audit including optional policy version. FLAG on an approved review
      pulls it from public view; RESTORE returns a rejected/flagged review to
      PENDING rather than re-publishing. Admins who authored or received a
      review cannot moderate it. No schema changes were needed — the existing
      `Review.status`/`moderatedAt`/`moderatedBy` fields carry the workflow,
      and public provider-review reads already filter to APPROVED. Automated
      signals, policy references, and "request investigation" remain open
      (see §10.5).
- [x] Safety/abuse case types. Shipped as `AdminCase`/`AdminCaseNote`
      (`admin_cases`/`admin_case_notes` tables — **requires `prisma db push`**)
      with SAFETY/ABUSE/REVIEW_INVESTIGATION/SUPPORT types at
      `/dashboard/admin/cases` under `SUPPORT_CASE_MANAGE`: severity,
      governed lifecycle (resolution required to resolve; reopen keeps
      resolution history), ADMIN-only assignment, linked entities, note
      trail, audited actions. Review moderation's "request investigation"
      creates linked cases. SAFETY-specific workflow
      (`SAFETY_INCIDENT_MANAGE`) PLANNED.
- [x] Operational notifications and work queues. **PARTIAL** — the
      work-queue half shipped at `/dashboard/admin/work-queues` (baseline
      `ADMIN_DASHBOARD_VIEW`): aggregate counts of every actionable queue
      with links, auto-refreshing. Pushed notifications PLANNED.

### Phase 3 — Payments, refunds, disputes, and privacy

**Status:** Started — payment operations, refund governance, dispute case
type, and privacy request tracking shipped as v1 slices; refund execution,
reconciliation against the provider, and exports remain PLANNED

- [x] Payment operations and reconciliation view. **PARTIAL** — local-ledger
      search + status summary at `/dashboard/admin/payments`
      (`PAYMENT_VIEW`). True reconciliation is PLANNED: there is no
      payment-provider integration to reconcile against yet.
- [x] Refund request/approval/execution. **PARTIAL** — request
      (`REFUND_REQUEST`) and two-person approval (`REFUND_APPROVE`,
      requester ≠ approver, amount ≤ refundable remainder, one pending
      request per payment) shipped via the `RefundRequest` model (requires
      `prisma db push`). **Execution is deliberately absent** — no money
      moves until a payment-provider integration exists; APPROVED is
      terminal.
- [x] Dispute/chargeback case management. **PARTIAL** — DISPUTE added to
      `AdminCaseType`; disputes are managed as cases at
      `/dashboard/admin/cases`. Evidence deadlines, documents, and
      chargeback-specific workflow PLANNED.
- [x] Privacy request intake, verification, export, correction, deletion, legal
      hold, and final communication. **PARTIAL** — intake/verification/
      lifecycle/legal-hold tracking shipped at `/dashboard/admin/privacy`
      (`PRIVACY_REQUEST_MANAGE`, `PrivacyRequest` model — requires
      `prisma db push`); export artifacts, deletion-execution linkage, and
      final communication PLANNED (see §11.4).
- [ ] Sensitive export controls. **Not started.**

### Phase 4 — Content, catalogs, and personalization governance

**Status:** Started — knowledge editorial workflow + Pending Reviews
workspace shipped; revisions, scheduling, DIY, catalogs, and
personalization records remain PLANNED

- [x] Immutable content revisions and standard editorial workflow.
      **PARTIAL** — the capability-separated editorial workflow shipped for
      knowledge articles (DRAFT → REVIEW → APPROVED → PUBLISHED → ARCHIVED
      with author/reviewer/publisher separation, required reasons, full
      audit; saving can no longer change lifecycle state; APPROVED added to
      the enum — **requires `prisma db push`**). Immutable revisions
      PLANNED — edits still mutate the article in place.
- [ ] Knowledge scheduling, preview, unpublish, and rollback. **PARTIAL** —
      unpublish shipped (PUBLISHED → APPROVED, immediate public removal);
      scheduling, preview, and rollback PLANNED.
- [ ] DIY safety-tier review and publication. **Not started.**
- [ ] Property Context catalog section. **Not started** (deliberately
      deferred — the property context area is under active concurrent
      development).
- [ ] Operational reference catalog management. **Not started.**
- [ ] Personalization review records and semantic diffs. **Not started.**
- [x] Pending Reviews and Scheduled Releases workspace. **PARTIAL** —
      Pending Reviews shipped at `/dashboard/admin/content-reviews` (review
      + awaiting-publish queues, also surfaced in Work Queues); Scheduled
      Releases PLANNED with scheduling.

### Phase 5 — Platform operations and analytics expansion

**Status:** Worker Jobs and product analytics partially CURRENT; API-only foundations exist

- Shared Data Health UI.
- Permit/integration management UI.
- Release Gate UI.
- Worker run detail, incident correlation, governed bulk triggers.
- Marketplace, support, finance, content, catalog, and operations analytics.
- Saved views, controlled exports, and alerts.

### Phase 6 — Advanced governance and automation

**Status:** FUTURE

- Read-only support-assisted user context.
- Hardware-backed privileged authentication.
- Periodic access certification workflow.
- Advanced fraud/abuse triage assistance.
- Scheduled operational reports.
- Policy-driven workload routing and SLA prediction.
- Restricted auditor and legal-request workspaces.

---

## 18. Rollout and operational readiness

- Deliver domain workspaces incrementally behind capability assignments.
- Do not grant new mutation capabilities merely because the user already has the
  legacy ADMIN role.
- Backfill audit/case/governance metadata without changing domain state.
- Run read-only comparison before replacing existing operational workflows.
- Validate non-production external integrations before financial or messaging
  actions are enabled.
- Publish runbooks for refunds, account suspension, provider suspension,
  privacy deletion, break-glass access, job failures, and audit failure.
- Train each internal persona on only their assigned workflows.
- Perform access review before production enablement.
- Maintain direct-tool fallback only where formally approved; record its use.

---

## 19. Acceptance criteria

The target ADMIN platform is complete when:

1. ADMIN has a dedicated landing dashboard, global search, and capability-based
   navigation.
2. Every admin mutation is protected by authentication, ADMIN role, capability,
   MFA/step-up as required, validation, and audit.
3. User/account support, provider operations, booking operations, payment/refund
   operations, moderation, privacy, content/catalog, personalization, platform
   operations, and analytics each have a coherent workspace.
4. Cross-domain cases support assignment, notes, SLA, linked entities,
   escalation, and resolution.
5. High-risk actions support approval, reason, idempotency, impact preview, and
   safe outcome history.
6. Payment and external integration state is never fabricated locally.
7. Content and catalog publication uses immutable revisions and rollback.
8. Git-managed contracts/configuration remain read-only in ADMIN.
9. Audit Explorer can trace an action across actor, entity, case, approval,
   request, trace, and external reference.
10. Privacy-sensitive access and exports are scoped and reviewable.
11. HOMEOWNER and PROVIDER roles cannot access ADMIN APIs or pages.
12. Core workflows meet performance, reliability, accessibility, and
    observability requirements.
13. Routine operations no longer require direct SQL.
14. No database migration script is created by implementation.

---

## 20. Decisions and open questions

### 20.1 Decisions made

- This document defines complete target-state coverage with phased delivery.
- The existing `ADMIN_MODULE_FRD.md` is expanded rather than replaced by a
  separate platform FRD.
- Existing implemented functionality is explicitly identified.
- All requested domains are included in target architecture.
- Property Context catalog governance is one ADMIN section.
- Existing dedicated shell, shared guard, MFA pattern, and idle timeout remain
  the platform foundation.
- Internal responsibilities use capabilities within the ADMIN population.
- Direct SQL is not a normal operational workflow.
- Schema changes are permitted when required; migration scripts are not created.

### 20.2 Open questions to resolve during Phase 0/1

1. Which named individuals initially receive each capability bundle?
2. What refund amounts/actions require one versus two approvers?
3. Which user fields may customer support correct without privacy-team approval?
4. Which record views require an active linked case before sensitive data is
   revealed?
5. What are the SLA targets for support, compliance, disputes, privacy, safety,
   and publishing queues?
6. What audit, case, communication, and export retention periods apply?
7. Which external payment, messaging, observability, and incident tools are
   authoritative in production?
8. Is payout administration in platform scope, or is it permanently delegated
   to the payment provider?
9. Which actions must be unavailable on mobile?
10. Which jurisdictional privacy workflows must be supported first?
11. Does `PERSONALIZATION_OPERATE` belong with Platform Administrator as an
    emergency safety control (as bundled in §8.3), or with Content/Catalog
    Publisher once content-version authoring is separated from rule authoring
    per §10.8?
12. Is subject-rights privacy request intake and execution (§11.4) owned by
    Trust and Safety Reviewer as bundled in §8.3, or does it warrant a
    dedicated Privacy/Legal persona ahead of Phase 3?

---

## 21. Definition of done

For each delivered phase:

- current/planned status inventory is updated;
- personas and capabilities are defined and server-enforced;
- routes use the approved admin security boundary;
- list, detail, queue, action, error, empty, loading, and offline experiences are
  implemented;
- domain state transitions are validated;
- sensitive actions use required reason, approval, idempotency, and impact
  preview;
- complete safe audit events are written and queryable;
- privacy/redaction requirements pass tests;
- contract, integration, authorization, and end-to-end tests pass;
- accessibility checks pass;
- metrics, alerts, and runbooks exist;
- release and rollback behavior is tested;
- documentation and capability matrix are current;
- no migration script has been created.

---

## 22. Repository evidence map

| Area | Current evidence |
|---|---|
| ADMIN navigation | `apps/frontend/src/lib/navigation/adminNavigation.ts` |
| Shared guard | `apps/frontend/src/hooks/useAdminGuard.tsx` |
| ADMIN console components | `apps/frontend/src/components/ops/AdminConsoleShell.tsx` |
| Dashboard role shell | `apps/frontend/src/app/(dashboard)/layout.tsx` |
| Frontend route protection | `apps/frontend/middleware.ts` |
| Provider Compliance UI | `apps/frontend/src/app/(dashboard)/dashboard/admin/provider-compliance/page.tsx` |
| DIY Admin UI | `apps/frontend/src/app/(dashboard)/dashboard/admin/diy/templates/**` |
| Analytics UI | `apps/frontend/src/app/(dashboard)/dashboard/analytics-admin/page.tsx` |
| Knowledge Admin UI | `apps/frontend/src/app/(dashboard)/dashboard/knowledge-admin/**` |
| Worker Jobs UI | `apps/frontend/src/app/(dashboard)/dashboard/worker-jobs/page.tsx` |
| Personalization UI | `apps/frontend/src/app/(dashboard)/dashboard/admin/personalization/page.tsx` |
| Backend authorization/MFA | `apps/backend/src/middleware/auth.middleware.ts` |
| Provider compliance routes | `apps/backend/src/routes/providerCredential.routes.ts` |
| DIY admin routes | `apps/backend/src/routes/diy.routes.ts` |
| Knowledge admin routes | `apps/backend/src/routes/knowledgeHubAdmin.routes.ts` |
| Personalization routes | `apps/backend/src/routes/adminPersonalization.routes.ts` |
| Analytics routes | `apps/backend/src/routes/adminAnalytics.routes.ts` |
| Worker routes | `apps/backend/src/routes/adminWorkerJobs.routes.ts` |
| Shared-data routes | `apps/backend/src/routes/adminSharedData.routes.ts` |
| Financing admin routes | `apps/backend/src/routes/financing.routes.ts` |
| Permit source routes | `apps/backend/src/routes/permitTracker.routes.ts` |
| Release gates | `apps/backend/src/routes/releaseGate.routes.ts` |
| Capability catalog + persona bundles (Phase 0) | `apps/backend/src/config/adminCapabilities.ts` |
| Capability grant/revoke enforcement (Phase 0) | `apps/backend/src/services/adminCapability.service.ts`, `apps/backend/src/middleware/adminCapability.middleware.ts` |
| Capability grant/revoke API (Phase 0) | `apps/backend/src/routes/adminCapability.routes.ts`, `apps/backend/src/controllers/adminCapability.controller.ts` |
| Standardized admin audit write path (Phase 0) | `apps/backend/src/services/adminAudit.service.ts` |
| Admin capability bootstrap (Phase 0, run manually post-`db push`) | `apps/backend/scripts/adminCapabilityBootstrap.ts` |
| User & Account Support UI (Phase 1) | `apps/frontend/src/app/(dashboard)/dashboard/admin/users/page.tsx` |
| User & Account Support backend (Phase 1) | `apps/backend/src/services/adminUserSupport.service.ts`, `apps/backend/src/routes/adminUserSupport.routes.ts` |
| Audit Explorer v1 UI (Phase 1) | `apps/frontend/src/app/(dashboard)/dashboard/admin/audit/page.tsx` |
| Audit Explorer v1 backend (Phase 1) | `apps/backend/src/services/adminAuditExplorer.service.ts`, `apps/backend/src/routes/adminAuditExplorer.routes.ts` |
| Review Moderation Queue UI (Phase 2) | `apps/frontend/src/app/(dashboard)/dashboard/admin/reviews/page.tsx` |
| Review Moderation Queue backend (Phase 2) | `apps/backend/src/services/adminReviewModeration.service.ts`, `apps/backend/src/routes/adminReviewModeration.routes.ts` |
| Provider Operations UI (Phase 2) | `apps/frontend/src/app/(dashboard)/dashboard/admin/providers/page.tsx` |
| Provider Operations backend (Phase 2) | `apps/backend/src/services/adminProviderOps.service.ts`, `apps/backend/src/routes/adminProviderOps.routes.ts` |
| Booking Operations UI (Phase 2) | `apps/frontend/src/app/(dashboard)/dashboard/admin/bookings/page.tsx` |
| Booking Operations backend (Phase 2) | `apps/backend/src/services/adminBookingOps.service.ts`, `apps/backend/src/routes/adminBookingOps.routes.ts` |
| Cases UI (Phase 2) | `apps/frontend/src/app/(dashboard)/dashboard/admin/cases/page.tsx` |
| Cases backend (Phase 2) | `apps/backend/src/services/adminCase.service.ts`, `apps/backend/src/routes/adminCase.routes.ts` |
| Work Queues UI (Phase 2) | `apps/frontend/src/app/(dashboard)/dashboard/admin/work-queues/page.tsx` |
| Work Queues backend (Phase 2) | `apps/backend/src/services/adminWorkQueues.service.ts`, `apps/backend/src/routes/adminWorkQueues.routes.ts` |
| Payment Operations UI (Phase 3) | `apps/frontend/src/app/(dashboard)/dashboard/admin/payments/page.tsx` |
| Payment Operations backend (Phase 3) | `apps/backend/src/services/adminPaymentOps.service.ts`, `apps/backend/src/routes/adminPaymentOps.routes.ts` |
| Privacy Requests UI (Phase 3) | `apps/frontend/src/app/(dashboard)/dashboard/admin/privacy/page.tsx` |
| Privacy Requests backend (Phase 3) | `apps/backend/src/services/adminPrivacyRequests.service.ts`, `apps/backend/src/routes/adminPrivacyRequests.routes.ts` |
| Pending Reviews UI (Phase 4) | `apps/frontend/src/app/(dashboard)/dashboard/admin/content-reviews/page.tsx` |
| Pending Reviews backend (Phase 4) | `apps/backend/src/services/adminContentGovernance.service.ts`, `apps/backend/src/routes/adminContentGovernance.routes.ts` |
| Booking domain/admin foundation | `apps/backend/src/services/booking.service.ts` |
| Account lifecycle/deletion | `apps/backend/src/services/auth.service.ts`, `apps/backend/src/controllers/user.controller.ts`, `apps/backend/src/services/accountDeletionCascade.service.ts` |
| Core domain and audit schema | `apps/backend/prisma/schema.prisma` |
| Property Context catalog | `apps/backend/src/modules/propertyContext/catalog/factCatalog.ts` |
| Reference bootstrap | `apps/backend/prisma/reference-data-bootstrap.pgadmin.sql` |

---

## 23. Initial ADMIN implementation history

Version 1.2 of this FRD covered the initial ADMIN isolation work. The following
capabilities were implemented and manually verified on 2026-07-09:

- dedicated ADMIN navigation instead of homeowner navigation;
- desktop/mobile/command-palette ADMIN treatment;
- complete navigation to the then-current admin pages;
- frontend middleware protection for actual ADMIN routes;
- shared `useAdminGuard` page behavior;
- 15-minute ADMIN inactivity timeout with a 60-second warning and cross-tab
  activity synchronization;
- ADMIN redirect away from the homeowner dashboard;
- suppression of homeowner-only property setup, property switcher,
  breadcrumbs, command content, and AI concierge surfaces.

Post-verification fixes included idle-logout race handling, property setup banner
suppression, property-switcher suppression, ADMIN `/dashboard` redirect,
breadcrumb suppression, command-palette isolation, AI chat suppression, and
ADMIN-specific command-search copy. These fixes were recorded in commits
`0473a9b`, `8054e1d`, `b92b4ad`, and `fe9e032`.

This history remains `CURRENT` platform foundation. Version 2.0 adds the holistic
target operating model and does not invalidate that completed work.

---

*This version is based on a holistic repository review performed on 2026-07-17.
It defines the complete target ADMIN platform, identifies implemented and
foundational capabilities, and organizes remaining work into phased delivery.*
