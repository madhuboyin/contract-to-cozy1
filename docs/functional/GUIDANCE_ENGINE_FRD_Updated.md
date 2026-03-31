Functional Requirements Document (FRD): End-to-End Asset Resolution & Guidance
Project: Contract to Cozy Home Management Platform
Version: 1.0
Status: Ready for Implementation
Core Principle: “I have an issue with this asset, help me resolve it end-to-end.”

1. Executive Summary
This feature transitions the Guidance Engine from a system-driven notification center to a user-initiated resolution concierge. It provides homeowners with a deterministic, linear path to resolve physical asset failures (e.g., a broken refrigerator) or service-level management tasks (e.g., an insurance renewal). By capturing historical data in small increments during the resolution process, the system builds a high-fidelity "Certified Home Record."

2. Core Product Principles
Intent-Driven: Users can proactively trigger guidance for any item in their inventory.
Deterministic Linearity: To prevent decision fatigue, journeys are capped at 5-6 steps with clear "unlocked" states.
Contextual Data Harvesting: The "2-Year Lookback" captures missing service history at the moment of highest user engagement (during an active issue).
Category Logic: Workflows branch automatically based on the scopeCategory (Asset vs. Service).

3. Initiation & Entry Point Requirements
FR-01: Full Inventory Access
Description: The guidance-overview page shall provide a non-truncated list of all items from the property Status Board.
UI Requirement: List view with search and "Category" tabs (Appliances, Systems, Services, etc.).
FR-02: Manual Trigger Mechanism
Description: Every item in the list must include a "Report Issue" or "Get Guidance" action button.
Logic: On click, the system creates a manual GuidanceJourney record with initiatedByUser: true.

4. Workflow A: Physical Asset Resolution
Target: Major Appliances, HVAC, Roof, Plumbing, etc.
Step 1: Verify & Historical Input (The 2-Year Lookback)
FR-03: History Discovery: If the "Home Timeline" contains no records for the selected asset in the last 24 months, the system MUST prompt the user for missing history.
FR-04: Data Capture: User provides:
Symptom Picker: Standardized list based on asset type (e.g., "Not Cooling," "Water Leak").
Lookback Entry: Option to add a repair from the last 2 years (Date, Cost, Resolution).
Visual Evidence: Upload area for a photo or video of the current issue.
Step 2: Check Coverage
FR-05: Claims Auditor: Execute the InsuranceAuditor service to cross-reference the symptom against policies in the Vault.
FR-06: Coverage Display: Show status: Covered (likely a claim), Partial (rider needed), or Private Pay (below deductible).
Step 3: Repair vs. Replace Analysis
FR-07: Mandatory Decision Gate: For high-value assets, run the ReplaceRepairAnalysis engine.
Output: A "Homeowner Decision" card showing remaining life vs. repair cost.
Step 4: Price & Negotiation
FR-08: Fair Price Radar: Pull localized labor/parts ranges from ServicePriceRadar.
FR-09: Negotiation Shield: Upon entry of a quote, generate scripts to help the user lower the price or verify labor hours.
Step 5: Provider & Booking
FR-10: Integrated Logistics: Show "Favorite Providers" or local pros. Auto-populate the booking request with Asset ID and Issue Description.
Step 6: Finalize & Track
FR-11: Timeline Integration: Upon completion, auto-create a HomeEvent marked as VerifiedResolution.
FR-12: Asset Sync: Automatically update the asset's lastServicedDate and condition score in the database.

5. Workflow B: Service Item Management
Target: Home Insurance, Home Warranty, Termite Bond, etc.
Step 1: Audit & Compliance
FR-13: Verify expiration dates and total annual premium.
Step 2: Gap Detection
FR-14: Identify missing critical riders (e.g., "Equipment Breakdown" or "Service Line Coverage").
Step 3: Optimization
FR-15: Compare current costs against zip-code averages via the service radar.
Step 4: Secure Vault
FR-16: Request upload of current policy. Finalize by updating the property's financial efficiency score.

6. Technical & Schema Requirements
TR-01: Database Enhancements
Update the GuidanceJourney table to support:
initiatedByUser (Boolean)
targetAssetId (UUID/String)
templateVersion (Int) - to ensure linear steps don't break during app updates.
TR-02: Tool Orchestration Wrapper
The Guidance Engine shall act as a "Controller of Controllers," calling existing tool services (InsuranceAuditor, NegotiationShield, TimelineService) and passing shared context throughout the session.
TR-03: Event-Driven Progress
Implement a webhook listener on the Booking service. When a booking moves to Status: COMPLETED, the Guidance Journey must automatically move from Step 5 to Step 6.

7. UI/UX Requirements
UR-01: The Guidance Drawer
History Sidebar: While troubleshooting, display a mini-timeline of that specific asset's history.
Persistence: A "Sticky Resolution Banner" should appear at the top of the dashboard if a user leaves a journey mid-way.
UR-02: Mobile Optimization
The horizontal GuidanceJourneyStrip shall switch to a vertical "Step Timeline" on viewport widths < 768px.

8. Gap Analysis Checklist for Implementation
ID
Gap Item
Remediation Requirement
1
Reactive Entry
Add "Get Guidance" to every Status Board item row.
2
Timeline as Source
Modify Step 1 to query Timeline for the 2-year lookback.
3
Tool Fragmentation
Embed NegotiationShield and ReplaceRepair as sub-components of the Guidance Action Card.
4
Manual DB Sync
Automate the update of lastServicedDate on Journey completion.



