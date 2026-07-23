# ContractToCozy — Living Home Record and Coverage Intelligence

Status: Implemented beta contract

Last updated: July 23, 2026

## 1. Product model

The Living Home Record tracks both property-level systems and room-level possessions. The Home Record presents them as two explicit groups:

- **Systems & Structure** — roof, HVAC, water heater, electrical, plumbing, safety, exterior, and other whole-home systems.
- **Appliances & Belongings** — room-associated appliances, electronics, furniture, valuables, and other possessions.

Property systems are valid Home Record assets even when they are not assigned to a room. Their location label is **Whole home**, never **Unassigned**. Homeowner-facing labels use canonical names such as **Roof**, **Water Heater**, and **HVAC Furnace**.

Automatically inferred systems retain provenance such as **Based on property details** or **Needs confirmation**. They are not presented as manually entered records.

## 2. Canonical coverage states

Coverage is derived by `inventoryCoverageState.service.ts` and `coverageGap.service.ts`. A missing warranty or insurance relation alone is not a coverage gap.

| State | Meaning | Owner coverage action |
| --- | --- | --- |
| `CONFIRMED` | Active warranty or policy evidence is linked | No |
| `MISSING` | Item exists, owner responsibility and lifecycle context are sufficient, the user confirmed no coverage, and financial relevance is known | Yes |
| `MANAGED_ELSEWHERE` | HOA, landlord, or a shared party is responsible | No |
| `INCOMPLETE` | Confirmation, responsibility, lifecycle, condition, value, or coverage evidence is missing or uncertain | No |
| `NOT_REQUIRED` | The user explicitly waived coverage or confirmed that the inferred system is absent | No |

An inferred item with unknown age, value, responsibility, or coverage evidence must say **Coverage information incomplete**. It must not show a red **Coverage gap** badge or prioritize **Get coverage**.

Exact installation year is an accuracy prerequisite when there is otherwise insufficient context, but it is not absolute: verified active/expired policy evidence can establish a factual coverage state without an exact age. Recorded replacement value is preferred; a disclosed estimate may satisfy financial relevance.

## 3. Responsibility and applicability

Responsibility is resolved consistently for Roof, HVAC, Plumbing/Water Heater, common safety, building exterior, and shared electrical/structural/site systems.

- `OWNER` may receive owner maintenance, financial-risk, provider, and coverage actions when the remaining prerequisites are satisfied.
- `ASSOCIATION` displays **Managed by your HOA**.
- `LANDLORD` displays **Managed by your landlord**.
- `SHARED` displays **Shared responsibility**.
- Unknown responsibility keeps an inferred property system incomplete.

A system managed elsewhere remains in the Living Home Record because it physically belongs to the property, but homeowner coverage-gap, replacement, booking, and risk actions are suppressed. Relevant HOA/landlord/contact/document actions may be offered instead.

Applicability fails closed. A basement-dependent asset or recommendation is not created when the property has no confirmed basement. Unknown applicability requests or waits for the required Property Context rather than manufacturing a homeowner problem.

## 4. Just-in-time coverage capture

Opening an incomplete item evaluates:

```text
COVERAGE_INTELLIGENCE / ASSESS_ITEM_COVERAGE
inventoryItemId = selected item
```

The same-screen sequence is:

1. Confirm an inferred item exists.
2. Confirm who is responsible.
3. Capture approximate installation/replacement year and condition.
4. Capture warranty/policy evidence, **I don't have coverage**, or **I'm not sure**.
5. Capture recorded value or disclose an estimated replacement value.
6. Save, re-evaluate, and refresh the item inline.

**I'm not sure** remains `INCOMPLETE`; it is not equivalent to confirmed missing coverage. The workflow must remain on the current item and must not redirect to the full Property Details editor.

## 5. Canonical consumers

The backend coverage detector is the source of truth for:

- Home attention cards and Home-at-a-glance counts;
- the full Prioritized Action Plan;
- Resolution Center coverage cases;
- Active major moments and guidance journeys;
- Inventory/Home Record badges, filters, and summaries;
- room health and room coverage counts;
- coverage analysis and protection tools;
- provider and risk-derived owner actions.

Frontend projections must consume `coverageState`, `coverageActionable`, `coverageStateLabel`, `effectiveReplacementCostCents`, and responsibility metadata. They must not reconstruct a gap from `!warrantyId`, `!insurancePolicyId`, or local partial-coverage rules.

Actionable financial thresholds are currently:

- Appliances & Belongings: effective replacement value of at least $250.
- Systems & Structure: effective replacement value of at least $500.

## 6. Journey reconciliation

An active `coverage_gap_resolution` journey is historical workflow state, not independent proof that a current gap exists.

When responsibility or item context changes:

- `CONFIRMED`, `MANAGED_ELSEWHERE`, and `NOT_REQUIRED` journeys are archived;
- journeys for removed/hidden items are archived;
- `MISSING` and `INCOMPLETE` journeys may remain active because the former is actionable and the latter preserves a valid JIT capture workflow;
- Home selects an Active major moment only when that journey is retained by the canonical action feed.

This prevents an association-managed Roof from resurfacing on Home or Guidance after it has been removed from current coverage actions.

## 7. Inventory documents and export

Inventory items can link receipts, manuals, warranties, insurance policies, and other documents. Document intelligence may suggest item associations but does not silently force them. CSV export includes room/location, item metadata, costs, coverage relations, and document names for claims and household records.

## 8. Acceptance criteria

- Property-level systems appear under **Systems & Structure** with **Whole home**.
- Room inventory appears under **Appliances & Belongings**.
- Unknown or inferred context never becomes a definite red coverage gap.
- HOA-, landlord-, and shared-managed assets never create homeowner coverage, provider, replacement, or financial-risk actions.
- All coverage counts and filters agree for the same property and context version.
- Updating responsibility removes stale owner actions and reconciles active coverage journeys.
- The Active major moment cannot bypass canonical action eligibility.
- JIT capture stays inline and re-evaluates the selected item after save.
