# PRD: P2.2 – Recall & Safety Alerts

## Product
ContractToCozy

## Feature Code
P2.2

## Feature Name
Recall & Safety Alerts (Safety Risk Detection)

## Status
Proposed

## Priority
P2 – Fast Win

## Competitive Driver
HomeBinder (Parity + Extension)

## Effort
Low

## Expected Value
Medium → High (when integrated with Risk, Incidents, and Coverage)

---

## 1. Problem Statement

Homeowners often remain unaware of safety recalls affecting appliances, systems, or household products already installed in their homes. These recalls may pose serious risks such as fire hazards, electrical failures, water damage, or health concerns.

Currently, ContractToCozy does **not** proactively detect or surface recall-related risks for assets stored in a property’s inventory. This creates:
- Missed safety risks
- Preventable damage or injury
- Reduced trust in the platform’s “property health” promise

---

## 2. Goals & Objectives

### Primary Goals
- Detect safety recalls for inventoried assets
- Notify homeowners proactively
- Convert recalls into **trackable incidents and actions**

### Secondary Goals
- Strengthen the Property Risk & Health narrative
- Establish parity with competitors (HomeBinder)
- Lay groundwork for advanced risk & coverage workflows

---

## 3. Success Metrics

| Metric | Target |
|-----|-----|
| % of inventory assets scanned for recalls | 100% |
| Recall alerts successfully generated | >90% accuracy |
| Incidents created from recalls | Tracked |
| User engagement (view / resolve) | ≥40% |
| False positive rate | <10% |

---

## 4. Scope (v1)

### In Scope
- Match inventoried assets by **make + model**
- Detect active recalls from public sources
- Generate:
  - Incident
  - Recommended action
- Notify user via in-app notifications (digest)

### Out of Scope (v1)
- Paid recall APIs
- International recalls (non-US)
- Automated booking or claims
- Vehicle recalls (future phase)

---

## 5. User Stories

### US-1: Recall Detection
> As a homeowner, I want to know if any appliance or product in my home has an active safety recall.

### US-2: Actionable Alerts
> As a homeowner, I want recall alerts to turn into clear actions so I know what to do next.

### US-3: Risk Visibility
> As a homeowner, I want safety recalls to impact my home’s risk profile so I understand urgency.

---

## 6. Functional Requirements

### 6.1 Recall Ingestion
- System ingests recall data from:
  - US Consumer Product Safety Commission (CPSC)
- Data fields required:
  - Manufacturer
  - Model(s)
  - Category
  - Recall description
  - Hazard type
  - Recall date
  - Resolution instructions

---

### 6.2 Asset Matching Logic
- Match recall entries against inventory items using:
  - Manufacturer (string match)
  - Model (exact + partial match)
  - Category filter

#### Match Confidence Levels
| Confidence | Behavior |
|---------|--------|
| High | Auto-create incident |
| Medium | Ask user to confirm |
| Low | Informational alert only |

---

### 6.3 Incident Creation
When a recall is detected:
- Create an **Incident** with:
  - Type: `SAFETY_RECALL`
  - Severity: derived from hazard type
  - Source: `RECALL_SYSTEM`
- Link incident to:
  - Property
  - Inventory Item

---

### 6.4 Action Generation
Each recall incident generates one or more actions:
- “Contact manufacturer”
- “Schedule inspection / repair”
- “Check warranty coverage”

Actions must:
- Be trackable
- Support completion states:
  - Open
  - Completed
  - Not Applicable
  - Ignored (with reason)

---

### 6.5 Notifications
- Notify users via:
  - In-app notification
- Delivery model:
  - Digest (default)
  - Throttled to avoid fatigue

---

## 7. UX & UI Considerations

### Entry Points
- Dashboard → Alerts / Notifications
- Property → Incidents
- Inventory Item → Safety Status

### UI States
- New recall detected
- Confirmation required (medium confidence)
- Recall resolved
- Recall dismissed

### Messaging Tone
- Calm, safety-focused
- Avoid panic language
- Emphasize prevention

---

## 8. Data Model (High Level)

### New / Extended Entities
- `RecallSource`
- `RecallMatch`
- `Incident.type = SAFETY_RECALL`
- `Action.source = RECALL`

### Key Relationships
- InventoryItem → RecallMatch
- RecallMatch → Incident
- Incident → Actions

---

## 9. Non-Functional Requirements

- Batch processing supported (nightly scan)
- Idempotent recall ingestion
- No duplicate incidents for same recall + asset
- Audit trail for:
  - Recall detected
  - User confirmation
  - Resolution

---

## 10. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| False positives | Confidence scoring + user confirmation |
| Notification fatigue | Digest + throttling |
| Recall data inconsistency | Normalize ingestion |
| User anxiety | Clear, calm UX copy |

---

## 11. Dependencies

- Inventory system
- Incident management
- Action orchestration
- Notification framework

---

## 12. Future Enhancements (Post-v1)

### v1.1 – High Impact
- Coverage linkage (Warranty / Insurance)
- Risk score impact
- Recall severity weighting

### v1.2
- Auto-suggest service providers
- Recall resolution verification
- Recall-driven maintenance history updates

### v2
- Vehicle recalls (NHTSA)
- Manufacturer-specific integrations
- Predictive recall risk alerts

---

## 13. Strategic Value

This feature:
- Establishes safety credibility
- Reinforces “property health” positioning
- Acts as an entry point to higher-value workflows:
  - Coverage gaps
  - Claims
  - Preventive maintenance

---

## 14. Go / No-Go Criteria

### Go When:
- Recall ingestion is stable
- Matching accuracy ≥90%
- Incident + action workflows validated

### No-Go If:
- False positives exceed threshold
- Notifications overwhelm users
- Data ingestion becomes unreliable

---

## 15. Final Notes

This feature should be positioned externally as:
> **“Proactive Safety Risk Detection for Your Home”**

Not merely “recall alerts.”

---
