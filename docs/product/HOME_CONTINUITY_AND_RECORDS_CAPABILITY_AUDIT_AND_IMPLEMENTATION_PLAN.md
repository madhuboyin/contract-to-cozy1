# Home Continuity and Records Capability Audit and Implementation Plan

**Capabilities:** Document Vault, Home Timeline, Home Digital Will, Material
Specs, and Seller Prep<br>
**Contributing domains:** Property Context, Household Collaboration, Inventory,
Documents, Home Events, Property Brief, Inspection Hub, Insurance, Warranties,
Claims, Projects, Renovations, Permits, HOA, Home Actions, Notifications,
Bookings, Providers, and Property Intelligence<br>
**Audit framework:** `CAPABILITY_OUTCOME_AND_EXPERIENCE_AUDIT_FRAMEWORK.md`<br>
**Audit date:** August 1, 2026<br>
**Status:** Recommended implementation plan<br>
**Recommended disposition:** **Build one durable records and continuity system;
make Document Vault the governed evidence foundation, preserve Home Timeline as
the history authority, keep Material Specs as structured as-built detail,
rebuild Home Digital Will as a real access-controlled Home Continuity Plan, and
reposition Seller Prep as a sale-triggered readiness and property-handoff
journey**<br>
**Current safety classification:** All five capabilities are registered as low
consequence<br>
**Recommended safety classification:** Instance-based, ranging from low
consequence through privacy-sensitive, safety-sensitive, material-financial,
commercial, and regulated/disclosure-sensitive<br>
**Primary outcome family:** Home Continuity and Records

---

## 1. Executive Decision

ContractToCozy has the beginnings of a valuable long-term home record, but the
current portfolio does not yet provide reliable continuity.

Today:

- Document Vault stores files but is organized around the uploader rather than
  a durable property record, has limited classification and linking, and does
  not provide a complete review, version, retention, recovery, or transfer
  lifecycle;
- Home Timeline now has a strong provenance, evidence, correction, grouping,
  and date-precision foundation, but document uploads can still become timeline
  events even when the upload itself is not a real-world property event;
- Home Digital Will lets the owner author instructions and assign labels such
  as `VIEW` or `EMERGENCY_ONLY`, but a trusted contact cannot actually accept an
  invitation, authenticate, receive access, or use the handoff independently;
- Material Specs has evolved into a useful proposed-to-as-built lifecycle, but
  the primary UI still behaves like a basic card list and does not expose much
  of the evidence, verification, substitution, care, and repair/reorder value;
  and
- Seller Prep generates a separate static checklist, fixed ROI ranges, inferred
  spending and value uplift, agent comparisons, and lead promises rather than
  turning the home's existing records and canonical work into a governed sale
  transition.

The five routes overlap because each creates its own partial version of a home
record or handoff. The answer is not to merge them into a single large records
dashboard. Their responsibilities are legitimately different:

- files are evidence;
- structured records describe the home;
- Timeline records what happened;
- a continuity handoff controls what another person can use;
- a sale journey prepares selected records and work for a specific transition.

The homeowner job is:

> Keep the important facts, files, and history of my home reliable and easy to
> find; make them useful when something happens; and let me safely hand off only
> what another person needs during an emergency, household transition, service
> visit, or sale.

The recommended product decision is:

1. make **Document Vault** the canonical binary-file and evidence foundation,
   not the authority for extracted facts;
2. call the homeowner destination **Home Records** unless and until the product
   meets the stronger security, recovery, and durability expectations created
   by the word “Vault”;
3. make files property-owned by default, with explicit uploader, household,
   sensitivity, visibility, and retention policy;
4. support immutable originals, versions, integrity checks, trash/recovery,
   evidence-safe deletion, multiple domain links, and full-text retrieval;
5. stage every extracted fact for review before it changes a warranty, policy,
   inventory item, material spec, Timeline event, or other canonical record;
6. preserve **Home Timeline** as the durable history authority established by
   the Property Intelligence review;
7. record the event evidenced by a document, not the act of uploading a file,
   unless the upload itself is the relevant administrative milestone;
8. preserve **Material Specs** as structured, searchable as-built property
   detail and make Document Vault evidence reusable from it;
9. rename **Home Digital Will** to **Home Continuity Plan** or **Home Handoff**
   to avoid implying that it is a legal testamentary instrument;
10. rebuild that capability around real recipient invitations, acceptance,
    authentication, item-level access, published revisions, freshness review,
    access logs, and revocation;
11. assemble continuity content from canonical home records instead of asking
    the homeowner to copy the same contractor, policy, utility, system, and
    document information into free-text entries;
12. reposition **Seller Prep** as a contextual **Sale Readiness and Handoff**
    journey that activates only after confirmed sale intent;
13. make Seller Prep consume canonical Home Actions, Projects, inspections,
    permits, documents, Material Specs, Timeline, and Property Brief rather than
    creating another task and record system;
14. remove unsupported ROI, value-uplift, inferred-spend, verified-provider,
    and fulfillment claims;
15. reuse one governed package, recipient, access, expiration, audit, and
    revocation foundation for continuity, professional, and sale handoffs;
16. preserve private household history while projecting only expressly selected
    resale-safe records to a buyer or agent;
17. give the homeowner an explicit record-retention and access decision at
    closing instead of automatically transferring account data; and
18. measure successful retrieval, verified records, tested recipient access,
    and completed handoffs—not file counts, completion percentages, plans
    created, or pages viewed.

The target promise should be:

> Keep the story and proof of your home organized, find what you need when it
> matters, and hand off the right information safely.

### 1.1 Immediate trust and commercial-integrity decision

Several current behaviors require containment before the broader redesign:

- the AI Smart Upload path always requests automatic warranty creation and can
  create a warranty from a 0.7-confidence extraction without field-level
  homeowner confirmation;
- when a purchase date is absent, auto-created warranty data can use the current
  date, and a generated `AUTO-<timestamp>` can be stored as a policy number;
- raw document-intelligence model output is logged and may include sensitive
  document content;
- the property-scoped Documents page calls an API with `propertyId`, but the
  backend list route ignores the filter and returns all files uploaded by that
  homeowner profile;
- property documents uploaded by one household member are not naturally
  visible to another because listing and ownership are uploader-centric;
- generic document deletion physically removes the object before deleting the
  database row and does not guard against removing active evidence;
- Home Digital Will copy says trusted contacts can access information even
  though the only scoped-contact endpoint is an authenticated owner preview;
- Seller Prep marks generic tasks done without evidence and then treats fixed
  cost buckets as money spent and fixed ROI ranges as value created;
- its readiness report fabricates broad uplift ranges based only on the number
  of checklist items marked done;
- its “Get Free Quotes” experience promises up to three verified, licensed
  professionals within 24 hours, but the active backend only stores a lead row;
- the lead controller discards the name, email, phone, and contact preference
  submitted by the UI, so the promised follow-up cannot occur through that
  path; and
- the lead endpoint does not apply property authorization or a governed
  commercial-consent contract.

Disclaimers do not correct a contradictory product flow. Automatic record
creation, financial claims, trusted-contact access claims, and commercial
fulfillment claims must be removed or disabled until their underlying outcome
exists.

### 1.2 Implementation constraint

There are no real users and no production data migration requirement.

Implementation may change the Prisma schema directly. It must not create:

- database migration scripts;
- historical backfills;
- compatibility tables for obsolete uploader-owned files, digital-will
  entries, or seller checklist models;
- dual-write behavior solely to preserve the fragmented record systems;
- synthetic document versions, access grants, recipient acceptance, evidence,
  Timeline history, seller progress, provider fulfillment, or ownership
  transfer; or
- legacy fields solely to retain unsupported completion, ROI, uplift, readiness,
  or sharing semantics.

The user will reconcile the database separately after schema changes.

Use this constraint to establish clean property ownership, evidence, access,
handoff, and transition models. Do not preserve unsafe semantics for data that
does not need to be retained.

---

## 2. Scope and Portfolio Boundaries

### 2.1 In scope

| Area | Current responsibility | Target responsibility |
| --- | --- | --- |
| Document Vault | Upload, analyze, list, link to one entity, download, and hard-delete files | Durable property file/evidence foundation with review, multiple links, versions, integrity, retention, recovery, and access policy |
| Home Timeline | Durable events, evidence, revisions, grouping, and story presentation | Canonical property history; consumes evidence without treating every file upload as a property event |
| Home Digital Will | Separate structured notes and owner-previewed access levels | Home Continuity Plan assembled from canonical records, with real recipient access and tested handoff |
| Material Specs | Room/property finish records, photos, exports, and lifecycle | Structured planned-through-as-built material record available at repair, project, care, and handoff moments |
| Seller Prep | Static ROI checklist, budget/value model, comps, agent comparison, leads, and readiness report | Sale Readiness and Handoff journey using canonical work and selected resale-safe records |
| Record handoff | Fragmented exports and route-specific shares | Common package, recipient, item selection, grant, expiration, access log, revoke, and snapshot foundation |
| Ownership transition | Does not exist coherently | Explicit seller retention, buyer projection, acceptance, effective date, and post-closing access decisions |

### 2.2 Adjacent but not owned

- **Home Record, Property Context, Inventory, and domain records** own canonical
  structured facts. “Home Record” is a product concept and data contract; this
  plan does not assume a separate route unless one is deliberately built.
- **Home Timeline** owns durable historical events, not file storage or current
  record readiness.
- **Property Brief** owns purpose-specific governed summaries and should provide
  the reusable packaging/access foundation.
- **Home Actions** owns what needs attention, including missing-record,
  review, renewal, seller-preparation, and handoff tasks.
- **Status Board** owns current home state.
- **Home Digital Twin** owns scenarios, not facts or evidence.
- **Projects and Renovation Cases** own work execution and closeout.
- **Inspection Hub, Claims, Insurance, Warranties, Permits, HOA, Tax, and
  Expenses** own their domain records.
- **Providers and Bookings** own verified professional discovery, commercial
  consent, matching, and fulfillment.
- **Property Intelligence/Home Briefing** may report a meaningful record change
  but does not own the record.

The continuity system links these authorities. It does not copy their
lifecycles into a new generic record model.

### 2.3 Explicit non-goals

This plan does not recommend:

- representing Home Continuity Plan as a legal will, power of attorney,
  advance directive, estate plan, or authorization to act;
- guaranteeing that a trusted contact can legally enter, repair, sell, insure,
  or manage a property;
- transferring private household, claim, insurance, financial, security, or
  personal data to a buyer by default;
- treating file possession as proof that an extracted fact is true;
- replacing official originals, recorded deeds, permits, policies, inspection
  reports, or professional disclosures;
- turning every uploaded receipt or manual into a Timeline event;
- creating a duplicate document copy for every domain link;
- making every material record complete before it can provide partial value;
- calculating resale ROI or value uplift from generic static ranges;
- representing provider licensing, availability, quotes, or response times
  without a real governed fulfillment workflow;
- giving a viewer permission to alter property records;
- placing continuity or seller-prep cards permanently at the top of Home; or
- automatically transferring an account or property record on an unverified
  claim of sale.

---

## 3. Repository-Backed Current-State Map

### 3.1 Registered capability contracts

| Capability | Outcome | Release | Safety | Completion | Mode |
| --- | --- | --- | --- | --- | --- |
| Document Vault | `PLAN_BUDGET` | Beta | Low consequence | Plan created | Catalog only |
| Home Timeline | `UNDERSTAND_HOME` | Active | Low consequence | Artifact created | Catalog only |
| Home Digital Will | `UNDERSTAND_HOME` | Active | Low consequence | Artifact created | Contextual |
| Material Specs | `UNDERSTAND_HOME` | Active | Low consequence | Artifact created | Contextual |
| Seller Prep | `PLAN_BUDGET` | Active | Low consequence | Plan created | Contextual |

Timeline, Digital Will, Material Specs, and Seller Prep now have versioned
capability contracts with useful intent aliases and homeowner outcomes.
Document Vault still uses the generic tuple contract.

Material misalignments remain:

- Document Vault is evidence infrastructure, not a planning tool;
- “plan created” does not describe a useful document outcome;
- a file containing insurance, identity, deed, claim, financial, access, or
  emergency data is not uniformly low consequence;
- Digital Will declares a “governed, access-scoped handoff artifact,” but the
  implementation has no recipient grant or delivery lifecycle;
- Material Specs outputs are typed as documents even though the canonical
  output is a structured material record;
- Seller Prep completion includes creating or advancing a separate checklist,
  rather than reaching a verified sale-readiness or handoff outcome; and
- the contracts do not explain that Property Brief/access infrastructure should
  be reused rather than duplicated.

### 3.2 Current record flow

```text
File upload
  ├─ Document row owned by uploader profile
  ├─ optional single property/warranty/policy relation
  ├─ AI metadata JSON
  ├─ optional automatic Warranty creation
  └─ optional DOCUMENT Timeline event

Material entry
  ├─ structured MaterialSpec record
  ├─ separate photo objects
  ├─ string-array document references
  └─ export artifact

Home Digital Will
  ├─ copied free-text entries in eight sections
  ├─ contact rows with access-level labels
  └─ owner-authenticated contact-view preview

Seller Prep
  ├─ per-user/per-property static plan
  ├─ independent checklist status
  ├─ generic budget and value calculations
  ├─ agent-interview rows
  └─ unfulfilled lead capture
```

The current system lacks one coherent flow from:

```text
capture → review → canonical link → use → refresh → handoff → archive/transfer
```

### 3.3 Existing strengths to preserve

- property-scoped S3 storage and presigned download URLs;
- magic-byte validation and upload size/type controls;
- Document verification, checksum, parser-version, and OCR-quality fields,
  even though generic paths do not consistently populate or expose them;
- Timeline observation kind, verification state, date precision, revisions,
  corrections, evidence, and grouping;
- Material Specs lifecycle, immutable as-built identity, evidence gates,
  substitutions, extraction review, and repair/reorder output;
- Digital Will property authorization and owner-only trusted-contact mutation;
- Digital Will emergency-only section filtering in the owner preview;
- Seller Prep property-context and launch-lineage integration;
- Property Brief access, expiration, revocation, and audit foundation created by
  the Property Intelligence work; and
- existing typed links among Documents, Timeline, projects, claims, policies,
  warranties, inventory, and other domain records.

---

## 4. Capability Findings and Dispositions

### 4.1 Document Vault

#### Current strengths

- supports manual upload and AI-assisted analysis;
- validates actual file signatures rather than trusting MIME type alone;
- stores objects outside the database and uses short-lived signed downloads;
- supports links to several important domain entities;
- has document verification and extraction-quality fields;
- supports evidence use by Timeline, Property Brief, tax, insurance, projects,
  claims, and other features; and
- is already a widely reused platform dependency.

#### Material gaps

1. **The ownership model is uploader-centric.** `uploadedBy` is a homeowner
   profile, and listing/ownership middleware checks that uploader rather than
   the property's current household access.
2. **Property filtering is broken in the generic list route.** The frontend
   passes `propertyId`; the backend ignores it.
3. **A property-scoped route can therefore show documents from other properties
   owned by the same profile.**
4. **Household continuity is incomplete.** Another authorized household member
   may not see a file because they did not upload it.
5. **The standard upload supports only one related entity.** A roof invoice can
   legitimately evidence a project, warranty, material spec, Timeline event,
   expense, and insurance mitigation at the same time.
6. **There is no first-class many-to-many evidence/link model.** Some features
   use foreign keys, others use arrays of string IDs, and others maintain their
   own attachment tables.
7. **AI output is stored as opaque metadata rather than field-level candidates
   with citations, confidence, parser version, and review status.**
8. **Smart Upload requests automatic warranty creation by default.**
9. **Automatic warranty creation can invent a purchase date and policy number.**
10. **Document type mapping collapses warranty, receipt, and manual into
    `OTHER`; the taxonomy omits common continuity records such as deed, tax,
    utility, product manual, warranty, receipt, disclosure, survey, and closing
    document.**
11. **The generic UI shows “AI analyzed” and a confidence percentage without a
    complete extracted-field review workflow.**
12. **Raw model output is logged.**
13. **Checksum, storage ETag, verification, OCR-quality, and parser-version
    fields are not consistently populated by generic upload paths.**
14. **No duplicate-content or duplicate-version detection is applied.**
15. **There is no immutable-original and derived-file distinction.**
16. **No file version, replacement, supersession, or effective-period model
    exists.**
17. **Deletion is hard and can remove active evidence.** The object is deleted
    before the database transaction succeeds, creating a possible record/object
    split if the database delete fails.
18. **There is no trash, restore, legal/operational hold, retention policy, or
    evidence-impact preview.**
19. **There is no full-text/OCR search, saved collection, missing-record
    checklist, expiration/renewal control, or review queue.**
20. **The “Vault” name implies stronger durability, recoverability, privacy,
    and access guarantees than the product currently demonstrates.**

#### Disposition

**Double down and rebuild as the common Home Records evidence foundation.**

- Keep one immutable stored binary per version and reference it from multiple
  canonical records.
- Make property ownership and property access primary; preserve uploader as
  provenance.
- Add personal/private files explicitly rather than making all documents
  implicitly uploader-private.
- Stage extracted candidates and require confirmation before canonical writes.
- Replace hard deletion with trash, evidence-impact review, restore, and
  policy-driven purge.
- Build task-oriented retrieval such as “roof warranty,” “documents for my
  claim,” “records expiring soon,” and “what is missing for sale,” not only raw
  type/entity filters.

### 4.2 Home Timeline

#### Current strengths

- it is now correctly registered under `UNDERSTAND_HOME`;
- supports observed, reported, evidence-derived, inferred, and system-generated
  event kinds;
- supports exact, month, year, range, and unknown date precision;
- supports homeowner confirmation, evidence verification, dispute, corrections,
  revisions, grouping, and soft deletion;
- links Documents and other domain evidence;
- provides both scannable and narrative presentations; and
- is the natural durable history and long-term revisit anchor.

#### Remaining continuity gaps

1. A document upload can still create a `DOCUMENT` event even when the real
   historical fact is the warranty, inspection, repair, purchase, permit, or
   project evidenced by the file.
2. File deletion can silently remove a Timeline document link and leave the
   event with reduced evidence.
3. Timeline visibility values such as `SHARE_LINK` and `RESALE_PACK` do not by
   themselves establish recipient consent, snapshot, access, or transition
   policy.
4. Private, household, resale-safe, and successor-owner history need explicit
   projection rules.
5. A new owner should not inherit claims, notes, costs, household details, or
   private events merely because the property identifier persists.
6. A seller should not lose their private proof because ownership changes.
7. Document classification/review does not consistently promote the underlying
   event with field-level evidence.
8. Annual and sale handoff views need to reference canonical events, not copy
   them into a second history.

#### Disposition

**Preserve and integrate.**

The Property Intelligence audit already defines Timeline as the canonical
history authority. This plan should not create another Timeline roadmap.
Continuity implementation should:

- remove upload-as-history noise;
- promote reviewed underlying facts to events;
- protect active evidence during retention/deletion;
- add explicit handoff projections and snapshots;
- preserve seller-private history separately from successor-safe property
  history; and
- reuse Timeline evidence and revisions in every continuity package.

### 4.3 Home Digital Will

#### Current strengths

- useful emergency, critical information, contractor, maintenance, utility,
  insurance, house-rule, and notes sections;
- guided setup and readiness prompts;
- pinned and emergency entries;
- owner-only contact grant mutation;
- access-level concepts including emergency-only;
- household-aware service authorization; and
- a publish readiness gate requiring an emergency instruction and reachable
  primary contact.

#### Material gaps

1. **It is not a delivered handoff.** Contacts cannot independently access the
   content.
2. The scoped-contact view requires the property owner to authenticate and
   select the contact row; it is a preview, not recipient authorization.
3. There are no invitations, acceptance, identity verification, authentication
   binding, access tokens, recipient accounts, MFA, notification, or delivery
   receipts.
4. There are no access logs, last-access records, failed-access events, revoke
   events, or emergency-use audit.
5. Contact rows can have access labels without a reachable email or phone.
6. `VIEW` and `EDIT` are broad section-wide concepts; there is no item-level or
   sensitivity-level grant.
7. Publishing updates a mutable live record rather than creating an immutable
   published revision.
8. Later edits can change what a contact would see without explicit republish,
   notification, or acknowledgment.
9. There is no review cadence, stale-entry calculation, reminder, recipient
   access test, or “last confirmed by owner” per item.
10. The plan duplicates utilities, insurance, contractors, maintenance, and
    other canonical records as free text.
11. It cannot attach or select Document Vault records.
12. Emergency access is not available when the owner is unavailable unless the
    trusted person already has normal property account access.
13. There is no secure offline/emergency packet or controlled break-glass
    workflow.
14. There is no explicit consent from household co-owners before sharing
    sensitive household information.
15. The name “Home Digital Will” can be mistaken for a legal will or authority
    to act.
16. The low-consequence safety tier does not reflect emergency instructions,
    access details, security-system information, policy information, or trusted
    recipient identity.

#### Disposition

**Reposition and rebuild as Home Continuity Plan.**

- Use canonical records and links wherever possible.
- Keep authored instructions only for information that has no canonical owner.
- Let the owner compose purpose-based handoffs: emergency helper, household
  member, caregiver, property manager, service professional, or extended
  absence.
- Require real invite, acceptance, identity binding, access scope, expiry,
  revocation, audit, and access testing.
- Publish immutable revisions and make changes explicit to recipients.
- Prominently state that the plan shares information but grants no legal
  authority.

### 4.4 Material Specs

#### Current strengths

- clear homeowner job: identify and reorder exact finishes and products;
- appropriate distinction from Inventory, Projects, and Timeline;
- room and property scope;
- product identity fields including manufacturer, line, SKU, color code,
  dimensions, material, finish, lot/batch, supplier, quantity, and storage;
- planned, approved, substituted, installed, and as-built lifecycle;
- evidence gates and immutable as-built identity;
- extraction candidate review;
- project, renovation scope, inventory, room, compliance, receipt, warranty,
  and manual context;
- repair/reorder output and export; and
- good contextual activation potential at project completion or repair need.

#### Material gaps

1. The primary UI is still mostly a list, filter, add form, and export drawer.
2. It displays lifecycle status but does not expose the full lifecycle,
   evidence, extraction-review, substitution, verification, care, or
   repair/reorder workflow.
3. There is no visible detail/edit journey from the main card grid.
4. Separate `MaterialSpecPhoto` objects do not use common Document Vault
   retention, access, integrity, and deletion controls.
5. Document relationships are stored partly as string arrays rather than typed
   evidence links.
6. No uniqueness or duplicate-suggestion contract prevents several records for
   the same room/surface/material state.
7. Static color-code-to-hex lookup covers a very small curated set and can look
   more authoritative than it is.
8. A supplier URL can become stale, but discontinuation, last checked, alternate
   source, and successor product are not modeled.
9. “Exact match” should depend on verified manufacturer identity, product code,
   finish, batch/dye-lot where relevant, and source freshness.
10. Casual homeowner capture is too form-heavy for the highest-value moment:
    photographing a label, receipt, packaging, or leftover location during
    project closeout.
11. Material Specs can become a parallel project/compliance workflow if it owns
    approvals instead of referencing Renovation Case authority.
12. Export is file-centric rather than a governed, recipient-scoped professional
    handoff.

#### Disposition

**Double down as structured as-built detail, primarily contextual and embedded.**

- Keep the lifecycle and verification model.
- Make Renovation Case the approval authority and Material Specs the durable
  material record.
- Use common Document evidence and handoff infrastructure.
- Add photo/label/receipt-assisted capture with field review.
- Lead with homeowner outcomes: match a repair, reorder a product, find care
  instructions, locate leftovers, or hand exact specs to a professional.
- Do not make Material Specs a permanent Home card.

### 4.5 Seller Prep

#### Current strengths

- contextual activation from sale intent;
- property-context readiness checks;
- configurable timeline, budget, property type, priority, and condition;
- checklist progress and agent-interview comparison;
- comparables provider abstraction and unavailable state;
- launch lineage to source action/journey/project; and
- a valid terminal homeowner job: turn years of records and care into a more
  orderly sale.

#### Material gaps

1. Opening the overview creates a plan before confirming that the homeowner
   wants a sale journey.
2. Plans are unique per user/property rather than one property sale journey
   shared under household roles.
3. Checklist items are static national defaults, not derived from inspections,
   open projects, permits, documents, material records, Home Actions, local
   requirements, or listing strategy.
4. The route creates another task list instead of using canonical Home Actions.
5. “Done” requires no evidence or actual cost.
6. Fixed cost buckets are treated as money spent.
7. Static ROI ranges are treated as value increase.
8. The readiness report fabricates `$5k–$15k` or `$15k–$30k` uplift solely from
   completed item count.
9. The UI says the plan will “maximize resale value,” which is not a supportable
   outcome guarantee.
10. The methodology dialog claims adjustment for regional costs, property type,
    market conditions, and urgency even though the checklist engine returns the
    same four rows and static ROI ranges.
11. Top actions are sorted lexically by priority string, not by an explicit
    homeowner/action priority contract.
12. There is no document-readiness, title/deed, permit, warranty, improvement,
    disclosure, repair-evidence, or material-spec package workflow.
13. There is no listing date, listing stage, under-contract stage, closing
    stage, sale completion, or ownership handoff lifecycle.
14. Agent interview mutations use owner-specific plan access while checklist
    mutation is household-aware, producing inconsistent collaboration.
15. The lead endpoint lacks property authorization and a complete consent
    contract.
16. The active lead controller discards contact data supplied by the UI.
17. The product promises verified licensed professionals, up to three quotes,
    and a 24-hour response without matching, partner, licensing, delivery,
    quote, or SLA implementation.
18. There is no referral/compensation disclosure or auditable consent to share
    personal and project information.
19. The journey does not reuse Property Brief or a governed buyer/agent package.
20. There is no privacy separation between seller-private evidence and
    buyer-safe records.

#### Disposition

**Reposition as a sale-triggered Sale Readiness and Handoff journey.**

- Start only after explicit sale intent.
- Create one property sale case with household roles and a target timeline.
- Derive work from canonical findings/actions/projects instead of static tasks.
- Separate must-resolve, consider, document, disclose/verify, and optional
  presentation work.
- Use actual expenses and quotes, not inferred spend.
- Use governed local market data or professional input before displaying
  financial implications.
- Build a selected Property Brief/sale package and explicit closing handoff.
- Hide commercial CTAs until provider fulfillment and consent meet the product
  framework.

---

## 5. Functional Completeness and Experience Audit

### 5.1 Portfolio score

| Framework dimension | Score | Maximum | Finding |
| --- | ---: | ---: | --- |
| Homeowner value clarity | 13 | 20 | Strong latent value, but “vault,” “will,” specs, history, and seller plan do not form one understandable lifecycle |
| Functional completeness | 9 | 20 | Timeline and Material foundations are strong; durable file and real handoff lifecycles are incomplete |
| Actionability and lifecycle | 7 | 15 | Capture exists, but review, refresh, recipient access, transition, and recovery are fragmented |
| Trust, safety, and evidence | 5 | 15 | Automatic extraction writes, misleading access/commercial claims, and hard deletion are material gaps |
| UX and progressive disclosure | 8 | 15 | Several rich surfaces exist, but they emphasize storage, forms, percentages, and generic dashboards over moments of need |
| Product-framework conformance | 5 | 10 | Timeline is aligned; Document, Digital Will, and Seller Prep contracts remain materially inconsistent |
| Reliability and operability | 3 | 5 | Storage and validation exist, but integrity, retention, delivery, access, and recovery operations are incomplete |
| **Total** | **50** | **100** | **Consolidate the lifecycle and harden trust before expanding record volume or sharing** |

### 5.2 Homeowner question contract

| Homeowner question | Current answer | Target answer |
| --- | --- | --- |
| What is this? | Five separate tools | The record, proof, history, and controlled handoff of this home |
| How does it benefit me? | Store files, watch a story, fill forms, export lists | Find proof quickly, avoid re-entry, preserve knowledge, and make transitions safer |
| What should I add? | Generic uploads and long forms | The one missing record or fact that improves an active need |
| What should I care about? | Counts, completion percentages, static tasks | Missing, stale, unreviewed, expiring, private, or transition-critical records |
| What can I control? | Upload/delete, edit entries, set contact labels, mark tasks done | Record visibility, review, correction, retention, recipient scope, expiry, revoke, and transfer |
| Can my household use it? | Inconsistent uploader/user ownership | Explicit property roles and record-level sensitivity |
| Can my trusted contact use it without me? | No | Accepted, authenticated, tested, logged, revocable access |
| What can a buyer see? | Unclear timeline/export semantics | A previewed, selected, resale-safe snapshot with exclusions |
| What happens after sale? | No coherent answer | Explicit closing handoff plus seller retention and access choices |

### 5.3 Revisit-value diagnosis

| Capability | Current revisit mechanism | Why it is weak | Target revisit trigger |
| --- | --- | --- | --- |
| Document Vault | Upload and browse | A file list is useful only when the homeowner already knows what to find | Missing/expiring record, active workflow, review request, or retrieval need |
| Home Timeline | New event or story playback | Strong natural loop; upload noise can dilute it | Verified event, correction, evidence, milestone, recap, or handoff |
| Home Digital Will | Completion/readiness percentage | Percentage does not prove recipient access or freshness | Stale critical item, changed canonical record, grant change, or access test |
| Material Specs | Add/search/export | Strong at repair/project moments but weak as passive browsing | Project closeout, damage/repair, reorder, care, or professional handoff |
| Seller Prep | Checklist progress | Static tasks and ROI gamification are not a real sale lifecycle | Confirmed sale stage, canonical blocker, document gap, deadline, or handoff milestone |

### 5.4 Severity-ranked findings

#### P0 — Privacy, trust, and commercial integrity

- Trusted-contact access is described but not delivered.
- Smart Upload can automatically create canonical warranty records without
  field-level confirmation.
- Raw document AI output may be logged.
- Seller Prep promises provider verification and fulfillment that do not exist.
- Seller Prep lead contact data is discarded by the active backend path.
- Generic seller ROI, spend, and uplift claims are unsupported.
- Property-scoped document listing does not honor the property filter.
- Document hard deletion can remove active evidence and can split object/database
  state.

#### P1 — Durable record architecture

- Document ownership is tied to uploader rather than property and access policy.
- No common multi-entity evidence link exists.
- No immutable original/version/supersession/retention/recovery lifecycle exists.
- Digital Will duplicates canonical records as mutable text.
- Seller Prep creates a separate per-user action system.
- Ownership transition and recipient-safe history projection are absent.

#### P2 — Homeowner experience

- Record value appears mainly as upload, filter, form, export, or completion
  mechanics.
- Missing and stale records are not presented in the context of an active need.
- Material lifecycle depth is hidden from the main UI.
- Recipient access cannot be tested.
- Sale readiness does not distinguish required verification, optional work,
  record preparation, and buyer presentation.

#### P3 — Operations and measurement

- File counts and generated artifacts can substitute for useful outcomes.
- No common access, retention, purge, integrity, or delivery SLO exists.
- There is no portfolio view of broken evidence links or stale handoffs.
- No metrics measure successful retrieval or recipient access.

---

## 6. Target Product Architecture

### 6.1 Canonical responsibility model

| Question | Canonical owner |
| --- | --- |
| Where is the original file? | Home Records / Document service |
| What fact does the file support? | The owning domain record with evidence provenance |
| What happened to the home? | Home Timeline |
| What is installed in this room/surface? | Material Specs |
| What information should another person be able to use? | Home Continuity Plan / governed handoff |
| What must be done before a sale? | Sale Readiness case projected into Home Actions |
| What can a recipient see? | Purpose-specific Property Brief/handoff snapshot |
| Who accessed or changed it? | Common access and audit ledger |
| What happens after ownership changes? | Governed property transition |

### 6.2 Target topology

```text
Home Records foundation
  ├─ immutable document objects and versions
  ├─ reviewed extracted-fact candidates
  ├─ typed evidence links
  ├─ sensitivity, visibility, retention, and integrity
  └─ search, retrieval, trash, and recovery
             │
             ├────────► canonical domain records
             ├────────► Home Timeline evidence
             ├────────► Material Specs evidence
             └────────► governed handoff package items

Governed handoff foundation
  ├─ Property Brief
  ├─ Home Continuity Plan
  ├─ professional/service package
  └─ Sale Readiness / buyer handoff
             │
             └─ recipient + scope + snapshot + grant + access log + revoke
```

### 6.3 Record lifecycle

Every durable record must support:

1. **Capture** — upload, scan, import, email-forward, domain-generated artifact,
   or manual reference.
2. **Validate** — file signature, malware scan, integrity hash, property access,
   and source metadata.
3. **Classify** — record type, sensitivity, property, effective period, and
   suggested domain links.
4. **Review** — field-level extraction candidates with citations and confidence.
5. **Link** — one original can support several canonical records.
6. **Use** — claim, repair, warranty, renewal, project, history, emergency,
   professional, or sale workflow.
7. **Refresh** — expiry, supersession, stale review, or replacement version.
8. **Archive** — no longer current but retained as historical evidence.
9. **Share/Handoff** — selected snapshot and access policy.
10. **Trash/Purge** — reversible deletion followed by policy-controlled purge
    only when evidence and hold rules permit.

### 6.4 Canonical data contracts

#### Record and version

```text
PropertyRecord
  id
  propertyId
  recordType
  title
  description
  sensitivity
  defaultVisibility
  lifecycleStatus
  currentVersionId
  effectiveFrom?
  effectiveTo?
  reviewDueAt?
  retentionPolicyId?
  createdByUserId
  archivedAt?
  trashedAt?

PropertyRecordVersion
  id
  propertyRecordId
  versionNumber
  storageKey
  originalFilename
  mimeType
  sizeBytes
  sha256
  storageEtag
  malwareScanStatus
  sourceType
  parserVersion?
  ocrQualityScore?
  uploadedByUserId
  createdAt
  supersedesVersionId?
```

#### Evidence and extraction

```text
RecordLink
  propertyRecordId
  targetEntityType
  targetEntityId
  linkKind
  relationshipLabel?
  isPrimaryEvidence
  addedByUserId
  createdAt

ExtractedFactCandidate
  propertyRecordVersionId
  targetDomain
  fieldKey
  proposedValue
  sourceCitation
  confidence
  reviewStatus
  reviewedValue?
  reviewedByUserId?
  reviewedAt?
  promotedEntityType?
  promotedEntityId?
```

#### Access and handoff

```text
HandoffPackage
  id
  propertyId
  purpose
  title
  status
  revision
  createdByUserId
  publishedAt?
  supersedesPackageId?

HandoffPackageItem
  handoffPackageId
  sourceEntityType
  sourceEntityId
  snapshotPayload
  sensitivity
  includedByUserId

HandoffRecipient
  handoffPackageId
  recipientType
  displayName
  emailHash?
  phoneHash?
  identityBindingUserId?
  invitationStatus
  acceptedAt?

HandoffAccessGrant
  handoffRecipientId
  grantScope
  authPolicy
  startsAt
  expiresAt?
  revokedAt?
  lastTestedAt?

HandoffAccessEvent
  accessGrantId
  eventType
  occurredAt
  actorFingerprint
  metadata
```

#### Sale transition

```text
PropertySaleCase
  id
  propertyId
  status
  targetListDate?
  targetCloseDate?
  listedAt?
  underContractAt?
  closedAt?
  createdByUserId
  sourceActionId?

SaleReadinessItem
  saleCaseId
  sourceEntityType
  sourceEntityId
  category
  requirementClass
  status
  dueAt?
  canonicalWorkItemId?

PropertyTransition
  saleCaseId
  effectiveAt
  sellerRetentionDecision
  buyerPackageId?
  acceptedAt?
  completedAt?
```

Seller-readiness work should reference canonical work items, not duplicate their
status.

### 6.5 Record truth rules

- A file is evidence, not proof that every extracted field is true.
- An AI classification is a candidate until reviewed.
- An immutable original can have several derived previews/OCR outputs.
- A newer file version does not erase the previous version.
- An expired record can still be valid historical evidence.
- A document upload is not automatically a historical property event.
- A handoff is a purpose-specific snapshot and access policy, not a new source
  of truth.
- A recipient view never broadens because a source record later becomes more
  sensitive; republish is explicit.
- A buyer receives only selected successor-safe records.
- A seller retains private/account records according to an explicit policy.
- “Verified” must state who or what verified the record and what was verified.

### 6.6 Safety and privacy classification

| Instance | Recommended classification |
| --- | --- |
| Paint color record | Low consequence |
| Contractor manual shared for a repair | Low consequence with privacy controls |
| Deed, policy, claim, invoice, or financial record | Privacy-sensitive / material-financial |
| Alarm, lock, shutoff, utility, or emergency instruction | Safety-sensitive / security-sensitive |
| Trusted-contact identity and access grant | Privacy and account-security sensitive |
| Seller disclosure or permit representation | Regulated/disclosure-sensitive |
| ROI, value, or market recommendation | Material-financial |
| Provider referral and contact sharing | Commercial-integrity and privacy-sensitive |

Safety is derived from record sensitivity, use, recipient, and action—not the
route name.

---

## 7. Target Homeowner Experience

### 7.1 Home placement

Do not show permanent cards for Document Vault, Material Specs, Timeline,
Continuity Plan, or Seller Prep on Unified Home.

Show a Home Action or contextual card only when:

- a critical record is missing for an active situation;
- an extracted field needs review;
- a policy, warranty, permit, or other record is expiring;
- a continuity plan is stale or recipient access has not been tested;
- a verified home event was added or needs correction;
- a repair/project needs material details;
- sale intent has been confirmed and a material readiness blocker exists; or
- a handoff is ready for recipient review or acceptance.

### 7.2 Home Records

Homeowner-language header:

> Records and proof for this home

Subhead:

> Find warranties, receipts, inspections, permits, policies, project files, and
> other records when you need them. Review extracted details before they update
> your home record.

Primary organization:

- **Needs review**
- **Expiring or outdated**
- **Recently used**
- **By home system/room/project**
- **All records**
- **Trash**

Every record shows:

- what it is;
- which property and records it supports;
- current/expired/superseded state;
- review/verification state;
- sensitivity and who can see it;
- source, version, and integrity details in progressive disclosure; and
- actions such as review fields, link, replace with newer version, download,
  share through a package, archive, or move to trash.

### 7.3 Continuity Plan

Positioning:

> Make sure the right person can find critical home information if you are away
> or unavailable.

The setup journey asks:

1. What situation are you preparing for?
2. Who needs access?
3. What should that person see?
4. When should access start and end?
5. How will they verify access?
6. Has the recipient accepted and tested it?
7. When should you review it again?

The plan should suggest canonical information already known:

- emergency and shutoff instructions;
- property contacts and household roles;
- selected policies and documents;
- preferred providers;
- active maintenance/care instructions;
- critical systems and Material Specs;
- selected Timeline events; and
- authored notes only where needed.

Readiness states:

- Draft;
- Recipient missing;
- Needs recipient acceptance;
- Access not tested;
- Ready;
- Update available;
- Needs review;
- Revoked/expired.

Do not show “100% complete” merely because one emergency entry and one contact
exist.

### 7.4 Material Specs

Lead with tasks, not taxonomy:

- Find the exact paint, tile, flooring, fixture, roofing, siding, or finish.
- See where it is installed.
- Reorder it or find a successor.
- Locate leftover material.
- Read care instructions.
- Give selected specs to a contractor.
- Confirm what was installed at project closeout.

Progressive capture:

1. take a label/package/receipt photo;
2. review extracted manufacturer/product/code/batch fields;
3. choose room and surface;
4. add leftover quantity/location;
5. link project, receipt, warranty, manual, and care instructions; and
6. verify as-built only when evidence requirements are met.

### 7.5 Sale Readiness and Handoff

Activate only after the homeowner confirms sale intent.

The first screen answers:

- What must be resolved before the target listing/closing date?
- What is optional and why might it help?
- Which records are missing or need review?
- What can be shared with an agent or buyer?
- What remains private?
- What is the next canonical action?

Recommended sections:

- **Decide and set timeline**
- **Resolve material blockers**
- **Prepare property records**
- **Verify permits, projects, and warranties**
- **Build agent/listing package**
- **Build buyer-safe property handoff**
- **Closing and ownership transition**

Any financial recommendation must include source geography, source date,
assumptions, confidence, and whether it comes from an actual quote or qualified
market input. “Mark done” never creates spend or value.

### 7.6 Closing and ownership transition

Before closing, show a preview of:

- records selected for the buyer;
- excluded/private records;
- Timeline events selected for successor history;
- warranties/manuals/material specs that may transfer;
- permits and project closeout records;
- package expiration and recipient identity;
- seller retention choice; and
- what account/property access will and will not change.

After verified closing:

- freeze the buyer package snapshot;
- record delivery and acceptance;
- preserve seller-private records under the seller's retention choice;
- never transfer household members, claims, private notes, access credentials,
  or financial data automatically;
- revoke temporary agent/professional access as configured; and
- add a verified Timeline transition milestone without exposing private sale
  details to a successor by default.

---

## 8. Recommended Implementation Sequence

### Slice 0 — Trust, privacy, and commercial containment

**Goal:** Stop behavior that contradicts the current product promise.

Work:

- stop passing `autoCreateWarranty=true` from Smart Upload;
- stage all extracted warranty fields for homeowner review;
- remove invented purchase dates and generated policy numbers;
- stop logging raw document-intelligence output;
- honor `propertyId` in document listing and enforce property access;
- add mutation role floors to Document and Material routes;
- change generic deletion to a guarded trash operation;
- prevent deletion of active evidence without an impact decision;
- make database/object deletion transactional through an outbox or purge job;
- replace Digital Will copy that says contacts can access content with honest
  “access setup is not yet sent” language, or disable publish;
- disable Seller Prep lead CTAs and confirmation copy until fulfillment exists;
- remove verified/licensed, three-provider, 24-hour, and “free quotes” claims;
- remove fixed ROI/uplift and inferred-spend displays;
- require property authorization and validated commercial consent on any
  retained lead endpoint; and
- add audit alerts for blocked auto-writes, attempted evidence deletion, and
  unauthorized record access.

**Exit gate:** No unreviewed extraction changes a canonical record; no UI claims
recipient access or provider fulfillment that does not exist; no property route
shows another property's files; and no active evidence can be irreversibly
deleted in one click.

### Slice 1 — Portfolio contracts and canonical ownership

**Goal:** Encode the target product responsibilities.

Work:

- move Document Vault to `UNDERSTAND_HOME` and define its explicit contract;
- choose Home Records versus Vault naming based on security/durability review;
- rename Digital Will to Home Continuity Plan/Home Handoff;
- define purpose-based handoff relationships to Property Brief;
- change Material Specs output type from generic document to structured record;
- redefine Seller Prep as a contextual sale case with verified milestones;
- assign instance-based safety and privacy tiers;
- update completion signals;
- define Home placement and contextual triggers;
- publish the canonical ownership matrix; and
- remove duplicate catalog and related-tool paths.

**Exit gate:** Capability inventory, discovery, routes, analytics, and content
describe one records-and-handoff system.

### Slice 2 — Canonical record, version, and evidence foundation

**Goal:** Make files durable property evidence rather than uploader-owned rows.

Work:

- add Property Record, Record Version, Record Link, retention, and integrity
  models;
- separate property ownership, uploader provenance, and personal/private scope;
- implement immutable originals and version supersession;
- calculate SHA-256 and capture storage ETag on every upload;
- add duplicate and possible-new-version detection;
- normalize document/record taxonomy;
- support many typed entity links;
- create shared evidence-link APIs for domain services;
- add sensitivity and default visibility policy;
- implement trash, restore, archive, hold, and purge eligibility;
- add broken-link/evidence-impact analysis; and
- remove obsolete single-parent assumptions.

**Exit gate:** Every file has property/access scope, immutable version identity,
integrity, lifecycle, and typed evidence relationships.

### Slice 3 — Safe smart intake and review

**Goal:** Turn AI extraction into reviewable assistance.

Work:

- add field-level extracted candidates with source citation;
- add malware scanning and OCR quality state;
- show model/parser version only in trust detail;
- build review/confirm/correct/reject UI;
- define per-domain promotion contracts;
- prohibit canonical promotion below domain-specific review gates;
- distinguish document classification confidence from field confidence;
- support manual classification when analysis fails;
- add batch mobile scan and direct domain upload entry points;
- add duplicate/version resolution UI; and
- redact sensitive fields from logs, analytics, and error payloads.

**Exit gate:** The homeowner can see and control every proposed canonical write.

### Slice 4 — Retrieval, freshness, and record readiness

**Goal:** Make records useful after capture.

Work:

- add OCR/full-text and structured search;
- add task-oriented search and entity-based browse;
- add current, expired, superseded, archived, and trash views;
- add review/expiry/reminder dates;
- define contextual record-readiness templates for claims, sale, emergency,
  project closeout, warranty, tax, and professional service;
- promote missing/stale records through canonical Home Actions only when useful;
- add recently used and source-workflow backlinks;
- implement saved retrievals or lightweight collections;
- add export/download audit; and
- define storage/recovery SLOs.

**Exit gate:** A homeowner can find a known record or understand what is missing
within the active task context.

### Slice 5 — Material Specs continuity integration

**Goal:** Expose the existing structured depth at the moment of need.

Work:

- replace photo/document string references with common typed record links;
- add label/photo/receipt-assisted capture and field review;
- build material detail, edit, lifecycle, evidence, substitution, care, and
  repair/reorder views;
- add duplicate/same-surface suggestions;
- label exact-match confidence and missing identity fields;
- add product-source freshness, discontinued state, alternate/successor record,
  and last checked;
- keep Renovation Case as approval authority;
- add leftover-material quantity/location prompts at closeout;
- use governed handoff packages for contractor sharing; and
- keep contextual entry from rooms, incidents, repairs, and projects.

**Exit gate:** A homeowner can capture a material once and reliably retrieve or
share what is known when repair, care, reorder, or closeout requires it.

### Slice 6 — Timeline continuity integration

**Goal:** Connect evidence and history without duplicating the Property
Intelligence Timeline roadmap.

Work:

- stop generic document-upload events;
- promote reviewed underlying facts/events instead;
- show record version and evidence state in event detail;
- prevent purge of sole active evidence without an explicit decision;
- add resale-safe and successor-safe projection policy;
- add handoff snapshot references without copying events;
- preserve seller-private history across transition; and
- verify annual recap and selected export use canonical revisions.

**Exit gate:** Timeline describes what happened, while Home Records explains how
it is known.

### Slice 7 — Real Home Continuity Plan

**Goal:** Deliver an access-controlled handoff another person can actually use.

Work:

- add purpose, package revision, recipient, invitation, grant, and access-event
  models;
- assemble items from canonical records and authored instructions;
- support item/section sensitivity and scope;
- build recipient preview;
- send invitation and bind acceptance to a verified identity/account or
  appropriately secured recipient flow;
- define authentication and optional MFA by sensitivity;
- implement starts, expiry, revoke, and access log;
- publish immutable package revisions;
- notify recipients about material republished changes;
- add “test access” and last-tested state;
- add stale critical-item review and reminders;
- support secure offline/emergency package policy where approved;
- add household co-owner consent where necessary; and
- display clear non-legal-authority language.

**Exit gate:** A recipient can independently access exactly the accepted scope,
and the owner can see, test, update, expire, and revoke that access.

### Slice 8 — Sale Readiness case

**Goal:** Replace the static checklist with one governed sale journey.

Work:

- add one property Sale Case with household roles;
- require confirmed sale intent;
- add target listing/closing dates and lifecycle;
- project canonical findings, projects, permits, Home Actions, documents,
  Material Specs, and Timeline gaps into readiness categories;
- distinguish material blocker, verification needed, optional improvement,
  presentation, and professional decision;
- use canonical work-item status;
- capture actual quotes/expenses rather than infer spend;
- remove static ROI and value uplift;
- integrate Property Brief and record-readiness checks;
- add agent/listing package composition;
- make jurisdictional/disclosure prompts research and professional-review aids,
  not legal conclusions; and
- align household collaboration and audit.

**Exit gate:** Seller readiness reflects real property work and records, not
generic tasks or self-reported completion percentages.

### Slice 9 — Provider and commercial workflow, if retained

**Goal:** Reintroduce provider assistance only with real fulfillment.

Work:

- route through canonical Providers/Bookings infrastructure;
- verify property access and explicit contact-sharing consent;
- disclose recipient companies, purpose, retention, and any compensation;
- validate provider licensing claims and verification freshness;
- implement match, delivery, acceptance, response, quote, and close lifecycle;
- stop making fixed response-time promises without an enforceable SLO;
- persist the submitted contact data securely;
- add withdraw/delete consent controls;
- add spam/rate/abuse protection; and
- audit every partner disclosure and data transfer.

**Exit gate:** Every commercial promise is backed by a measurable workflow and
auditable consent.

### Slice 10 — Buyer handoff and ownership transition

**Goal:** Safely convert selected home continuity records into successor value.

Work:

- compose buyer-safe package templates through common handoff infrastructure;
- preview selected and excluded content;
- include reviewed warranties, manuals, Material Specs, permits, project
  closeout, and selected Timeline history;
- exclude sensitive/private categories by default;
- add recipient identity, acceptance, expiry, and revoke;
- verify closing before property transition;
- capture seller retention and buyer projection decisions;
- separate account ownership from package access;
- preserve immutable delivered snapshot and audit;
- revoke temporary professional/agent access; and
- create verified transition milestones.

**Exit gate:** The buyer receives useful selected records without inheriting the
seller's private account or history.

### Slice 11 — Unified experience, operations, and launch governance

**Goal:** Complete the lifecycle and prove durability.

Work:

- add contextual Home Actions and suppress passive cards;
- update Home Records, Timeline, Material, Continuity, and Sale cross-links;
- standardize record truth, sensitivity, freshness, access, and limitation
  language;
- complete responsive, accessibility, keyboard, and screen-reader behavior;
- add integrity, broken-link, extraction-review, handoff, access, and purge
  operational dashboards;
- add source/provider kill switches;
- run privacy, security, commercial, and disclosure reviews;
- define incident response and recovery drills;
- remove obsolete models/routes after acceptance; and
- update functional, product, support, privacy, and operational documentation.

**Exit gate:** The record remains retrievable, understandable, protected, and
useful through capture, active ownership, handoff, and transition.

---

## 9. Detailed Engineering Plan

### 9.1 Backend

- Create a `homeRecords` domain for record/version/link/extraction/retention and
  integrity policy.
- Replace uploader-only document authorization with property access plus
  record-level sensitivity.
- Add a typed link registry rather than more nullable foreign keys or string
  arrays.
- Make upload creation idempotent by content hash and explicit version intent.
- Add malware scan and quarantine state.
- Add extraction candidate adapters per document family.
- Promote confirmed candidates through domain services, never direct generic
  writes.
- Add outbox-driven object purge after database eligibility is committed.
- Add common handoff package/access services or extend Property Brief services.
- Add immutable package revision assembly.
- Refactor Digital Will to use the common handoff service.
- Refactor Seller Prep into one property Sale Case and canonical action
  projections.
- Route commercial requests through Providers/Bookings.
- Add transition policy and successor-safe projections.

### 9.2 Frontend

- Rebuild Document Vault as task-oriented Home Records.
- Add review, version, link, sensitivity, retention, trash, and restore flows.
- Add record-use backlinks and contextual missing-record prompts.
- Add Material detail and lifecycle UI.
- Replace Digital Will completion dashboards with handoff readiness and tested
  access.
- Build recipient invite/accept/access experiences.
- Replace Seller Prep dashboard with one next-step sale journey.
- Build record/package selection and recipient preview.
- Add closing transition decisions.
- Reuse common truth, evidence, source, sensitivity, and access components.

### 9.3 Storage and workers

- scan every file before normal availability;
- compute integrity metadata;
- generate OCR/previews as derived versions;
- run extraction without logging document content;
- schedule record review/expiry reminders;
- verify evidence-link integrity;
- expire access grants and download links;
- process trash purge only after hold/evidence checks;
- generate immutable handoff package snapshots;
- deliver recipient invitations and access notifications; and
- monitor object/database consistency and recovery.

### 9.4 Data model and schema

Direct Prisma schema changes are expected. No migration scripts or backfills
are required.

Preferred cleanup:

- replace the current generic `Document` ownership/relationship contract with
  property record, version, and link models;
- remove obsolete single-parent and uploader-ownership assumptions;
- remove string-array document references from Material Specs;
- remove mutable Digital Will access labels that are not real grants;
- repurpose or remove Digital Will section/entry/contact models after package
  acceptance;
- replace per-user Seller Prep plans and static items with property Sale Case
  and canonical work references;
- remove unsupported Seller Prep lead models or replace them with canonical
  commercial request entities;
- preserve strong Home Event evidence/revision models; and
- reuse Property Brief share/access concepts rather than creating a separate
  token system for every package purpose.

Do not retain old tables solely for compatibility.

### 9.5 API contracts

Recommended property-scoped contracts:

```text
GET    /api/properties/:propertyId/records
POST   /api/properties/:propertyId/records
GET    /api/properties/:propertyId/records/:recordId
POST   /api/properties/:propertyId/records/:recordId/versions
POST   /api/properties/:propertyId/records/:recordId/links
DELETE /api/properties/:propertyId/records/:recordId/links/:linkId
POST   /api/properties/:propertyId/records/:recordId/extractions/:candidateId/review
POST   /api/properties/:propertyId/records/:recordId/archive
POST   /api/properties/:propertyId/records/:recordId/trash
POST   /api/properties/:propertyId/records/:recordId/restore
GET    /api/properties/:propertyId/records/readiness

POST   /api/properties/:propertyId/handoffs
GET    /api/properties/:propertyId/handoffs/:handoffId/preview
POST   /api/properties/:propertyId/handoffs/:handoffId/publish
POST   /api/properties/:propertyId/handoffs/:handoffId/recipients
POST   /api/handoff-invitations/:token/accept
GET    /api/handoff-access/:grantToken
POST   /api/properties/:propertyId/handoffs/:handoffId/grants/:grantId/revoke
GET    /api/properties/:propertyId/handoffs/:handoffId/access-events

POST   /api/properties/:propertyId/sale-cases
GET    /api/properties/:propertyId/sale-cases/current
PATCH  /api/properties/:propertyId/sale-cases/:caseId
GET    /api/properties/:propertyId/sale-cases/:caseId/readiness
POST   /api/properties/:propertyId/sale-cases/:caseId/buyer-package
POST   /api/properties/:propertyId/sale-cases/:caseId/transitions
```

Every record response should include:

- property and access scope;
- record type and sensitivity;
- lifecycle and effective period;
- current version and integrity state;
- review/verification state;
- domain/evidence links;
- review/expiry/retention state;
- allowed actions for the current user; and
- impact of archive/trash/delete.

---

## 10. Acceptance Criteria

### 10.1 Records and evidence

- [ ] Property-scoped listing returns only records the user may access for that
      property.
- [ ] Household viewers can read permitted records but cannot mutate them.
- [ ] Contributors and owners follow explicit mutation floors.
- [ ] Every original has SHA-256, object metadata, scan state, uploader, and
      immutable version identity.
- [ ] Duplicate content is detected.
- [ ] A replacement file creates a new version rather than overwriting history.
- [ ] One record can support multiple domain entities.
- [ ] Extracted fields are candidates with citations and review state.
- [ ] No unreviewed candidate creates or changes a canonical record.
- [ ] Raw document content is absent from logs and analytics.
- [ ] Trash is reversible until purge eligibility.
- [ ] Sole active evidence cannot be purged without an explicit impact
      resolution.
- [ ] Object purge cannot leave a live database version pointing to a missing
      object.

### 10.2 Timeline

- [ ] Uploading a generic file does not create a property-history event.
- [ ] Confirming an underlying event can create one idempotent Timeline event.
- [ ] Event evidence points to the correct record version.
- [ ] Removing evidence updates the event trust state or requires replacement.
- [ ] Resale/successor projection is explicit and separate from household
      visibility.
- [ ] Private seller history is not inherited by a buyer.
- [ ] Handoff packages reference canonical event revisions.

### 10.3 Home Continuity Plan

- [ ] A contact label alone never counts as access.
- [ ] A recipient must be invited and accept before the plan is ready.
- [ ] Recipient identity is bound to the grant.
- [ ] Access is limited to the previewed scope.
- [ ] Emergency-only access cannot read other sections/items.
- [ ] Grants can start, expire, and be revoked.
- [ ] Every access is logged.
- [ ] The owner can test access.
- [ ] Published revisions are immutable.
- [ ] Material updates require explicit republish/recipient notification policy.
- [ ] Stale critical information creates a review need.
- [ ] The experience states that it grants information access, not legal
      authority.

### 10.4 Material Specs

- [ ] Photo/label extraction requires field confirmation.
- [ ] Exact-match language appears only when identity evidence supports it.
- [ ] As-built identity cannot be silently overwritten.
- [ ] Substitutions retain lineage.
- [ ] Receipt, warranty, manual, approval, and installation evidence use common
      typed record links.
- [ ] Duplicate room/surface records are flagged.
- [ ] Repair/reorder output distinguishes current, stale, discontinued, and
      alternate source state.
- [ ] Professional sharing uses a scoped expiring package.

### 10.5 Sale readiness and transition

- [ ] No Sale Case is created before confirmed sale intent.
- [ ] One property Sale Case is shared under household roles.
- [ ] Seller work references canonical Home Actions/Projects.
- [ ] Marking work complete does not infer spend or value.
- [ ] No generic static ROI/uplift is presented as property-specific.
- [ ] Buyer/agent packages show included and excluded records.
- [ ] Sensitive records are excluded by default.
- [ ] Closing/ownership change requires verification and explicit decisions.
- [ ] Buyer access does not confer seller account access.
- [ ] Seller retention policy is recorded.
- [ ] Temporary professional access is revoked as configured.

### 10.6 Commercial integrity

- [ ] No provider CTA appears without a working fulfillment path.
- [ ] Property access is verified before a request is created.
- [ ] Contact information submitted by the user is stored and used only under
      explicit consent.
- [ ] Recipient/provider identity and purpose are disclosed.
- [ ] Referral or compensation terms are disclosed.
- [ ] Licensing/verification claims include review source and freshness.
- [ ] Response-time claims are backed by an SLO.
- [ ] The user can withdraw the request and consent where applicable.

---

## 11. Test Strategy

### 11.1 Unit tests

- record sensitivity and role policy;
- content-hash duplicate/version detection;
- extraction promotion gates;
- evidence-link eligibility;
- archive/trash/purge policy;
- handoff item scope and redaction;
- invitation/grant lifecycle;
- continuity readiness calculation;
- material exact-match and lifecycle policy;
- sale-readiness projection;
- successor-safe event projection; and
- commercial consent requirements.

### 11.2 Contract tests

- upload scan/integrity responses;
- property and household authorization;
- record version APIs;
- extraction review and promotion;
- typed evidence links;
- package snapshot immutability;
- invitation acceptance and grant access;
- expiry and revoke;
- Timeline evidence/version references;
- old-route redirects;
- provider request consent; and
- capability inventory validation.

### 11.3 Integration scenarios

1. Owner uploads a roof invoice; contributor can find it, viewer can read it,
   and unauthorized user cannot.
2. The same invoice links to a project, expense, warranty, material record, and
   Timeline repair event without creating five file copies.
3. A duplicate upload is offered as a possible new version.
4. AI misreads a warranty expiration; homeowner corrects it before promotion.
5. Smart Upload analysis fails; the original remains stored and manually
   classifiable.
6. A verified evidence document is moved to trash; purge is blocked until the
   evidence relationship is resolved.
7. A newer policy supersedes an older version while history remains available.
8. A continuity recipient accepts emergency-only access and cannot read policy
   or private notes outside the grant.
9. Owner changes a critical instruction; old published revision remains
   auditable and recipient receives the governed update.
10. A recipient grant expires and access fails thereafter.
11. A project installs a substituted tile; original, substitution, receipt,
    lot, and leftover location remain linked.
12. Confirmed sale intent creates one household Sale Case and canonical actions.
13. A generic seller task marked done does not create expense or value.
14. Buyer package excludes claims and household notes by default.
15. Verified closing delivers a snapshot without transferring the seller
    account.
16. A provider request cannot be submitted without access and consent.

### 11.4 End-to-end journeys

- scan receipt → review extracted fields → link material/project/warranty →
  confirm work event → retrieve during repair;
- upload inspection → review findings → canonical actions → selected Timeline
  outcomes → sale package;
- build Continuity Plan → select records → invite recipient → accept/test →
  access → update → revoke;
- confirm sale intent → resolve canonical blockers → prepare records → preview
  buyer package → verified closing → handoff; and
- trash record → evidence impact → restore or replace → eligible purge.

---

## 12. Measurement

### 12.1 North-star outcome

> Percentage of important home record needs that result in a reviewed,
> retrievable record or a successfully tested, recipient-safe handoff without
> duplicate truth or privacy leakage.

### 12.2 Product metrics

- successful task-oriented record retrieval;
- time to find a known record;
- extraction candidate review/correction rate;
- canonical promotion rate after review;
- records reused across two or more valid workflows;
- critical record readiness by active journey;
- Timeline events with linked reviewed evidence;
- material records retrieved at repair/reorder time;
- continuity recipients invited, accepted, and access-tested;
- stale continuity items corrected;
- sale blockers resolved through canonical work;
- buyer packages previewed and accepted; and
- successful verified transitions.

### 12.3 Trust, privacy, and reliability metrics

- cross-property/cross-household access incidents;
- raw-sensitive-content logging incidents;
- malware quarantine rate;
- object/database integrity mismatch rate;
- duplicate object rate;
- broken evidence-link rate;
- unreviewed canonical-write incidents;
- trash restore and blocked-purge rate;
- failed/revoked/expired access events;
- over-broad handoff findings;
- sensitive buyer-package inclusion findings;
- commercial consent/fulfillment mismatch incidents; and
- recovery SLO attainment.

### 12.4 Metrics to retire

- total files uploaded as a success metric;
- AI analyzed count;
- Digital Will completion percentage;
- trusted contacts added without acceptance;
- Timeline replay duration as primary value;
- Material Specs export count without downstream use;
- Seller Prep plan created;
- checklist items marked done without evidence;
- inferred seller spend;
- estimated uplift from task count; and
- provider lead submitted without fulfillment.

---

## 13. Rollout and Operational Governance

### 13.1 Launch order

1. Trust/commercial containment.
2. Capability and naming decisions.
3. Property-owned record/version/evidence foundation.
4. Safe extraction review.
5. Retrieval, trash, retention, and integrity operations.
6. Material Specs integration.
7. Timeline evidence integration.
8. One internal/household Continuity Plan pilot.
9. Recipient access pilot with low-sensitivity content.
10. Sale Readiness case.
11. Buyer handoff pilot.
12. Provider commercial workflow only after governance approval.

The lower portfolio urgency does not justify weak privacy or false promises.
Trust containment is immediate; broader convenience and transition scope can
follow the higher-priority product families.

### 13.2 Launch gates

Records foundation requires:

- property/household authorization tests;
- malware and file-integrity checks;
- extraction review gates;
- recovery and restore test;
- evidence-safe purge;
- sensitive logging audit; and
- storage/object consistency monitoring.

Recipient handoff requires:

- threat model;
- identity and authentication policy;
- item-level authorization tests;
- expiration/revoke tests;
- access logging;
- privacy review;
- recipient-support and recovery path; and
- incident response.

Sale transition requires:

- seller/buyer privacy policy;
- disclosure/legal-content review;
- closing verification policy;
- seller retention policy;
- successor-safe projection tests; and
- explicit household authorization.

Commercial assistance requires:

- real provider supply;
- licensing/verification process;
- consent and compensation disclosure;
- data-processing terms;
- fulfillment SLO;
- withdrawal/deletion flow; and
- complaint/escalation ownership.

### 13.3 Rollback

- disable AI extraction promotion while retaining originals;
- quarantine a parser/version without deleting confirmed facts;
- disable new handoff invitations while preserving revoke/access audit;
- revoke compromised grants;
- stop buyer package delivery without changing canonical records;
- disable commercial CTAs without deleting Sale Cases; and
- preserve Timeline and verified domain records when a source or presentation
  feature is rolled back.

---

## 14. Documentation Updates

Implementation must update:

- capability inventory, relationships, safety, completion, and discovery rules;
- Document Vault/Home Records functional documentation;
- `HOME_TIMELINE.md` for evidence-version and transition projection semantics;
- `HOME_DIGITAL_WILL.md` to the Home Continuity Plan contract;
- `MATERIAL_SPEC_REGISTRY.md` for common evidence and recipient sharing;
- Seller Prep functional documentation;
- Property Brief/handoff package documentation;
- household collaboration and property-access documentation;
- file security, malware, retention, trash, recovery, and purge runbooks;
- extraction/provider/model governance;
- privacy and recipient-access policy;
- sale/ownership transition policy;
- provider commercial-integrity and consent policy;
- analytics taxonomy; and
- support and incident-response documentation.

---

## 15. Final Portfolio Disposition

| Capability | Decision | Independent destination? | Revisit value |
| --- | --- | --- | --- |
| Document Vault | Rebuild as Home Records evidence foundation | Yes, for retrieval/review; also embedded everywhere evidence is used | Missing, stale, expiring, unreviewed, or actively needed record |
| Home Timeline | Preserve as canonical property history | Yes | New event, evidence, correction, milestone, recap, or handoff |
| Home Digital Will | Rename/rebuild as Home Continuity Plan | Yes, as purpose-specific handoff composer and access manager | Stale critical data, changed package, grant event, or access test |
| Material Specs | Double down as structured as-built record | Focused search/detail plus contextual embedding | Project closeout, repair, reorder, care, or professional handoff |
| Seller Prep | Reposition as Sale Readiness and Handoff | Yes, only during confirmed sale journey | Stage change, blocker, deadline, record gap, package, or closing transition |

The best-in-class result is one durable continuity loop:

```text
Capture an original
  → review extracted candidates
  → link evidence to canonical facts and events
  → retrieve it at the moment of need
  → keep it current and recoverable
  → select a purpose-specific handoff
  → grant, audit, expire, or revoke recipient access
  → preserve the right history through household or ownership transition
```

That loop makes the record valuable long before a sale and more valuable at
every transition. It also gives each existing capability a clear reason to
exist without allowing any of them to become a competing Home Record,
Timeline, action list, access system, or source of truth.
