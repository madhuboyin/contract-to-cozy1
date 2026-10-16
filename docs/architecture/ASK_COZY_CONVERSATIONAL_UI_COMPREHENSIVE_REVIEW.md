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
- **Live browser observation** across a **30-turn production session** on `https://contracttocozy.com/dashboard/ask` (property `94 Ashford Dr`, viewport `1658 × 749`) uncovered **14 live runtime, layout, data-formatting, and workflow issues**—including 4 critical (`P0`) issues—that only manifest with real viewport geometry, live property data, and multi-step workflow execution (Section 3).

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

## 3. Live Browser Observation Findings (30-Turn Production Session)

**Session Context:** Observed live on `https://contracttocozy.com/dashboard/ask` (`propertyId=d8636cd4-003c-4fda-929e-90c0e16312c5` — `94 Ashford Dr`, `sessionId=5ef326d2-925e-40ab-b036-362c06ff806c`) at a standard laptop viewport (`1658 × 749` px) across 30 consecutive conversational turns spanning Home Actions, Maintenance, Home Record, Seasonal Care, Risk Assessment, Status Board, Home Score, HOA Setup, Home Event Radar, Plant Advisor, Upgrade Planner, Appliance Oracle, Coverage Gap, Claims, Project Tracker, and Seller Prep.

### 3.1 Critical (`P0`) Live Findings

1. **Left Sidebar History Scroller Crushed to `34px` Height on Laptop Viewports ([`ConversationHistoryNav.tsx:124-201`](../../apps/frontend/src/components/ask/workspace/ConversationHistoryNav.tsx#L124-L201)):**
   - **Observed Behavior (Turns 1–30):** When the left sidebar (`aside`, `272px × 749px`) is expanded on a `1658 × 749` laptop viewport, the fixed header controls (`« Hide history`, `+ New conversation`, `EXPLORE WITH COZY` with 4 topic rows, `CONVERSATIONS` header, `This home / All homes` segmented control, `Search conversations` input) plus the bottom `Account / Log out` footer consume **`715px` of vertical height**, leaving the conversation list scroll container (`div.mt-4.min-h-0.flex-1.overflow-y-auto.pr-1` at line 150) with **`clientHeight: 34px`** (`scrollHeight: 341px`). Only the `TODAY` label and a ~12px top sliver of the first conversation item (`y: 632.5px` to `645px`) are visible before being clipped by the Account footer.
   - **Recommendation:** Make `EXPLORE WITH COZY` collapsible (or scroll together with the rail body inside a single unified `overflow-y-auto` region between the top `+ New conversation` button and the bottom `Account` footer), and tighten vertical spacing so at least 4–5 recent conversations are visible at `749px` viewport height.

2. **Internal Ranking Jargon Leaking Into `What matters now` Cards ([`PriorityAndOutcomeBlocks.tsx`](../../apps/frontend/src/components/ask/blocks/PriorityAndOutcomeBlocks.tsx)):**
   - **Observed Behavior (Turns 1 & 4):** In `What matters now` (Turn 1) and `16 Home Actions are ready to review` (Turn 4), action cards render raw internal ranking/tie-breaker explanations directly to the homeowner:
     - `"Ranked here because: stable tie break."` on *Chimney cleaning and inspection*, *Maintain Oven Range*, and *Maintain Dishwasher*.
     - `"Ranked here because: higher consequence, higher urgency, higher confidence, higher household..."` (truncated internal scoring dimensions) on *Smoke & CO Detector Check*.
   - **Recommendation:** Replace internal ranking/tie-breaker diagnostic strings in the `HOME_ACTIONS` / priority presenter with homeowner-meaningful provenance (e.g., *"Due Oct 31 · Annual fire-safety check"* or *"High-impact safety maintenance"*), and suppress `"stable tie break"` entirely.

3. **Clicking `[Review project]` on a Newly Created Project Fails With "Unsupported Presentation Version" (Turn 28):**
   - **Observed Behavior (Turns 26–28):** After creating a new `"Office Desk"` project (`$500` budget, `05/30/2026` target completion) via the 4-step conversational wizard (Turn 26) and seeing `"Office Desk · Planning · PLANNING · $500 budget"` in Project Tracker (Turn 27), clicking `[Review project]` (`"Review this tracked project."`, Turn 28) fails to render the project detail and instead shows the fallback card:
     > **This saved response needs to be refreshed**  
     > *The response was saved with an unsupported presentation version. Ask preserved the execution and hid incompatible details instead of showing a broken or misleading result.*  
     Clicking `[Try again with current records]` does not recover the view.
   - **Recommendation:** Audit the project detail presenter (`Review this tracked project` / `project-detail-records`) against the presentation version validator and schema contract so newly created projects render their detail view without tripping the unsupported presentation version fallback.

4. **`HTTP 409 Conflict` & Raw Backend Error When Recording an Upgrade Planner Decision (Turn 18):**
   - **Observed Behavior (Turns 17–18):** In Turn 17 (`"Show my upgrade planner options"`), clicking `[Record my decision]` on `"Wait and monitor Roof"` opens Turn 18 (`COMPLETE THIS WORKFLOW / Your decision: Wait and monitor Roof`) with `Decision (wait)` and `Timeline (optional)` inputs. Submitting `[Record decision]` fails with `Failed to load resource: the server responded with a status of 409 ()` and displays the raw backend error message `"This execution does not have an active inline capture."` inside the form.
   - **Recommendation:** Ensure the Upgrade Planner decision action initializes a valid active inline capture state on the execution (or routes through the standard mutation confirmation/capture endpoint expected by the backend), and map `409 Conflict` responses to user-friendly recovery copy rather than exposing raw internal execution terminology.

---

### 3.2 High (`P1`) Live Findings

5. **Action & Rating Button Overload on Multi-Card Priority Grids (Turn 4):**
   - **Observed Behavior (Turn 4):** In `"16 Home Actions are ready to review"`, 8 cards render in a 3-column grid where **every single card** renders its own solid dark-green primary `[Review in Ask]` CTA button plus its own `Useful? 👍 👎` feedback buttons, followed by the turn-level `👍 👎 ···` row—placing **8 competing primary green buttons** and **18 rating buttons** on screen in a single turn.
   - **Recommendation:** Demote per-card `[Review in Ask]` buttons in multi-card grids to quiet secondary/ghost actions (or make the card header/row clickable with at most one primary CTA on the top recommended action), and remove per-card `Useful? 👍 👎` buttons in favor of the single turn-level feedback bar.

6. **1-Day Timezone Offset Discrepancy Between Priority Card and Detail/List Views (Turns 1–3):**
   - **Observed Behavior (Turns 1–3):** In Turn 1 (`What matters now`), *"Chimney cleaning and inspection"* displays **`Due 10/30/2026`** (local EDT conversion of `2026-10-31T00:00:00.000Z`), whereas clicking `[Review in Ask]` (Turn 2) and viewing pending maintenance (Turn 3) displays **`Due Oct 31, 2026`** (UTC date).
   - **Recommendation:** Format date-only fields (such as maintenance `nextDueDate` / target dates stored at `00:00:00Z`) using `timeZone: 'UTC'` (or a shared date-only formatter) across all Ask Cozy card, detail, and list presenters so due dates never shift by 1 day across views.

7. **Contradictory Copy in Seasonal Recommendations vs. 97% Complete Home Record (Turn 6 vs. Turn 5):**
   - **Observed Behavior (Turns 5–6):** Even though the left rail displays `My Home Record 97% complete` and Turn 5 explicitly lists the home's recorded `HVAC`, `Central AC`, and `Shingle` roof, Turn 6 (`"What should I do to get ready for next season?"` → `"Getting ready for winter"`) renders an `"About this recommendation"` card stating:
     > *"This is general guidance for your climate, not an assessment of this home, and it does not use anything recorded about your systems. Once your home record lists them, your own seasonal checklist can add tasks specific to those systems."*
   - **Recommendation:** Ground seasonal readiness answers in the property's existing `InventoryItem` / home system records when present, and remove or conditionalize the boilerplate disclaimer so it never claims a 97%-complete home has no recorded systems.

8. **Clicking `"Add this recommended plant to my home."` Re-Opens the Room Search Form Instead of Adding the Plant (Turns 15–16):**
   - **Observed Behavior (Turns 15–16):** After Turn 15 (`"Find plants that fit a room"` for `Laundry`) returns 8 recommended plants (`1. Spider Plant`, `2. Snake Plant`, etc.), clicking the action to add a recommended plant (`"Add this recommended plant to my home."`, Turn 16) opens the `"Find plants for a room"` search form (`"Choose the room and the growing conditions you want recommendations for"`) instead of an add-plant confirmation/capture flow for the selected plant.
   - **Recommendation:** Fix the action routing/intent mapping for `"Add this recommended plant to my home."` so it passes the selected plant and room context directly into the plant-addition confirmation flow rather than re-triggering the room plant recommendation search capture.

---

### 3.3 Medium (`P1`/`P2`) & Low (`P2`) Live Findings

9. **Container Width Jumps Across Consecutive Turns (`1140px` vs. `920px` vs. `800px`):**
   - **Observed Behavior (Turns 1–30):** On the `1658px` viewport (`main` width `1385px`), Turns 1, 3, 4, 9, 13, and 29 render at **`width: 1140px`** (`x: 394.88` to `1534.88`), while Turns 2, 6, 7, 8, 10–12, 14–28, and 30 shrink to **`width: 920px`** (`x: 504.88` to `1424.88`), and seasonal sub-cards inside Turn 6 cap at **`800px`**. This causes both Cozy's left margin and the user's right-aligned question bubbles to jump horizontally by **`110px`** between consecutive turns.
   - **Recommendation:** Anchor the outer turn `<article>` (and user question bubble) to a single consistent column width, and allow only wide data visualizations/tables to expand gracefully from the same left alignment edge.

10. **Content Security Policy (CSP) Blocks Inline Styles on Lifespan / Progress Bars (Turns 9 & 20):**
    - **Observed Behavior (Turns 9 & 20):** When rendering the `Status Board` (Turn 9, 25 tracked items) and `Appliance Oracle` (Turn 20, 7 systems approaching end of life with lifespan progress bars), Chrome logs CSP violations:
      `Applying inline style violates the following Content Security Policy directive 'style-src-elem 'self' 'nonce-...''`.
    - **Recommendation:** Replace inline `style={{ width: ... }}` / injected `<style>` elements in Status Board and Appliance Oracle progress indicators with CSP-safe SVG `<rect width="...">`, native `<progress>`, or Tailwind width/CSS-variable classes supported by the CSP policy.

11. **Raw Database Enum Strings & Duplicate Badges in Claims & Seller-Prep Receipts (Turns 24 & 30):**
    - **Observed Behavior (Turns 24, 27, 30):**
      - In Turn 24 (`"Do I have any pending claims?"`), open claim rows render duplicate `"draft"` badges and unformatted enum tokens: `Water damage claim · draft · water damage · draft` and `Fire or smoke claim · draft · fire smoke · draft`.
      - In Turn 27 (`Project Tracker`), project rows duplicate the status in both Title Case and UPPERCASE: `Office Desk · Planning · PLANNING · $500 budget`.
      - In Turn 30 (`"Pursue this seller-prep checklist item."` Receipt), the `Decision` field renders raw lowercase enum `pursue` instead of `"Pursue"` / `"Pursuing"`.
    - **Recommendation:** Deduplicate status badges in `ClaimResultList` and Project Tracker presenters, and humanize all status/decision enum values before rendering in list subtitles and confirmation receipts.

12. **Left Rail Indicator Line-Wrap (`"My Home Record 97% complete"`) & Duplicate Session Titles ([`ExploreWithCozy.tsx:139`](../../apps/frontend/src/components/ask/workspace/ExploreWithCozy.tsx#L139)):**
    - **Observed Behavior (Turns 1–30):** In the `272px` sidebar, `"My Home Record"` and `"97%"` stay on line 1 while `"complete"` wraps onto line 2 by itself (increasing topic row height and further squeezing the history scroller). Meanwhile, in the `TODAY` history list, all 4 sessions have the identical title `"Show me what needs attention now or soon"` because every new session was started from the same top starter chip.
    - **Recommendation:** Shorten the indicator badge to `"97%"` (with `whitespace-nowrap`) in `ExploreWithCozy.tsx`, and update a session's title after the first user-specific follow-up or disambiguate identical starter-chip session titles with a topic/timestamp suffix.

13. **Single-Session Bloat Across Unrelated Topics (`30 turns`, `24,758px` Scroll Height):**
    - **Observed Behavior (Turns 1–30):** Clicking topics in `EXPLORE WITH COZY` or the `"More ideas"` modal (`What Ask Cozy can help with`) appends every prompt into the same active session (`5ef326d2-...`), growing the single DOM stream to **30 turns (`24,758px` scroll height)** across 12 unrelated domains while the sidebar still titles the thread `"Show me what needs attention now or soon"`.
    - **Recommendation:** Offer a subtle `"Start in a new conversation"` option (or topic separator with automatic session title update) when switching to an unrelated domain via `Explore with Cozy`, and pair with the floating `"Jump to latest ↓"` pill for long threads.

14. **19 Form Inputs Missing `id` or `name` Attributes Across Inline Workflows (Turns 11, 16, 18, 26):**
    - **Observed Behavior (Turns 11, 16, 18, 26):** Across the HOA setup form (Turn 11), Plant Advisor room setup form (Turn 16), Upgrade Planner decision form (Turn 18), and 4-step Project Setup wizard (Turn 26), Chrome DevTools flagged `A form field element should have an id or name attribute (count: 19)`.
    - **Recommendation:** Add deterministic `id` and `name` attributes (paired with `<label htmlFor={...}>`) to all `<input>`, `<select>`, and `<textarea>` elements in `ConversationalCapture.tsx` and `CaptureCards.tsx`.

---

## 4. Prioritized Implementation Roadmap

| Priority | Item | Target Files | Effort |
| :---: | :--- | :--- | :---: |
| **P0** | **Fix Left Sidebar Scroller Height (`34px` Crush):** Make `Explore with Cozy` collapsible or scroll within a unified rail body and tighten vertical padding so conversation history is visible on `749px`-tall laptop screens; fix `"97% complete"` badge wrapping (`whitespace-nowrap`). | [`ConversationHistoryNav.tsx`](../../apps/frontend/src/components/ask/workspace/ConversationHistoryNav.tsx), [`ExploreWithCozy.tsx`](../../apps/frontend/src/components/ask/workspace/ExploreWithCozy.tsx) | S |
| **P0** | **Fix Broken Interactive Workflows (`Review project` & `Record my decision`):** Fix `"Unsupported presentation version"` fallback when clicking `[Review project]` on newly created projects (Turn 28), and fix `HTTP 409 Conflict` (`"This execution does not have an active inline capture."`) when submitting an Upgrade Planner decision (Turn 18). | Backend `projectTracker` / `upgradePlanner` presenters & [`CaptureCards.tsx`](../../apps/frontend/src/components/ask/workspace/CaptureCards.tsx) | M |
| **P0** | **Remove Internal Ranking Jargon from `What matters now` Cards:** Strip `"Ranked here because: stable tie break."` and raw internal scoring dimension lists (`"higher consequence, higher urgency..."`) from Home Action priority cards. | Backend `homeActions` / priority presenter & [`PriorityAndOutcomeBlocks.tsx`](../../apps/frontend/src/components/ask/blocks/PriorityAndOutcomeBlocks.tsx) | S |
| **P0** | **Wire `<CollectionStatusNote>` & `sectionHasNextPage`** across `SeasonalPlanResultList`, `PatternFrame`, `MaintenanceResultList`, and specialized list renderers; fix missing test props in `negotiationShieldReview.test.tsx`. | [`SeasonalPlanResultList.tsx`](../../apps/frontend/src/components/ask/SeasonalPlanResultList.tsx), [`PatternParts.tsx`](../../apps/frontend/src/components/ask/patterns/PatternParts.tsx), [`MaintenanceResultList.tsx`](../../apps/frontend/src/components/ask/MaintenanceResultList.tsx), [`negotiationShieldReview.test.tsx`](../../apps/frontend/src/components/ask/__tests__/negotiationShieldReview.test.tsx) | S |
| **P0** | **Fix Turn Container Width Jumps (`1140px` vs. `920px`) & Declutter Transcript:** Keep outer `<article>` and user question bubbles aligned to a single consistent column width across all turns; show `"Change and resend"` on hover/focus; remove `capitalize` from `ClarificationCard` options. | [`ExecutionCard.tsx`](../../apps/frontend/src/components/ask/workspace/ExecutionCard.tsx), [`CaptureCards.tsx`](../../apps/frontend/src/components/ask/workspace/CaptureCards.tsx) | S |
| **P0** | **Composer Auto-Resize & Non-Error Stop State:** Auto-grow composer `<textarea>` up to `max-h-48` (switching hero pill from `rounded-full` to `rounded-3xl` when multi-line); replace red `AlertTriangle` error banner on user-initiated `Stop` with quiet draft restoration. | [`AskWorkspace.tsx`](../../apps/frontend/src/components/ask/AskWorkspace.tsx), [`useAskRequest.ts`](../../apps/frontend/src/components/ask/workspace/useAskRequest.ts) | S |
| **P1** | **Fix Plant Addition Routing, Seasonal Disclaimer Contradiction & UTC Date Shift:** Route `"Add this recommended plant to my home."` to plant confirmation instead of room search (Turn 16); ground seasonal recommendations in recorded home systems (Turn 6); format date-only due dates in UTC so `10/30/2026` vs. `Oct 31, 2026` discrepancies cannot occur (Turns 1–3). | Backend `plantAdvisor`, `seasonalHomeCare`, and frontend date formatters / [`PriorityAndOutcomeBlocks.tsx`](../../apps/frontend/src/components/ask/blocks/PriorityAndOutcomeBlocks.tsx) | M |
| **P1** | **Reduce Multi-Card CTA & Rating Button Overload (Turn 4):** Demote repetitive solid-green `[Review in Ask]` buttons on 8-card priority grids to quiet secondary actions and remove per-card `Useful? 👍 👎` buttons in favor of the turn-level feedback bar. | [`PriorityAndOutcomeBlocks.tsx`](../../apps/frontend/src/components/ask/blocks/PriorityAndOutcomeBlocks.tsx), [`ExecutionCard.tsx`](../../apps/frontend/src/components/ask/workspace/ExecutionCard.tsx) | S |
| **P1** | **Humanize Enum Badges & Fix CSP Inline Styles (Turns 9, 20, 24, 27, 30):** Remove duplicate `draft · water damage · draft` and `Planning · PLANNING` tokens, format `pursue` in Seller-Prep receipts, and replace CSP-blocked inline styles on Status Board and Appliance Oracle progress bars. | [`ClaimResultList.tsx`](../../apps/frontend/src/components/ask/ClaimResultList.tsx), backend `claims` / `projectTracker` / `sellerPrep` presenters, Status Board & Appliance Oracle block components | S |
| **P1** | **Calm Landing Polish:** Hide empty `Decisions to make` / `Active major moment` placeholder cards; distinguish missing `selectedPropertyId` from API failure; allow starter pills to wrap or show scroll affordances. | [`CalmLanding.tsx`](../../apps/frontend/src/components/ask/calm/CalmLanding.tsx) | S |
| **P1** | **Universal Composer Attachments:** Allow photo/PDF uploads (`AttachEvidenceControl`), drag-and-drop, and clipboard paste in the hero and footer composers without requiring a prior entity-scoped turn. | [`AskWorkspace.tsx`](../../apps/frontend/src/components/ask/AskWorkspace.tsx), [`AttachEvidenceControl.tsx`](../../apps/frontend/src/components/ask/AttachEvidenceControl.tsx) | M |
| **P1** | **Unify Calm Visual Adoption Across All Block Types:** Expand `isCalmAdopter` and update `SummaryBlock` seasonal cards, `MetricRowBlock`, `ProactiveInsightBlock`, and `DecisionBlocks` to respect `useCalmChrome()`. | [`calmAnswers.ts`](../../apps/frontend/src/features/ask/calmAnswers.ts), [`CoreBlocks.tsx`](../../apps/frontend/src/components/ask/blocks/CoreBlocks.tsx), [`DecisionBlocks.tsx`](../../apps/frontend/src/components/ask/blocks/DecisionBlocks.tsx) | M |
| **P2** | **Action Overflow Cap & Form Input Accessibility (`id`/`name`):** Apply the 2-action + `"More"` overflow disclosure to non-dense rows in `GenericGroupedListBlock`, check item-level primary actions in `evaluatePresentationQuality.ts`, and add `id`/`name` attributes to all 19 inline capture/confirmation form fields. | [`GroupedListBlock.tsx`](../../apps/frontend/src/components/ask/blocks/GroupedListBlock.tsx), [`ConversationalCapture.tsx`](../../apps/frontend/src/components/ask/calm/ConversationalCapture.tsx), [`CaptureCards.tsx`](../../apps/frontend/src/components/ask/workspace/CaptureCards.tsx) | S |
| **P2** | **Desktop Rail, Session Naming & Long-Thread Navigation:** Default history/discovery rail to expanded on wide desktop screens (`xl+`), hide inactive row `MoreHorizontal` menus until hover/focus, auto-update generic starter-chip session titles, and add a floating `"Jump to latest ↓"` button when scrolled up. | [`historyRail.ts`](../../apps/frontend/src/features/ask/historyRail.ts), [`ConversationSessionRow.tsx`](../../apps/frontend/src/components/ask/ConversationSessionRow.tsx), [`AskWorkspace.tsx`](../../apps/frontend/src/components/ask/AskWorkspace.tsx) | M |

