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

At the same time, code inspection across the frontend and backend presentation layer identified **17 concrete UX, visual-consistency, and wiring gaps** that prevent the conversational UI from feeling uniformly cohesive across every turn and domain.

---

## 2. Layer-by-Layer Findings

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
   - **Evidence:** The composer `<textarea>` sets `rows={1}` and `max-h-48`, but has no `scrollHeight` auto-resize effect when `input` changes. Multi-sentence questions or voice dictations scroll inside a 1-line box (`min-h-10`). Inaddition, the calm hero wrapper uses `rounded-full items-center` (`line 304`), which distorts if the textarea grows taller.
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

## 3. Prioritized Implementation Roadmap

| Priority | Item | Target Files | Effort |
| :---: | :--- | :--- | :---: |
| **P0** | **Wire `<CollectionStatusNote>` & `sectionHasNextPage`** across `SeasonalPlanResultList`, `PatternFrame`, `MaintenanceResultList`, and specialized list renderers; fix missing test props in `negotiationShieldReview.test.tsx`. | [`SeasonalPlanResultList.tsx`](../../apps/frontend/src/components/ask/SeasonalPlanResultList.tsx), [`PatternParts.tsx`](../../apps/frontend/src/components/ask/patterns/PatternParts.tsx), [`MaintenanceResultList.tsx`](../../apps/frontend/src/components/ask/MaintenanceResultList.tsx), [`negotiationShieldReview.test.tsx`](../../apps/frontend/src/components/ask/__tests__/negotiationShieldReview.test.tsx) | S |
| **P0** | **Fix Turn Bubble Alignment & Declutter Transcript:** Align user question bubbles to a consistent column width independent of `askAnswerWidth`; show `"Change and resend"` on hover/focus; remove `capitalize` from `ClarificationCard` options. | [`ExecutionCard.tsx`](../../apps/frontend/src/components/ask/workspace/ExecutionCard.tsx), [`CaptureCards.tsx`](../../apps/frontend/src/components/ask/workspace/CaptureCards.tsx) | S |
| **P0** | **Composer Auto-Resize & Non-Error Stop State:** Auto-grow composer `<textarea>` up to `max-h-48` (switching hero pill from `rounded-full` to `rounded-3xl` when multi-line); replace red `AlertTriangle` error banner on user-initiated `Stop` with quiet draft restoration. | [`AskWorkspace.tsx`](../../apps/frontend/src/components/ask/AskWorkspace.tsx), [`useAskRequest.ts`](../../apps/frontend/src/components/ask/workspace/useAskRequest.ts) | S |
| **P1** | **Calm Landing Polish:** Hide empty `Decisions to make` / `Active major moment` placeholder cards; distinguish missing `selectedPropertyId` from API failure; allow starter pills to wrap or show scroll affordances. | [`CalmLanding.tsx`](../../apps/frontend/src/components/ask/calm/CalmLanding.tsx) | S |
| **P1** | **Universal Composer Attachments:** Allow photo/PDF uploads (`AttachEvidenceControl`), drag-and-drop, and clipboard paste in the hero and footer composers without requiring a prior entity-scoped turn. | [`AskWorkspace.tsx`](../../apps/frontend/src/components/ask/AskWorkspace.tsx), [`AttachEvidenceControl.tsx`](../../apps/frontend/src/components/ask/AttachEvidenceControl.tsx) | M |
| **P1** | **Unify Calm Visual Adoption Across All Block Types:** Expand `isCalmAdopter` and update `SummaryBlock` seasonal cards, `MetricRowBlock`, `ProactiveInsightBlock`, and `DecisionBlocks` to respect `useCalmChrome()`. | [`calmAnswers.ts`](../../apps/frontend/src/features/ask/calmAnswers.ts), [`CoreBlocks.tsx`](../../apps/frontend/src/components/ask/blocks/CoreBlocks.tsx), [`DecisionBlocks.tsx`](../../apps/frontend/src/components/ask/blocks/DecisionBlocks.tsx) | M |
| **P2** | **Action Overflow Cap on Standard Rows:** Apply the 2-action + `"More"` overflow disclosure to non-dense rows in `GenericGroupedListBlock` and check item-level primary actions in `evaluatePresentationQuality.ts`. | [`GroupedListBlock.tsx`](../../apps/frontend/src/components/ask/blocks/GroupedListBlock.tsx), [`evaluatePresentationQuality.ts`](../../apps/backend/src/services/ask/presentation/evaluatePresentationQuality.ts) | S |
| **P2** | **Desktop Rail & Long-Thread Navigation:** Default history/discovery rail to expanded on wide desktop screens (`xl+`), hide inactive row `MoreHorizontal` menus until hover/focus, and add a floating `"Jump to latest"` button when scrolled up. | [`historyRail.ts`](../../apps/frontend/src/features/ask/historyRail.ts), [`ConversationSessionRow.tsx`](../../apps/frontend/src/components/ask/ConversationSessionRow.tsx), [`AskWorkspace.tsx`](../../apps/frontend/src/components/ask/AskWorkspace.tsx) | M |
