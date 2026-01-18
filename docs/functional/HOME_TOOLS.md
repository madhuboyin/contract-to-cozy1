# Home Tools — Functional Requirements Document (FRD)

## Product
**Contract-to-Cozy**  
Homeowner Intelligence Platform

## Module
**Home Tools** (Property-Scoped Analytical Tools)

## Document Version
v1.0 — Phase 1 Complete  
Prepared for Phase 2 planning

---

## 1. Overview

**Home Tools** is a set of property-scoped analytical experiences designed to help homeowners understand:
- Why their costs are increasing
- Whether appreciation is outpacing expenses
- How insurance and tax trends affect them locally
- The true, long-term cost of owning a home

These tools are intentionally **educational, explainable, and trust-building**, differentiating Contract-to-Cozy from listing-centric platforms (Zillow, Redfin).

---

## 2. Goals & Principles

### Core Goals
- Reduce homeowner anxiety around rising costs
- Create “aha” moments through plain-English insights
- Establish Contract-to-Cozy as a trusted authority
- Lay groundwork for premium AI-driven decision tools

### Design Principles
- Calm, non-alarmist language
- Visual clarity over dense tables
- Explicit confidence labeling (modeled vs factual)
- Property-scoped, not generic market data

---

## 3. Home Tools Navigation (Shared)

### Placement
- **Horizontal Home Tools rail**
- Located **under property header**
- Placed **above the “Ready to sell?” CTA banner**

### Behavior
- Desktop: Inline horizontal pill buttons
- Mobile: Auto-hidden → bottom sheet
- Active tool highlighted
- Hover tooltips explain value of each tool

### Tools Included
1. Property Tax
2. Cost Growth
3. Insurance Trend
4. Cost Explainer
5. True Cost of Home Ownership

---

## 4. Feature Breakdown (Phase 1)

---

### 4.1 Property Tax Analyzer

#### Purpose
Help homeowners understand **tax trajectory and reassessment pressure**.

#### Outputs
- Current annual property tax
- Historical trend (5y / 10y)
- Year-over-year delta
- Reassessment cadence indicators

#### Data Sources (Phase 1)
- Modeled tax history
- State reassessment heuristics

#### Value
- Explains tax volatility
- Reduces confusion around reassessments

#### Confidence Labeling
- Medium (modeled)

---

### 4.2 Home Cost Growth Analyzer

#### Purpose
Answer: *“Is my home actually costing me more than it’s gaining?”*

#### Outputs
- Home value appreciation trend
- Total ownership expenses trend
- Net delta (appreciation – expenses)
- CAGR appreciation
- Net 5-year impact

#### Visualization
- Multi-line chart:
  - Home value
  - Total expenses
  - Net delta
- Toggle: Home Value / Expenses / Net Δ

#### Data Sources (Phase 1)
- Modeled appreciation
- Aggregated expense estimates

#### Value
- Strong financial “reality check”
- Differentiates from listing platforms

---

### 4.3 Insurance Cost Trend Analyzer

#### Purpose
Explain **insurance cost inflation** and localized risk pressure.

#### Outputs
- Insurance cost trend by ZIP
- Comparison vs state average
- Climate / claims pressure indicators

#### Data Sources (Phase 1)
- Modeled trend
- Regional risk heuristics

#### Value
- High emotional relevance
- Bridges naturally into Risk & Protection features

---

### 4.4 “Why Is My Home Cost Increasing?” — Cost Explainer

#### Purpose
Provide a **plain-English narrative** explaining cost increases.

#### Outputs
- Category breakdown:
  - Taxes
  - Insurance
  - Maintenance
  - Total
- Bullet-point explanations
- Confidence labeling per category
- Snapshot cards + trend visualization

#### Language Style
- Calm
- Non-technical
- Reassuring but honest

#### Value
- Trust builder
- Authority positioning
- AI-readiness layer for future explainers

---

### 4.5 True Cost of Home Ownership Calculator

#### Purpose
Show the **real 5-year cost** of owning a home.

#### Outputs
- Annual current cost
- 5-year projected total
- Category breakdown:
  - Property tax
  - Insurance
  - Maintenance
  - Utilities
- Trend visualization with legend

#### Data Sources (Phase 1)
- Tax + insurance (modeled)
- Maintenance heuristic (~1% of value)
- Utilities (regional averages)

#### Value
- Buyer education
- Cost realism
- Repeat usage tool

---

## 5. Shared UX & UI Requirements

### Charts
- Multi-line charts with:
  - Legends (bottom-aligned)
  - Hover tooltips per line
- Emphasized “Total” line
- Subtle comparison lines for components

### Confidence Indicators
- High / Medium / Estimated badges
- Visible wherever data is modeled

### Accessibility
- Keyboard navigable
- Tooltips readable without hover (mobile)

---

## 6. Phase 1 Status (Current)

### ✅ Implemented
- All Home Tools UI
- Backend services (modeled data)
- Property-scoped routing
- Home Tools rail (desktop + mobile)
- Trend charts + legends
- Confidence labeling

### ⚠️ Known Limitations
- Modeled data only (no external APIs)
- No snapshot persistence
- No cross-tool correlation views
- Utilities data is coarse (regional avg)

---

## 7. Phase 1 Pending Enhancements (Near-Term)

These can still be completed within Phase 1 if desired:

1. Tool-to-Tool Deep Links  
   - From Cost Explainer → Cost Growth / Insurance Trend
2. Inline “What does this mean?” helper text
3. Empty-state messaging when data confidence is low
4. Export (PDF / CSV) for True Cost summary
5. Save snapshots for year-over-year comparison

---

## 8. Phase 2 Requirements (Planned)

### Data Enhancements
- State DOI insurance filings
- FEMA / NOAA climate correlation
- Utility provider-level averages
- Real tax assessment history ingestion

### Intelligence Layer
- AI-generated explanations (LLM-backed)
- “What should I do next?” recommendations
- Scenario simulations (sell / hold / renovate)

### UX Enhancements
- Cross-tool comparison view
- Timeline replay of ownership costs
- Risk-adjusted cost forecasting

### Monetization
- Free tier: Modeled insights
- Premium tier:
  - Real data sources
  - AI explainers
  - Scenario planning
  - PDF exports

---

## 9. Success Metrics

- Tool engagement rate
- Repeat visits per property
- Time spent in Cost Explainer
- Conversion to premium insights
- User trust feedback (qualitative)

---

## 10. Summary

**Home Tools** forms the analytical backbone of Contract-to-Cozy’s homeowner experience.

Phase 1 successfully delivers:
- Trust
- Clarity
- Differentiation

Phase 2 will transform these tools into:
- Predictive intelligence
- Decision orchestration
- Revenue-generating premium features

---

_End of document_

# Home Tools — Phase 2 Product Requirements Document (PRD)

## Product
Contract-to-Cozy

## Module
Home Tools (Phase 2 — Intelligence & Decision Layer)

## Document Version
v2.0 (Post Phase-1 launch)

---

## 1. Phase 2 Objectives

Phase 2 evolves **Home Tools** from *explainable insights* into **actionable intelligence**.

### Primary Goals
- Replace modeled assumptions with real-world data
- Introduce AI-driven reasoning and recommendations
- Enable scenario planning (sell / hold / renovate / insure)
- Create clear premium differentiation

---

## 2. What Phase 2 Unlocks

| Phase 1 | Phase 2 |
|------|------|
| Static modeled trends | Live + historical datasets |
| “Why did this happen?” | “What should I do next?” |
| One tool at a time | Cross-tool correlation |
| Educational | Decision-support |

---

## 3. Phase 2 Feature Enhancements (by Tool)

---

### 3.1 Property Tax Analyzer (Phase 2)

#### New Capabilities
- Ingest **county-level assessment history**
- Track **millage rate changes**
- Detect reassessment events automatically

#### New Outputs
- “Reassessment risk score”
- Upcoming reassessment window prediction
- Tax appeal eligibility indicator

#### AI Additions
- Plain-English explanation of assessment changes
- “Should you appeal?” guidance

---

### 3.2 Cost Growth Analyzer (Phase 2)

#### New Capabilities
- Real appreciation data (MLS / FHFA / Case-Shiller proxy)
- Expense inflation adjusted by region
- Risk-adjusted appreciation vs expense delta

#### New Outputs
- “Hold vs Sell” financial signal
- Break-even year for ownership
- Net cost sensitivity analysis

#### AI Additions
- Narrative summary:
  > “At your current trajectory, expenses outpace appreciation after Year 7.”

---

### 3.3 Insurance Trend Analyzer (Phase 2)

#### New Data Sources
- State DOI rate filings
- FEMA disaster declarations
- NOAA climate risk trends
- Reinsurance pricing indices

#### New Outputs
- Insurance volatility score
- Cancellation / non-renewal risk
- State vs ZIP divergence indicator

#### AI Additions
- “Why insurers are increasing rates in your area”
- Mitigation recommendations (roof, flood, fire hardening)

---

### 3.4 Cost Explainer (Phase 2)

#### New Capabilities
- LLM-generated explanations (grounded, source-cited)
- Confidence-weighted narratives
- Cross-tool reasoning

#### New Outputs
- Ranked drivers of cost increase
- “Primary vs secondary causes”
- Forecasted explanation (next 2–3 years)

#### UX
- Expandable “AI reasoning” panel
- Toggle: Simple / Detailed

---

### 3.5 True Cost of Home Ownership (Phase 2)

#### New Capabilities
- Utility provider-specific data
- Maintenance curves by home age
- Renovation-adjusted projections

#### New Outputs
- 10-year total ownership cost
- Cost per square foot per year
- Ownership cost vs rent comparison

#### AI Additions
- “Is this home financially efficient?”
- Ownership optimization suggestions

---

## 4. Cross-Tool Intelligence (New in Phase 2)

### Unified Insights Layer
- Correlate:
  - Insurance ↑ → Risk events
  - Taxes ↑ → Reassessment cycles
  - Maintenance ↑ → Home age signals

### Examples
- “Insurance increases explain 62% of your net cost growth.”
- “Your ZIP shows higher volatility than the state average.”

---

## 5. Scenario Planning (Phase 2)

### Scenarios Supported
- Sell in X years
- Hold for X years
- Renovate (with budget input)
- Refinance / re-insure

### Outputs
- Financial outcome per scenario
- Risk-adjusted projections
- Recommendation confidence score

---

## 6. Monetization (Phase 2)

### Free Tier
- Modeled insights
- Limited history
- No AI recommendations

### Premium Tier
- Real datasets
- AI explainers & recommendations
- Scenario planning
- PDF exports & reports
- Historical snapshots

---

## 7. Phase 2 Success Metrics

- Premium conversion rate
- Tool cross-navigation rate
- Scenario usage
- AI explanation engagement
- User trust feedback

---

## 8. Risks & Mitigations

| Risk | Mitigation |
|----|----|
| Over-alarming users | Calm language + confidence badges |
| Data trust | Source citations |
| AI hallucination | Strict grounding + deterministic rules |

---

_End of PRD_

# Home Tools → AI Roadmap

## Purpose

This roadmap defines how **Home Tools evolve into an AI-powered homeowner intelligence system** without sacrificing trust, explainability, or control.

---

## AI Design Philosophy

- AI explains — it does not obscure
- Every insight is traceable to data
- Confidence is explicit
- Users stay in control

---

## AI Maturity Stages

### Stage 1 — Explainable Intelligence (Completed)

✅ Deterministic models  
✅ Human-readable narratives  
✅ Confidence labeling  
✅ No opaque ML decisions  

---

### Stage 2 — Assisted Reasoning (Phase 2)

🔄 LLM-generated explanations  
🔄 Source-grounded responses  
🔄 Cross-tool reasoning  
🔄 Scenario-based insights  

**Example**
> “Your insurance is rising primarily due to reinsurance pricing after repeated regional flood losses.”

---

### Stage 3 — Predictive Intelligence (Phase 3)

🔮 Forecasted risk events  
🔮 Cost trajectory alerts  
🔮 Preventive recommendations  

**Example**
> “Based on your roof age and ZIP, insurance premiums may spike within 18 months.”

---

### Stage 4 — Autonomous Planning (Phase 4)

🤖 Proactive action plans  
🤖 Task orchestration  
🤖 Vendor recommendations  
🤖 Continuous optimization  

**Example**
> “We recommend replacing your roof in 2026 to avoid a projected 22% insurance increase.”

---

## AI Capability Map

| Capability | Phase |
|---------|------|
| Natural language explanation | Phase 2 |
| Cross-tool correlation | Phase 2 |
| Risk prediction | Phase 3 |
| Preventive maintenance planning | Phase 3 |
| Autonomous orchestration | Phase 4 |

---

## AI Guardrails

### Technical
- Retrieval-augmented generation (RAG)
- Deterministic fallbacks
- Strict prompt constraints

### UX
- Confidence badges
- “Why am I seeing this?” links
- Explainability overlays

### Ethical
- No financial advice claims
- No fear-based nudging
- Transparency over optimization

---

## Strategic Differentiation

**Zillow / Redfin**
- Static
- Listing-focused
- Transactional

**Contract-to-Cozy**
- Ownership-focused
- Continuous intelligence
- Emotionally aware
- Decision-oriented

---

## Long-Term Vision

Home Tools becomes:
> *A living financial and risk companion for homeowners — not a calculator.*

---

_End of Roadmap_
