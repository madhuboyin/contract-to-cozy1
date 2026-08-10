# Property Page Best-in-Class Enhancement Plan

**Product:** ContractToCozy

**Surface:** Property page / Home Record

**Status:** Implemented in application code; progressive rollout and field validation remain operational follow-ups

**Document date:** August 10, 2026

**Primary route:** `/dashboard/properties/[id]`

## 1. Executive summary

The Property page should become the authoritative, structured record for one
home. It should answer:

> What do we know about this property, how complete and trustworthy is that
> information, and where can I inspect or manage each part of it?

The page must not behave like a second Home page. Home is the dynamic command
center that ranks what needs attention, what changed, and what the homeowner
should do next. Property is the stable, detailed, navigable source of truth for
the physical home, its spaces, systems, documents, people, and history.

The target Property experience has two complementary themes:

1. **Core theme — Living Property Record.** Structured property information,
   record completeness, provenance, and clear editing paths.
2. **Secondary theme — Property-connected capabilities.** Tools and workspaces
   that materially depend on, enrich, or create durable outputs for this
   property. Examples include Home Continuity Plan (currently backed by the
   Home Digital Will capability), Home Capital Timeline, Plant Advisor,
   Property Brief, Status Board, and Home Timeline.

The secondary layer is not an advertisement rail. A tool qualifies only when it
is property-scoped and has a meaningful relationship to the living property
record. Its card must show property-specific state, not generic marketing copy.

## 2. Product decision and page contracts

### 2.1 Canonical page themes

| Surface | Canonical theme | Primary homeowner question | Owns |
| --- | --- | --- | --- |
| Home | Daily Home Command Center | What should I know or do now? | Attention, changes, prioritized actions, decisions, active moments, planning horizon |
| Property | Living Property Record | What do we know about this property? | Facts, spaces, systems, inventory, household, documents, provenance, completeness, record history |
| Maintenance | Work execution | What work is due, active, or complete? | Maintenance tasks, schedules, completion, evidence |
| Projects | Project delivery | What property projects am I planning or executing? | Scope, milestones, providers, costs, progress, closeout |
| Tools | Specialized property analysis | Which focused analysis or artifact do I need? | Capability-specific inputs, calculations, decisions, plans, and artifacts |

### 2.2 Non-duplication contract

The same underlying data may support multiple pages, but it must not be shown
with the same purpose, hierarchy, or detail.

| Information | Home presentation | Property presentation |
| --- | --- | --- |
| Open work | Ranked action or aggregate count | Link to the owning workspace; no duplicate action feed |
| Missing property data | One contextual nudge when it blocks useful guidance | Exact missing/inferred fields grouped by record category |
| Weather or risk signal | Timely attention item | Stored property attributes and exposure history only; no daily alert card |
| Recent changes | Material change or decision impact | Record audit history: what field/document changed, when, and by whom/source |
| System condition | Outcome-oriented summary when relevant today | Canonical system record with condition, age, source, and edit path |
| Record completeness | Small status pointer | Full category-level completeness and correction workflow |
| Tool opportunity | Recommended next move when timely | Stable related-tool entry showing property-specific readiness or saved state |

Rules:

- Home owns urgency and prioritization.
- Property owns facts and record quality.
- A Home card may link into an exact Property category or field.
- A Property module may link to Home Actions, Maintenance, or another workspace,
  but must not reproduce those queues.
- Identity context such as address and property name may appear on both pages.
  Repeating identity is orientation, not content duplication.

## 3. Current-state assessment

### 3.1 Strengths to preserve

- Property-scoped routing and property selection already exist.
- The page has useful canonical destinations for rooms, timeline, reports,
  claims, household, editing, maintenance, incidents, and protection.
- Home Record readiness already distinguishes facts that need review.
- The capability registry already identifies property-scoped tools, routes,
  context requirements, release stages, and expected outputs.
- The visual language is calm and approachable, with an established teal brand
  color and accessible card primitives.

### 3.2 Problems to correct

#### Page purpose is unclear

The page is labeled **Property Hub**, the sidebar selects **Home Record**, the
hero may use a generic property name such as **Rental**, and the content behaves
like a dashboard. These cues describe different products.

#### Home content is repeated

The current Property page includes:

- Next Best Action;
- Meaningful changes;
- Environment Report alerts;
- Mortgage Refinance Radar state;
- Plant Advisor recommendations;
- recommendation-first Smart Context Tools; and
- a seller-preparation promotion.

These modules compete with Home's command-center purpose and hide the property
record itself.

#### The layout creates artificial empty space

Property Snapshot, Home Record readiness, Environment Report, refinance, and
Plant Advisor are placed in one equal-row CSS grid. Grid items stretch to the
height of the tallest card in a row. A short snapshot therefore becomes very
tall when Home Record has many review items.

#### Setup is overrepresented

Setup appears in the property header and again as a large checklist. The page
shows workflow chrome instead of the resulting record structure. Setup should
be expressed as record completeness, with the exact next missing category or
field available on demand.

#### Navigation reflects implementation structure

Primary tabs, a separate More Sections surface, contextual tool rows, hero
buttons, and floating Ask Cozy actions compete for attention. Homeowners must
understand internal feature boundaries before they can find information.

#### Tool cards are inconsistent

Some tools render as dashboard cards, some as recommendation rows, some as
secondary navigation, and some as promotional banners. The page lacks one
governed definition of a related property tool.

## 4. Target audience and user jobs

### 4.1 Primary users

- Homeowners maintaining a long-lived record of their home
- Household members who need reliable property information
- Owners preparing a repair, renovation, refinance, claim, or sale
- Owners validating information imported from documents or external sources
- Owners assembling a trusted handoff or shareable property package

### 4.2 Primary jobs to be done

1. Look up a property fact quickly.
2. Understand what ContractToCozy knows and does not know.
3. Add, correct, verify, or remove property information.
4. Inspect rooms, systems, appliances, household, and documents.
5. Understand the source and freshness of important facts.
6. See how complete the record is by category.
7. Navigate to property-connected planning, continuity, and lifestyle tools.
8. Generate or share an appropriate property record or brief.

### 4.3 Secondary jobs

- Review current system status.
- Understand likely replacement timing.
- Maintain room-specific plant context.
- Prepare critical home knowledge for trusted recipients.
- Review property history and major milestones.

### 4.4 Non-goals

The Property overview is not the canonical place to:

- rank daily actions;
- show an alert feed;
- recommend generic tools;
- promote a sale, refinance, or project without established property context;
- execute maintenance tasks;
- manage project milestones;
- duplicate Home Briefing; or
- provide an exhaustive catalog of every available tool.

## 5. Experience principles

### 5.1 Record first

Property facts and record structure appear before related tools, promotions, or
workflow links.

### 5.2 Detail on demand

The overview is concise, but every summary provides a direct route to complete
details. Missing data, provenance, and validation information expand or open in
the owning section rather than filling the overview.

### 5.3 One source, one owner

Each fact, task, alert, tool output, and document has one canonical owner. Other
surfaces link to that owner rather than recreating its UI.

### 5.4 Property-specific secondary content

Related tools show saved state or readiness for the selected property. Generic
descriptions and recommendation rationales belong in the tool catalog, not on
the Property overview.

### 5.5 Calm density

Best in class does not mean sparse. The target is compact, legible information
density with clear grouping, consistent alignment, and restrained use of
cards.

### 5.6 Trust is visible

Important facts can expose:

- Verified
- Homeowner confirmed
- Reported
- Inferred
- Unknown
- Conflicted
- Last updated
- Source or evidence

Trust labels must describe field state and must not imply that an entire card
is verified because one field is verified.

## 6. Target information architecture

### 6.1 Page title and naming

Recommended product name: **Property Record**.

Recommended header hierarchy:

1. Eyebrow: `Property Record`
2. H1: property name when meaningful; otherwise street address
3. Context line: full address
4. Compact metadata: property type, year, size, ownership/occupancy
5. Record status: completeness percentage and last updated

Avoid using generic values such as `Main`, `Primary`, `Rental`, `Home`, or
`Primary Home` as the primary H1 when the address is the stronger identifier.
The deployed implementation treats those values as labels rather than
meaningful property names and promotes the street address to H1.

### 6.2 Primary navigation

Recommended tabs:

1. **Overview** — identity, category summaries, completeness, and recent record updates
2. **Details** — structure, lot, construction, utilities, ownership, and address facts
3. **Systems & Inventory** — major systems, equipment, appliances, materials, warranties
4. **Rooms & Household** — rooms, room attributes, occupants, access and roles
5. **Documents** — deeds, inspections, receipts, warranties, policies, evidence
6. **History** — record changes, confirmed home events, and provenance timeline

On small screens, use a section selector or bottom sheet with the same six
destinations and descriptions. Do not present a second set of unrelated primary
tabs.

### 6.3 Related workspaces navigation

Maintenance, Projects, Protection, Claims, Reports, and Home Actions are
property-related workspaces, not record categories. Present them in one compact
**Related workspaces** menu or rail.

Each entry includes:

- destination name;
- one-line purpose;
- optional aggregate status, such as `3 open tasks`; and
- a direct, property-preserving route.

It must not reproduce individual tasks, incidents, claims, or actions.

## 7. Target overview specification

### 7.1 Desktop composition

Use a two-column responsive composition rather than an equal-height card grid:

- Main column: the fluid remainder of the record canvas
- Supporting rail: approximately 340 px at compact desktop and 380 px at wide desktop
- Independent vertical stacks so one tall card does not stretch adjacent cards
- Maximum Property Record canvas width: 1,520 px inside the shared dashboard
  shell. Other dashboard routes retain their narrower reading width.
- One shell-level horizontal padding treatment; the Property page must not add
  a second nested container that recreates large gutters.

Recommended reading order:

1. Property Record header
2. Primary section navigation
3. Record overview
4. Record completeness
5. Spaces and systems summaries
6. Documents and history summaries
7. Related property tools
8. Related workspaces

### 7.2 Mobile composition

1. Compact property identity header
2. Primary CTA and overflow menu
3. Section selector
4. Record completeness
5. Property profile
6. Systems & Inventory
7. Rooms & Household
8. Documents
9. Related property tools
10. Related workspaces

Do not use a persistent property-page Ask Cozy bar if the global command bar or
Home page already provides that capability.

### 7.3 Header actions

Record-quality CTA hierarchy:

- **Primary:** the most specific next record improvement, such as `Add layout`,
  `Add year built`, `Add first system`, or `Upload first document`
- **Secondary:** `Edit property`
- **Utility menu:** Generate report, share Property Brief, archive/remove
  property when authorized

Contextual CTAs appear inside their owning sections:

- `Add system`
- `Add room`
- `Upload document`
- `Review missing details`
- `View source`

The primary CTA may change with record quality, but must never become a Home
attention item or today's generalized Next Best Action. When no obvious gap
exists, use `Add to record`. Only explicitly curated, directly actionable gaps
may replace this fallback; internal Property Context facts must not generate
header labels automatically.

### 7.4 Record overview modules

#### A. Property profile

Show the most frequently referenced facts:

- property type;
- year built;
- living area;
- bedrooms and bathrooms;
- lot size where applicable;
- ownership or occupancy type; and
- last profile update.

The card has one `Edit details` action. Household management must not be mixed
into this card's header.

#### B. Record completeness

Show category-level completeness rather than a flat setup checklist:

| Category | Example state | Destination |
| --- | --- | --- |
| Property details | 90% complete | Details |
| Systems & inventory | 65% complete | Systems & Inventory |
| Rooms & household | 80% complete | Rooms & Household |
| Documents | 40% complete | Documents |

The header percentage is the equal-weight average of these four visible
categories. It must reconcile with the values presented in the rail rather
than using a separate setup score. Documents are complete according to
property linkage and verification coverage. A property with no documents is
`0%` and presents `Upload first document`; it must not display a green
no-missing-data message.

Display one next record-improvement opportunity, selected by relevance and data
dependency, such as `Add roof installation year`. This is a data-quality CTA,
not a generalized Next Best Action.

#### C. Systems & inventory summary

Show:

- systems tracked;
- systems with verified details;
- systems missing essential facts;
- warranties or documents linked; and
- direct access to the systems list.

Do not show a maintenance queue or replacement recommendation here. Capital
Timeline and Maintenance own those outcomes.

#### D. Rooms & household summary

Show:

- room count and room names;
- inventory coverage by room;
- household member count and roles, subject to permissions; and
- quick routes to rooms and household management.

Room-specific capabilities such as Plant Advisor may be linked contextually from
this module and again in the consolidated Related Property Tools section.

#### E. Documents summary

Show:

- total documents;
- documents grouped by type;
- unlinked or unreviewed documents;
- newest document; and
- `Upload document` and `View documents` actions.

#### F. Recent record updates

Show only durable changes to the record, for example:

- roof installation year confirmed;
- inspection report linked;
- HVAC warranty added;
- household access changed; or
- property profile edited.

Do not show weather, alerts, recommendations, or general Home Briefing items.

## 8. Related Property Tools framework

### 8.1 Purpose

The Related Property Tools section helps homeowners move from authoritative
property context into capabilities that use or enrich that context.

It should answer:

> What can I do with this property's record?

### 8.2 Qualification rules

A capability is eligible only when all required rules are satisfied:

1. It has a property-scoped route or an explicit property-aware launch route.
2. It reads from or writes to the living property record, a property room, a
   tracked system, inventory, documents, household, or property history.
3. Its value materially changes based on the selected property.
4. It has an ACTIVE or otherwise explicitly approved release stage.
5. It does not duplicate a core Property section.
6. The user is authorized to know that the capability or its saved state exists.
7. Its card can show a meaningful property-specific state or an honest setup
   state.

A tool is not eligible merely because it accepts `propertyId`.

### 8.3 Core related tools

The initial curated set should include:

#### Home Capital Timeline

**Relationship to Property:** Converts tracked systems, installation dates,
condition, lifespan assumptions, and completed replacements into a long-range
capital plan.

**Property card state:**

- number of systems included;
- next modeled capital window;
- timeline freshness; and
- setup state if no systems are tracked.

**CTA:** `Open Capital Timeline` or `Add systems to start`.

Do not show a precise cost or replacement conclusion without the tool's own
confidence and financial-governance treatment.

#### Home Continuity Plan

The current capability ID and route may remain `home-digital-will`, while the
homeowner-facing label should follow the registry's clearer name, **Home
Continuity Plan**.

**Relationship to Property:** Organizes critical home knowledge, emergency
instructions, trusted contacts, utilities, providers, and selected records for
continuity and handoff.

**Property card state:**

- not started, in progress, or ready;
- completion percentage;
- last reviewed date; and
- trusted-recipient readiness at an aggregate level.

**CTA:** `Set up Continuity Plan` or `Review plan`.

The Property overview must not expose sensitive entries, recipient names, access
details, or emergency instructions.

#### Plant Advisor

**Relationship to Property:** Uses room records, light context, care
preferences, household constraints, and saved plants to produce room-specific
recommendations and care guidance.

**Property card state:**

- rooms configured for plants;
- saved plant count;
- room requiring profile setup; or
- optional setup state when no plant context exists.

**CTA:** `Open Plant Advisor` or `Set up a room`.

Plant Advisor should also have a contextual entry from Rooms & Household. It
must not show weather-triggered recommendations on the Property overview.

#### Property Brief

**Relationship to Property:** Produces a governed, shareable summary from
selected verified records.

**Property card state:**

- brief not created;
- last generated date;
- records included; and
- review-needed state when source facts have changed.

**CTA:** `Create Property Brief` or `Review brief`.

#### Home Timeline

**Relationship to Property:** Presents confirmed property events and durable
history derived from the record and completed work.

**Property card state:**

- confirmed event count;
- latest confirmed event; and
- last updated date.

**CTA:** `Open Home Timeline`.

#### Status Board

**Relationship to Property:** Provides the canonical current condition,
readiness, and evidence view for tracked systems.

**Property card state:**

- systems represented;
- data freshness; and
- whether more system context is required.

**CTA:** `Open Status Board`.

### 8.4 Optional related tools

Other tools may qualify when they have strong record affinity and a useful
property-specific state:

- Reserve Fund Planner
- Inspection Hub
- Permit Tracker
- Material Specs
- Renovations
- Project Tracker
- Property Tax
- Ownership Costs
- Coverage Intelligence
- Home Habit Coach

Mortgage Refinance Radar, seller preparation, and similar decision tools should
not be permanently promoted on the Property overview. They may appear in All
Property Tools, a related workspace, or Home when their context becomes timely.

### 8.5 Tool grouping

Use homeowner-oriented groups, not internal outcome categories:

- **Plan for the property:** Capital Timeline, Reserve Fund Planner
- **Preserve knowledge:** Home Continuity Plan, Property Brief, Home Timeline
- **Use spaces better:** Plant Advisor, Material Specs
- **Understand current state:** Status Board, Inspection Hub

The overview should show no more than four tools by default. Provide `View all
property tools` for the complete eligible set.

### 8.6 Ranking and selection

Recommended deterministic order:

1. Tool with existing saved property state
2. Tool linked to the category currently being viewed
3. Tool whose minimum context requirements are satisfied
4. Tool that can create a durable property artifact or improve the record
5. Curated fallback order

Do not reuse the Home recommendation score as the sole ordering mechanism.
Property ordering should favor record affinity and continuity, not urgency.

### 8.7 Card anatomy

Every related-tool card contains:

- icon;
- homeowner-facing tool name;
- one sentence describing its relationship to this property;
- property-specific state;
- one CTA; and
- optional last-updated or readiness metadata.

Avoid:

- `Recommended` badges on every card;
- permanent `Why now` and `Value` paragraphs;
- multiple CTAs;
- unrelated alerts;
- generic marketing descriptions; and
- displaying sensitive tool content.

## 9. Visual design specification

### 9.1 Hierarchy

- One dominant page title
- One primary CTA in the header
- Section headings at consistent levels
- Stronger typography for values than labels
- Status communicated with text, not color alone
- Limited accent color use for links, focus, progress, and verified state

### 9.2 Density

- Desktop card padding: approximately 16–20 px
- Section gaps: approximately 16–24 px
- Related rows: approximately 44–56 px minimum height
- Avoid cards nested more than one level deep
- Use dividers and aligned rows where a new card would add visual noise
- Do not force neighboring cards to equal height

### 9.3 Card usage

Use cards for coherent objects or categories, not every individual value. A
single Property Profile card can contain aligned label/value rows. Systems,
rooms, and documents can use compact summary cards with direct navigation.

### 9.4 Color and status

- Teal: navigation, primary actions, verified/healthy emphasis
- Amber: missing, inferred, stale, or review-needed information
- Red: conflicts or destructive consequences only
- Blue/neutral: informational state
- Green must not imply verification unless the underlying fact is verified

### 9.5 Empty states

Empty states must explain:

1. what has not been added;
2. why adding it is useful; and
3. the exact next action.

Example:

> No major systems are recorded yet. Add your roof, HVAC, or water heater to
> build lifecycle and warranty history.

CTA: `Add first system`

Avoid generic empty cards such as `No recommendations` or large blank panels.

## 10. Content design

### 10.1 Recommended terminology

| Current or ambiguous | Recommended |
| --- | --- |
| Property Hub | Property Record |
| Complete setup | Complete your property record |
| Setup in progress | 80% record complete |
| Documents & Edit | Documents / Edit property as separate actions |
| Add to record | A specific record-quality action such as `Add layout` or `Upload first document` |
| Digital Will | Home Continuity Plan, while preserving capability ID and route |
| Open | Action-specific labels such as `Review plan` or `View timeline` |
| More Sections | Related workspaces or More |

### 10.2 Copy rules

- Use factual, property-specific labels.
- Prefer nouns for navigation and verbs for CTAs.
- Describe unknown and inferred values honestly.
- Do not use urgency language on the Property overview unless it describes a
  data conflict that blocks record reliability.
- Do not promise personalized recommendations when required context is absent.

## 11. Navigation behavior

### 11.1 Property preservation

Every related route must preserve the selected property ID. Returning from a
tool or workspace should restore the Property page and, where practical, the
originating section.

Recommended query contract:

```text
?backTo=/dashboard/properties/[id]?section=systems
```

Use existing safe return-route helpers rather than accepting arbitrary URLs.

### 11.2 Breadcrumbs and Back behavior

Preferred breadcrumb:

```text
Home Record / 324 Hemley Trl / Systems & Inventory
```

Do not show a generic `Back` button above the Property header when the global
breadcrumb already provides a predictable destination. Tool pages may use
`Back to Property Record` when launched from this page.

### 11.3 Deep links

Support stable section and entity links:

```text
/dashboard/properties/[id]?section=documents
/dashboard/properties/[id]?section=systems&systemId=[systemId]
/dashboard/properties/[id]?section=rooms&roomId=[roomId]
```

The exact URL structure may use route segments instead of query parameters, but
it must be shareable, restorable, and analytics-friendly.

## 12. Accessibility requirements

- One H1 identifying the property
- Semantic `nav`, `main`, `section`, and heading hierarchy
- Tabs implement the WAI-ARIA tabs pattern or use navigational links when they
  change routes
- All actions keyboard accessible with visible focus
- Minimum 44 px touch targets on mobile
- Tool status announced with text, not only badges or color
- Expandable provenance and missing-field details expose correct expanded state
- Loading states use appropriate busy/live semantics without repeated
  announcements
- Skeletons match final geometry to reduce layout shift
- Reduced-motion support for transitions and scrolling
- Sensitive Continuity Plan state is permission-filtered before rendering

## 13. Performance and reliability targets

Target budgets for the Property overview:

- LCP at or below 2.5 seconds at p75 on supported mobile conditions
- CLS below 0.1
- INP below 200 ms at p75
- Core record content renders independently of optional tool-status failures
- Related tools load after core property information or from the same composed
  bootstrap without blocking first meaningful content
- Failure of one tool status adapter does not fail the Related Property Tools
  section
- No waterfall of one request per tool when a composed summary endpoint can
  provide the required aggregate states

## 14. Technical design

### 14.1 Frontend component structure

Proposed components:

```text
PropertyRecordPage
├── PropertyRecordHeader
├── PropertyRecordNavigation
├── PropertyRecordOverview
│   ├── PropertyProfileSummary
│   ├── RecordCompletenessSummary
│   ├── SystemsInventorySummary
│   ├── RoomsHouseholdSummary
│   ├── DocumentsSummary
│   └── RecentRecordUpdates
├── RelatedPropertyTools
│   └── RelatedPropertyToolCard
└── RelatedPropertyWorkspaces
```

Suggested location:

```text
apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/components/
```

### 14.2 Current components to remove or relocate

| Current component/module | Target disposition |
| --- | --- |
| `MeaningfulChangeHomeCard` | Remove from Property; retain Home/Home Briefing ownership |
| Hero `Next Best Action` | Remove from Property |
| `SetupChecklistPanel` | Replace with record completeness summary |
| `EnvironmentReportDashboardCard` | Remove from Property overview; access through Home or property tools |
| `RefinanceRadarDashboardCard` | Remove from Property overview |
| `PlantAdvisorDashboardCard` | Replace with governed Related Property Tool card and room-context link |
| `SmartContextToolsSection` | Replace with `RelatedPropertyTools` |
| `SellingPrepBanner` | Remove from Property overview; use Home or Related Workspaces when applicable |
| Duplicate Property-page Ask Cozy actions | Remove; keep one global entry point |
| `PropertyHubTemplate` | Refactor or replace with `PropertyRecordTemplate` |

### 14.3 Data contract

Create or compose a Property overview DTO that contains only record-owned data
and aggregate related-tool state.

Illustrative shape:

```ts
interface PropertyRecordOverviewDTO {
  property: {
    id: string;
    name: string | null;
    address: string;
    dwellingType: string | null;
    yearBuilt: number | null;
    propertySize: number | null;
    bedrooms: number | null;
    bathrooms: number | null;
    updatedAt: string;
  };
  completeness: {
    percent: number;
    categories: Array<{
      key: string;
      label: string;
      percent: number;
      missingEssentialCount: number;
      conflictedCount: number;
      href: string;
    }>;
    nextImprovement: {
      label: string;
      benefit: string;
      href: string;
    } | null;
  };
  systems: PropertySectionSummaryDTO;
  rooms: PropertySectionSummaryDTO;
  household: PropertySectionSummaryDTO;
  documents: PropertySectionSummaryDTO;
  recentRecordUpdates: PropertyRecordUpdateDTO[];
  relatedTools: RelatedPropertyToolDTO[];
  relatedWorkspaces: PropertyWorkspaceLinkDTO[];
}
```

The DTO must not include the Home attention queue merely for convenience.

### 14.4 Related-tool derivation

Use the canonical capability registry as the source for:

- capability ID;
- homeowner-facing label;
- property-scoped route;
- release stage;
- context mode;
- living Home Record reads and writes;
- safety tier; and
- expected output.

Add a Property-surface presentation policy that defines:

- eligibility;
- curated group;
- fallback order;
- permitted status adapter;
- sensitive-state restrictions; and
- empty/setup-state copy.

Do not create a second hard-coded tool catalog inside the Property page.

Illustrative policy:

```ts
interface PropertyToolPresentationPolicy {
  capabilityId: string;
  group: 'PLAN' | 'PRESERVE' | 'SPACES' | 'UNDERSTAND';
  overviewEligible: boolean;
  maxSensitivity: 'PUBLIC_STATE' | 'AGGREGATE_PRIVATE_STATE';
  contextualSections: Array<'OVERVIEW' | 'SYSTEMS' | 'ROOMS' | 'DOCUMENTS' | 'HISTORY'>;
  fallbackRank: number;
}
```

### 14.5 Tool-state adapters

Each eligible tool may provide a small aggregate status adapter. Examples:

- Capital Timeline: tracked systems and next modeled window
- Home Continuity Plan: completion and last-reviewed date
- Plant Advisor: configured rooms and saved plant count
- Property Brief: last-generated date and stale/current state
- Home Timeline: confirmed event count and latest event
- Status Board: represented system count and freshness

Adapters must return safe display state and a canonical destination. They must
not copy the entire tool result into the Property response.

### 14.6 Caching and failure isolation

- Cache core property record data independently from optional related-tool state.
- Use a short, explicit stale time for tool aggregates where freshness matters.
- Render unavailable tool state as `Status unavailable` without removing the
  canonical tool link.
- Log adapter failures with capability ID and property ID, without sensitive
  content.

## 15. Analytics and success measures

### 15.1 Events

Recommended events:

```text
property_record_viewed
property_record_section_opened
property_record_edit_started
property_record_item_added
property_record_missing_detail_opened
property_record_source_viewed
property_related_tool_impression
property_related_tool_opened
property_related_workspace_opened
property_record_report_generated
```

Important dimensions:

- property ID;
- section;
- capability ID;
- tool group;
- tool state;
- origin section;
- record completeness band;
- viewport category; and
- registry version.

Do not include sensitive Continuity Plan entry content, household contact data,
document names, or raw property facts in analytics payloads.

### 15.2 Success metrics

Primary:

- Time to locate a known property fact
- Property-section navigation success rate
- Record correction/addition completion rate
- Related-tool open rate from relevant property context
- Percentage of Property visits resulting in a meaningful record interaction
- Reduction in exits caused by unclear navigation

Secondary:

- Increase in verified essential property facts
- Increase in linked documents and tracked systems
- Return rate to the Property Record
- Tool setup completion after a property-context launch
- Reduction in Home/Property duplicate impressions

Guardrails:

- No increase in accidental edits
- No sensitive-state exposure
- No reduction in Home attention-item engagement caused by competing Property UI
- No material regression in Property page performance or accessibility

## 16. Implementation plan

### Phase 0 — Contract and baseline

**Objective:** Establish ownership and measure the current experience before UI
changes.

Tasks:

1. Approve the Home vs Property content ownership matrix.
2. Inventory every module currently rendered on Home and Property.
3. Map each module to one canonical owner and destination.
4. Capture baseline page performance, navigation, engagement, and completion.
5. Define the Property overview DTO and related-tool presentation policy.
6. Confirm homeowner-facing naming: Property Record and Home Continuity Plan.

Exit criteria:

- No unresolved module has two canonical owners.
- Data contract and analytics schema are reviewed.
- Baseline metrics are recorded.

### Phase 1 — Property shell and navigation

**Objective:** Make the page purpose unmistakable before changing deeper data.

Tasks:

1. Introduce `PropertyRecordTemplate` or refactor `PropertyHubTemplate`.
2. Replace the hero with the Property Record header.
3. Make address/property name the primary identifier.
4. Implement the six-section navigation model.
5. Consolidate secondary destinations into Related Workspaces.
6. Remove the generic Back button when breadcrumbs cover the route.
7. Preserve property and return context across routes.

Exit criteria:

- Desktop and mobile navigation reach every canonical destination.
- Page H1 and breadcrumb identify the selected property.
- No Next Best Action appears in the Property header.

### Phase 2 — Core record overview

**Objective:** Replace dashboard cards with structured property information.

Tasks:

1. Build Property Profile summary.
2. Build category-level Record Completeness.
3. Build Systems & Inventory summary.
4. Build Rooms & Household summary.
5. Build Documents summary.
6. Add Recent Record Updates using record events only.
7. Replace the equal-height grid with independent responsive stacks.
8. Add field-state and provenance patterns.

Exit criteria:

- Every overview module owns property-record information.
- Short cards do not stretch to match tall cards.
- Missing and conflicted facts navigate to an exact correction destination.

### Phase 3 — Related Property Tools

**Objective:** Add a coherent, governed secondary tools layer.

Tasks:

1. Implement the Property-surface capability presentation policy.
2. Build aggregate status adapters for Capital Timeline, Home Continuity Plan,
   Plant Advisor, Property Brief, Home Timeline, and Status Board.
3. Build `RelatedPropertyTools` and `RelatedPropertyToolCard`.
4. Add contextual entry points from Systems, Rooms, Documents, and History.
5. Add `View all property tools` using the same registry-derived eligible set.
6. Add sensitive-state filtering for Continuity Plan.
7. Instrument impressions and opens with registry version and origin section.

Exit criteria:

- No second hard-coded tool catalog exists.
- Every displayed tool passes the eligibility rules.
- Cards show property-specific state or an honest setup state.
- A failure in one tool adapter does not fail core Property content.

### Phase 4 — Remove duplication and coordinate Home

**Objective:** Enforce distinct Home and Property themes.

Tasks:

1. Remove Meaningful Changes from Property.
2. Remove Environment Report, Refinance Radar, and legacy Plant Advisor
   dashboard cards from Property.
3. Remove Smart Context Tools from Property.
4. Remove the seller-preparation promotional banner from Property.
5. Replace Setup Checklist with Record Completeness.
6. Remove duplicate Ask Cozy actions.
7. Review Home's `Home at a glance` module so it remains an aggregate pointer,
   not a duplicate property record.
8. Add deep links from Home record-completeness nudges to exact Property
   categories.

Exit criteria:

- Home owns attention, change, recommendation, and decision feeds.
- Property owns detailed record information.
- Automated checks confirm retired Property modules are not rendered.

### Phase 5 — Quality hardening

**Objective:** Make the experience best in class across interaction quality,
accessibility, performance, and states.

Tasks:

1. Complete responsive behavior at supported breakpoints.
2. Add loading, partial-error, empty, unauthorized, and stale-data states.
3. Complete keyboard and screen-reader testing.
4. Add visual-regression coverage for sparse and dense records.
5. Verify long addresses, missing names, multiple properties, and localization.
6. Verify performance budgets and request composition.
7. Validate sensitive-data filtering.
8. Conduct moderated usability testing for fact lookup, record correction, and
   related-tool discovery.

Exit criteria:

- Accessibility checks pass with no critical or serious issues.
- Performance budgets are met or documented exceptions are approved.
- Users can complete the critical tasks without entering Home first.

### Phase 6 — Rollout and optimization

**Objective:** Release safely and refine using evidence.

Tasks:

1. Release behind a dedicated feature flag.
2. Enable internal and test accounts.
3. Compare sparse, medium, and mature property records.
4. Roll out progressively while monitoring errors and guardrails.
5. Review navigation and tool engagement after sufficient exposure.
6. Tune tool fallback order without changing canonical ownership.
7. Remove legacy components after the rollback window.

Exit criteria:

- Target cohort metrics meet agreed thresholds.
- No privacy, navigation, or data-authority regression is observed.
- Legacy Property-dashboard modules are removed or explicitly retained only for
  other canonical surfaces.

### 16.1 Likely code touchpoints

The final file list should be confirmed during Phase 0, but the current
implementation indicates these primary touchpoints:

| Area | Current location | Expected work |
| --- | --- | --- |
| Property page composition | `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/page.tsx` | Replace dashboard composition, tabs, duplicated cards, and promotions with the record-first overview |
| Property shell | `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/components/PropertyHubTemplate.tsx` | Refactor or replace with `PropertyRecordTemplate` |
| Setup presentation | `apps/frontend/src/components/onboarding/SetupChecklistPanel.tsx` | Remove from Property overview; reuse onboarding only on its canonical flow |
| Readiness | `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/components/HomeRecordReadinessCard.tsx` | Convert detailed flat issue list into category-level overview and exact drill-down |
| Current recommendation rail | `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/components/SmartContextToolsSection.tsx` | Retire on Property and replace with registry-governed related tools |
| Legacy property cards | `MeaningfulChangeHomeCard.tsx`, `EnvironmentReportDashboardCard.tsx`, `RefinanceRadarDashboardCard.tsx`, `PlantAdvisorDashboardCard.tsx` | Remove from Property composition; preserve only on canonical owners where still required |
| Home ownership boundary | `apps/frontend/src/components/home/UnifiedHomeSurface.tsx` | Keep attention and decisions on Home; make Home-at-a-glance an aggregate pointer |
| Frontend tool catalog | `apps/frontend/src/features/tools/toolDiscoveryRegistry.ts` | Reuse canonical metadata and requirements; add Property presentation policy separately |
| Backend capability registry | `apps/backend/src/productFramework/capabilities/definitions/` | Source capability route, stage, context, record reads/writes, safety, and output metadata |
| Property bootstrap/API client | `apps/frontend/src/lib/api/client.ts` and the owning backend property routes/services | Add or compose the Property Record overview DTO and related-tool aggregate states |
| Navigation | `apps/frontend/src/lib/navigation/` and `apps/frontend/src/components/navigation/` | Add safe section-aware return routes and Property breadcrumbs |
| Analytics | `apps/frontend/src/lib/analytics/events.ts` | Add Property Record and related-tool events with privacy-safe payloads |

### 16.2 Dependencies

| Dependency | Needed for | Resolution |
| --- | --- | --- |
| Home vs Property ownership approval | Removal of duplicate modules | Product/design sign-off in Phase 0 |
| Canonical record category model | Completeness and navigation | Align frontend categories with backend record/inventory/document owners |
| Capability registry metadata | Related Property Tools | Reuse registry; add only Property-surface presentation policy |
| Aggregate status access | Property-specific tool cards | Implement safe adapters or a composed summary response |
| Safe return-route contract | Seamless tool navigation | Extend existing `backTo`/property-aware navigation helpers |
| Continuity Plan authorization | Safe aggregate state | Enforce permission before serialization and rendering |
| Record event source | Recent record updates | Filter canonical record/history events; exclude Home attention signals |

### 16.3 Indicative delivery sequence

This is a relative engineering sequence, not a calendar commitment. It assumes
one cross-functional product squad and allows backend/API work to run in
parallel with frontend shell work.

| Delivery slice | Primary outcome | Depends on |
| --- | --- | --- |
| Slice 1 | Approved page contract, module inventory, baseline analytics | None |
| Slice 2 | Property Record header, navigation, responsive shell | Slice 1 |
| Slice 3 | Core profile, completeness, systems, rooms, and documents summaries | Slices 1–2 |
| Slice 4 | Related Property Tools policy, adapters, cards, and contextual links | Slices 1–3; registry and authorization |
| Slice 5 | Duplicate-module removal and Home coordination | Slices 2–4 |
| Slice 6 | Accessibility, performance, E2E, visual regression, and flagged rollout | Slices 2–5 |

Parallelization opportunities:

- Core Property DTO and frontend shell can be developed in parallel after the
  contract is approved.
- Tool-state adapters can be implemented independently by capability, provided
  they share one DTO and error contract.
- Accessibility fixtures and visual-regression scenarios can begin with the
  shell and expand as modules land.
- Home cleanup should merge only after replacement Property navigation is
  available, avoiding dead ends.

### 16.4 Implementation reconciliation (August 10, 2026)

The repository implementation now covers all engineering-owned scope in this
plan. Operational validation remains a release gate and is intentionally not
represented as completed without production or moderated-user evidence.

| Planned capability | Implemented evidence |
| --- | --- |
| Authoritative overview contract | The property dashboard bootstrap composes Property Context, rooms, inventory, documents, household, verified record events, and safe related-tool aggregates through `property-record-overview-v1`. Optional adapters are isolated and return explicit `AVAILABLE` or `UNAVAILABLE` states. |
| Record-owned information hierarchy | The overview presents profile, four-category completeness, systems/inventory, rooms/household, documents, and verified record history. The duplicative Ownership & Protection summary was removed; Protection remains a related workspace. Home attention, daily changes, refinance, environment alerts, seller promotion, and generic Next Best Action are not rendered. |
| Trust and provenance | Important profile facts distinguish verified, inferred, stale, conflicted, and missing state and expose their source/correction destination. Recent updates use homeowner-confirmed or evidence-verified Home Events, not Home attention signals. |
| Documents truthfulness | Document summaries use property or inventory linkage plus verified coverage, type distribution, and review counts. A zero-document property displays an explicit upload action and never a contradictory green completeness message. Adapter failure renders unavailable state instead of a false zero. |
| Governed related tools | Tool identity and metadata come from the canonical capability registry; Property policy adds grouping and record affinity. Availability honors release stage metadata, rollout state, disabled/broken/release-gated tools, minimum room/system context, and Continuity Plan role restrictions. |
| Navigation continuity | Launch URLs carry canonical `backTo` plus the legacy `returnTo` alias. Capital Timeline, Plant Advisor, Home Continuity Plan, Timeline, and Status Board restore the Property origin, including section anchors. Explicit Home Tools property links take precedence over global selection. |
| Home coordination | Home Record completeness links to the exact next record-improvement control rather than duplicating Property detail. |
| Analytics | Views include completeness band, viewport, context, and registry version. Tool events include group/state/origin/registry metadata. Source views, record additions, reports, section navigation, workspaces, and isolated adapter failures are instrumented without sensitive content. |
| Accessibility and responsive behavior | The page has one wrapping, address-first H1 when the saved name is generic; semantic navigation/sections; busy loading semantics; reduced-motion fallbacks; 44 px mobile controls; textual statuses; and mobile-first completeness ordering. |
| Rollback control | `NEXT_PUBLIC_FEATURE_PROPERTY_RECORD_EXPERIENCE=false` switches the enhanced overview to a safe compact record fallback; connected tools remain independently controllable. |

### 16.5 Post-deployment visual refinement

Screenshot review of the first production deployment identified five final UI
issues. They are now reflected in the canonical specification and implemented:

1. The Property route opts into a 1,520 px dashboard canvas with a fluid main
   column and 340–380 px quality rail, eliminating the inherited 1,180 px
   constraint and double page padding.
2. Generic saved names including `Main` no longer displace the street address
   as the property identifier.
3. Header completeness is calculated from the same four category percentages
   visible in the quality rail. Document coverage recognizes both direct
   property links and inventory-item links.
4. The repeated Ownership & Protection card was removed because ownership,
   household count, and verified-document count already have canonical homes.
   Protection remains available through Related Workspaces.
5. The header primary CTA identifies a curated next record improvement when one
   exists, then falls back to `Add to record`. It never derives user-facing copy
   directly from operational or internal Property Context fact keys.

### 16.6 Contextual CTA correction: property timezone

Post-deployment review exposed `Review timezone` as a generated header CTA. The
underlying `location.timezone` fact was writable in the context registry, but
the Property editor and update contract did not expose it, making the CTA a
dead end. The correction is implemented as follows:

- the header action resolver uses a curated record-gap hierarchy and no longer
  promotes the first unknown context fact;
- the complete-state fallback is the stable `Add to record` action;
- Property Details now exposes a clearly labeled timezone selector alongside
  the address, with copy explaining its effect on reminders, schedules, and
  local dates;
- the frontend Property contract and update client carry `timezone`;
- the backend validates IANA timezone identifiers, persists the field on
  create/update, and records `location.timezone` evidence; and
- an existing valid timezone outside the common US choices remains visible and
  preservable in the editor.

Release evidence still required outside application implementation:

- p75 LCP, CLS, and INP from the production telemetry window;
- automated accessibility and visual-regression runs against authenticated
  sparse, medium, and mature property fixtures;
- moderated fact-finding, correction, and tool-discovery sessions; and
- progressive-cohort guardrail review before removing the rollback path.

These are launch-validation activities, not missing application behavior.

## 17. Testing strategy

### 17.1 Unit tests

- Property completeness category calculation
- Next record-improvement selection
- Related-tool eligibility and deterministic ordering
- Tool status adapter mapping
- Sensitive-state redaction
- Property-aware route construction
- Home vs Property ownership policy

### 17.2 Component tests

- Sparse, partial, complete, conflicted, and stale records
- Tool not started, active, complete, unavailable, and unauthorized states
- Long values and missing values
- Desktop and mobile navigation
- Keyboard operation and focus return

### 17.3 End-to-end tests

1. Open Property and locate a known fact.
2. Navigate directly to Systems & Inventory.
3. Correct a missing property field and return to the same section.
4. Upload a document and see the Documents summary update.
5. Open Capital Timeline with the selected property preserved.
6. Open Plant Advisor from a room-context entry point.
7. Open Home Continuity Plan without exposing sensitive content in Property.
8. Return from a tool to the originating Property section.
9. Confirm Home attention items do not render on Property.
10. Confirm one failed tool adapter does not block the page.

### 17.4 Visual regression scenarios

- New property with minimal information
- Property with one remaining setup field
- Mature property with many systems, rooms, and documents
- Property with conflicts and inferred facts
- Multiple related tools with saved state
- No eligible related tools
- Long address and long property name
- Mobile 360 px, tablet, standard desktop, and wide desktop

## 18. Acceptance criteria

### Purpose and relevance

- [ ] A first-time user can explain the Property page's purpose after viewing
  the first viewport.
- [ ] Property facts appear before related tools and workspaces.
- [ ] No Home attention feed, Meaningful Changes card, or generic Next Best
  Action appears on Property.
- [ ] Record completeness is expressed by category.

### Information detail and trust

- [ ] Profile, systems, rooms, documents, and history have clear canonical
  destinations.
- [ ] Missing, inferred, stale, verified, and conflicted states are distinguishable.
- [ ] Important facts provide provenance or a route to source details.
- [ ] Recent updates include record changes only.

### Related tools

- [ ] Capital Timeline, Home Continuity Plan, and Plant Advisor use the canonical
  capability registry.
- [ ] Related-tool cards show property-specific state.
- [ ] No more than four tools render on the overview by default.
- [ ] Sensitive tool content is never exposed in overview cards or analytics.
- [ ] All-property-tools navigation includes only eligible property-connected
  capabilities.

### CTA and navigation

- [ ] The header has one primary CTA.
- [ ] Section CTAs use specific verbs.
- [ ] All related destinations preserve property context.
- [ ] Return navigation restores the originating Property section where feasible.
- [ ] Mobile navigation exposes the same information architecture as desktop.

### UI quality

- [ ] Independent columns eliminate artificial card-height whitespace.
- [ ] No unnecessary nested cards or promotional banners remain.
- [ ] Loading geometry does not create significant layout shift.
- [ ] Empty states provide an exact next action.
- [ ] The page meets accessibility and performance targets.

## 19. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Removing action cards makes Property feel less useful | Replace them with richer record summaries and strong related-tool/workspace navigation |
| Home and Property drift back into duplication | Maintain an explicit ownership policy and automated render assertions |
| Related tools become another promotional catalog | Enforce eligibility rules, a four-card limit, and property-specific state requirements |
| Tool aggregate requests create a waterfall | Use a composed summary endpoint or parallel cached adapters |
| Home Continuity Plan leaks sensitive state | Permit aggregate readiness only and enforce authorization before serialization |
| Sparse properties still look empty | Use purposeful category empty states and guided record creation rather than filler cards |
| Existing deep links break | Preserve route aliases and use canonical safe return-route helpers |
| Renaming causes conceptual fragmentation | Align sidebar, breadcrumb, header, analytics, and documentation in one release |

## 20. Recommended delivery order

The fastest path to visible improvement without compromising architecture is:

1. Clarify naming and remove Next Best Action from the Property hero.
2. Replace the equal-height dashboard grid with the record-first overview.
3. Replace Setup Checklist with category completeness.
4. Remove duplicate Home modules.
5. Introduce the registry-driven Related Property Tools section.
6. Add contextual tool links from the relevant record categories.
7. Harden mobile, accessibility, performance, analytics, and rollout.

## 21. Final product outcome

After enhancement, ContractToCozy should have two unmistakably different and
complementary entry points:

- **Home** is alive, timely, prioritized, and action-oriented.
- **Property Record** is stable, comprehensive, trustworthy, and easy to
  navigate.

Related tools then form a meaningful bridge between them. They use the
property's record to help the homeowner plan, preserve knowledge, understand
the home's state, and use its spaces better—without turning the Property page
back into a duplicated command center.
