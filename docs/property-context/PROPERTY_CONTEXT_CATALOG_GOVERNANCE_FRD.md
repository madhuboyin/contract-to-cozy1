# Property Context Platform — Catalog, Operational Configuration, and Editorial Governance FRD

**Version:** 1.0

**Last Updated:** 2026-07-17

**Status:** Proposed

**Audience:** Product, platform engineering, backend engineering, frontend engineering, QA, operations, content operations

**Related documents:**

- `docs/property-context/PROPERTY_CONTEXT_FRD.md`
- `docs/functional/ADMIN_MODULE_FRD.md`
- `docs/personalization/08-personalization-frd.md`

---

## 1. Executive summary

The Property Context Platform depends on several kinds of shared data that have
different risk, ownership, and release characteristics:

1. **Contract and rule configuration** controls fact identity, canonical
   ownership, applicability, scoring, safety, and financial behavior.
2. **Operational reference catalogs** control which services, plants,
   maintenance tasks, habits, tools, and integrations are available.
3. **Editorial data** controls homeowner-facing titles, explanations, care
   instructions, articles, and calls to action.

These data types must not be managed through one unrestricted CRUD interface.
The recommended model is a hybrid:

- **Git-managed configuration** for code-coupled contracts and high-risk
  deterministic rules.
- **Governed admin-managed data** for operational catalogs that must change
  without an application deployment.
- **Editorial workflows** for homeowner-facing content.
- **Read-only operational visibility** in the ADMIN module for Git-managed
  catalogs, including deployed version, validation state, and drift status.

Every catalog and every mutable field must have exactly one authoritative source.
Seed or bootstrap processes must never overwrite fields owned by the ADMIN
module. Direct production SQL is limited to initial bootstrap, controlled bulk
repair, and break-glass recovery.

This FRD extends the existing ADMIN module; it does not replace it. The current
admin shell, shared guard, MFA middleware, inactivity timeout, and console
components are the foundation for the new catalog-governance workspace.

---

## 2. Problem statement

The application has accumulated production-relevant configuration across Prisma
tables, TypeScript catalogs, seed logic, and feature-specific admin pages. The
runtime consumers are generally implemented, but the management model is
inconsistent:

- some catalogs are authored in code and deployed;
- some database catalogs are created by seed/bootstrap logic;
- some content is directly edited and published from the ADMIN module;
- some operational configuration has backend admin APIs but no admin UI;
- most database catalogs have no version, reviewer, publisher, effective date,
  release, or rollback concept;
- current bootstrap upserts can conflict with future UI ownership;
- direct database edits are possible but provide no safe business workflow.

Without an explicit governance model, the likely outcomes are configuration
drift, lost admin edits, unsafe activation, weak auditability, and uncertainty
about whether Git, SQL, or the database is authoritative.

---

## 3. Goals

- Establish one authoritative source for every managed catalog and field.
- Extend the current ADMIN module with catalog-specific management experiences.
- Support safe draft, review, approval, publication, retirement, and rollback.
- Keep high-risk decision logic version-controlled and testable in Git.
- Allow approved operational and editorial changes without an application
  deployment.
- Prevent seed/bootstrap routines from overwriting DB-owned data.
- Preserve stable identifiers and existing transactional references.
- Provide complete actor, change, release, and rollback audit history.
- Apply controls proportional to the blast radius of each change.
- Provide validation and impact previews before publication.
- Make deployed catalog health and drift visible to administrators.

## 4. Non-goals

- A generic database-table editor.
- Replacing GitHub or the normal pull-request process.
- Moving the Property Context fact contract into a runtime-editable database.
- Allowing administrators to create arbitrary rule JSON or unvalidated schemas.
- Exposing secrets, API keys, or environment-variable values in the UI.
- Introducing automatic personalization weight tuning.
- Building a full enterprise MDM suite.
- Creating Prisma migration scripts. If schema changes are approved during
  implementation, the Prisma schema may be changed and the user will apply the
  database change separately.
- Managing homeowner-, property-, provider-, or transaction-owned records as
  reference catalogs.

---

## 5. Review scope and current-state evidence

The review covered the implemented ADMIN navigation and shell, page-level
authorization, backend admin routes, catalog services, validators, Prisma
models, Property Context catalogs, and reference bootstrap SQL.

Primary implementation evidence includes:

- `apps/frontend/src/lib/navigation/adminNavigation.ts`
- `apps/frontend/src/hooks/useAdminGuard.tsx`
- `apps/frontend/src/components/ops/AdminConsoleShell.tsx`
- `apps/frontend/src/app/(dashboard)/dashboard/admin/**`
- `apps/frontend/src/app/(dashboard)/dashboard/knowledge-admin/**`
- `apps/backend/src/routes/adminPersonalization.routes.ts`
- `apps/backend/src/routes/knowledgeHubAdmin.routes.ts`
- `apps/backend/src/routes/adminSharedData.routes.ts`
- `apps/backend/src/routes/adminWorkerJobs.routes.ts`
- `apps/backend/src/routes/diy.routes.ts`
- `apps/backend/src/routes/financing.routes.ts`
- `apps/backend/src/routes/permitTracker.routes.ts`
- `apps/backend/src/routes/releaseGate.routes.ts`
- `apps/backend/src/modules/propertyContext/catalog/factCatalog.ts`
- `apps/backend/src/modules/propertyContext/policies/featurePolicy.ts`
- `apps/backend/prisma/schema.prisma`
- `apps/backend/prisma/reference-data-bootstrap.pgadmin.sql`

### 5.1 Existing ADMIN module strengths

| Area | Current capability | Reuse decision |
|---|---|---|
| Admin shell | Dedicated ADMIN-only navigation, desktop/mobile treatment, admin command palette | Reuse and extend |
| Client guard | Shared `useAdminGuard` loading, authentication, role, and offline states | Reuse |
| Server authorization | ADMIN role checks across admin APIs | Standardize |
| MFA | Personalization, knowledge, analytics, shared data, worker jobs, and provider compliance use `requireMfa` | Extend to all catalog mutations |
| Session control | ADMIN inactivity timeout exists | Reuse |
| Console UI | Shared shell and route-state components | Reuse |
| Personalization | Reviewed activation, per-definition pause/resume, global kill switch, aggregate quality view | Preserve and extend carefully |
| Knowledge | Article list, create, edit, taxonomy selection, tool/CTA linking, and lifecycle status | Evolve into editorial workflow |
| DIY | Template list, filtering, authoring, duplication, and lifecycle actions | Evolve into governed workflow |
| Provider compliance | Review queue with approval/rejection | Retain outside catalog workspace |
| Worker jobs | Registry, health, history, and supported manual triggers | Retain; integrate catalog job visibility |
| Analytics | Product analytics dashboard | Retain; add catalog-governance metrics separately |

### 5.2 Current ADMIN module limitations

| Finding | Current state | Required direction |
|---|---|---|
| Navigation coverage | Six visible admin destinations; shared-data diagnostics, financing rates, permit sources, and release gates have no first-class admin destination | Add grouped information architecture |
| Catalog coverage | No management UI/API for service categories, system components, plants, seasonal templates, habit templates, knowledge categories, knowledge tags, or product-tool presentation | Add catalog-specific modules according to ownership matrix |
| Personalization authoring | UI activates existing rule/content/question versions but does not safely author them | Keep rule/schema authoring in Git; optionally add controlled content-version authoring |
| Knowledge publication | An editor can set lifecycle status directly in the article upsert | Separate save, submit, approve, publish, unpublish, and archive actions |
| Knowledge revisions | Article updates replace current article and child rows | Add immutable revision and release history |
| Knowledge audit | No explicit actor-aware catalog audit is written by the reviewed create/update service | Add catalog audit and publication events |
| DIY protection | Admin DIY routes require authentication and ADMIN role, but do not currently apply the MFA middleware used by other sensitive admin routes | Require MFA for mutations and preferably the whole admin DIY route group |
| DIY governance | DRAFT/ACTIVE/ARCHIVED exists, but reviewer/publisher and immutable revision history do not | Add review, release, and rollback controls |
| Reference lifecycle | Several models only expose `isActive`; `PlantCatalog` has no lifecycle field | Standardize lifecycle behavior without forcing one physical schema shape |
| Stable keys | Plant catalog lacks a unique stable business code; common/scientific names are not sufficient immutable identity | Add an immutable plant code before admin authoring |
| Audit fragmentation | Generic `AuditLog`, personalization-specific audit events, and service-specific logging coexist | Define a common catalog audit contract while preserving privacy-specific stores |
| Source ownership | Bootstrap SQL upserts several catalogs | Change semantics before any catalog becomes DB-owned by the UI |
| Approval granularity | Current application has one `ADMIN` role | Add catalog capabilities or assignments without exposing data to non-admin roles |

### 5.3 Current catalog inventory

| Catalog/configuration | Storage today | Runtime use | Admin support today |
|---|---|---|---|
| Property fact catalog | TypeScript | Property Context contract, validation, correction routing | None; code-only |
| Feature applicability policies | TypeScript services | Feature applicability and missing-context behavior | None; code-only |
| Service categories | `ServiceCategoryConfig` + enum | Provider discovery and task routing | None |
| System components | `SystemComponentConfig` | Lifespan, replacement cost, risk warnings | None |
| Personalization definitions/rules/content | Versioned Prisma models plus TypeScript allowlist | Deterministic recommendations | Review, activate, pause/resume |
| Profile questions | Versioned `ProfileQuestion` | Progressive profiling | Review and activate |
| Plant catalog | `PlantCatalog` | Plant Advisor and care planning | None |
| Seasonal templates | `SeasonalTaskTemplate` | Seasonal checklist generation | None |
| Habit templates | `HabitTemplate` | Habit generation and ranking | None |
| Knowledge articles | Knowledge article aggregate | Knowledge Hub | Create/edit/status management |
| Knowledge categories/tags | `KnowledgeCategory`, `KnowledgeTag` | Article taxonomy | Selection only; no taxonomy management |
| Product tools | `ProductTool` | Knowledge tool and CTA linking | Selection only; no catalog management |
| DIY templates | `DiyProjectTemplate` aggregate | DIY library and decision support | Full authoring and status controls |
| Financing rates | `FinancingRateConfig` | Financing calculations | Backend admin API only |
| Permit data sources | `PermitDataSource` | Permit ingestion | Backend admin API only |
| Shared-data operations | Service/worker operations | Backfill, readiness, consistency, signal health | Backend admin API and worker visibility only |
| Release gates | Code/service registry | Tool release readiness | Backend read API only |

---

## 6. Governance principles

### 6.1 One source of truth

Every catalog field must be classified as one of:

- `GIT_OWNED`
- `ADMIN_OWNED`
- `RUNTIME_DERIVED`
- `SECRET_REFERENCE`

No field may be both Git-owned and admin-owned. An ownership change requires an
explicit one-time handoff and must not occur implicitly through a deployment.

### 6.2 Stable identity

- Business keys are immutable after first publication.
- Labels, descriptions, sort order, and presentation may change independently.
- Published keys may be retired but not reused for a different meaning.
- Physical deletion is prohibited once a record is referenced.

### 6.3 Proportional control

Controls are based on change risk:

| Tier | Meaning | Examples | Minimum control |
|---|---|---|---|
| T0 | Read-only deployed contract | Property fact keys and canonical owners | Git PR, CI, deployment visibility |
| T1 | Low-risk editorial | Description, care copy, article text | Draft, validation, publisher action, audit |
| T2 | Operational behavior | Active status, availability, targeting, cadence, taxonomy | Draft, independent review, MFA publish, rollback |
| T3 | Safety/financial/decision logic | Risk penalties, replacement costs, safety warnings, rule AST, rate values | Git review or two-person admin approval, impact simulation, MFA, staged activation, rollback |

### 6.4 Immutable publication

Drafts are mutable. Published releases are immutable snapshots. Correcting a
published release creates a new revision; it does not rewrite history.

### 6.5 No routine direct SQL

Direct SQL must not be the normal authoring or publishing workflow. Permitted use
is limited to:

- initial reference-data bootstrap;
- approved bulk import using the same validation rules as the API;
- controlled repair with an incident/change record;
- break-glass recovery.

---

## 7. Recommended ownership model

### 7.1 Property Context and rule catalogs

| Data | Git-owned fields | Admin capability |
|---|---|---|
| Property fact catalog | Fact key, scope, canonical owner, correction contract, writability | Read-only catalog, deployed commit/version, consumer impact, drift/health |
| Feature policy | Required facts, applicability outcomes, unknown/conflict behavior, safety fallbacks | Read-only policy and simulation results |
| System component config | `systemType`, risk category, expected life, replacement-cost basis, warning flag semantics | Read-only deployed values initially; emergency disable only if separately modeled and audited |
| Personalization definition | Code, category, safety class, supported-definition allowlist | Activate/pause/resume supported versions |
| Personalization rule | Rule AST and its schema-valid version | Review evidence and activate; no raw JSON authoring |
| Profile question contract | Code and answer schema | Review prompt/privacy content and activate version |
| Product-tool contract | Key, slug, tool type, route path, route capability | Read-only contract; admin may manage presentation fields below |

### 7.2 Admin-owned operational and editorial fields

| Catalog | Admin-owned fields | Required workflow tier |
|---|---|---|
| Service category | Display name, description, icon, sort order, audience availability, active/retired state | T2 |
| Plant catalog | Display/care content, placement tips, watering guidance, decor tags; reviewed applicability and safety metadata | T1 content; T2/T3 toxicity and safety changes |
| Seasonal template | Title/copy, timing, cadence, cost range, DIY metadata, priority, service link, applicability metadata, active state | T2; safety-warning changes T3 |
| Habit template | Title/copy, cadence, effort, priority, tips, active state; schema-validated targeting inputs | T2 |
| Personalization content | Locale-specific title/body and review date | T2; safety-sensitive definition content T3 |
| Knowledge article | Article content, sections, SEO, taxonomy links, tool links, CTAs, feature/sort metadata | T1/T2 |
| Knowledge category/tag | Name, description/group, order, active/retired state | T2 |
| Product-tool presentation | Name, short description, icon, badge, order, display category, approved metadata subset | T2 |
| DIY template | Content, steps, materials, tools, costs, presentation, active/archived state | T2; high-safety content T3 |
| Financing rate | Value, label, source note, effective date | T3 |
| Permit data source | Display identity, coverage, mappings, filters, status, non-secret endpoint metadata | T3 |

### 7.3 Required field-boundary decisions

Before implementation, each catalog must have a checked-in field ownership
manifest. The manifest is used by API validation, bootstrap logic, import logic,
and CI. At minimum it identifies:

- immutable key fields;
- Git-owned fields;
- admin-owned fields;
- derived/read-only fields;
- sensitive fields;
- tier and required approval count;
- validation schema version;
- runtime consumers.

---

## 8. Target ADMIN information architecture

The ADMIN navigation should use grouped destinations instead of adding every
catalog as a top-level link.

### 8.1 Operations

- Provider Compliance
- Worker Jobs
- Shared Data Health
- Permit Data Sources
- Financing Rates
- Release Gates

### 8.2 Content and catalogs

- Catalog Overview
- Service Categories
- Plant Catalog
- Seasonal Templates
- Habit Templates
- DIY Templates
- Knowledge Articles
- Knowledge Taxonomy
- Product Tool Presentation
- Personalization Content and Activation

### 8.3 Governance

- Pending Reviews
- Scheduled Releases
- Publication History
- Audit History
- Import/Export Jobs
- Deployed Git Catalogs

The first catalog route should be
`/dashboard/admin/catalogs`. Individual catalog routes should live below this
prefix. Existing knowledge, DIY, and personalization routes may initially remain
in place but must be linked from the grouped catalog workspace.

---

## 9. Personas and permissions

The external application role remains `ADMIN`. Catalog permissions are internal
capabilities assigned to ADMIN users, not new public application roles.

| Capability | Purpose |
|---|---|
| `CATALOG_VIEW` | View catalog entries, versions, releases, and health |
| `CATALOG_AUTHOR` | Create and edit drafts for assigned catalogs |
| `CATALOG_REVIEW` | Review, approve, or reject changes authored by another user |
| `CATALOG_PUBLISH` | Publish approved revisions and perform rollback |
| `CATALOG_OPERATE` | Pause, resume, activate, or retire operational entries |
| `CATALOG_IMPORT` | Create validated bulk-import drafts |
| `CATALOG_BREAK_GLASS` | Perform explicitly logged emergency action |

Rules:

- MFA is required for all mutation endpoints.
- T2 and T3 publication must prevent an author from being the sole approver.
- T3 publication requires two-person control unless the change is delivered via
  the approved Git workflow.
- Break-glass capability is not implied by the general ADMIN role.
- Permissions may initially be configuration-backed if there are very few admins,
  but the API must enforce them independently of UI visibility.

---

## 10. Functional requirements

### FR-1: Catalog registry

- FR-1.1: The platform shall expose a registry of all governed catalogs.
- FR-1.2: Each registry entry shall identify owner, source of truth, risk tier,
  validation schema version, lifecycle, runtime consumers, and supported actions.
- FR-1.3: Git-managed catalogs shall be visible but not editable in the ADMIN UI.
- FR-1.4: The registry shall show the deployed catalog version or application
  commit where applicable.
- FR-1.5: Catalogs not registered shall not be eligible for generic admin
  mutation endpoints.

### FR-2: Catalog overview

- FR-2.1: The overview shall show entry counts by lifecycle status, pending
  reviews, scheduled releases, validation failures, drift, and recent publishes.
- FR-2.2: Administrators shall be able to filter by data class, owner, risk tier,
  lifecycle state, and health.
- FR-2.3: Each catalog card shall clearly identify `Git managed`, `Admin managed`,
  or `Hybrid fields`.
- FR-2.4: The overview shall link to runtime consumers and related worker jobs.

### FR-3: Catalog-specific list and detail views

- FR-3.1: Lists shall support search, lifecycle filtering, sorting, pagination,
  and CSV export where safe.
- FR-3.2: Stable business keys shall be visually distinguished from editable
  labels.
- FR-3.3: Detail views shall show active revision, draft revision, effective
  dates, references, validation state, and audit history.
- FR-3.4: Retirement actions shall show reference counts and consumer impact.
- FR-3.5: UI forms shall be catalog-specific and generated only from approved
  field metadata; arbitrary table/column editing is prohibited.

### FR-4: Draft and revision management

- FR-4.1: Editing an active entry shall create or update a draft revision.
- FR-4.2: Active data shall remain unchanged until publication succeeds.
- FR-4.3: Drafts shall support autosave or explicit save with optimistic
  concurrency protection.
- FR-4.4: The UI shall detect stale edits and require refresh or conflict
  resolution instead of silently overwriting another admin's work.
- FR-4.5: A revision shall include change summary and author.
- FR-4.6: Published revisions shall be immutable.

### FR-5: Validation

- FR-5.1: Every write shall pass field-schema validation.
- FR-5.2: Submission and publication shall also pass semantic and cross-catalog
  validation.
- FR-5.3: Foreign codes shall be verified against the authoritative catalog.
- FR-5.4: URL, locale, currency, cost-range, cadence, climate, enum, and JSON
  fields shall use typed validators.
- FR-5.5: JSON-backed rules shall use named, versioned schemas and structured
  editors; free-form JSON is not sufficient.
- FR-5.6: Validation results shall identify field, rule code, severity, and
  remediation guidance.
- FR-5.7: Warnings may require acknowledgement; errors block publication.

### FR-6: Review and approval

- FR-6.1: Authors shall submit a draft with a change summary.
- FR-6.2: Reviewers shall see a semantic diff between active and proposed data.
- FR-6.3: Reviewers may approve, reject with reason, or request changes.
- FR-6.4: T2/T3 self-approval restrictions shall be server-enforced.
- FR-6.5: Approval shall be invalidated when the approved draft changes.
- FR-6.6: Review records shall be immutable and retained after later releases.

### FR-7: Impact preview

- FR-7.1: Before publication, the system shall list known runtime consumers.
- FR-7.2: Deactivation/retirement shall show referenced records and affected
  experiences.
- FR-7.3: Seasonal, habit, plant, personalization, system-component, and service
  category changes shall support representative-archetype simulation.
- FR-7.4: T3 changes shall include before/after output comparisons for the demo
  archetype matrix defined by the Property Context FRD.
- FR-7.5: A preview shall never mutate homeowner or transactional data.

### FR-8: Publication and scheduling

- FR-8.1: Only approved revisions may be published.
- FR-8.2: Publication shall be atomic per release.
- FR-8.3: A release may contain multiple related entries and catalogs where
  cross-catalog consistency requires atomic activation.
- FR-8.4: Editorial and T2 changes may be scheduled with effective start time.
- FR-8.5: Only one active revision may exist for a stable key and locale/effective
  interval unless the catalog explicitly supports overlap.
- FR-8.6: Publication shall re-run validation immediately before activation.
- FR-8.7: Successful publication shall invalidate relevant caches and emit a
  catalog-release event.

### FR-9: Pause, retirement, and rollback

- FR-9.1: Operational entries shall support pause or retirement according to
  catalog capability.
- FR-9.2: Pause must preserve references and prior release history.
- FR-9.3: Rollback shall create a new release pointing to a previously published
  snapshot; it shall not rewrite history.
- FR-9.4: T2/T3 pause and rollback require MFA and a reason.
- FR-9.5: The UI shall distinguish scheduled end, manual retirement, emergency
  pause, and rollback.
- FR-9.6: Personalization's existing kill switch and definition pause controls
  remain authoritative for their current scope.

### FR-10: Audit history

- FR-10.1: Create, edit, submit, approve, reject, publish, schedule, cancel,
  pause, resume, retire, import, export, and rollback actions shall be audited.
- FR-10.2: Audit events shall capture actor, action, catalog, entry key, revision,
  release, reason, timestamp, request/trace ID, and safe before/after diff.
- FR-10.3: Sensitive profile values, secrets, tokens, and raw rule-evaluation
  payloads shall not be logged.
- FR-10.4: Personalization may continue using its privacy-restricted audit store,
  but it must expose the same safe audit projection to the governance UI.
- FR-10.5: Audit history shall be append-only and filterable.

### FR-11: Import and export

- FR-11.1: Bulk import shall create a draft import job, never write directly to
  active records.
- FR-11.2: The system shall provide a downloadable template including schema
  version and stable keys.
- FR-11.3: Import shall run the same validators as individual API writes.
- FR-11.4: Administrators shall preview creates, updates, unchanged rows,
  conflicts, and errors before submission.
- FR-11.5: Imports shall be atomic at publication time.
- FR-11.6: Export shall identify active revision and effective dates and shall not
  include secret values.

### FR-12: Git-managed catalog visibility

- FR-12.1: The ADMIN module shall show the deployed Property Context fact catalog,
  feature policies, system-component configuration, personalization rule
  versions, and product-tool contracts as read-only data.
- FR-12.2: The view shall show the application commit or catalog version and last
  successful validation time.
- FR-12.3: Where a repository link is configured, the UI may link to the source
  file or change request but shall not edit Git-managed fields.
- FR-12.4: Deployment shall report validation or reconciliation failure to the
  catalog health dashboard.

### FR-13: Bootstrap and reconciliation

- FR-13.1: A bootstrap manifest shall declare ownership semantics for every
  seeded field.
- FR-13.2: For admin-owned catalogs, bootstrap shall insert missing baseline
  records and shall not update existing admin-owned fields.
- FR-13.3: For Git-owned catalogs, deployment may reconcile declared fields after
  validation and shall record the deployed version.
- FR-13.4: Hybrid catalogs shall reconcile only Git-owned fields and preserve
  admin-owned fields.
- FR-13.5: Reconciliation shall support dry-run and produce a diff.
- FR-13.6: The existing pgAdmin bootstrap SQL must be updated to these semantics
  before an ADMIN UI becomes authoritative for any catalog it currently upserts.

### FR-14: Editorial workflow

- FR-14.1: Knowledge and other long-form content shall use Draft → Review →
  Approved → Published → Archived lifecycle actions.
- FR-14.2: Status shall not be an unrestricted field in the article upsert body.
- FR-14.3: Editors shall preview the homeowner rendering before submission or
  publication.
- FR-14.4: Publication may be scheduled; scheduled content may be cancelled by an
  authorized publisher.
- FR-14.5: Taxonomy changes shall warn about affected articles.
- FR-14.6: Article revision history shall preserve sections, taxonomy links, tool
  links, and CTAs as a consistent snapshot.

### FR-15: Catalog-specific safety controls

- FR-15.1: Plant toxicity and pet-safety changes require explicit evidence/source
  note and T3 approval.
- FR-15.2: Seasonal and DIY safety warnings cannot be removed from an active
  high-safety item without T3 approval.
- FR-15.3: System-component risk and replacement-cost changes remain Git-managed
  until a dedicated tested simulation and two-person workflow exists.
- FR-15.4: Financing rate changes require source note, effective date, semantic
  bounds, audit, and rollback.
- FR-15.5: Permit source secrets must be referenced by environment-variable name;
  secret values shall never be returned by the API.
- FR-15.6: Personalization rule AST and question answer schemas remain code/Git
  authored; online tuning remains disabled.

### FR-16: Operational health

- FR-16.1: The catalog dashboard shall expose validation failures, publication
  failures, cache/reconciliation failures, stale scheduled releases, and drift.
- FR-16.2: Catalog release events shall include catalog, version, outcome, and
  duration metrics without sensitive payloads.
- FR-16.3: Relevant worker-job health shall be linked from each catalog.
- FR-16.4: Alerts shall exist for failed T3 publications, repeated reconciliation
  failures, and missing active baseline catalogs.

---

## 11. Catalog-specific requirements

### 11.1 Service categories

- The enum value remains code-owned and immutable.
- Admins manage presentation, ordering, audience availability, and lifecycle.
- Deactivation preview identifies providers, tasks, templates, and discovery
  surfaces using the category.
- A category with active references is retired/hidden, not deleted.

### 11.2 Plant catalog

- Introduce a unique immutable plant code before enabling authoring.
- Common and scientific names are editable attributes, not identity.
- Toxicity, pet safety, and suitability require evidence/source metadata.
- The editor separates identity, environmental fit, safety, care, placement, and
  presentation sections.
- Preview shows representative Plant Advisor cards and applicability results.

### 11.3 Seasonal templates

- `taskKey` remains immutable.
- Climate regions, asset requirements, responsibility/applicability behavior,
  recurrence, and timing use typed controls.
- Service category must reference an active known category.
- Cost minimum cannot exceed cost maximum.
- Safety warnings and high-priority changes receive T3 treatment.
- Existing generated checklist items retain their historical task snapshot or
  template revision reference.

### 11.4 Habit templates

- `key` remains immutable.
- Targeting rules use a versioned schema and structured condition builder.
- Cadence, difficulty, impact, estimated effort, and priority use bounded typed
  fields.
- Preview evaluates the template against representative properties without
  creating `PropertyHabit` records.

### 11.5 Personalization

- Preserve the implemented definition allowlist, immutable rule versions,
  content versions, question versions, activation transaction, audit store,
  pause/resume, kill switch, and aggregate quality view.
- Add semantic diff, evidence checklist, and explicit review record.
- Rule AST and question answer-schema authoring remains Git-only.
- Content-version authoring may be added to ADMIN with separate locale and
  safety-sensitive approval controls.
- No automatic activation or online tuning is allowed.

### 11.6 Knowledge and taxonomy

- Keep the current article editor as the baseline authoring experience.
- Replace direct status assignment with workflow actions.
- Add revision snapshots, preview, reviewer/publisher identity, schedule,
  unpublish, rollback, and audit.
- Add category and tag CRUD with stable slugs, impact preview, and retirement.
- Product tool route/key/type remain code-owned; presentation fields may be
  managed through ADMIN.

### 11.7 DIY templates

- Preserve existing template form, nested steps/materials/tools, filtering,
  duplication, and lifecycle actions.
- Apply MFA consistently to admin DIY routes.
- Add immutable publication revisions and reviewer/publisher metadata.
- High-safety templates require T3 review and cannot self-approve.

### 11.8 Financing rates and permit sources

- Expose the existing backend capabilities through the grouped Operations UI.
- Apply MFA, capability checks, audit, version/effective-date history, and
  validation consistently.
- Permit-source test actions must return sanitized diagnostics.
- Financing changes must not retroactively rewrite stored scenario results.

---

## 12. Conceptual data requirements

Implementation may reuse existing tables and add focused governance tables. It
must not force all catalog rows into one generic entity-attribute-value table.

The target concepts are:

### 12.1 Catalog definition

- key
- name and description
- data class
- source of truth
- risk tier
- owning team/steward
- validation schema version
- supported lifecycle/actions
- runtime consumers

### 12.2 Catalog revision

- catalog key and entry key
- revision number
- immutable snapshot or typed revision relation
- base revision
- lifecycle state
- author and change summary
- validation result
- created/updated timestamps

### 12.3 Review

- revision
- reviewer
- decision
- reason/comments
- reviewed timestamp
- policy/approval tier satisfied

### 12.4 Release

- release ID and version
- included revisions
- scheduled/effective time
- publisher
- status and outcome
- previous release for rollback
- deployed/reconciled timestamp

### 12.5 Audit event

- actor and action
- catalog, entry, revision, and release identity
- safe diff
- reason
- request/trace metadata
- timestamp

Existing catalog models remain the typed runtime representation. Revision and
release storage may use snapshots where necessary, but active reads must remain
typed, indexed, and efficient.

---

## 13. API requirements

Recommended route family:

```text
GET    /api/admin/catalogs
GET    /api/admin/catalogs/:catalogKey
GET    /api/admin/catalogs/:catalogKey/entries
GET    /api/admin/catalogs/:catalogKey/entries/:entryKey
POST   /api/admin/catalogs/:catalogKey/entries
POST   /api/admin/catalogs/:catalogKey/entries/:entryKey/revisions
POST   /api/admin/catalogs/:catalogKey/revisions/:revisionId/submit
POST   /api/admin/catalogs/:catalogKey/revisions/:revisionId/review
POST   /api/admin/catalog-releases
POST   /api/admin/catalog-releases/:releaseId/publish
POST   /api/admin/catalog-releases/:releaseId/cancel
POST   /api/admin/catalog-releases/:releaseId/rollback
POST   /api/admin/catalog-imports
GET    /api/admin/catalog-imports/:jobId
GET    /api/admin/catalog-audit
GET    /api/admin/catalog-health
```

Requirements:

- Existing domain-specific APIs may remain where they provide stronger typing.
- The generic route family delegates to registered catalog adapters and must not
  accept arbitrary model/table names.
- Mutation APIs require authentication, ADMIN role, MFA, capability check,
  validation, optimistic concurrency token, and audit context.
- List APIs support bounded pagination and filters.
- Error responses use stable codes for validation, conflict, stale revision,
  approval, source ownership, reference, and publication failures.
- Idempotency keys are required for publish, rollback, and import commit actions.

---

## 14. Security and privacy requirements

- All routes are server-authorized; client guards are defense-in-depth only.
- MFA is required for catalog mutations and operational actions.
- CSRF/session protections follow the existing API authentication model.
- JSON input is size-limited and schema validated.
- Rich editorial content is sanitized before preview and publication.
- Spreadsheet/CSV formula injection is prevented on export.
- Audit diffs redact secret and privacy-restricted fields.
- Permit/API credentials are stored only in the approved secret system.
- Break-glass actions require reason, enhanced audit, and post-action review.
- The UI must not expose homeowner fact values through global catalog views.

---

## 15. Non-functional requirements

### Performance

- Catalog list p95 response: under 500 ms for normal filtered views.
- Entry detail p95 response: under 750 ms excluding external preview services.
- Publication acknowledgment: under 2 seconds for queued releases.
- Long validation/import/simulation work runs asynchronously with progress.

### Reliability

- Publication is atomic and idempotent.
- Failed publication leaves the prior active release unchanged.
- Cache invalidation failure is visible and retryable.
- Scheduled release execution is retry-safe.

### Accessibility

- Admin forms meet WCAG 2.1 AA interaction and labeling expectations.
- Status and validation are not communicated by color alone.
- Diffs, dialogs, tables, and structured editors are keyboard accessible.

### Observability

- Metrics cover drafts, review latency, publication success/failure, rollback,
  drift, validation failures, and stale catalogs.
- Logs use catalog and release identifiers but exclude protected payloads.
- Trace IDs connect API, publication worker, reconciliation, and audit events.

---

## 16. Testing strategy

### Unit tests

- Field ownership enforcement
- Stable-key immutability
- Lifecycle state machine
- Schema and semantic validators
- Self-approval and approval-count policies
- Safe audit diff/redaction
- Bootstrap ownership behavior
- Revision conflict handling

### Integration tests

- Draft → submit → approve → publish transaction
- Rejection and resubmission
- Scheduled publish and cancellation
- Failed publish preserving active version
- Rollback creating a new release
- Cache invalidation/reconciliation
- Import preview and atomic commit
- Runtime consumers reading only active data
- MFA and catalog capability enforcement

### Contract tests

- Property Context fact catalog and feature policies remain Git-owned
- Service/seasonal/habit/plant cross-catalog references validate
- Personalization activation remains allowlisted and transactional
- Knowledge revisions preserve full article aggregate
- Bootstrap never overwrites admin-owned fields

### UI tests

- Admin navigation and route protection
- Catalog filtering and pagination
- Structured editors and validation errors
- Semantic diff and impact preview
- Approval restrictions
- Publish/rollback confirmations
- Offline and stale-edit behavior
- Accessibility checks

### Archetype simulations

Use the Property Context FRD demo archetypes to verify before/after behavior for
plant, seasonal, habit, personalization, service, risk, and financial changes.

---

## 17. Implementation roadmap

### Slice 0 — Ownership and safety baseline

- Create the catalog registry and checked-in field ownership manifests.
- Classify all existing bootstrap statements.
- Change DB-owned bootstrap behavior to insert-missing-only.
- Standardize MFA across all admin mutation routes, including DIY, financing,
  and permit configuration.
- Add common catalog audit service/contract.
- Add immutable plant business key.

### Slice 1 — Catalog governance foundation

- Add catalog overview, review queue, release history, and audit history.
- Add revision/review/release concepts.
- Implement capability enforcement, optimistic concurrency, and validators.
- Add read-only deployed Git catalog visibility.

### Slice 2 — Low/medium-risk operational catalogs

- Service categories.
- Knowledge categories and tags.
- Product-tool presentation.
- Plant editorial/care fields.
- Import/export foundation.

### Slice 3 — Template catalogs

- Seasonal templates.
- Habit templates.
- DIY revision and approval retrofit.
- Archetype preview/simulation.

### Slice 4 — Editorial publication

- Knowledge immutable revisions.
- Separate workflow actions from article save.
- Preview, scheduling, unpublish, archive, and rollback.
- Personalization content-version authoring if approved.

### Slice 5 — High-risk operational configuration

- Financing-rate governed UI.
- Permit-source governed UI.
- System-component read-only deployment visibility and simulation.
- Reassess whether any system-component fields should become admin-owned only
  after two-person approval and simulation controls are proven.

### Slice 6 — Operational hardening

- Drift and reconciliation dashboard.
- Alerts and SLOs.
- Bulk-operation performance.
- Final security, privacy, accessibility, and disaster-recovery review.

---

## 18. Release and rollout requirements

- Ship catalog types incrementally; do not switch all catalogs at once.
- Before enabling ADMIN writes for a catalog, freeze or change any bootstrap
  update behavior that overlaps its fields.
- Backfill governance metadata without changing active catalog behavior.
- Run dual-read comparison where runtime read paths materially change.
- Enable publication to non-production first and verify representative outputs.
- Maintain a tested rollback path for each onboarded catalog.
- Direct production writes are disabled once the governed workflow is enabled,
  except for documented break-glass access.

---

## 19. Acceptance criteria

The recommended model is accepted when:

1. Every in-scope catalog is registered and has an explicit source of truth.
2. Every mutable field is classified and cannot be changed through the wrong
   channel.
3. Property Context contracts and high-risk rules remain Git-managed and are
   visible read-only in ADMIN.
4. Service, plant, seasonal, habit, knowledge taxonomy, product presentation,
   and DIY catalogs have governed admin workflows appropriate to their tier.
5. Knowledge content supports separate draft, review, publish, archive, revision,
   and rollback behavior.
6. All admin mutations require MFA and server-side capability enforcement.
7. T2/T3 publication prevents sole self-approval.
8. Every publication and rollback has an immutable safe audit trail.
9. Bootstrap/reconciliation tests prove that admin-owned fields are not
   overwritten.
10. Validation and impact preview block unsafe or inconsistent changes.
11. Failed publication leaves the previous active release intact.
12. Runtime services consume only active/effective catalog revisions.
13. No Prisma migration script is created as part of implementation.

---

## 20. Decisions and open questions

### Decisions made by this FRD

- The target is hybrid Git/admin/editorial governance, not a generic admin CRUD
  system.
- Property Context fact identity and canonical ownership remain code/Git-owned.
- Personalization rule AST and answer schemas remain code/Git-owned.
- Published catalog revisions are immutable.
- Direct production SQL is not a normal management workflow.
- Bootstrap ownership semantics must change before UI ownership begins.
- Existing ADMIN shell, guard, MFA, and idle controls are reused.
- Catalog permissions are capabilities within ADMIN, not public user roles.
- Schema changes are allowed when required, but implementation must not create
  database migration scripts.

### Open product/engineering questions

1. Who will act as author, reviewer, and publisher during the initial
   single/small-admin phase?
2. Should approval capabilities be persisted in the database or configured in
   deployment settings initially?
3. Which plant safety evidence sources are approved, and must their citations be
   visible to homeowners?
4. Is scheduled publication required in the first Knowledge workflow slice or
   may it follow immutable revisions and manual publishing?
5. Should personalization content be authored in ADMIN or remain entirely
   bootstrap/Git-authored during the next release?
6. What retention period is required for catalog revisions, releases, imports,
   and audit history?
7. Which T3 changes require two approvers versus one independent approver plus a
   Git review?
8. Which non-production environment is the required publication preview target?

---

## 21. Definition of done

For each onboarded catalog:

- ownership manifest is complete;
- source of truth is enforced;
- stable keys and reference behavior are documented and tested;
- schema and semantic validation are implemented;
- admin list/detail/editor/preview experience is complete where applicable;
- revision, review, publication, rollback, and audit policies match risk tier;
- MFA and server-side capabilities are enforced;
- bootstrap and import behavior preserve admin-owned data;
- runtime consumer tests cover active/effective reads;
- operational dashboards expose release and reconciliation health;
- accessibility and security checks pass;
- no migration script has been created.

---

*This FRD is based on a repository review performed on 2026-07-17. It defines
the target governance and product requirements; it does not implement the
catalog-management functionality.*
