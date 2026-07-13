# 11 — Risks, Guardrails, and Open Questions

## Risk register

| Risk | Impact/likelihood | Mitigation/guardrail | Owner |
|---|---|---|---|
| Over-personalization/intrusiveness | high/medium | ≤5 onboarding questions, contextual asks/caps, explicit controls, no exact routines | Product + Privacy |
| Unnecessary household collection | high/medium | schema allowlist/prohibited fields, value review, retention/deletion | Privacy |
| Incorrect inference | high/medium | consent, low confidence, visible source, confirm/override/disable, explicit precedence | Product + Data |
| Sensitive-data exposure | critical/medium | role-aware evidence, redaction, telemetry canaries, step-up/admin audit, no URL values | Security + Privacy |
| Authorization mismatch | critical/high current | Phase 0 capability policy, service-level checks, item-ID matrix, collaborator semantics | Backend/Security |
| Low-quality/stale recommendation | high/medium | reviewed sources/dates, confidence/freshness, golden data, pause SLA, stale-safe behavior | Content + Domain owner |
| Notification fatigue | high/high | central budget/dedupe/diversity, digest, quiet/cadence, opt-out guardrail | Product/Growth |
| Rule conflicts/duplication | high/high current | dependency/dedupe/intent scope, conflict resolver, impact preview, one catalog owner | Personalization Eng |
| Stale rules/content | high/medium | reviewDueAt, owner, alerts, auto-pause policy for expired sources | Content Operations |
| Safety misinformation | critical/low-medium | deterministic reviewed content, safety class/floors, professional escalation, adverse reporting | Safety/Legal + Domain |
| Insurance/legal/financial overreach | critical/medium | review prompts not determinations, limitations, no guaranteed eligibility/savings | Legal/Compliance |
| Medical implications | critical/medium | collect goals, not diagnoses; home-accessibility wording; prohibited claims lint | Privacy/Content |
| LLM hallucination/prompt injection | high/medium | no consequential AI, validated structured output, approved template fallback, AI-off test | AI Platform/Security |
| Unmanageable rule growth | high/medium | taxonomy/dependency registry, owner/reviewer, catalog lint/golden diffs, admin lifecycle | Product Ops/Eng |
| Database complexity/growth | medium/medium | relational core, bounded JSON/history, indexes/query plans, retention/partition triggers | Data/Backend |
| Excess synchronous processing | high/medium | precomputed snapshots, coalesced jobs, no external calls in evaluation | Backend/Ops |
| Pi capacity/worker duplication | high/high current | measure baseline, queue/lease cron, concurrency caps, thresholds and alerts | SRE/Ops |
| Feature sprawl | high/high | home-scope lint/review, module contract, out-of-scope list | Product |
| Loss of trust | critical/medium | explanations/corrections, calm copy, confidence, no hidden labels/pricing | Product/Trust |
| Feedback bias | medium/medium | explicit vs implicit separation, holdouts, no click-only optimization | Analytics/Product |
| Cross-property context leakage | critical/medium | scope keys, property applicability, authorization/golden multi-property tests | Backend/Security |
| Profile deletion incomplete | critical/high current | erasure graph/job/verification, retention policy, integrate account deletion | Privacy/Backend |
| Cron double execution | high/high current | BullMQ repeatable jobs or distributed lease; idempotency is secondary defense | SRE/Workers |
| Dashboard overload | high/high current | replace competing ranks, top 3 default, one list/progressive disclosure | Frontend/Product |

## Safety and trust guardrails

- Safety/insurance/legal/financial definitions require named domain reviewer and source/review date.
- No eligibility or urgency solely from LLM output.
- Unknown critical facts fail closed or ask; “no data” never means “safe.”
- Engagement affinity cannot reduce critical in-app visibility or override consent/channel law.
- Cost/savings show band, currency, geography/date and confidence; never guarantee.
- Profile explanations minimize member-specific detail for shared roles.
- Admin pause propagates to new reads/evaluations within a defined SLA and is audited.
- Every recommendation has owner, scope, source, version, status, effective/review dates, tests and adverse-report path.

## Open questions and recommended defaults

| Question | Recommended default | Why |
|---|---|---|
| Is household tied to one primary user? | OWNER creates/controls one default household; model allows more later. | simple MVP without schema dead end |
| Can multiple authenticated users share a household? | Share property access now; do not grant raw profile access automatically. Add explicit household access later. | current ACL semantics/privacy |
| Can one user belong to multiple households? | Schema yes; UI exposes one default initially. | multi-property/future flexibility |
| Are member names needed? | No. Use counts and broad life-stage bands. | minimization |
| How represent children? | Count by broad stage only; no names/DOB. | value without unnecessary sensitivity |
| Which traits may be inferred? | Only low-sensitivity operational/preferences with consent; never children/seniors/aging/financial posture in MVP. | trust |
| Must inferred traits be confirmed? | Show/allow correction always; require confirmation before sensitive or consequential use. | control |
| Which categories can notify? | safety/time-sensitive maintenance/weather/protection only initially; other items digest/in-app. | fatigue/trust |
| Dashboard count? | 3 default, 5 maximum, ≤2/category except critical. | focus |
| AI assistant access? | Only current authorized snapshot fields explicitly consented; no raw answers/history by default. | minimization |
| Different occupancy? | Yes, `HouseholdProperty.occupancyType` and property overrides. | secondary/rental correctness |
| Rental/investment behavior? | Property facts apply; personal household traits do not unless household occupies it. | avoid wrong context |
| Rule administration? | Reviewed code/config seeds + DB lifecycle for MVP; admin UI Phase 2. | understand workflow before building editor |
| One household for all existing properties during backfill? | Link to one default but mark context unconfirmed; ask on secondary property before personal traits apply. | safe migration |
| Should recommendation instances be per user? | Household+property instance, with per-user feedback/suppression where needed. | shared truth plus individual control |
| Can contributors change profile? | No by default; OWNER manages sensitive profile. Contributor can act/feedback. | least privilege |
| Exact travel dates? | Out of MVP; use frequency band and explicit temporary vacation mode later. | privacy |
| Pet names/breeds? | Not needed. Type/size/shedding/access bands only. | relevance/minimization |
| Pollen context provider? | Add only after source/coverage/SLA review; seasonal proxy cannot claim live pollen. | avoid false precision |
| Recommendation content localization? | Store locale/version from day one; ship one locale initially. | avoid schema rewrite |
| Retention periods? | Decide before launch; proposed 30–90d operational traces and bounded snapshot history. | policy/legal input required |
| Critical notification override? | Never override channel opt-out except legally defined emergency behavior; in-app safety floor remains. | consent |
| Graph database trigger? | Only benchmarked need for arbitrary multi-hop queries at scale; PostgreSQL first. | operations |

## Decision owners needed before Phase 1

Product must approve taxonomy/profile question set/dashboard limit; Privacy must approve classification/consent/retention/deletion; Security must approve role capability matrix/audit/redaction; Content/Legal must approve safety workflow and claims language; SRE must provide actual Pi cluster utilization/node/storage baseline.

## Areas not verified

Live production topology/utilization/data cardinality/queue depth; actual K3s node count and storage performance; deployed manifest parity; legal retention requirements; product staffing/content-review SLA; real user research willingness; current database migration history completeness; external provider commercial terms/SLA; email/SMS consent compliance configuration. These uncertainties affect rollout sizing, not the architectural recommendation.
