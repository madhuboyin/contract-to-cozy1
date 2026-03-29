# Signal & Action Audit (Normalized) — v2.0 (New)

**Generated:** 2026-03-17
**Source of truth:** `signal-action-audit-v2.json`
**Scope:** Full codebase (backend + frontend + workers + schema)
**Purpose:** Guidance Engine design foundation

---

## 1. Executive Summary

### Key Metrics

| Metric | Count |
|--------|-------|
| Total normalized signals | 58 |
| Total signal families | 17 |
| Signals with no action (`isNoAction=true`) | 12 |
| Generic CTA count (`isGenericCta=true`) | 24 |
| Premature booking count (`isPrematureBooking=true`) | 8 |
| Backend exists / frontend weak gap | 55 |
| High confidence signals | 33 |

### Decision Stage Distribution

| Stage | Count | Description |
|-------|-------|-------------|
| awareness | 16 | User learns about issue — no action path yet |
| diagnosis | 11 | User investigating severity |
| decision | 17 | User choosing action path |
| execution | 10 | User taking action |
| validation | 2 | User verifying before acting |
| tracking | 2 | User monitoring outcome |

---

## 2. Signal Taxonomy

The following `signalIntentFamily` values represent the normalized intent classification for the Guidance Engine:

- **`home_value_risk`**: Signals impacting property appreciation or equity.
- **`lifecycle_end_or_past_life`**: Asset age > 85% of expected lifespan.
- **`overdue_maintenance`**: Missed maintenance windows or high failure probability.
- **`coverage_gap`**: Missing insurance, warranty, or insufficient limits.
- **`policy_expiring`**: Insurance/warranty renewal required.
- **`price_above_market`**: Contractor quotes exceeding local benchmarks.
- **`recall_detected`**: Active safety recalls matched to inventory.
- **`inspection_due`**: Periodic or defect-driven inspection required.
- **`missing_documentation`**: Gaps in data preventing accurate scoring.
- **`seasonal_readiness_due`**: Current season preparation tasks.
- **`financial_exposure`**: Unfunded capital expenses or budget shortfalls.
- **`contractor_quality_risk`**: Urgency manipulation or disputed service.
- **`permit_compliance_gap`**: Unpermitted work risks.
- **`freeze_risk`**: Urgent plumbing protection signals.
- **`weather_risk`**: Heavy rain/storm readiness signals.

---

## 3. High-Risk Findings

### 3.1 Premature Booking (execution before diagnosis)
**Critical Pattern**: 8 signals (including HVAC, Roof, Electrical, and Plumbing) route directly to "Schedule" without a "Repair vs Replace" gate or "Coverage Check". This leads to unnecessary out-of-pocket expenses.

### 3.2 Missing Actions
**Critical Pattern**: 12 signals (including OPEN recalls and Coverage Lapses) have no frontend action. The backend correctly identifies these risks, but the user is left stranded.

### 3.3 Generic CTAs
**Critical Pattern**: 24 signals use vague CTAs like "View Details" or "View Analysis". The Guidance Engine must replace these with specific, score-band or outcome-specific next steps.

---

## 4. Top Broken Flows

1.  **Lifecycle → Booking**: Skips `replaceRepairAnalysis.service` and home warranty checks.
2.  **Recall Match → Silent**: Safety hazards are recorded in the DB but never reach the dashboard alert banner.
3.  **Coverage Gap → Information Only**: User is told they have a gap but not given a "Get Quote" or "Add Rider" path.
4.  **Weather/Freeze Risk → Disconnected**: Forecasts fire incidents, but no DIY guides or plumbing pro links are surfaced inline.

---

## 5. Signal → Ideal Step Mapping (Key Examples)

| Signal Family | Ideal Next Step | Missing Step |
|---------------|-----------------|--------------|
| `lifecycle_end` | Run Repair vs Replace Analysis | Mandatory decision gate |
| `coverage_gap` | Link to specific policy endorsement/rider | Targeted insurance routing |
| `recall_detected` | Show manufacturer remedy instructions | Remedy instructions bridge |
| `price_above_market` | Surface AI counter-script for negotiation | Negotiation tool |
| `freeze_risk` | Show DIY shut-off guide + Plumber link | Immediate safety triage |

---

## 6. Gaps Blocking Guidance Engine

1.  **Orchestration Gate**: No unified logic to intercept "Schedule" clicks with "Check Coverage" steps.
2.  **Alert Bridge**: Missing a mechanism to push worker-detected incidents (Recall, Freeze) to a global notification banner.
3.  **Context Silos**: Financial tools (Savings) don't know about Risk signals (upcoming HVAC failure), resulting in unfunded risks.
4.  **DIY/Pro Logic**: Most maintenance signals default to "Schedule Pro", missing the opportunity to provide DIY guides for easy tasks.

---
*End of Signal & Action Audit v2.0 (New)*
