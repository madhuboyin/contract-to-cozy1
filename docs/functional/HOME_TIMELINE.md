# Functional Requirements Document (FRD)
## Feature: Home Timeline (List + Visual Replay)

---

## 1. Overview

**Home Timeline** is a core engagement and retention feature that presents a homeowner’s complete property history as a chronological narrative. It consolidates events across inventory, documents, claims, improvements, maintenance, and value changes into a unified timeline.

The feature supports **two presentation modes**:
- **List Mode** — dense, scannable, operational view
- **Visual Mode** — emotional, story-driven, replayable experience

The Home Timeline is designed to:
- Increase emotional ownership
- Encourage habitual engagement
- Create a resale-ready “home story”
- Serve as a foundation for future AI insights and summaries

---

## 2. Goals & Success Criteria

### Goals
- Provide a single source of truth for a home’s history
- Make progress and investments feel tangible
- Offer a “wow” experience without sacrificing usability
- Enable future replay, storytelling, and AI narration

### Success Metrics
- Increased session duration on Property pages
- Increased feature revisit frequency
- Higher document upload and inventory completion rates
- Positive qualitative feedback on “story” and “timeline” experience

---

## 3. Supported Event Types

The timeline aggregates events from multiple domains:

| Category | Examples |
|--------|---------|
| Inventory | Item created, purchased, installed |
| Improvements | Remodels, upgrades, renovations |
| Maintenance | Services, inspections |
| Claims | Claim opened, status changed, closed |
| Documents | Warranty uploaded, inspection report |
| Value | Estimated home value updates |
| Milestones | Move-in, remodel completion |
| Notes | Manual or system notes |
| System | Seed events, auto-generated events |

---

## 4. Data Model (Logical)

Each timeline event is derived from a canonical **Home Event** model with the following logical fields:

### Core Fields
- `id`
- `propertyId`
- `type` (PURCHASE, IMPROVEMENT, CLAIM, DOCUMENT, etc.)
- `subtype` (optional)
- `title`
- `summary` (optional)
- `occurredAt` (ISO timestamp)

### Metadata
- `importance` (NORMAL | HIGHLIGHT)
- `groupKey` (optional, for future grouping)
- `amount` (cost, if applicable)
- `valueDelta` (home value impact, if applicable)
- `meta.semantic` (AI promotion metadata)

### Relationships
- Linked documents
- Linked inventory items
- Linked claims / policies (where applicable)

---

## 5. Modes of Presentation

### 5.1 List Mode (Default)

**Purpose**
- Fast scanning
- Operational clarity
- Debug-friendly

**Characteristics**
- Vertical list of events
- Compact cards
- Badges for type, importance, subtype
- Attachments preview
- No animation dependencies

**Behavior**
- Filterable by type
- Paginated / limited
- Always available
- Works even on low-end devices

---

### 5.2 Visual Mode (Story Mode)

**Purpose**
- Emotional engagement
- Narrative storytelling
- “This is my home’s journey”

**Layout**
- Vertical timeline spine
- Event nodes placed chronologically
- Cards aligned along the spine
- Sticky year headers

**Visual Cues**
- Icons by event type
- Highlight events visually emphasized
- Subtle background emphasis for milestones

---

## 6. Replay Mode (MVP)

Replay Mode is an **optional enhancement inside Visual Mode**.

### Behavior
- Events are revealed chronologically
- One event appears at a time
- Automatic scrolling as events appear
- Replay can be paused, resumed, restarted

### Controls
- Replay On / Off toggle
- Pause / Resume
- Restart
- Speed selector:
  - Slow
  - Calm (default)
  - Fast

### Animations (No External Libraries)
- Fade-in + slide-up for newly revealed events
- Highlight events:
  - Slightly stronger entrance motion
  - One-time subtle glow on timeline node

---

## 7. UX & Interaction Details

### Filters
- Shared across List and Visual modes
- Filter by event type
- Adjustable limit

### Mode Persistence
- Last selected mode saved in localStorage
- Restored on page reload

### Accessibility
- No reliance on color alone
- Icons + text labels
- Animations are subtle and non-distracting

---

## 8. Error Handling

- Graceful empty state when no events exist
- Clear messaging for load errors
- Replay disabled automatically if no events
- Visual mode falls back safely to list mode

---

## 9. Performance Considerations

- Single API call shared across modes
- Replay mode renders incrementally
- No animation libraries → minimal bundle impact
- Hooks usage follows React rules strictly

---

## 10. Security & Permissions

- Property-scoped authorization enforced server-side
- Events only visible to authorized property users
- No cross-property leakage

---

## 11. Value Adds (Business Impact)

### Emotional Retention
- Users see progress, effort, and investment visually
- Creates attachment beyond functional usage

### Resale Readiness
- Timeline doubles as a home history record
- Useful for buyers, inspectors, agents

### Engagement Loop
- Replay encourages re-visits
- Highlight moments reinforce milestones

### Zero Marginal Cost
- Uses existing data sources
- No external APIs required

---

## 12. Future Enhancements (Roadmap)

### Near-Term (Low Effort, High Impact)
- Milestone-only filter
- Grouped events (e.g., “Kitchen Remodel – 6 events”)
- Timeline export (PDF / share link)

### Mid-Term
- AI-generated “Home Story Summary”
- Seasonal / yearly recap (“Your 2025 Home Journey”)
- User-added manual milestones

### Long-Term (Premium)
- AI voice narration of replay
- Sentiment curve (“Home Confidence Over Time”)
- Buyer-ready timeline view
- Realtor / inspector sharing mode

---

## 13. Out of Scope (Current Phase)

- Drag/drop reordering
- Manual event editing
- Collaborative annotations
- Third-party photo ingestion (e.g. Google Photos)

---

## 14. Summary

The **Home Timeline** transforms fragmented home management data into a cohesive, emotionally resonant experience. By combining a reliable list view with a visually rich replayable story mode, it balances utility with delight and establishes a strong foundation for future AI-driven home intelligence features.

---

**Status:** Implemented (List + Visual + Replay MVP)  
**Owner:** Product / Platform  
**Next Review:** Post user feedback & engagement metrics
