# Phase 8 Deferred Facts and Features

Date: 2026-07-17

Deferral means there is not yet enough product, source-quality, or operational
evidence to create another canonical field. It does not authorize a feature to
store a private substitute.

| Candidate | Evidence reviewed | Decision | Revisit trigger |
|---|---|---|---|
| Public-record override precedence by fact | Property Context supports provenance and conflict states, but the repository has no fact-by-fact authority matrix for assessor, permit, inspection, and user sources. | Defer automatic overrides; preserve conflicts and user correction paths. | A production integration provides source SLAs and a reviewed authority policy per fact. |
| Effective-dated responsibility transitions | Current consumers require the responsible party now; no audited feature requires historical property-manager/association responsibility intervals. | Keep current typed responsibility records; do not add speculative history. | A rental/association transition workflow needs dated responsibility for notices, claims, or legal records. |
| Additional market-specific dwelling types | Current UI and reviewed US feature policies are covered by the canonical `DwellingType` values. | Do not expand the enum speculatively. | Launch geography or an UI-creatable property cannot be represented without `OTHER`. |
| Collaborator edit rights per individual fact | Role floors exist, but no reviewed matrix justifies allowing contributors to change every structural, financial, or responsibility fact. | Keep current scoped authorization; do not infer broad edit rights. | Admin/household governance requirements approve a fact-by-role matrix. |
| Optional household relationship history | `HouseholdProperty.occupancyType` currently supports consented relationship context, while canonical property occupancy remains on `Property`. | Retain and review; do not merge it into property truth. | Multiple simultaneous household relationships or dated occupancy becomes a product requirement. |
| Generic context fact storage | All implemented facts have typed canonical owners and the catalog already records ownership/correction paths. | Explicitly rejected. | None; a new fact must first justify a typed owner. |
| Automatic Personalization tuning | Quality metrics exist, but the reviewed catalog still requires controlled rule/content activation. | Keep automatic tuning disabled. | Sufficient outcome volume, bias review, rollback controls, and approval workflow exist. |

Every deferred entry must remain `UNKNOWN`, conflicted, or unavailable where
appropriate. Feature code must not convert a deferral into an inferred fact.
