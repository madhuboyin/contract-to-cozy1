# Ask Cozy Conversational UI — Comprehensive Review

**Date:** 2026-10-16  
**Scope:** Exclusive review of the Ask Cozy conversational UI (`/dashboard/ask` and `apps/frontend/src/components/ask/**`), covering the landing & discovery surface, composer & input mechanics, multi-turn conversation stream, answer block presentation & visual consistency, interactive conversational workflows, and thread/session history management.  
**Out of Scope:** Transition/routing from the traditional Desktop UI to Ask Cozy (tracked separately).

---

## 1. Executive Summary

Ask Cozy is built on strong conversational foundations that go well beyond a generic text chatbot:
- **Governed Block Registry ([`BlockView`](../../apps/frontend/src/components/ask/blocks/registry.tsx)):** Compile-time exhaustive renderer mapping across 30+ structured block types with graceful runtime fallback (`UnsupportedBlock`).
- **Progressive Conversational Capture ([`ConversationalCapture.tsx`](../../apps/frontend/src/components/ask/calm/ConversationalCapture.tsx)):** One-question-at-a-time inline parameter collection with single-tap chips, optional skips, and editable prior-answer pills.
- **Safe, Versioned Mutations ([`ConfirmationCard`](../../apps/frontend/src/components/ask/workspace/CaptureCards.tsx)):** Inline field editing, automatic consent reset on edit, idempotency keys per confirmation version, and network-drop reconciliation (`PendingOutcomeCard`).
- **Calm Presentation Anatomy ([`calmAnswers.ts`](../../apps/frontend/src/features/ask/calmAnswers.ts)):** Warm editorial canvas (`#faf9f6`), frameless domain lists (`FRAMELESS_LISTS`), answer-first summary headlines, and a quiet provenance trust line (`Based on N sources, latest...`).

At the same time:
- **Static code inspection** across the frontend and backend presentation layer identified **17 concrete UX, visual-consistency, and wiring gaps** (Section 2).
- **Live browser observation** across **79 total turns in 2 production sessions** on `https://contracttocozy.com/dashboard/ask` (property `94 Ashford Dr`, viewport `1658 × 749`; Session 1 Turns 1–63 and Session 2 Turns 1–16) uncovered **28 distinct live runtime, auth, workflow, data-consistency, layout, and formatting issues**—including **9 critical (`P0`) issues**—that only manifest with real viewport geometry, live property data, and multi-step workflow execution (Section 3).

---

## 2. Layer-by-Layer Findings (Static Code Review)

### 2.1 Landing & Discovery Surface
**Files:** [`CalmLanding.tsx`](../../apps/frontend/src/components/ask/calm/CalmLanding.tsx), [`ExploreWithCozy.tsx`](../../apps/frontend/src/components/ask/workspace/ExploreWithCozy.tsx), [`AskWorkspace.tsx`](../../apps/frontend/src/components/ask/AskWorkspace.tsx)

#### Strengths
- **State-First Opening ([`AskWorkspace.tsx:396`](../../apps/frontend/src/components/ask/AskWorkspace.tsx#L396)):** Opens with a home-state headline (`buildConciergeStateStrip(concierge.view).opening`) and two deterministic priority partitions (`Needs attention` and `Plan ahead` in [`CalmLanding.tsx:75-88`](../../apps/frontend/src/components/ask/calm/CalmLanding.tsx#L75-L88)), each with an inline `"Why this appeared"` disclosure (`data-why-toggle`).
- **Prompt Deduplication ([`CalmLanding.tsx:48-52`](../../apps/frontend/src/components/ask/calm/CalmLanding.tsx#L48-L52)):** Drops starter questions that duplicate priority strip chips or urgent prompts.
- **View-State Capability Exploration ([`ExploreWithCozy.tsx:72-124`](../../apps/frontend/src/components/ask/workspace/ExploreWithCozy.tsx#L72-L124)):** `useExploreFocus` treats topic browsing as pure view state with clean browser `Back`/`Forward` history integration and scroll/focus restoration.

#### Gaps & Recommendations
1. **Empty Boxed Cards Below the Composer ([`CalmLanding.tsx:95-143`](../../apps/frontend/src/components/ask/calm/CalmLanding.tsx#L95-L143)):**
   - **Evidence:** Below the hero composer and starter pills, `CalmLanding` unconditionally renders a two-column section (`Decisions to make` and `Active major moment`) even when `view.homeContinuity.decisions.length === 0` and `!view.homeContinuity.activeMajorMoment`. Users see two large bordered cards reading *"No decisions need your attention."* and *"No major project or guided plan is active."*
   - **Recommendation:** Hide the `Decisions and active work` section when both partitions are empty, or collapse single-partition empty states so the calm landing page remains uncluttered.
2. **Misleading Empty-Home / No-Property Copy ([`CalmLanding.tsx:81`](../../apps/frontend/src/components/ask/calm/CalmLanding.tsx#L81)):**
   - **Evidence:** When `!loading && (failed || !strip)` (which also occurs when `selectedPropertyId` is unset because a user has no property configured), line 81 renders: *"Your home overview is temporarily unavailable. You can still ask anything above."*
   - **Recommendation:** Distinguish `!selectedPropertyId` (no home selected/added) from `failed` (API error). When no property exists, render a welcoming onboarding prompt instead of an outage message.
3. **Unindicated Horizontal Overflow on Starter Pills ([`CalmLanding.tsx:18, 90-94`](../../apps/frontend/src/components/ask/calm/CalmLanding.tsx#L90-L94)):**
   - **Evidence:** `ROW` uses `flex flex-nowrap gap-2 overflow-x-auto pb-1 [scrollbar-width:none]`. On desktop pointer devices without horizontal scrolling, overflowing starter pills and the trailing capability explorer chip (`children`) are clipped without a scroll button, fade mask, or wrap option.
   - **Recommendation:** Allow starter pills to wrap up to 2 lines on desktop (`sm:flex-wrap`) or add horizontal scroll affordances/fade masks.

---

### 2.2 Composer & Input Mechanics
**Files:** [`AskWorkspace.tsx`](../../apps/frontend/src/components/ask/AskWorkspace.tsx), [`useAskRequest.ts`](../../apps/frontend/src/components/ask/workspace/useAskRequest.ts), [`useComposerKeys.ts`](../../apps/frontend/src/components/ask/workspace/useComposerKeys.ts), [`VoiceInputButton.tsx`](../../apps/frontend/src/components/ask/VoiceInputButton.tsx), [`AttachEvidenceControl.tsx`](../../apps/frontend/src/components/ask/AttachEvidenceControl.tsx)

#### Strengths
- **Draft Persistence:** Automatically saves and restores drafts in `localStorage` scoped by `(propertyId, sessionId)` (`draftStorageKey`).
- **IME Safety ([`useComposerKeys.ts`](../../apps/frontend/src/components/ask/workspace/useComposerKeys.ts)):** Guards `Enter` submission with `isComposingRef` so CJK/IME composition never triggers accidental sends.
- **Non-Destructive Voice Dictation ([`VoiceInputButton.tsx:37`](../../apps/frontend/src/components/ask/VoiceInputButton.tsx#L37)):** Merges interim speech recognition transcripts into the existing composer text via `mergeDictation` without auto-submitting.

#### Gaps & Recommendations
1. **Textarea Does Not Auto-Grow on Multi-Line Input ([`AskWorkspace.tsx:304-305`](../../apps/frontend/src/components/ask/AskWorkspace.tsx#L304-L305)):**
   - **Evidence:** The composer `<textarea>` sets `rows={1}` and `max-h-48`, but has no `scrollHeight` auto-resize effect when `input` changes. Multi-sentence questions or voice dictations scroll inside a 1-line box (`min-h-10`). In addition, the calm hero wrapper uses `rounded-full items-center` (`line 304`), which distorts if the textarea grows taller.
   - **Recommendation:** Auto-adjust `textareaRef.current.style.height` on `input` change (capped at `12rem` / `max-h-48`) and switch the calm hero container from `rounded-full items-center` to `rounded-3xl items-end` when multi-line.
2. **File/Photo Attachment Is Missing on New Turns & General Questions ([`AskWorkspace.tsx:223, 306-308`](../../apps/frontend/src/components/ask/AskWorkspace.tsx#L306-L308)):**
   - **Evidence:** `AttachEvidenceControl` only renders when `deriveComposerAffordances(latestExecution)` returns a single deterministic target (`HOME_EVENT`, `INVENTORY_ITEM`, or `WARRANTY`). On the hero landing composer (`executions.length === 0`) or during general questions, there is no paperclip button, drag-and-drop zone, or clipboard image paste (`onPaste`).
   - **Recommendation:** Offer a universal attachment button (plus drag-and-drop and clipboard paste) in both hero and footer composers so homeowners can upload photos (leaks, serial plates, inspection findings) or PDFs (quotes, warranties, invoices) on any turn.
3. **User-Initiated "Stop" Displays a Red Error Banner ([`useAskRequest.ts:182`](../../apps/frontend/src/components/ask/workspace/useAskRequest.ts#L182), [`AskWorkspace.tsx:302-303`](../../apps/frontend/src/components/ask/AskWorkspace.tsx#L302-L303)):**
   - **Evidence:** Clicking the `Stop` button (`stopAsking()`) sets `error` to `'Stopped. If the request had already reached Ask, its answer may still appear in your history.'`, which [`AskWorkspace.tsx:302`](../../apps/frontend/src/components/ask/AskWorkspace.tsx#L302) renders inside a red `bg-red-50 text-red-700` alert box with `<AlertTriangle />` and a `"Try again"` button.
   - **Recommendation:** Separate user cancellation from request failure. Restore the draft to the composer quietly (or show a neutral muted status note) rather than rendering a red error alert, and pass an `AbortSignal` to cancel the in-flight HTTP request.

---

### 2.3 Conversation Stream & Turn Anatomy
**Files:** [`ExecutionCard.tsx`](../../apps/frontend/src/components/ask/workspace/ExecutionCard.tsx), [`PendingTurn.tsx`](../../apps/frontend/src/components/ask/calm/PendingTurn.tsx), [`FollowUpRow.tsx`](../../apps/frontend/src/components/ask/calm/FollowUpRow.tsx), [`PinnedResultsStrip.tsx`](../../apps/frontend/src/components/ask/PinnedResultsStrip.tsx)

#### Strengths
- **Layout-Stable Pending State ([`PendingTurn.tsx:18-31`](../../apps/frontend/src/components/ask/calm/PendingTurn.tsx#L18-L31)):** Immediately renders the user's question bubble, reserves the `1.6rem` action gap, and displays timed progress copy (`SLOW_AFTER_MS`, `STILL_WORKING_AFTER_MS`) with reduced-motion-safe skeleton bars.
- **Superseded Turn Collapsing ([`ExecutionCard.tsx:258-274`](../../apps/frontend/src/components/ask/workspace/ExecutionCard.tsx#L258-L274)):** Filter refinements collapse the superseded turn's body behind `"Earlier version of this answer · show"` while keeping the original question bubble in the transcript.
- **Docked Follow-Up Chips ([`FollowUpRow.tsx`](../../apps/frontend/src/components/ask/calm/FollowUpRow.tsx)):** Keeps governed follow-up suggestions docked above the footer composer with pending-chip spinner feedback and `"Not now"` / `"Not relevant"` dismissal controls.

#### Gaps & Recommendations
1. **Horizontal Zig-Zagging of User Question Bubbles Across Turns ([`ExecutionCard.tsx:168, 263, 277, 285`](../../apps/frontend/src/components/ask/workspace/ExecutionCard.tsx#L277-L285)):**
   - **Evidence:** Each `<article>` in the transcript sets its own max-width (`narrow`, `standard`, or `wide` via `askAnswerWidthClass(answerWidth)`), and the right-aligned user question bubble (`ml-auto w-fit max-w-[88%]`) sits inside that `<article>`. When a `narrow` text turn is followed by a `wide` comparison or table turn, the right edge of the user's question bubbles shifts horizontally between turns.
   - **Recommendation:** Keep the user question bubble aligned to a consistent conversation column width across all turns, and apply `askAnswerWidthClass(answerWidth)` only to the assistant response container.
2. **Permanent `"Change and resend"` Visual Clutter ([`ExecutionCard.tsx:286`](../../apps/frontend/src/components/ask/workspace/ExecutionCard.tsx#L286)):**
   - **Evidence:** Every turn in the conversation permanently renders a `"Change and resend"` button beneath the user's question bubble (`<div className="flex justify-end"><button ...>Change and resend</button></div>`). In a 10-turn conversation, this repeats 10 times down the transcript.
   - **Recommendation:** Show `"Change and resend"` on hover or keyboard focus (`opacity-0 group-hover:opacity-100 focus-within:opacity-100`) on desktop, or tuck it into a compact edit icon beside the bubble.
3. **No Floating `"Jump to latest"` Affordance When Scrolled Up ([`AskWorkspace.tsx:379`](../../apps/frontend/src/components/ask/AskWorkspace.tsx#L379)):**
   - **Evidence:** `conversationScrollRef` auto-scrolls on new turn submission (`lines 165–175`), and [`PinnedResultsStrip.tsx:12-16`](../../apps/frontend/src/components/ask/PinnedResultsStrip.tsx#L12-L16) scrolls up to pinned turns, but there is no floating button to return to the bottom of a long conversation once scrolled up.
   - **Recommendation:** Track scroll offset from the bottom of `conversationScrollRef` and show a floating pill (`"Jump to latest ↓"`) above the footer composer when scrolled up more than one viewport height.

---

### 2.4 Answer Presentation, Visual Consistency & Collection Truthfulness
**Files:** [`calmAnswers.ts`](../../apps/frontend/src/features/ask/calmAnswers.ts), [`CoreBlocks.tsx`](../../apps/frontend/src/components/ask/blocks/CoreBlocks.tsx), [`GroupedListBlock.tsx`](../../apps/frontend/src/components/ask/blocks/GroupedListBlock.tsx), [`PatternParts.tsx`](../../apps/frontend/src/components/ask/patterns/PatternParts.tsx), [`SeasonalPlanResultList.tsx`](../../apps/frontend/src/components/ask/SeasonalPlanResultList.tsx), [`MaintenanceResultList.tsx`](../../apps/frontend/src/components/ask/MaintenanceResultList.tsx), [`WarrantyResultList.tsx`](../../apps/frontend/src/components/ask/WarrantyResultList.tsx)

#### Strengths
- **Responsive Mobile Tables ([`TableBlock.tsx`](../../apps/frontend/src/components/ask/blocks/TableBlock.tsx)):** Automatically adapts 3+ column comparison tables into stacked labeled cards below `sm` while preserving semantic `<table>` markup on larger viewports.
- **Calm Summary & Provenance Trust Line ([`CoreBlocks.tsx:25-41`](../../apps/frontend/src/components/ask/blocks/CoreBlocks.tsx#L25-L41), [`EvidenceContextPanel.tsx:118-153`](../../apps/frontend/src/components/ask/EvidenceContextPanel.tsx#L118-L153)):** Adopted domains render clean display typography (`text-[22px] sm:text-[26px]`), thin left tone rules (`CALM_TONE_RULE`), and a single provenance link (`Based on N sources, latest...`) that opens the context sheet/panel.

#### Gaps & Recommendations
1. **Mid-Thread Visual Split-Brain Between Calm-Adopted and Non-Adopted Domains ([`calmAnswers.ts:44-63`](../../apps/frontend/src/features/ask/calmAnswers.ts#L44-L63), [`CoreBlocks.tsx:43-64, 156-161`](../../apps/frontend/src/components/ask/blocks/CoreBlocks.tsx#L43-L64)):**
   - **Evidence:** While `calmChrome` is on by default for the workspace, `isCalmAdopter(execution)` only returns `true` for 8 specific block types/IDs (`maintenance-groups`, `inventory-results`, `warranty-results`, `incident-claim-list`, `home-event-radar-feed`, `document-lookup-groups`, focused `property-rooms`, `property-completeness`, `home-actions-priority-list`, and `property-summary` synthesis). Furthermore:
     - [`SummaryBlock`](../../apps/frontend/src/components/ask/blocks/CoreBlocks.tsx#L46-L47) bypasses `CalmSummary` for `isSeasonalIntroBlockId` and `SEASONAL_NEXT_STEPS_BLOCK_IDS`.
     - [`MetricRowBlock`](../../apps/frontend/src/components/ask/blocks/CoreBlocks.tsx#L156-L161), [`ProactiveInsightBlock`](../../apps/frontend/src/components/ask/blocks/CoreBlocks.tsx#L78-L94), and [`DecisionBlocks.tsx`](../../apps/frontend/src/components/ask/blocks/DecisionBlocks.tsx) always render heavy bordered cards regardless of `useCalmChrome()`.
   - **Recommendation:** Unify all block renderers under the Calm visual language so multi-turn conversations across financial decisions, seasonal plans, and maintenance do not switch design systems mid-thread.
2. **`<CollectionStatusNote>` Missing from `PatternFrame` and 8 Specialized List Renderers:**
   - **Evidence:** `<CollectionStatusNote collection={block.collection} />` is only imported and rendered in [`GroupedListBlock.tsx`](../../apps/frontend/src/components/ask/blocks/GroupedListBlock.tsx#L361) (`GenericGroupedListBlock` and `home-event-radar-feed`) and [`StatusAccordionView.tsx`](../../apps/frontend/src/components/ask/patterns/StatusAccordionView.tsx#L88).
   - It is **never rendered** in:
     - [`PatternFrame`](../../apps/frontend/src/components/ask/patterns/PatternParts.tsx#L143-L187) (affecting `ChoiceGridView`, `BudgetBreakdownView`, `ShelvesView`, `DeckView`, and `RoomMapView`)
     - [`SeasonalPlanResultList.tsx`](../../apps/frontend/src/components/ask/SeasonalPlanResultList.tsx) (even though [`seasonalHomeCare.ts:269`](../../apps/backend/src/services/ask/support/seasonalHomeCare.ts#L269) attaches `collection: collectionDescriptor(...)`; while prose truncation is still mentioned in the `SUMMARY` block body at line 265, the structured collection note on the list block is dropped)
     - [`MaintenanceResultList.tsx`](../../apps/frontend/src/components/ask/MaintenanceResultList.tsx), [`InspectionFindingResultList.tsx`](../../apps/frontend/src/components/ask/InspectionFindingResultList.tsx), [`SellerPrepItemResultList.tsx`](../../apps/frontend/src/components/ask/SellerPrepItemResultList.tsx), [`BuyerTaskResultList.tsx`](../../apps/frontend/src/components/ask/BuyerTaskResultList.tsx), [`ClaimResultList.tsx`](../../apps/frontend/src/components/ask/ClaimResultList.tsx), and [`ReserveAllocationResultList.tsx`](../../apps/frontend/src/components/ask/ReserveAllocationResultList.tsx)
     - [`WarrantyResultList.tsx:203`](../../apps/frontend/src/components/ask/WarrantyResultList.tsx#L203) (which renders its own custom `+N more warranties...` string instead of the shared `<CollectionStatusNote>`).
   - **Recommendation:** Render `<CollectionStatusNote collection={block.collection} />` inside `PatternFrame` and all specialized grouped-list views.
3. **`MaintenanceResultList.tsx` Bypasses `sectionHasNextPage(block, section)` ([`MaintenanceResultList.tsx:427, 431, 488, 492`](../../apps/frontend/src/components/ask/MaintenanceResultList.tsx#L427-L492)):**
   - **Evidence:** Unlike `InventoryResultList`, `DocumentResultList`, and `HomeEventResultList` (which use `sectionHasNextPage(block, section)` from [`collectionStatus.ts`](../../apps/frontend/src/features/ask/collectionStatus.ts#L24-L27)), `MaintenanceResultList.tsx` still checks `offset + section.items.length < section.count` directly and ignores `block.collection?.nextPageAvailable === false`.
   - **Recommendation:** Replace the raw `offset + section.items.length < section.count` checks in `MaintenanceResultList.tsx` with `sectionHasNextPage(block, section)`.
4. **Standard Non-Dense List Rows Lack Action Overflow Capping ([`GroupedListBlock.tsx:301-318`](../../apps/frontend/src/components/ask/blocks/GroupedListBlock.tsx#L301-L318)):**
   - **Evidence:** While `dense` rows (`lines 250–276`) and `project-detail-records` (`lines 319–329`) cap inline item actions to 2 buttons + a `"More"` disclosure, standard non-dense rows in `GenericGroupedListBlock` (`lines 301–318`) render every `item.actions` entry inline without a cap. Additionally, [`evaluatePresentationQuality.ts:15-33`](../../apps/backend/src/services/ask/presentation/evaluatePresentationQuality.ts#L15-L33) only checks `block.actions` for `MULTIPLE_PRIMARY_ACTIONS`, ignoring item-level action collisions.
   - **Recommendation:** Apply the 2-action + `"More"` overflow cap to standard non-dense rows in `GenericGroupedListBlock` and extend `evaluatePresentationQuality` to check item-level primary action density.

---

### 2.5 Interactive Conversational Flows (Captures, Clarifications & Confirmations)
**Files:** [`ConversationalCapture.tsx`](../../apps/frontend/src/components/ask/calm/ConversationalCapture.tsx), [`CaptureCards.tsx`](../../apps/frontend/src/components/ask/workspace/CaptureCards.tsx)

#### Strengths
- **Step-by-Step Conversational Capture ([`ConversationalCapture.tsx`](../../apps/frontend/src/components/ask/calm/ConversationalCapture.tsx)):** Displays prior answers as editable chips (`Your answers so far`), auto-focuses the new question heading (`[data-capture-question]`) for screen readers without drawing a jarring ring on the first chip, and prevents auto-resubmission on restored drafts until the user interacts (`interacted` state at line 36).
- **Access-Loss Redaction ([`CaptureCards.tsx:208, 228, 244`](../../apps/frontend/src/components/ask/workspace/CaptureCards.tsx#L208-L244)):** Immediately redacts stale proposals/controls if property access is revoked mid-confirmation.

#### Gaps & Recommendations
1. **CSS `capitalize` Distorts Clarification Option Labels ([`CaptureCards.tsx:107`](../../apps/frontend/src/components/ask/workspace/CaptureCards.tsx#L107)):**
   - **Evidence:** In `ClarificationCard`, option buttons use `className="... capitalize text-slate-800"`. CSS `text-transform: capitalize` Title-Cases Every Word in a multi-word option label (e.g., `"Compare Repair Vs Replace For My Hvac"`), violating the sentence-case typography used everywhere else in Ask Cozy.
   - **Recommendation:** Remove `capitalize` from [`CaptureCards.tsx:107`](../../apps/frontend/src/components/ask/workspace/CaptureCards.tsx#L107).
2. **Mandatory Checkbox + Button Double-Click on All Confirmations ([`CaptureCards.tsx:157, 216`](../../apps/frontend/src/components/ask/workspace/CaptureCards.tsx#L216)):**
   - **Evidence:** `ConfirmationCard` requires the user to first tick a `consent` checkbox (`setConsent(true)`) before the primary `Confirm` button becomes enabled (`if (!consent || saving || expired || editingKey) return`), even for routine, reversible homeowner writes (such as adding a maintenance task or updating a reminder date).
   - **Recommendation:** Reserve the explicit two-step consent checkbox for high-consequence/irreversible mutations, while allowing routine reversible record updates to confirm with a single click on the primary action button.

---

### 2.6 Conversation History & Session Management
**Files:** [`ConversationHistoryNav.tsx`](../../apps/frontend/src/components/ask/workspace/ConversationHistoryNav.tsx), [`CollapsedConversationRail.tsx`](../../apps/frontend/src/components/ask/workspace/CollapsedConversationRail.tsx), [`ConversationSessionRow.tsx`](../../apps/frontend/src/components/ask/ConversationSessionRow.tsx), [`historyRail.ts`](../../apps/frontend/src/features/ask/historyRail.ts)

#### Strengths
- **Complete Session Lifecycle ([`ConversationSessionRow.tsx`](../../apps/frontend/src/components/ask/ConversationSessionRow.tsx)):** Supports pinning (`Pinned` group), archiving (`Archived conversations` view), inline renaming with `Escape` cancel, and explicit delete confirmation that reassures the user that home records created through Ask remain intact.
- **`Needs you` Priority Queue ([`ConversationHistoryNav.tsx:153-161`](../../apps/frontend/src/components/ask/workspace/ConversationHistoryNav.tsx#L153-L161)):** Surfaces up to 2 pending executions requiring user input at the top of the rail.

#### Gaps & Recommendations
1. **Default-Collapsed Rail on Desktop Hides Both History & Live Discovery Indicators ([`historyRail.ts`](../../apps/frontend/src/features/ask/historyRail.ts), [`CollapsedConversationRail.tsx`](../../apps/frontend/src/components/ask/workspace/CollapsedConversationRail.tsx)):**
   - **Evidence:** On the calm landing page, `resolveHistoryRailExpanded` defaults to `false` (rendering the `4.5rem` icon-only `CollapsedConversationRail`). In this collapsed state:
     - Users cannot see their `Needs you` queue, pinned threads, or recent conversations without clicking the `History` icon.
     - Clicking the `Compass` (`Explore with Cozy`) icon in [`AskWorkspace.tsx:374`](../../apps/frontend/src/components/ask/AskWorkspace.tsx#L374) immediately opens `ExploreFocusedView` for the first topic (`HOME_CARE`) rather than showing the topic list and its live status indicators (`"3 need attention"`, `"72% complete"` in [`ExploreWithCozy.tsx:29-35`](../../apps/frontend/src/components/ask/workspace/ExploreWithCozy.tsx#L29-L35)).
   - **Recommendation:** Default the rail to expanded on wide desktop viewports (`xl+`), or have the collapsed `Compass` button expand the rail / open a topic popover so all topics and their live indicators are visible before diving into a single topic.
2. **Always-Visible `MoreHorizontal` Button Crowds Session Titles ([`ConversationSessionRow.tsx:92-121`](../../apps/frontend/src/components/ask/ConversationSessionRow.tsx#L92-L121)):**
   - **Evidence:** Every row in the `17rem` history rail permanently renders a `2rem × 2rem` (`h-8 w-8`) `MoreHorizontal` menu trigger beside the session button, reducing the available width for conversation titles and home labels.
   - **Recommendation:** Reveal the `MoreHorizontal` trigger on row hover, keyboard focus (`group-hover:opacity-100 focus-within:opacity-100`), or when the row is `active`, while keeping it accessible on touch devices.

---

## 3. Live Browser Observation Findings (79 Turns Across 2 Production Sessions)

**Session Context:** Observed live on `https://contracttocozy.com/dashboard/ask` (`propertyId=d8636cd4-003c-4fda-929e-90c0e16312c5` — `94 Ashford Dr`) at a standard laptop viewport (`1658 × 749` px) across **79 total conversational turns** in two sessions:
- **Session 1 (`sessionId=5ef326d2-925e-40ab-b036-362c06ff806c`, Turns 1–63):** Spanned Home Actions, Maintenance, Home Record, Seasonal Care, Risk Assessment, Status Board, Home Score, HOA Setup, Home Event Radar, Plant Advisor, Upgrade Planner, Appliance Oracle, Coverage Gap, Claims, Project Tracker, Seller Prep, Negotiation Shield, Property Briefs, Home Updates, Break-Even Analysis, Sell/Hold/Rent Comparison, Refinance Radar, Home Financing Overview, Service Price Radar, Do-Nothing Simulation, Home Ownership Costs, Property Tax Appeal, Inspection Findings, DIY Projects, Around Your Home, Savings & Benefits, and Home Record Completeness.
- **Session 2 (`sessionId=be6c344a-00bc-4a39-8bf1-2bfca26e5a8d`, Turns 1–16):** Spanned Plan Ahead Home Actions, HVAC Filter Check, Inspection Findings, Age-Related Home Inspection Checklist, Service Price Radar, Emergency Boundary, Coverage Review, Home Risk Replay, Home Habit Coach, and Guided Journeys (`GUIDANCE_JOURNEY_CONTINUE` / `GUIDANCE_STEP_SKIP`).

---

### 3.1 Critical (`P0`) Live Findings

1. **Silent Token Refresh (`POST /api/auth/refresh`) Fails With `401` Under Concurrent Request Load, Booting Active User to `/login?reason=session_expired` After 15 Minutes (Session 1 Turn 49):**
   - **Observed Behavior (`10:51:06 EDT`, while clicking `[Check a quote]`):** The access token cookie (`__Secure-ctc.at`) has a 15-minute TTL (`900s`). When it expired while the user was actively submitting a turn (`reqid=921 POST /api/ask/executions`) alongside background polling (`reqid=929 GET /api/properties/.../intelligence-refresh-state`), `POST https://api.contracttocozy.com/api/auth/refresh` (`reqid=931`) with the still-valid 7-day refresh cookie (`__Secure-ctc.rt`) **returned `HTTP 401`** (`APIError: Session expired. Please log in again.`), hard-redirecting the active user out of Ask Cozy to `/login?reason=session_expired`. By contrast, 15 minutes later when the user was idle (`reqid=1445` → `reqid=1447`), a single `401` refresh succeeded with `200 OK`.
   - **Recommendation:** Deduplicate concurrent `POST /api/auth/refresh` calls behind a single shared in-flight promise on the frontend API client (and/or add a short refresh-token rotation grace window on the backend) so simultaneous requests at the 15-minute token expiry boundary never invalidate each other and boot an active user out of Ask Cozy.

2. **Clicking `[Review in Ask]` on Routine `"Schedule service for Smoke & CO Detector Check"` Card Triggers a False-Positive 911 Gas-Leak `EMERGENCY_BOUNDARY` Block (Session 2 Turns 7 → 8):**
   - **Observed Behavior:** In Session 2 Turn 7 (`"What needs my attention at home?"`), Ask Cozy rendered a `PLAN SOON` priority card: `"Schedule service for Smoke & CO Detector Check"` with a `[Review in Ask]` button. Clicking `[Review in Ask]` (Turn 8) sent `POST /api/ask/executions` with `launchContext: { operationId: "HOME_ACTIONS", entityType: "HOME_ACTION", entityId: "...:RISK:SAFETY_SMOKE_CO_DETECTORS" }`. Instead of rendering the `HOME_ACTIONS` detail view, the backend safety classifier matched `"Smoke & CO"` in the prompt string and returned `status: "BLOCKED"` (`operation.id: "EMERGENCY_BOUNDARY"`), displaying a 911 gas-leak evacuation warning:
     > **Treat this as an immediate safety issue**  
     > *Leave the affected area if you can do so safely. Call 911 or your local emergency service and the appropriate utility emergency line from a safe location. Do not operate switches, appliances, flames, or vehicles near a suspected gas leak.*
   - **Recommendation:** Bypass raw keyword emergency interception when `launchContext` specifies a governed non-emergency operation (`operationId === "HOME_ACTIONS"` / `entityType === "HOME_ACTION"`), and refine `EMERGENCY_BOUNDARY` detection so routine detector maintenance prompts (`"Smoke & CO Detector Check"`) do not trigger active gas-leak/fire alarms.

3. **Systemic `HTTP 409 Conflict (ASK_CAPTURE_NOT_ACTIVE)` Breaking Inline `WORKFLOW_INPUT` Captures — Even on the Latest Active Turn (Session 1 Turn 18 & Session 2 Turn 13):**
   - **Observed Behavior:**
     - **Upgrade Planner Decision (Session 1 Turn 18):** Clicking `[Record my decision]` on `"Wait and monitor Roof"` (Turn 17) opened Turn 18 (`COMPLETE THIS WORKFLOW / Your decision: Wait and monitor Roof`). Submitting `[Record decision]` failed with `HTTP 409 Conflict` and rendered `"This execution does not have an active inline capture."` inside the form.
     - **Home Habit Coach Settings (Session 2 Turn 13):** Clicking `[Change coach settings]` in Turn 12 (`"Show my home habits"`) created Turn 13 (`"Change the Home Habit Coach settings for this home."`, `operation.id: "HOME_HABIT_PREFERENCES_COMMAND"`, `status: "NEEDS_CONTEXT"`, `classification: "WORKFLOW_INPUT"`). With Turn 13 still as the latest active turn in the session, selecting the `"Environment"` pill (`"ENVIRONMENTAL"`) and clicking `[Continue to review]` sent `POST /api/ask/executions/821b26f2-.../captures` and immediately failed with **`409 Conflict`** (`code: "ASK_CAPTURE_NOT_ACTIVE"`, `"This execution does not have an active inline capture."`).
   - **Recommendation:** Audit how `POST /api/ask/executions` persists `captureRequests` with `classification: "WORKFLOW_INPUT"` (such as `HOME_HABIT_PREFERENCES_COMMAND` and Upgrade Planner decision capture) and how `POST /api/ask/executions/:id/captures` validates active capture state so `WORKFLOW_INPUT` captures can be submitted without throwing `ASK_CAPTURE_NOT_ACTIVE`.

4. **Post-Mutation `childExecutions` Refresh Corrupts Already-Answered Ancestor Turns In-Place (`Unsupported Presentation Version` & `answer-relevance-uncertain`, Session 1 Turns 28, 50 & Session 2 Turns 15–16):**
   - **Observed Behavior & Exact Network Root Cause:**
     - **Guided Journey Step Skip (Session 2 Turns 14–16):** In Turn 15 (`"Continue this guided journey."`, `operationId: "GUIDANCE_JOURNEY_CONTINUE"`, `entityId: "43f22d21-..."`), the backend initially returned `201 Created` (`status: "ANSWERED"`) with the full 6-step Guided Journey card (`Home expense planning: Out-of-Pocket Exposure`). When the user clicked `[Skip this step]` (Turn 16) and confirmed it via `POST /api/ask/executions/6ac3ca9e-.../confirm`, the `/confirm` response returned `childExecutions` to auto-refresh Turn 14 and Turn 15 in place. When re-evaluating Turn 15 without its original `launchContext` entity binding, the backend relevance verifier failed (`answer-relevance-uncertain`) and **overwrote Turn 15 in the database and UI** with `status: "NEEDS_CLARIFICATION"` (*"I need one detail to verify this answer"*), even though `originalResponse.blocks` in the payload still contained the valid 6-step journey card.
     - **Do-Nothing Simulation (Session 1 Turns 50–51):** Turn 50 (`"Show my do-nothing simulation"`) initially rendered a full `1,818px` simulation breakdown (`Estimated extra cost: $805 to $2,770 · Run Jul 27, 2026`). After confirming `[Run it again]` in Turn 51 (`"Run the do-nothing simulation."`), Turn 50 collapsed in-place into `"This saved response needs to be refreshed — The response was saved with an unsupported presentation version"`.
     - **Project Tracker (Session 1 Turn 28):** Immediately after creating the `"Office Desk"` project (Turn 26) and listing it in Turn 27, clicking `[Review project]` (`"Review this tracked project."`, Turn 28) failed with the same `"This saved response needs to be refreshed — The response was saved with an unsupported presentation version"` fallback card.
   - **Recommendation:** When `POST /api/ask/executions/:id/confirm` re-evaluates ancestor turns (`childExecutions`), preserve each ancestor execution's original `launchContext` (`entityType`, `entityId`, `operationId`) and presentation version, and never overwrite an already-`ANSWERED` turn with `NEEDS_CLARIFICATION` (`answer-relevance-uncertain`) or an unsupported-presentation fallback during a background refresh.

5. **Left Sidebar History Scroller Crushed to `34px` Height — and `NEEDS YOU` Queue Pushes `TODAY` Conversations Completely Out of View ([`ConversationHistoryNav.tsx:124-201`](../../apps/frontend/src/components/ask/workspace/ConversationHistoryNav.tsx#L124-L201)):**
   - **Observed Behavior (Session 1 Turns 1–63 & Session 2 Turns 1–16):**
     - On a `1658 × 749` laptop viewport, the fixed header controls (`« Hide history`, `+ New conversation`, `EXPLORE WITH COZY` with 4 topic rows, `CONVERSATIONS` header, `This home / All homes` toggle, `Search conversations` input) plus the bottom `Account / Log out` footer consume **`715px` of vertical height**, leaving the conversation list scroll container (`div.mt-4.min-h-0.flex-1.overflow-y-auto.pr-1` at line 150) with **`clientHeight: 34px`** (`scrollHeight: 341px`).
     - In Session 2, once the **`NEEDS YOU`** section (`Check a contractor quote.` and `Start a negotiation review.`) appeared at the top of that `34px` scroll container, only the `NEEDS YOU` heading and a ~3px top sliver of the first card were visible—pushing the entire `TODAY` conversation list completely below the fold.
   - **Recommendation:** Make `EXPLORE WITH COZY` collapsible (or scroll together with the rail body inside a single unified `overflow-y-auto` region between `+ New conversation` and the bottom `Account` footer), and tighten vertical spacing so at least 4–5 recent conversations remain visible at `749px` viewport height.

6. **Clicking `[Check a quote]` on `"Show my service price radar"` Refuses to Run and Tells the User to Click `[Check a quote]` — Then Persists as an `"Unfinished"` Workflow (Session 1 Turns 48–49 & Session 2 Landing):**
   - **Observed Behavior:**
     - In Session 1 Turn 48 (`"Show my service price radar"`), Cozy rendered `"No quote checks yet"` with a `[Check a quote]` CTA button.
     - Clicking `[Check a quote]` (Turn 49, `"Check a contractor quote."`, `operationId: "SERVICE_PRICE_CHECK_RUN"`) failed to open the quote capture form in Session 1 and instead replied:
       > **Use the Check a quote button**  
       > *A quote is checked from the Check a quote button on the quote checks answer. Nothing has changed.*
     - Even worse, the backend still recorded that failed turn as an **unfinished inline capture**, surfacing `Unfinished · Check a contractor quote. | Dismiss | Continue` in the top banner and `Check a contractor quote. — Add the missing detail` in the `NEEDS YOU` sidebar in Session 2.
   - **Recommendation:** Ensure clicking `[Check a quote]` (`SERVICE_PRICE_CHECK_RUN`) deterministically opens the quote-check inline capture every time, and never persist a refused/non-capture execution as an unfinished capture in `NEEDS YOU`.

7. **Dead-End `[Fill in missing details]` CTA on Home Record Completeness When Missing Fields Are System-Derived (Session 1 Turns 62 & 63):**
   - **Observed Behavior:**
     - **Turn 62 (`"How complete is my home record?"`):** Displayed `"Main’s Property Context is 97% complete | 2 missing, 0 conflicted, and 0 stale details were found across 1 area"`, rendered **two** `[Fill in missing details]` CTA buttons for `Location (11 of 13 facts known | 2 missing)`, and instructed the user: *"Open the property record or answer the inline prompt to add canonical information."*
     - **Turn 63 (`"Fill in the missing location details."`):** Clicking `[Fill in missing details]` immediately dead-ended with:
       > **No more questions in this session**  
       > *Location is 85% complete on the home record. **2 details cannot be filled in here: County (from your address); County code (from your address).***
   - **Recommendation:** Exclude non-editable/address-derived fields (`County`, `County code`) from inline capture prompts, and suppress `[Fill in missing details]` buttons (and inline prompt instructions) whenever an area has zero user-answerable missing fields.

8. **`$273,000` Home Value Contradiction Across Financial Turns for the Same Property (`$452,000` vs. `$725,000`, Session 1 Turns 44/45 vs. Turn 47):**
   - **Observed Behavior:**
     - **Turn 44/45 (`"Should I sell, hold, or rent this home?"`):** Under `CURRENT PLANNING INPUTS`, Ask Cozy modeled the property using **`Home value: $452,000`** (`$536,834 projected price` in 5 years).
     - **Turn 47 (`"Show my home financing overview"`, 2 turns later):** Reported **`"About 55.86% equity ($405,000) on a home valued near $725,000, based on your recorded home value."`**
   - **Recommendation:** Unify the canonical property value resolver across all financial efficiency, sell/hold/rent, break-even, and financing overview services so every financial answer in Ask Cozy uses the same authoritative home value (or explicitly explains if a different valuation source is used).

9. **Internal Ranking, Microservice Names & Engineering Jargon Leaking Into User-Facing Answers (`What matters now`, `Break-even analysis`, `Savings` & `Guided Journeys`):**
   - **Observed Behavior:**
     - **Home Actions (`What matters now`, Session 1 Turns 1 & 4; Session 2 Turns 1 & 7):** Priority cards expose internal ranking diagnostics such as `"Ranked here because: stable tie break."` and `"Ranked here because: higher consequence, higher urgency, higher confidence, higher household..."`.
     - **Break-Even Analysis (Session 1 Turn 43, `"Show my home break-even analysis"`):**
       - Under `"What this projection is missing"`: `"Debt-aware modeling is ON using mortgage snapshot/override inputs. FHFA comps returned no usable rate for this horizon; using heuristic appreciation."`
       - Under `"What drives the result"`: `"Localized modeling uses state + ZIP prefix 085 heuristics for context (Phase 1–2)."` and `"Modeled using localized historical heuristics (Phase 1–2)."` (exposing internal engineering roadmap phases `"Phase 1–2"`).
       - Under tables in Turns 43, 46, and 53: `"3 records. View: automatically adapted to available width."` / `"1 record. View: table."`
     - **Savings & Benefits (Session 1 Turn 60):** Displays internal ownership copy `"Owned by its dedicated ContractToCozy analysis"` and raw enum `"recorded RECEIVED outcomes"`.
     - **Guided Journeys (Session 2 Turn 15):** Exposes internal hyphenated module identifiers in prose and provenance: *"Ask cannot record this step's proof yet **(Coverage-Intelligence)**, so completing it is not currently available in Ask"* and *"Estimate Out-of-Pocket Cost: Cost Estimate — **Verified · True-Cost**"*.
   - **Recommendation:** Scrub all internal engineering phase labels (`"(Phase 1–2)"`), module slugs (`"Coverage-Intelligence"`, `"True-Cost"`), algorithm diagnostics (`"FHFA comps returned no usable rate"`, `"stable tie break"`), and table view debug footers (`"View: automatically adapted to available width."`) from user-facing presenters.

---

### 3.2 High (`P1`) Live Findings

10. **Raw `label: / value:` Debug Formatting & Enum Strings in Property Brief Preview (Session 1 Turn 37):**
    - **Observed Behavior (`"Preview this property brief."`, `3,320px` tall):** All 14 rows under `SELECTED PROPERTY FACTS` and 3 rows under `KNOWN GAPS AND UNKNOWNS` render literal schema debug keys (`label:`, `value:`, `state:`), uncapitalized values (`plainsboro township`, `nj`, `hvac`, `central ac`), and raw enum codes (`USER_REPORTED`, `INCLUDED`):
      - `label: city | value: plainsboro township | Source: Verified property fact evidence: USER_REPORTED · As of Jul 27, 2026 · verified | INCLUDED`
      - `label: bedrooms | state: unknown or not recorded | Source: Canonical property record gap · As of Jul 27, 2026 · unknown or not recorded | INCLUDED`
    - **Recommendation:** Format Property Brief preview rows with human-readable labels (`City: Plainsboro Township`, `State: NJ`, `Heating type: HVAC`) and clean provenance subtitles (`Self-reported · Verified Jul 27, 2026`).

11. **Stale Property Brief Snapshot Contradicts the Live Home Record Without Warning (Session 1 Turn 37 vs. Turns 5 & 13):**
    - **Observed Behavior:** Turns 5 and 13 (`"Give me a summary of my home record"`) show **`Bedrooms: 3`** and **`Bathrooms: 2.5`**, and the sidebar shows `My Home Record 97% complete`. However, Turn 37 (`"Preview this property brief."`) lists `bedrooms` and `bathrooms` under **`KNOWN GAPS AND UNKNOWNS`** (`state: unknown or not recorded`) because the saved brief is a frozen snapshot from `Aug 5, 2026`, without alerting the user that their home record has been updated since the snapshot was taken.
    - **Recommendation:** Detect when a saved Property Brief snapshot is older than the latest property record update, surface a clear notice (*"Your home record has been updated since this brief was saved on Aug 5, 2026"*), and provide a one-click `[Refresh brief with current records]` action.

12. **Coverage Gap Count Mismatch (`2` vs. `3`) & Routine Maintenance Task Misclassified as an Uncovered Appliance (Session 1 Turns 60 & 61):**
    - **Observed Behavior:**
      - **Turn 60 (`"Where could I save money on this home?"`):** States `"Coverage and premium review | 2 coverage gaps — largest exposure Microwave ($1,200)"`.
      - **Turn 61 (`"Show my current coverage gaps."`):** Reports **`"3 confirmed missing or expired"`** under `NO COVERAGE CONFIRMED (3)`: `Microwave ($1,200)`, `Oven Range ($1,000)`, and **`Smoke & CO Detector Check (safety · $300 estimated exposure · No linked policy or warranty)`**.
    - **Recommendation:** Filter routine maintenance tasks (`Smoke & CO Detector Check`) out of appliance/asset warranty coverage gap lists, and ensure the savings summary (Turn 60) and coverage gap detail (Turn 61) query the same filtered count.

13. **Opaque, Uninformative Rows in `"What changed recently for this home?"` (Session 1 Turn 38):**
    - **Observed Behavior (`"Here’s what changed around your home"`):** 5 of the 10 recent update cards repeat the generic record category as both the title and the badge, with **no description of what changed** and **no action button**:
      - Three identical consecutive rows: `URGENT · Property record · Recorded Oct 2 · Property record`
      - One row: `IMPORTANT · Insurance claim · Recorded Oct 13 · Insurance claim`
      - One row: `IMPORTANT · Property record · Recorded Oct 10 · Property record`
    - **Recommendation:** Populate human-readable change summaries (e.g., *"Updated roof replacement year to 2019"* or *"Opened water damage claim draft"*) and link each update row to its corresponding record or Ask follow-up.

14. **Action & Rating Button Overload on Multi-Card Priority Grids (Session 1 Turn 4 & Session 2 Turn 7):**
    - **Observed Behavior:** In `"16 Home Actions are ready to review"` (Session 1 Turn 4) and `"18 Home Actions are ready to review"` (Session 2 Turn 7), 8 cards render in a 3-column grid where **every single card** has its own solid dark-green primary `[Review in Ask]` CTA button plus its own `Useful? 👍 👎` feedback buttons, followed by the turn-level `👍 👎 ···` row—placing **8 competing primary green buttons** and **18 rating buttons** on screen in a single turn.
    - **Recommendation:** Demote per-card `[Review in Ask]` buttons in multi-card grids to quiet secondary/ghost actions (or make the card clickable with at most one primary CTA on the top item), and remove per-card `Useful? 👍 👎` buttons in favor of the single turn-level feedback bar.

15. **1-Day Timezone Offset Discrepancy Between Priority Card and Detail/List Views (Session 1 Turns 1–3):**
    - **Observed Behavior:** In Turn 1 (`What matters now`), *"Chimney cleaning and inspection"* displays **`Due 10/30/2026`** (local EDT conversion of `2026-10-31T00:00:00.000Z`), whereas clicking `[Review in Ask]` (Turn 2) and viewing pending maintenance (Turn 3) displays **`Due Oct 31, 2026`** (UTC date).
    - **Recommendation:** Format date-only fields (such as maintenance `nextDueDate` stored at `00:00:00Z`) using `timeZone: 'UTC'` (or a shared date-only helper) across all Ask Cozy card, detail, and list presenters.

16. **Contradictory Copy in Seasonal Recommendations vs. 97% Complete Home Record (Session 1 Turn 6 vs. Turn 5):**
    - **Observed Behavior:** Even though the left rail displays `My Home Record 97% complete` and Turn 5 explicitly lists the home's recorded `HVAC`, `Central AC`, and `Shingle` roof, Turn 6 (`"What should I do to get ready for next season?"` → `"Getting ready for winter"`) renders an `"About this recommendation"` card stating:
      > *"This is general guidance for your climate, not an assessment of this home, and it does not use anything recorded about your systems. Once your home record lists them, your own seasonal checklist can add tasks specific to those systems."*
    - **Recommendation:** Ground seasonal readiness answers in the property's recorded systems when present, and remove or conditionalize the boilerplate disclaimer so it never claims a 97%-complete home has no recorded systems.

17. **Clicking `"Add this recommended plant to my home."` Re-Opens the Room Search Form Instead of Adding the Plant (Session 1 Turns 15–16):**
    - **Observed Behavior:** After Turn 15 (`"Find plants that fit a room"` for `Laundry`) returns 8 recommended plants (`1. Spider Plant`, `2. Snake Plant`, etc.), clicking `"Add this recommended plant to my home."` (Turn 16) opens the `"Find plants for a room"` search form (`"Choose the room and the growing conditions you want recommendations for"`) instead of an add-plant confirmation flow for the selected plant.
    - **Recommendation:** Fix the action routing/intent mapping for `"Add this recommended plant to my home."` so it passes the selected plant and room context directly into the plant-addition confirmation flow.

18. **Production Test Fixture Exposed in Live DIY Projects (`"[TEST] Touch up a scuffed wall"`, Session 1 Turn 57):**
    - **Observed Behavior (`"Show the DIY projects I can start."`):** The only starter DIY project returned on live production is a test fixture:
      - **Title:** `[TEST] Touch up a scuffed wall`
      - **Description:** `Test template: cover a small scuff on an interior wall with matching paint. (Painting · 5 steps · About 1 hr)`
    - **Recommendation:** Remove or filter `[TEST]` seed templates from production DIY project catalogs and replace them with curated homeowner DIY templates.

---

### 3.3 Medium (`P1`/`P2`) & Low (`P2`) Live Findings

19. **22-Word Internal Operation Registry Description Rendered as a Title-Cased Clarification Button ([`CaptureCards.tsx:107`](../../apps/frontend/src/components/ask/workspace/CaptureCards.tsx#L107), Session 2 Turn 15):**
    - **Observed Behavior:** When Turn 15 degraded into `status: "NEEDS_CLARIFICATION"`, `clarification.options` populated the radio button label from the raw internal operation description (`"see where one guided journey stands: its steps, the current step and why it matters, what blocks it and what has been done"`), and `CaptureCards.tsx:107` (`capitalize`) title-cased every word into a 22-word button:
      **`See Where One Guided Journey Stands: Its Steps, The Current Step And Why It Matters, What Blocks It And What Has Been Done`**.
    - **Recommendation:** Provide concise homeowner-friendly `shortLabel` strings on all operations used in `clarification.options` (e.g., *"View current guided journey steps"*), and remove CSS `capitalize` from `ClarificationCard` ([`CaptureCards.tsx:107`](../../apps/frontend/src/components/ask/workspace/CaptureCards.tsx#L107)).

20. **Container Width Jumps Across Consecutive Turns (`1140px` vs. `920px` vs. `800px`):**
    - **Observed Behavior:** On the `1658px` viewport (`main` width `1385px`), wide turns (such as Turns 1, 3, 4, 9, 13, 29, 31, 34, 43, 44, 46, 53 in Session 1 and Turns 1, 7 in Session 2) render at **`width: 1140px`** (`x: 394.88` to `1534.88`), while standard turns shrink to **`width: 920px`** (`x: 504.88` to `1424.88`), and seasonal sub-cards cap at **`800px`**. This causes both Cozy's left margin and the user's right-aligned question bubbles to jump horizontally by **`110px`** between consecutive turns.
    - **Recommendation:** Anchor the outer turn `<article>` (and user question bubble) to a single consistent column width, and allow only wide data visualizations/tables to expand gracefully from the same left alignment edge.

21. **Content Security Policy (CSP) Blocks Inline Styles on Lifespan / Progress Bars (Session 1 Turns 9 & 20):**
    - **Observed Behavior:** When rendering the `Status Board` (Turn 9, 25 tracked items) and `Appliance Oracle` (Turn 20, 7 systems approaching end of life with lifespan progress bars), Chrome logs CSP violations:
      `Applying inline style violates the following Content Security Policy directive 'style-src-elem 'self' 'nonce-...''`.
    - **Recommendation:** Replace inline `style={{ width: ... }}` / injected `<style>` elements in Status Board and Appliance Oracle progress indicators with CSP-safe SVG `<rect width="...">`, native `<progress>`, or Tailwind width classes.

22. **Raw Database Enum Strings, Naive Title-Casing & Duplicate Badges Across Claims, Financing, Habits, Service Price Radar & Seller-Prep Receipts:**
    - **Observed Behavior:**
      - **Claims (Session 1 Turn 24):** Open claim rows render duplicate `"draft"` badges and raw enum tokens: `Water damage claim · draft · water damage · draft` and `Fire or smoke claim · draft · fire smoke · draft`.
      - **Project Tracker (Session 1 Turn 27):** Project rows duplicate the status in both Title Case and UPPERCASE: `Office Desk · Planning · PLANNING · $500 budget`.
      - **Seller-Prep Receipts (Session 1 Turns 30 & 32):** The `Decision` field renders raw lowercase enums `pursue` and `waive` instead of `"Pursue"` and `"Waive"`.
      - **Home Financing Overview (Session 1 Turn 47):** Displays raw mortgage enum **`Type: FIXED_30`** instead of `"30-year fixed"`.
      - **Service Price Radar Capture Pills (Session 2 Turn 6):** `Service *` pill options strip underscores without preserving acronyms or `&` conjunctions, producing **`Hvac`**, **`Windows Doors`**, **`Landscaping Drainage`**, and **`Security Safety`**.
      - **Home Habit Coach (Session 2 Turn 12):** Habit rows render raw lowercase difficulty enum badges (**`easy`**, **`moderate`**) beside capitalized frequency labels (`Monthly`, `Annual`).
    - **Recommendation:** Centralize human-readable enum formatters across all Ask presenters and inline capture option builders, and deduplicate status badges in `ClaimResultList` and Project Tracker.

23. **`0-0 USD` Formatting, `(s)` Template Placeholders, Pluralization & Double-Verb Grammar Bugs:**
    - **Observed Behavior:**
      - **Coverage Review (Session 1 Turn 40 & Session 2 Turn 10):** Headline reads **`"1 item match this coverage review"`** (should be `"1 item matches..."`).
      - **Do-Nothing Simulation (Session 1 Turns 50 & 52):**
        - Displays `"Deferred maintenance debt | Projected maintenance debt adds 0-0 USD over 12 months."` (`0-0 USD` instead of `"$0"` or omitting zero-cost rows).
        - Renders raw `(s)` pluralization placeholders: `"3 critical end-of-life item(s)"`, `"6 item(s) are beyond 70% of expected lifespan"`, `"1 recent water/plumbing claim signal(s) increase repeat-risk probability"`, and `"2 claim(s) in the last 36 months"`.
      - **Plan Ahead Home Action Title (Session 2 Turns 1 & 2):** Concatenates `"Review "` onto a capitalized sentence: **`"Review Your HVAC filter may be due for a replacement check"`**.
    - **Recommendation:** Replace `(s)` strings with proper singular/plural helper formatting, format zero-dollar ranges cleanly (`"$0"`), fix `"1 item matches"`, and avoid prepending `"Review "` when an action title is already a full sentence.

24. **Duplicate User Question Bubbles Across Multi-Step Negotiation Shield Starters (Session 1 Turns 34 & 35):**
    - **Observed Behavior:** Clicking `[Start a review]` in Turn 33 appends user bubble `"Start a negotiation review."` (Turn 34). Clicking `[Start]` on the specific `"Insurance premium increase"` option in Turn 34 appends another identical user bubble `"Start a negotiation review."` (Turn 35) instead of `"Start an insurance premium increase review."`.
    - **Recommendation:** Include the selected review type in the user-facing action prompt when launching a specific Negotiation Shield workflow from the option grid.

25. **Left Rail Indicator Line-Wrap (`"My Home Record 97% complete"`) & Duplicate Session Titles ([`ExploreWithCozy.tsx:139`](../../apps/frontend/src/components/ask/workspace/ExploreWithCozy.tsx#L139)):**
    - **Observed Behavior:** In the `272px` sidebar, `"My Home Record"` and `"97%"` stay on line 1 while `"complete"` wraps onto line 2 by itself (increasing topic row height and further squeezing the history scroller). Meanwhile, in the `TODAY` history list, 4 sessions have the identical title `"Show me what needs attention now or soon"` because each was started from the same top starter chip.
    - **Recommendation:** Shorten the indicator badge to `"97%"` (with `whitespace-nowrap`) in `ExploreWithCozy.tsx`, and update a session's title after the first user-specific follow-up or disambiguate identical starter-chip session titles.

26. **Single-Session Bloat Across Unrelated Topics (`63 turns`, `48,428px` Scroll Height in Session 1):**
    - **Observed Behavior:** Clicking topics in `EXPLORE WITH COZY` or the `"More ideas"` modal (`What Ask Cozy can help with`) appends every prompt into the same active session (`5ef326d2-...`), growing the single DOM stream to **63 turns (`48,428px` scroll height)** across 25+ unrelated domains while the sidebar still titles the thread `"Show me what needs attention now or soon"`.
    - **Recommendation:** Offer a subtle `"Start in a new conversation"` option (or topic separator with automatic session title update) when switching to an unrelated domain via `Explore with Cozy`, and pair with the floating `"Jump to latest ↓"` pill for long threads.

27. **22 Form Inputs Missing `id` or `name` Attributes Across Inline Workflows (Session 1 Turns 11, 16, 18, 26, 35):**
    - **Observed Behavior:** Across the HOA setup form (Turn 11), Plant Advisor room setup form (Turn 16), Upgrade Planner decision form (Turn 18), 4-step Project Setup wizard (Turn 26), and Negotiation Shield form (Turn 35), Chrome DevTools flagged `A form field element should have an id or name attribute (count: 22)`.
    - **Recommendation:** Add deterministic `id` and `name` attributes (paired with `<label htmlFor={...}>`) to all `<input>`, `<select>`, and `<textarea>` elements in `ConversationalCapture.tsx` and `CaptureCards.tsx`.

---

## 4. Prioritized Implementation Roadmap

| Priority | Item | Target Files | Effort |
| :---: | :--- | :--- | :---: |
| **P0** | **Fix Silent Token Refresh `401` (`POST /api/auth/refresh`):** Fix refresh token extraction/validation so active Ask Cozy users are not booted to `/login?reason=session_expired` when the 15-minute access token expires. | Backend `auth.routes.ts` / `auth.controller.ts` & frontend [`client.ts`](../../apps/frontend/src/lib/api/client.ts) | S |
| **P0** | **Fix False-Positive `EMERGENCY_BOUNDARY` on Smoke & CO Detector Maintenance (Session 2 Turn 8):** Bypass keyword emergency interception when `launchContext` targets `HOME_ACTIONS` (`SAFETY_SMOKE_CO_DETECTORS`) and refine emergency classifier rules. | Backend `ask` emergency boundary / intent classifier & `homeActions` | S |
| **P0** | **Fix Systemic `409 ASK_CAPTURE_NOT_ACTIVE` on `WORKFLOW_INPUT` Captures (Session 1 Turn 18 & Session 2 Turn 13):** Persist and validate `WORKFLOW_INPUT` inline captures (`HOME_HABIT_PREFERENCES_COMMAND`, Upgrade Planner decisions) so submitting them on the active turn succeeds. | Backend `ask/captures` service & `homeHabitCoach` / `upgradePlanner` handlers | M |
| **P0** | **Fix Post-Mutation `childExecutions` Refresh Corrupting Ancestor Turns (`Review project`, `Do-nothing simulation`, `Guided Journey`):** Preserve ancestor `launchContext` (`entityId`, `operationId`) and presentation version during `/confirm` refresh so answered parent turns are never overwritten with `answer-relevance-uncertain` (`NEEDS_CLARIFICATION`) or `"Unsupported presentation version"`. | Backend `ask/confirm` ancestor refresh pipeline, `projectTracker`, `doNothingSimulation`, `guidanceJourney` | M |
| **P0** | **Fix Service Price Radar `[Check a quote]` Refusal & False `"Unfinished"` State (Session 1 Turn 49) + Home Completeness Dead-End CTA (Turns 62–63):** Ensure `[Check a quote]` (`SERVICE_PRICE_CHECK_RUN`) always opens its capture form and never saves a refused turn into `NEEDS YOU`; hide `[Fill in missing details]` when missing fields (`County`, `County code`) are non-editable. | Backend `servicePriceRadar`, `propertyCompleteness`, and `needsYou` queue filter | M |
| **P0** | **Fix Left Sidebar Scroller Height (`34px` Crush):** Make `Explore with Cozy` collapsible or scroll within a unified rail body and tighten vertical padding so `NEEDS YOU` and `TODAY` conversations are visible on `749px`-tall laptop screens; fix `"97% complete"` badge wrapping (`whitespace-nowrap`). | [`ConversationHistoryNav.tsx`](../../apps/frontend/src/components/ask/workspace/ConversationHistoryNav.tsx), [`ExploreWithCozy.tsx`](../../apps/frontend/src/components/ask/workspace/ExploreWithCozy.tsx) | S |
| **P0** | **Reconcile `$273k` Home Value Discrepancy & Scrub Internal Jargon:** Unify property value resolution across Sell/Hold/Rent (`$452k`) and Financing Overview (`$725k`); strip `"Ranked here because: stable tie break"`, `"FHFA comps..."`, `"(Phase 1–2)"`, `"(Coverage-Intelligence)"`, `"True-Cost"`, and `"View: automatically adapted to available width."` from user-facing cards/tables. | Backend financial & guidance presenters, `homeActions` presenter, [`PriorityAndOutcomeBlocks.tsx`](../../apps/frontend/src/components/ask/blocks/PriorityAndOutcomeBlocks.tsx), [`TableBlock.tsx`](../../apps/frontend/src/components/ask/blocks/TableBlock.tsx) | M |
| **P0** | **Wire `<CollectionStatusNote>` & `sectionHasNextPage`** across `SeasonalPlanResultList`, `PatternFrame`, `MaintenanceResultList`, and specialized list renderers; fix missing test props in `negotiationShieldReview.test.tsx`. | [`SeasonalPlanResultList.tsx`](../../apps/frontend/src/components/ask/SeasonalPlanResultList.tsx), [`PatternParts.tsx`](../../apps/frontend/src/components/ask/patterns/PatternParts.tsx), [`MaintenanceResultList.tsx`](../../apps/frontend/src/components/ask/MaintenanceResultList.tsx), [`negotiationShieldReview.test.tsx`](../../apps/frontend/src/components/ask/__tests__/negotiationShieldReview.test.tsx) | S |
| **P0** | **Fix Turn Container Width Jumps (`1140px` vs. `920px`), Clarification Labels & Declutter Transcript:** Keep outer `<article>` and user question bubbles aligned to a single consistent column width across all turns; show `"Change and resend"` on hover/focus; use concise `shortLabel` on clarification options and remove `capitalize` from `ClarificationCard`. | [`ExecutionCard.tsx`](../../apps/frontend/src/components/ask/workspace/ExecutionCard.tsx), [`CaptureCards.tsx`](../../apps/frontend/src/components/ask/workspace/CaptureCards.tsx) | S |
| **P0** | **Composer Auto-Resize & Non-Error Stop State:** Auto-grow composer `<textarea>` up to `max-h-48` (switching hero pill from `rounded-full` to `rounded-3xl` when multi-line); replace red `AlertTriangle` error banner on user-initiated `Stop` with quiet draft restoration. | [`AskWorkspace.tsx`](../../apps/frontend/src/components/ask/AskWorkspace.tsx), [`useAskRequest.ts`](../../apps/frontend/src/components/ask/workspace/useAskRequest.ts) | S |
| **P1** | **Fix Property Brief Preview Formatting & Stale Snapshot Warning (Turn 37):** Replace raw `label: city | value: plainsboro township | USER_REPORTED` strings with clean labels and warn when the frozen snapshot is older than current home records (`Bedrooms: 3`, `Bathrooms: 2.5`). | Backend `propertyBrief` presenter | S |
| **P1** | **Fix Coverage Gap Filtering (Turns 60–61), Opaque Home Updates (Turn 38) & `[TEST]` DIY Seed (Turn 57):** Exclude maintenance tasks (`Smoke & CO Detector Check`) from appliance coverage gaps and align Turn 60/61 counts (`2` vs. `3`); add descriptive titles/actions to `"Property record"` / `"Insurance claim"` rows in Turn 38; remove `[TEST] Touch up a scuffed wall` from production DIY templates. | Backend `coverageGap`, `homeUpdates`, and `diyProjects` services/seeds | M |
| **P1** | **Fix Plant Addition Routing, Seasonal Disclaimer Contradiction & UTC Date Shift:** Route `"Add this recommended plant to my home."` to plant confirmation instead of room search (Turn 16); ground seasonal recommendations in recorded home systems (Turn 6); format date-only due dates in UTC so `10/30/2026` vs. `Oct 31, 2026` discrepancies cannot occur (Turns 1–3). | Backend `plantAdvisor`, `seasonalHomeCare`, and frontend date formatters / [`PriorityAndOutcomeBlocks.tsx`](../../apps/frontend/src/components/ask/blocks/PriorityAndOutcomeBlocks.tsx) | M |
| **P1** | **Reduce Multi-Card CTA & Rating Button Overload (Turn 4 & Session 2 Turn 7):** Demote repetitive solid-green `[Review in Ask]` buttons on 8-card priority grids to quiet secondary actions and remove per-card `Useful? 👍 👎` buttons in favor of the turn-level feedback bar. | [`PriorityAndOutcomeBlocks.tsx`](../../apps/frontend/src/components/ask/blocks/PriorityAndOutcomeBlocks.tsx), [`ExecutionCard.tsx`](../../apps/frontend/src/components/ask/workspace/ExecutionCard.tsx) | S |
| **P1** | **Humanize Enum Badges, Grammar & Fix CSP Inline Styles:** Clean up `draft · water damage · draft`, `Planning · PLANNING`, `pursue`/`waive`, `FIXED_30`, `RECEIVED`, `Hvac`/`Windows Doors`, `easy`/`moderate`, `0-0 USD`, `(s)` templates, `"1 item match"`, and `"Review Your..."`; replace CSP-blocked inline styles on Status Board and Appliance Oracle progress bars. | [`ClaimResultList.tsx`](../../apps/frontend/src/components/ask/ClaimResultList.tsx), backend presenters, Status Board & Appliance Oracle block components | M |
| **P1** | **Calm Landing Polish, Universal Composer Attachments & Unified Calm Visual Adoption:** Hide empty `Decisions to make` / `Active major moment` cards; distinguish missing `selectedPropertyId` from API failure; enable universal photo/PDF attachments; unify remaining block types under `useCalmChrome()`. | [`CalmLanding.tsx`](../../apps/frontend/src/components/ask/calm/CalmLanding.tsx), [`AskWorkspace.tsx`](../../apps/frontend/src/components/ask/AskWorkspace.tsx), [`calmAnswers.ts`](../../apps/frontend/src/features/ask/calmAnswers.ts), [`CoreBlocks.tsx`](../../apps/frontend/src/components/ask/blocks/CoreBlocks.tsx) | M |
| **P2** | **Action Overflow Cap & Form Input Accessibility (`id`/`name`):** Apply the 2-action + `"More"` overflow disclosure to non-dense rows in `GenericGroupedListBlock`, check item-level primary actions in `evaluatePresentationQuality.ts`, and add `id`/`name` attributes to all 22 inline capture/confirmation form fields. | [`GroupedListBlock.tsx`](../../apps/frontend/src/components/ask/blocks/GroupedListBlock.tsx), [`ConversationalCapture.tsx`](../../apps/frontend/src/components/ask/calm/ConversationalCapture.tsx), [`CaptureCards.tsx`](../../apps/frontend/src/components/ask/workspace/CaptureCards.tsx) | S |
| **P2** | **Desktop Rail, Session Naming & Long-Thread Navigation:** Default history/discovery rail to expanded on wide desktop screens (`xl+`), hide inactive row `MoreHorizontal` menus until hover/focus, auto-update generic starter-chip session titles, and add a floating `"Jump to latest ↓"` button when scrolled up. | [`historyRail.ts`](../../apps/frontend/src/features/ask/historyRail.ts), [`ConversationSessionRow.tsx`](../../apps/frontend/src/components/ask/ConversationSessionRow.tsx), [`AskWorkspace.tsx`](../../apps/frontend/src/components/ask/AskWorkspace.tsx) | M |

