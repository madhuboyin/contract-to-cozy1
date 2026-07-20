## Strongest Buyer-Facing Assets
- Repository audit counted 46 meaningful homeowner workflows/capabilities in total: 34 implemented and connected, 11 implemented but partially connected, and 1 prototype/mock-backed. That is directionally more important than raw feature count, but it is useful proof of breadth.
- The strongest strategic asset is the connected data and workflow model around `Property`, `HomeownerProfile`, `InventoryRoom`, `InventoryItem`, `HomeItem`, `GuidanceSignal`, `GuidanceJourney`, financial snapshots, and event records in [apps/backend/prisma/schema.prisma](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/prisma/schema.prisma:1).
- The guidance engine is unusually persuasive for an acquisition thesis because it turns multiple modules into a coordinated “what next” layer rather than a loose tool catalog. Evidence is strong across [docs/architecture/GUIDANCE_ENGINE.md](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/docs/architecture/GUIDANCE_ENGINE.md:1), [apps/backend/src/routes/guidance.routes.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/src/routes/guidance.routes.ts:1), and the frontend guidance surfaces.
- The refinance radar, home savings, coverage intelligence, status board, permits/inspection workflows, and digital twin are the highest-value examples of roadmap acceleration because they already combine domain modeling, UX, APIs, and background processing.
- The repo also contains meaningful operational assets: worker jobs, Kubernetes manifests, backup/restore docs, analytics taxonomy, release/admin tooling, and a test base across backend units and select UI utilities.

## Weakest Or Least Defensible Claims
- Do not claim production readiness, traction, or validated savings outcomes.
- Do not claim seller-prep comparable-sales intelligence as fully working. The comps provider currently returns placeholders/empty results in [publicComps.provider.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/src/sellerPrep/providers/publicComps.provider.ts:1).
- Do not imply property enrichment is live from ATTOM/RentCast. [externalPropertyData.service.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/src/services/externalPropertyData.service.ts:1) is explicitly mocked.
- Be careful not to overstate neighborhood intelligence as fully live everywhere. QA/dummy ingest paths exist for radar/risk/neighborhood worker jobs.
- Avoid claiming every tool is equally mature. The one-pager should emphasize representative pillars, not an exhaustive feature count pitch.

## Features That Should Not Be Mentioned Publicly As Fully Operational
- Public comps-backed seller pricing intelligence
- External property enrichment from third-party property-data providers
- Any live-marketplace implication that providers, bookings, or service pricing are fully validated at scale
- Any AI-dependent workflow that would fail without configured credentials

## Features That Appear Incomplete
- `coverage-options` is more of a continuation/wrapper than a standalone product engine.
- `quote-comparison` appears lightweight on dedicated backend support compared with service-price and negotiation flows.
- Some property-scoped tool routes are redirects into shared dashboard routes, notably permits, inspection hub, and HOA.
- Neighborhood and gazette value depend on worker cadence and feed configuration.

## Features Backed By Mock Data Or Placeholder Logic
- External property enrichment: mocked deterministic data
- Seller-prep public comparables: placeholder / no real records returned today
- QA neighborhood/radar/home-risk ingests: synthetic fixture-based worker paths
- Some document/report generation paths use fallback or mock buffers in non-production contexts

## Major Technical Risks
- Broad schema and feature surface increase integration complexity for a buyer.
- Some high-value workflows depend on environment configuration such as `GEMINI_API_KEY`, `FRED_API_KEY`, weather keys, or queue workers.
- Infrastructure is intentionally low-cost and self-hosted; a buyer should assume cloud migration, security review, and production hardening work.
- Cross-feature data duplication is documented by the repo itself in [docs/ctc-unified-data-architecture-pass7.md](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/docs/ctc-unified-data-architecture-pass7.md:1).
- Secret-handling templates exist and need normal diligence. I did not find live plaintext production secrets in the repo, but there are template/default secret placeholders that require review before transfer.

## Missing Documentation Or Areas That Need Founder Context
- Which modules have actually been demoed to pilot users versus built for internal exploration
- Which seeded/demo data paths are most representative of intended buyer demos
- Any uncommitted brand/domain/design assets or partner materials that belong with the transfer
- Legal/IP review of third-party data dependencies, imagery, and any external content used in docs or seeded assets

## Recommended Screenshots For A Designed One-Pager
| Route | Component | What it demonstrates | Data type | Why a buyer would care | Cleanup needed |
|---|---|---|---|---|---|
| `/dashboard/properties/[id]` | `DashboardHeroSection`, `MorningPulseSection`, `SmartContextToolsSection` | Connected property context plus recommendation-first navigation | Seeded/live app data | Best high-level “homeowner intelligence system” screen | Ensure polished demo property and remove empty states |
| `/dashboard/properties/[id]/status-board` | `StatusBoardClient` | Asset condition, urgency, warranty, and next-action framing | Live/seeded | Strong proof of operational asset intelligence | Curate demo property with varied but believable conditions |
| `/dashboard/properties/[id]/tools/coverage-intelligence` | `CoverageIntelligenceToolClient` | Cross-linking of insurance, warranties, claims, and action steps | Live/seeded | Strongest protection-intelligence workflow | Use a demo property with policy + warranty context populated |
| `/dashboard/properties/[id]/tools/mortgage-refinance-radar` | `MortgageRefinanceRadarClient` | Passive monitoring plus scenario analysis | Live/seeded plus worker-fed data | Clear value for mortgage/finserv buyers | Preload mortgage snapshot and recent rate data |
| `/dashboard/properties/[id]/tools/home-digital-twin` | `HomeDigitalTwinClient` | Structured home model and what-if scenarios | Live/seeded | Strong architectural and IP signal | Use a property with good inventory completeness |
| `/dashboard/properties/[id]/inspection-hub` | `InspectionHub` pages | Turning reports into findings and decisions | PDF-backed/live | Shows workflow depth beyond dashboards | Use a clean preloaded report and resolved/open findings mix |
| `/dashboard/properties/[id]/tools/neighborhood-change-radar` | `NeighborhoodChangeRadarClient` | Property-adjacent local-context intelligence | Seeded or mixed | Distinguishes platform from basic maintenance tools | Avoid synthetic-looking dummy event text in final materials |
| `/dashboard/properties/[id]/seller-prep` | `SellerPrepOverview` | Expansion from ownership into resale planning | Seeded/partially live | Useful for real-estate buyers | Do not highlight comparables if they are empty |

## Recommended Audience Variants
- Homeowner technology buyer: lead with homeowner intelligence, connected context, retention, and the operating system for ownership.
- Mortgage / insurer / financial-services buyer: lead with refinance, coverage, savings, property condition, and lifecycle-triggered engagement.
- Real-estate / brokerage / builder / home-services buyer: lead with buying-to-owning-to-improving-to-selling continuity, permits, inspection, project, and seller prep.

## Open Questions For The Founder
- Which modules matter most in a transfer: full platform, selected workflows, or IP/architecture only?
- Which buyer category feels most strategically aligned today?
- Which modules have received the most founder conviction and iteration, even if not the most code volume?
- Are there any external datasets, design assets, or contractual dependencies that would not transfer cleanly?
- Is a founder transition period available, and if so, is it oriented around product knowledge transfer, architecture handoff, or selective integration support?
- Which demo property and seeded data set should be treated as the canonical acquisition-demo environment?
