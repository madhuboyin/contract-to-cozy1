# ADR: Home Event Radar Utility-Outage Source

| Field | Value |
| --- | --- |
| Status | Accepted; integration and commercial activation pending |
| Decision date | July 27, 2026 |
| Work package | HER-605 |
| First launch territory | New Jersey electric service territories |
| Production source class | Licensed commercial outage aggregator |
| Preferred vendor for contracting | PowerOutage.us / FE Bluefire |
| Activation posture | Fail closed |

## Context

Home Event Radar has canonical `utility_outage` contracts, matching, impact rules,
actions, notifications, and UI filters, but it has no real utility source. Activating
the category without a licensed source and property-relevant geography would recreate
the original empty-tool problem and could falsely imply that a home has or does not
have electrical service.

This decision covers source strategy, launch territory, licensing, service-territory
mapping, lifecycle, reliability, cost controls, and the gates for a later adapter
implementation. It does not activate Utility or authorize production use of a provider.

## Decision

Use a **licensed commercial outage aggregator** as the production path, with
PowerOutage.us / FE Bluefire as the preferred vendor to contract. The published API
terms are not sufficient: they limit content to internal, non-commercial use and
prohibit publication, redistribution, and third-party access. Contract-to-Cozy must
obtain a written order form or addendum that expressly permits authenticated homeowner
display, derived property matching, notifications, and the required evidence retention
before credentials are accepted.

Launch in **New Jersey electric service territories**. Import the official New Jersey
electric-utility territory polygons as reference geography, retain the provider's
stable utility identifier (prefer EIA ID), and enable only utilities whose licensed
outage feed is verified. A polygon's presence does not by itself mean outage coverage.

Do not scrape utility outage maps, reverse-engineer KUBRA or similar endpoints, or
depend on undocumented browser APIs. Direct utility integrations may be added later
only when the utility offers a documented feed and grants the required use.

ODIN remains a no-cost evaluation and fallback candidate, not the launch source. Its
public status endpoint currently exposes JCP&L at county resolution but did not expose
the other searched New Jersey utilities. County data may support explicitly labeled
regional awareness, but it must not create a property-level `utility_outage` match or
send a homeowner notification. ODIN may qualify later for a utility only if its actual
feed supplies ZIP, point, or polygon geography and its access terms permit this use.

## Options considered

| Option | Decision | Reason |
| --- | --- | --- |
| Commercial aggregator | Selected, contract required | Best route to multi-utility coverage and one normalized integration; published terms alone do not permit the product use |
| ODIN public/subscriber API | Retain as evaluation fallback | Standards-based and no external participation fee, but current NJ coverage is incomplete and observed JCP&L resolution is county-only |
| Direct documented utility feeds | Future territory option | Potentially authoritative, but requires one lifecycle, license, and operations integration per utility |
| Scrape public outage maps | Rejected | Brittle, operationally unsafe, and often incompatible with site/API terms |
| County-only regional feed | Rejected for property matching | A county aggregate cannot establish that a specific home is affected |

## Launch territory and coverage model

The New Jersey pilot is electric-outage only. Gas, water, utility-rate changes, and
account/meter integrations are out of scope.

1. Ingest the official New Jersey electric service-territory polygons into a versioned
   reference dataset. Do not hand-draw or infer territories from ZIP codes.
2. Map each polygon to a normalized utility record using EIA ID where available and a
   reviewed alias table otherwise.
3. Join that utility record to the provider's coverage/status catalog.
4. A property has `available` Utility coverage only when:
   - its geocoded point resolves unambiguously to an enabled electric territory;
   - the provider reports that utility as covered;
   - the provider supplies ZIP, point, or polygon outage geography;
   - the most recent successful coverage check is within 24 hours; and
   - the source, utility, and global kill switches are enabled.
5. Boundary overlaps, missing points, multiple plausible utilities, county-only feeds,
   stale coverage, and provider errors produce `unavailable` or `degraded`, never an
   assumed match.

All official New Jersey polygons may be loaded, including municipal and cooperative
territories, but each remains disabled until the selected provider proves coverage.
The four regulated electric distribution companies are not assumed to be the complete
set of electric territories.

## Required provider contract

Legal/commercial approval must confirm all of the following in writing:

- commercial use in Contract-to-Cozy;
- display of source facts and derived matches to authenticated homeowners;
- in-app, email, and push notification delivery;
- storage of normalized observations, revision fingerprints, provenance, and audit
  evidence for at least 90 days, or an approved shorter product retention design;
- the required attribution text and official destination links;
- permitted caching and deletion obligations;
- the exact New Jersey utility coverage list and geographic resolution;
- production and test credentials, documented schemas, change notice, and support;
- rate limits, overage policy, incident communications, termination/export behavior,
  and a data-processing/security review;
- no restriction that prevents deterministic property matching. Provider content must
  not be used to train or ground an AI system.

If the contract permits less than 90 days of source-content storage, engineering must
store only permitted identifiers and derived audit facts, update the retention policy,
and obtain Product and Legal approval before implementation.

## API, freshness, and service objectives

These are Contract-to-Cozy launch requirements, not claims about a vendor's published
SLA:

| Measure | Required launch gate |
| --- | --- |
| Provider availability | Contracted monthly API availability of at least 99.9%, or an explicitly accepted exception |
| Normal polling | One state- or utility-batched poll every 2 minutes |
| Provider-to-product freshness | 95% of accepted observations visible within 5 minutes; never present data older than 15 minutes as current |
| Request timeout | 10 seconds per attempt |
| Retries | At most 4 attempts with bounded exponential backoff and jitter |
| Coverage catalog | Refresh at least daily and before enabling a utility |
| Health alert | Page after 10 minutes without a successful complete poll; mark coverage degraded |
| Stale cutoff | Stop new matching and notifications at 15 minutes; preserve existing active events as stale |
| Recovery | Require one complete successful poll before declaring the source healthy |

Poll by provider/utility scope, never once per property. With a two-minute statewide
schedule, the base volume is 21,600 polling calls per 30-day month. Procurement must
buy at least 25,000 calls per month for the pilot endpoint, plus separately documented
coverage/detail calls and provider-required headroom. If the API cannot batch a state
or utility, Cost and Engineering must recalculate and approve the call budget before
activation.

The vendor's public pricing is not treated as an approved budget. Activation requires
an approved quote recorded in the source configuration (`contractId`, billing owner,
monthly commitment, included calls, overage rate, renewal date, and spend-alert
threshold). The worker must enforce the configured call budget, warn at 70% and 90%,
and fail closed before unapproved overage.

## Canonical outage lifecycle

Provider estimated restoration time (ETR) is informational and is never equivalent to
restoration.

| Provider observation | Canonical behavior |
| --- | --- |
| New outage identity | Create an active canonical event and immutable revision |
| Customer count, geography, cause, status, or ETR materially changes | Append a revision; notify only through existing materiality/deduplication policy |
| Explicit restored/closed status | Resolve the event at the provider timestamp |
| Explicit cancellation/error | Retract the event |
| Identity absent from a complete successful snapshot | Mark as missing once; keep active/stale |
| Identity absent from two consecutive complete successful snapshots at least 10 minutes apart | Resolve conservatively using the second snapshot time |
| Partial/failed/timeout/empty-but-not-authoritative response | Do not resolve or retract anything |
| Source older than 15 minutes | Preserve event with stale provenance; suppress new matches and notifications |
| Later reappearance with same provider identity | Append a revision and reactivate; do not create a duplicate |

Canonical identity is `(sourceDefinitionId, providerUtilityId, providerOutageId)`.
When a provider does not supply a stable outage ID, the adapter is not launch-ready
until a reviewed deterministic identity and collision fixture are approved.

No event may say that the home itself lost power unless the provider geography contains
the property's point. ZIP-level data must say that an outage is reported in the
property's ZIP area. Restoration copy must say that the provider reports the outage
restored and should link to the official utility reporting destination.

## Safety, privacy, and security

- Ingest aggregate public outage facts only. Do not collect customer names, account
  numbers, meter identifiers, telephone numbers, or exact affected-customer addresses.
- Keep provider credentials in the existing secrets path and redact them from source
  operations, logs, run evidence, and errors.
- Allowlist provider API hosts and official New Jersey utility destinations.
- Validate every payload through the canonical adapter harness and cap response size,
  outage count, polygon complexity, and clock skew.
- Preserve source attribution, provider timestamps, raw fingerprints, and normalized
  evidence permitted by contract.
- Utility events are informational. Emergency copy must direct users to 911 for
  immediate danger and to the utility for outage reporting; it must not promise
  restoration or electrical safety.

## Implementation and activation sequence

1. Complete procurement and legal gates; record the licensed utility/resolution matrix.
2. Add versioned utility and territory reference models to the Prisma schema. Per
   repository policy, do not create a migration script.
3. Seed reviewed New Jersey territory metadata and utility aliases.
4. Implement the licensed adapter through the canonical source adapter and durable
   ingest harness.
5. Implement provider catalog/coverage reconciliation and point-in-territory matching.
6. Add lifecycle convergence, call-budget enforcement, source-health telemetry, and
   an admin dry-run/property scope.
7. Run provider fixtures and a live, scoped New Jersey acceptance test.
8. Enable individual utilities one at a time. Keep the Utility filter unavailable for
   every property without verified active coverage.

## Acceptance gates for the implementation slice

- Contract and retention checklist approved with evidence.
- Provider coverage fixture proves each enabled utility and resolution.
- Territory fixtures cover interior, boundary, overlap, municipal/cooperative, missing
  point, and stale-map cases.
- Lifecycle fixtures cover create, material update, ETR update, explicit restore,
  explicit retract, two-snapshot disappearance, reappearance, failed/partial fetch,
  authoritative empty, and stale recovery.
- County-only observations never create property matches or notifications.
- Duplicate provider identities are idempotent across replay and worker retry.
- Rate-limit, quota, oversize response, invalid geometry, and credential failures fail
  closed and surface in source operations.
- UI copy, attribution, official links, stale state, and unavailable Utility filter
  pass frontend acceptance.
- A property-scoped live pilot proves one canonical event/revision/match chain without
  customer PII before a utility is enabled.

## Consequences

The decision favors trustworthy, property-relevant events over nominal national
coverage. It introduces procurement cost and a vendor dependency, but avoids multiple
fragile scrapers and establishes a repeatable utility coverage contract. Until the
commercial, resolution, and acceptance gates pass, the truthful product state is that
Utility monitoring is unavailable.

## Authoritative references

- [PowerOutage.us API & Content Terms of Use](https://poweroutage.us/legal/apitermsofuse)
- [ORNL ODIN FAQ](https://odin.ornl.gov/pages/faq.html)
- [ORNL ODIN Subscriber Guide](https://odin.ornl.gov/downloadables/ODIN_Subscriber_Guide.pdf)
- [ORNL ODIN public status endpoint](https://odin.ornl.gov/odi/status)
- [New Jersey Electric Utilities Territory Map](https://mapsdep.nj.gov/arcgis/rest/services/Features/Utilities/MapServer/10)
- [New Jersey BPU utility contacts and outage maps](https://www.nj.gov/bpu/assistance/utility/)
- [HIFLD Electric Retail Service Territories](https://catalog.data.gov/dataset/electric-retail-service-territories)

