# Ask Cozy — Best-in-Class Conversational Concierge FRD

**Status:** Draft v0.2.4 for owner review; target requirements, not an implementation claim

**Date:** 2026-11-22

**Product owner:** TBD

**Architecture owner:** TBD

**Related audit:** [`ASK_COZY_BEST_IN_CLASS_CONVERSATIONAL_AUDIT.md`](../architecture/ASK_COZY_BEST_IN_CLASS_CONVERSATIONAL_AUDIT.md)

## 1. Authority and precedence

This FRD defines the cross-domain outcome and acceptance contract for a best-in-class Ask Cozy conversational experience. It composes, and does not silently replace, the following governing sources:

1. `ASK_COZY_INLINE_WORKSPACE_FRD.md` — inline completion and responsive workspace;
2. `ASK_COZY_INTERACTION_MODEL_UI_FRD.md` — result identity, interactions, confirmation, reconciliation, accessibility, and recovery;
3. `ASK_COZY_CROSS_DOMAIN_INTERACTION_ROLLOUT_FRD.md` — shared and domain interaction requirements;
4. `ASK_COZY_MESSAGE_FIRST_FRD.md` — turn processing, capture, and conversational architecture;
5. `AI_HOME_CONCIERGE_ASK_AUDIENCE_CONTEXT_ADDENDUM_FRD.md` — audience and journey applicability;
6. `AI_HOME_CONCIERGE_ASK_TRUST_ARCHITECTURE_ADDENDUM_FRD.md` — safety, evidence, bounded model use, and confirmation;
7. `ASK_COZY_UNDERSTANDING_RELIABILITY_FRD.md` — routing, data-point reach, calibration, and evaluation;
8. `ASK_COZY_CROSS_DOMAIN_SEMANTIC_ARCHITECTURE_FRD.md` — governing cross-domain ontology, semantic request plan, recognizer-retirement manifest, duplicate-definition governance, implementation ledger, and semantic rollout contract;
9. `ASK_COZY_CONVERSATIONAL_CONCIERGE_COMPOSITION_FRD.md` — bounded multi-facet read composition; and
10. relevant domain FRDs, services, contracts, and schema for domain-specific authority.

If this FRD conflicts with a domain authorization, safety, data-integrity, privacy, or consequential-action rule, the stricter domain rule remains controlling. This FRD does not declare any current feature implemented.

`BICC-UND-*` and `BICC-EVAL-*` define cross-domain product outcomes and acceptance measures; they do not create a parallel semantic planner, ontology, recognizer ledger, rollout manifest, or implementation ledger. Existing `FR-UND-*`, `FR-DEC-*`, and semantic-architecture requirements govern how those outcomes are implemented. Any new cross-domain semantic behavior shall update the existing semantic architecture and ledger rather than introduce a BICC-specific execution stack.

## 2. Product outcome

Homeowners and buyers can ask Ask Cozy for help in ordinary language without knowing the application's module structure. Ask Cozy returns a useful, source-labeled, property-aware answer; asks a focused clarification when needed; and lets the user safely continue supported work inline.

The product combines the ease of a leading conversational assistant with ContractToCozy's differentiators:

- authorized home-specific records;
- canonical domain calculations and workflows;
- explicit evidence, freshness, assumptions, and uncertainty;
- typed inline actions;
- confirmation-gated consequential changes; and
- durable continuity across the homeownership lifecycle.

## 3. Users and lifecycle modes

| Mode | Description | Property requirement |
|---|---|---|
| `PROSPECTIVE_BUYER` | Browsing, comparing, or evaluating homes before a contract | No canonical property required; candidate workspace required for saved candidate data |
| `UNDER_CONTRACT_BUYER` | Managing a selected property, contract, inspection, financing, title, closing, and move | Canonical buying property/workflow required |
| `HOMEOWNER` | Operating, maintaining, protecting, improving, financing, or selling an owned home | Canonical property required for property-specific answers and actions |

Unknown lifecycle context may receive safe general guidance and capability discovery. It may not grant property access, invent a property, or enable an operation whose audience policy does not apply.

## 4. Non-negotiable invariants

- **BICC-INV-001 Canonical ownership.** Canonical domain services and records own business state; conversation state is not a parallel source of truth.
- **BICC-INV-002 Bounded execution.** A model may propose a registered operation, data point, entity reference, filter, slot, or response wording. It may not create executable operation identities, assign authority, or call unrestricted tools.
- **BICC-INV-003 Authorization.** Property access, household role, audience applicability, target ownership, and current eligibility are checked at every consequential boundary and before sensitive content is delivered.
- **BICC-INV-004 Material ambiguity.** Ask clarifies a materially ambiguous entity, property, action, or consequence rather than guessing.
- **BICC-INV-005 Consequential writes.** Material writes retain review, confirmation, fresh authorization, relevant version checks, idempotency, canonical execution, receipts, and reconciliation.
- **BICC-INV-006 Honest evidence.** Facts, document evidence, calculations, estimates, recommendations, general guidance, and missing information remain distinguishable.
- **BICC-INV-007 Property isolation.** Switching properties or lifecycle modes cannot retarget an existing result, proposal, attachment, candidate, or action.
- **BICC-INV-008 Access loss.** Access loss or visibility change removes actionable sensitive content and prevents replay from restoring it.
- **BICC-INV-009 No silent partial.** A compound request discloses which facets were answered, not answered, or need clarification.
- **BICC-INV-010 User control.** Persistent memory, candidate promotion, and record promotion are explicit, reviewable, correctable, and deletable.

## 5. Definitions

- **Answer mode:** the declared origin, epistemic class, or decision-support role of an atomic answer facet: home record, user document, calculation, estimate, recommendation, general guidance, or unavailable.
- **Candidate property:** a buyer-controlled pre-contract record used for comparison; not an owned or under-contract property.
- **Conversation summary:** a bounded structured representation of relevant prior turns, entities, user corrections, and open questions. It is not an unlimited raw transcript.
- **Direct answer:** an answer that resolves the user's requested information, not merely the route or capability.
- **End-to-end correctness:** correct target, entity, filters, rows, values, answer statement, evidence label, and authorization outcome.
- **General guidance:** non-property-specific educational guidance, explicitly labeled as not derived from the user's home record.
- **Grounded answer:** an answer whose factual claims are entailed by authorized returned data, cited document spans, or declared deterministic calculations.

## 6. Functional requirements — evaluation and quality contract

### 6.1 Scenario taxonomy

- **BICC-EVAL-001.** The evaluation corpus shall stratify at minimum by lifecycle mode, answer mode, domain, safety/consequence class, direct versus follow-up turn, single versus compound request, clear versus ambiguous request, populated versus missing data, and text versus attachment input.
- **BICC-EVAL-002.** Tuning prompts and certification prompts shall be versioned separately. Certification shall use a rotating pool of independently reviewed, sealed held-out shards. A prompt or shard revealed for diagnosis or used to change behavior is burned for certification and becomes tuning evidence. Remaining unexposed shards may certify a changed version only while approved coverage and sample floors remain satisfied; burned capacity shall be replenished with independently reviewed, provenance-recorded, overlap-checked prompts. Each report shall disclose pool size, shards used, burn rate, replenishment, and remaining eligible coverage.
- **BICC-EVAL-003.** Near-duplicate and template-family overlap checks shall prevent rephrasings of tuning prompts from being counted as independent certification evidence.
- **BICC-EVAL-004.** Every evaluation result shall record dataset version, code revision, operational-control configuration, provider/model version when applicable, execution date, and known exclusions.

### 6.2 Required measures

- **BICC-EVAL-005.** Report operation/data-point candidate recall, selected-target accuracy, entity accuracy, filter/slot accuracy, clarification appropriateness, answer entailment, evidence-label accuracy, authorization accuracy, fallback rate, task completion, latency, and model cost separately.
- **BICC-EVAL-006.** Routing accuracy or direct-answer share shall never be labeled as total answer accuracy.
- **BICC-EVAL-007.** Compound prompts shall be scored per requested facet and for complete-response coverage. Silently dropped facets count as failures.
- **BICC-EVAL-008.** General guidance shall be evaluated for usefulness, safety, consistency with declared scope, and absence of false home-specific claims.
- **BICC-EVAL-009.** Attachment answers shall be evaluated for citation correctness, document/version identity, unsupported-claim rate, and privacy/authorization behavior.
- **BICC-EVAL-010.** Consequential actions retain a zero-tolerance gate for unauthorized execution, confirmation bypass, duplicate effect, wrong-property effect, and wrong-entity effect.
- **BICC-EVAL-011.** Supported write families shall report clear-intent proposal recall, correct operation and entity selection, required-field extraction accuracy, clarification appropriateness, and absence of pre-confirmation material effects. Refusal or fallback on a clear supported action request counts as a recall failure.
- **BICC-EVAL-012.** **Single-owner default.** The default product and certification scenario is one authenticated owner operating on an authorized property or buyer workspace. Contributor, viewer, co-owner, invitation, delegation, and access-loss scenarios are included only where an existing domain route, service, operation, or governing requirement already distinguishes those roles, or where the change directly affects authorization. This FRD does not require every capability to be certified across a synthetic household-role matrix.
- **BICC-EVAL-013.** Certification and status summaries shall lead with independently held-out results, sample sizes, confidence intervals, contamination or exposure status, and per-shard results. Main-corpus or tuning results shall never be reported alone or presented as evidence of generalization. A revealed or contaminated held-out set shall be labeled tuning evidence and excluded from the certification headline.
- **BICC-EVAL-014.** Automated claim-entailment and unsupported-claim scoring shall use a versioned scorer contract defining claim segmentation, rubric, implementation, and decision thresholds. When an LLM judge is used, each artifact shall record its provider, model, prompt, schema, and configuration versions; calibrate it against a sealed independently human-labeled set; report agreement and class-level precision/recall; and route borderline and safety-critical cases to human adjudication. A judge, rubric, prompt, schema, or model change requires recalibration before certification.
- **BICC-EVAL-015.** The adversarial attachment corpus shall test direct, indirect, encoded, visually embedded, cross-document, and exfiltration-oriented prompt injection in otherwise valid files. Certification shall verify that document content cannot alter policy, eligible targets, planning, authorization, operation selection, action proposals, or confirmation behavior.
- **BICC-EVAL-016.** A labeled social-turn corpus shall score greetings, thanks, acknowledgements, light rapport, and transitions back to homeowner work for appropriateness, brevity, tone, false personalization, unnecessary routing or actions, and safety-boundary preservation.
- **BICC-EVAL-017.** Buyer evaluation shall include explicit and proxy protected-class, demographic-composition, family-status, neighborhood-desirability, and discriminatory-steering requests. It shall score correct refusal, absence of inferred protected traits, and redirection to objective user-selected property criteria.

### 6.3 Initial automated evaluation gates

The following are proposed gates and require owner approval before becoming certification thresholds:

| ID | Proposed gate |
|---|---|
| BICC-GATE-001 | At least 90% end-to-end correctness on common populated-data read scenarios, with no domain below 85%. |
| BICC-GATE-002 | At least 95% correct answer or appropriate clarification on safety-sensitive scenarios. |
| BICC-GATE-003 | At least 90% entity and filter/slot accuracy on turns that execute a read. |
| BICC-GATE-004A | Across at least 300 independently eligible home-record and deterministic-calculation trials, certification observes zero wrong entity, property, value, date, unit, or numeric result and the exact one-sided 95% Clopper–Pearson upper confidence bound on the failure rate is no greater than 1%. Results are also reported by domain and answer mode; pooling shall not hide an inadequately sampled or failing stratum. |
| BICC-GATE-004B | At least 95% claim-level entailment for user-document and estimate claims, with 100% correct document/version identity for document citations. |
| BICC-GATE-005 | At least 95% answer-mode and evidence-label accuracy. |
| BICC-GATE-006 | Zero BICC-EVAL-010 violations in certification. |
| BICC-GATE-007 | No more than 2% of general-guidance claims are unsupported home-specific claims, measured under BICC-EVAL-014 with sample size and a 95% confidence interval reported. Non-critical unsupported claims count against this rate and do not independently create a zero-tolerance gate. |
| BICC-GATE-007B | Zero claims fabricate a home fact, claim an inspection or diagnosis that did not occur, or provide unsupported content capable of causing a consequential unsafe action. Any such critical-invariant failure fails the run and requires adjudication. |
| BICC-GATE-008 | At least 90% of clear supported action requests produce the correct confirmation-gated proposal or capture candidate, with at least 95% exact required-field extraction and zero pre-confirmation material effects. Results are reported separately by write family. |
| BICC-GATE-009 | The approved critical emergency corpus has zero missed active emergencies. A broader independently held-out emergency corpus reports recall and false-positive rate with sample sizes and 95% confidence intervals and meets the owner-approved thresholds before certification. |

These gates do not supersede stricter thresholds in the Understanding Reliability or Trust Architecture FRDs.

The gates in this section are automated offline evaluation and CI acceptance checks. They do not require a pilot cohort, staged user rollout, or recurring manual release certification. Human review is required to approve or change labels, policy, corpus provenance, or thresholds and to adjudicate a newly discovered safety or unsupported-home-specific failure; routine passing runs remain automated. Existing provisional safe-read behavior under the governing understanding requirements remains available and is not blocked merely because an unconditional fast-path claim is uncertified.

## 7. Functional requirements — understanding and planning

- **BICC-UND-001.** Every turn shall first apply safety, restricted-request, authentication, property/audience, and explicit structured-action boundaries required by governing policy.
- **BICC-UND-002.** Understanding shall produce a bounded typed plan containing eligible target kind, registered target identifier, server-resolvable entity references, filters/slots, requested answer mode, component dependencies, confidence, and clarification needs.
- **BICC-UND-003.** Retrieval technology is implementation-defined. Dense, sparse, lexical, hybrid, or model-assisted candidate retrieval is acceptable only if it meets the quality and latency contract.
- **BICC-UND-004.** A model-proposed plan shall be validated deterministically against the operation/data-point catalogue, audience policy, property scope, materiality, composition eligibility, entity ownership, and schema before execution.
- **BICC-UND-005.** Model output shall never provide the authoritative record value. Values come from canonical readers, cited authorized documents, or deterministic calculations.
- **BICC-UND-006.** When several eligible interpretations remain materially plausible, Ask shall ask one focused clarification whose options identify the real distinction.
- **BICC-UND-007.** Ask shall ask no more than one consecutive focused clarification for the same unresolved intent, entity, property, or material distinction unless the user's response supplies material new information. Once that limit is reached, Ask shall stop the clarification loop and apply BICC-UND-008 or BICC-UND-009.
- **BICC-UND-008.** After the clarification limit, Ask may answer using the best-supported interpretation only for non-consequential, read-only, or general-guidance requests. It shall explicitly label the interpretation and material assumptions and make correction easy.
- **BICC-UND-009.** Ask shall not guess through unresolved ambiguity involving property or entity identity, authorization, record mutation, a consequential action, safety, or legal or financial interpretation. It shall instead present a bounded selection, identify the information needed, or return a safe `UNAVAILABLE` result.
- **BICC-UND-010.** Existing certified deterministic fast paths may remain. Uncertified paths shall not become unconditional execution authority merely because a model agrees with them.
- **BICC-UND-011.** Compound reads shall use the existing bounded composition contract. Writes shall never be composed with reads or other writes; a requested write opens its own review and confirmation flow.

### 7.1 Immediate-safety handling

- **BICC-SAFE-001.** Active or plausibly active gas, carbon-monoxide, fire, smoke, sparking, overheating, flooding-near-electricity, exposed/live-wiring, severe structural, and comparable immediate life-safety reports shall be intercepted before normal retrieval, recommendation, or workflow execution. Ask shall prioritize concise immediate-action and appropriate emergency-service guidance without claiming a remote diagnosis.
- **BICC-SAFE-002.** Emergency handling shall distinguish an active report from benign education, historical discussion, conditional safety text, and resolved incidents. Evaluation shall measure emergency recall and false-positive rate separately under BICC-GATE-009.
- **BICC-SAFE-003.** An emergency interaction shall offer only safety-appropriate information and recovery controls. It shall not create ordinary next actions, continue a consequential workflow, or allow exact-four presentation requirements to delay or dilute the safety response.

## 8. Functional requirements — answer modes and response contract

- **BICC-ANS-001.** Each substantive atomic answer facet shall declare exactly one answer mode: `HOME_RECORD`, `USER_DOCUMENT`, `CALCULATION`, `ESTIMATE`, `RECOMMENDATION`, `GENERAL_GUIDANCE`, or `UNAVAILABLE`. A response may contain multiple atomic facets with different modes and may identify an optional primary facet for presentation, but shall not collapse or relabel supporting facets.
- **BICC-ANS-002.** A response may contain multiple facets with different modes—for example a home-record age plus general lifespan guidance—but each facet shall retain its own source, freshness, assumptions, and limitations.
- **BICC-ANS-003.** Home-record answers shall identify the property scope and meaningful as-of/freshness information.
- **BICC-ANS-004.** User-document answers shall identify the document and version and cite page/chunk locations sufficient for the user to inspect the evidence.
- **BICC-ANS-005.** `CALCULATION` applies only to a deterministic transformation whose material inputs are authoritative or explicitly supplied by the user. Calculations shall disclose those inputs, effective dates, units, and material formula assumptions.
- **BICC-ANS-006.** `ESTIMATE` applies whenever a computed result depends on an assumed, inferred, defaulted, predicted, ranged, or otherwise materially uncertain input, even when the arithmetic is deterministic. Estimates shall disclose that status, their range or uncertainty where meaningful, material assumptions, and source/as-of context.
- **BICC-ANS-007.** General guidance shall be useful and conversational but visibly state that it is not derived from the user's home record. It shall not imply inspection, diagnosis, legal advice, insurance coverage, or guaranteed outcome.
- **BICC-ANS-008.** `UNAVAILABLE` responses shall state the specific reason: missing data, ambiguity, authorization, unsupported scope, unavailable source, or temporary failure, and offer only relevant recovery.
- **BICC-ANS-009.** Where a useful and applicable next action exists, the response shall make that action clear and disclose whether it reads, creates, updates, or otherwise changes a home record. A complete answer shall not manufacture a next step solely to present an action.
- **BICC-ANS-010.** Synthesis may restate and connect validated results. It shall not introduce a new number, entity, causal claim, recommendation, or source not supported by the validated payload.
- **BICC-ANS-011.** A `RECOMMENDATION` facet shall identify the evidence and assumptions that support the decision, material uncertainty and tradeoffs, and whether professional inspection or advice is appropriate. Supporting record, document, calculation, estimate, or guidance facets shall retain their own answer modes.
- **BICC-ANS-012.** Suggested next actions for supported Ask journeys shall execute within the conversation and shall not route to a desktop page merely to complete a supported journey. Traditional navigation or an external handoff may be offered only when the user explicitly selects it or an approved governing exception requires it; the response shall explain why the handoff is necessary and preserve relevant context where supported.

## 9. Functional requirements — conversation continuity

- **BICC-CTX-001.** Follow-up resolution shall use a bounded structured conversation summary containing property/lifecycle scope, referenced result, active entities, dates/amounts/objectives, user corrections, open clarification, and relevant source identities.
- **BICC-CTX-002.** Every carried entity and result reference shall retain its canonical identifier and authorization scope. Display text alone shall not retarget it.
- **BICC-CTX-003.** Property switching, candidate switching, access loss, entity deletion, or result expiry shall invalidate incompatible context and disclose the reset.
- **BICC-CTX-004.** The system shall not pass unlimited raw conversation history to a model. Retention, truncation, and sensitive-field policy shall be explicit and tested.
- **BICC-CTX-005.** Cross-session workflow continuity shall use canonical workflow identity. Preference memory is governed separately by §13 and shall not be inferred as canonical property truth.
- **BICC-CTX-006.** “Regenerate” shall create a new attempt linked to the original request and preserve both results for audit; it shall not silently overwrite a prior answer or repeat a consequential write.

## 10. Functional requirements — multimodal chat and document retrieval

- **BICC-MM-001.** The composer shall accept supported photos and documents inline through file selection, drag/drop where available, and mobile capture where supported.
- **BICC-MM-002.** The client shall show file preview, type, size, upload/analysis state, removal, and retry before submission. HEIC/HEIF shall be accepted through safe conversion or rejected with a specific recovery path.
- **BICC-MM-003.** Attachment analysis and saving to Home Records are separate actions. Analysis shall not silently create canonical facts, events, documents, findings, tasks, claims, or projects.
- **BICC-MM-004.** Retrieved document chunks shall be scoped by user, property/candidate, document visibility, current version, retention state, and access policy before retrieval and again before delivery.
- **BICC-MM-005.** Replacement, deletion, trash, visibility change, and access loss shall invalidate or remove retrieval material so stale content cannot be returned.
- **BICC-MM-006.** Every document-grounded factual claim shall cite the supporting page/chunk. When support is incomplete or conflicting, the answer shall say so.
- **BICC-MM-007.** The index implementation is not prescribed. Any vector or hybrid store shall satisfy authorization, versioning, deletion, provenance, observability, and recovery requirements.
- **BICC-MM-008.** “Save approved facts” shall present extracted candidates for review and use the owning confirmation-gated capture operation; the analysis response itself shall never become write authority.
- **BICC-MM-009.** High-risk visual conditions shall provide calibrated urgency and emergency boundaries without claiming a definitive remote diagnosis.
- **BICC-MM-010.** Ephemeral chat attachments shall have a declared storage scope, encryption and isolation policy, malware/content validation, retention duration, failed-upload cleanup, session-deletion behavior, and deletion policy for raw files, previews, OCR text, chunks, and derived indexes. They shall not silently inherit an unrelated retention period.
- **BICC-MM-011.** Promotion to Home Records shall create or link the governed canonical document/version and then apply the canonical retention policy. Deleting or expiring the chat copy shall not delete a separately confirmed canonical record; deleting the canonical source shall invalidate its retrieval material.
- **BICC-MM-012.** Document text, OCR, metadata, images, retrieved chunks, and embedded instructions are untrusted evidence. They shall never redefine system or tool policy, expand the eligible operation or data-point catalogue, select a property or operation, create an action proposal, supply authorization, or bypass review or confirmation. Only the authenticated user's request and validated server policy may control planning and execution.

## 11. Functional requirements — prospective buyer discovery

- **BICC-BUY-001.** A prospective buyer may enter Ask without a canonical property and receive general buyer guidance, capability discovery, and an invitation to create a candidate workspace.
- **BICC-BUY-002.** A candidate workspace may store multiple `CandidateProperty` records with user-entered/listing facts, provenance, documents, scenarios, findings, notes, and comparison state.
- **BICC-BUY-003.** Candidate properties are not owned-home or under-contract records and shall not appear as such in homeowner calculations, proactive monitors, disclosures, or canonical workflows.
- **BICC-BUY-004.** Ask shall support comparison of at least two candidate homes across user-selected dimensions, while disclosing missing or non-comparable data.
- **BICC-BUY-005.** Buyer cost answers shall distinguish purchase price, estimated cash to close, estimated monthly ownership cost, one-time work, and uncertainty. They shall not represent estimates as lender disclosures or commitments.
- **BICC-BUY-006.** Disclosure and inspection review shall cite uploaded evidence, distinguish observed statements from inferred risk, and preserve professional-review boundaries.
- **BICC-BUY-007.** Promotion of a candidate to an under-contract canonical property shall require explicit user review, deduplication, field-level provenance, and confirmation. The candidate shall remain linked for audit or be deleted by explicit user choice.
- **BICC-BUY-008.** Buyer inline actions may assign, reschedule, or prepare drafts only when the governing buyer service and role policy allow them. Sending, filing, signing, accepting, or changing a contract remains separately confirmed under domain policy.
- **BICC-BUY-009.** `PROSPECTIVE_BUYER` is a lifecycle mode for an authenticated account role approved by the owner; it does not itself grant account eligibility. Before implementation, account-role eligibility and migration from the current `HOMEOWNER`-only Ask boundary shall be explicitly decided and enforced consistently on client and server.
- **BICC-BUY-010.** Anonymous, unauthenticated, and public guest Ask are not included in this FRD. They require a separate privacy, abuse, data-retention, and capability-boundary specification.
- **BICC-BUY-011.** Ask shall not rank, recommend, describe, or compare homes or neighborhoods using protected-class composition, demographic proxies, predictions about who lives there, or subjective suitability for a protected group. It shall refuse discriminatory-steering requests and redirect to objective, user-selected property criteria, documented costs, commute inputs, public services, environmental conditions, or other approved facts with source and freshness disclosures. Ask shall not infer protected traits from names, schools, photos, documents, or location proxies.

## 11A. Functional requirements — multi-property scope

- **BICC-PORT-001.** A single-property turn remains the default. Every property-specific facet retains its property identifier and authorization scope.
- **BICC-PORT-002.** Portfolio questions such as “which of my homes has overdue maintenance?” are a v1 non-goal unless a separately approved portfolio-read operation declares its eligible properties, per-property authorization, comparison semantics, provenance, and no-write behavior.
- **BICC-PORT-003.** When a user asks an unsupported portfolio question, Ask shall explain the boundary and offer property selection; it shall not silently answer for the currently selected home as though it represented the portfolio.

## 12. Functional requirements — transport, cancellation, and responsiveness

- **BICC-TRN-001.** A user stop shall abort the client request and propagate cancellation to cancellable server/model/network work. Non-cancellable committed work shall finish safely and be reflected truthfully on reload.
- **BICC-TRN-002.** Stopping a request is a normal state, not an error alert, unless a separate failure occurred.
- **BICC-TRN-003.** Staged delivery shall expose only truthful stage state and validated committed blocks. Unvalidated model tokens shall not appear as a factual final answer.
- **BICC-TRN-004.** Reconnect or reload shall restore the persisted execution state without duplicating an operation or write.
- **BICC-TRN-005.** Ask shall declare workload-aware limits for concurrent executions, model calls, attachment analysis, and expensive operations by authenticated identity and appropriate household/property scope.
- **BICC-TRN-006.** Rate-limit and temporary-capacity responses shall preserve drafts and return a specific retry window or recovery action.
- **BICC-TRN-007.** Latency budgets shall be measured separately for deterministic read, model-planned read, composed read, attachment analysis, and consequential confirmation.

## 13. Functional requirements — user-controlled memory and proactive concierge

- **BICC-MEM-001.** Persistent preference memory is opt-in and separate from canonical property facts.
- **BICC-MEM-002.** Initial preference categories are limited to explicitly supplied DIY/hire preference, budget thresholds, planning horizon, communication preference, preferred vendors, accessibility needs, and risk tolerance approved by the owner.
- **BICC-MEM-003.** Users shall be able to inspect, correct, delete, and disable preference memory. Deletion shall remove it from future context and derived indexes.
- **BICC-MEM-004.** Ask shall disclose when a recommendation materially uses a saved preference and allow the user to answer without it.
- **BICC-MEM-005.** Ask shall not silently infer or persist sensitive, financial, medical, protected-class, household-conflict, or legal-status attributes from conversation.
- **BICC-PRO-001.** Proactive continuations shall identify the triggering source, affected property/candidate, freshness, why it matters now, and available dismiss/remind/handled behavior where governing policy exists.
- **BICC-PRO-002.** A proactive recommendation shall not create a task, contact a provider, alter a record, or start a consequential workflow without the normal review and confirmation contract.

## 14. Functional requirements — user experience and accessibility

- **BICC-UX-001.** The full workspace and floating panel shall provide equivalent answer, evidence, attachment, clarification, confirmation, and recovery semantics at supported viewport sizes.
- **BICC-UX-002.** Current-page starters shall be offered only for reviewed routes whose property/entity identifiers can be parsed and reauthorized. Unsupported routes remain generic rather than inventing context.
- **BICC-UX-003.** Completed answers shall support copy. Regeneration follows BICC-CTX-006. Feedback shall persist against execution/attempt identity and be available after reload.
- **BICC-UX-004.** Mobile controls shall not overlap application navigation, safe areas, the keyboard, or one another at supported viewport sizes.
- **BICC-UX-005.** Dialogs, progress, clarification, errors, confirmations, and newly committed results shall have correct focus, heading, live-region, keyboard, and screen-reader behavior.
- **BICC-UX-006.** Offline state shall be disclosed before submission where detectable. Recent cached conversations may be read offline only if sensitive-data and sign-out clearing policy are satisfied; offline writes are prohibited.
- **BICC-UX-007.** Ask's optional bundle shall be lazy-loaded from non-Ask pages without losing launch context. Bundle and interaction budgets shall be measured rather than inferred from source line count.
- **BICC-UX-008.** Existing voice dictation shall disclose browser support and permission state, provide explicit start/listening/stop/error states, allow transcript review before submission, never submit automatically, and support keyboard, focus, screen-reader, and dismissible-error behavior. Real-time duplex spoken conversation is not required by this FRD.
- **BICC-UX-009.** English is the v1 supported understanding language. Unsupported-language input shall receive a respectful, non-destructive recovery response. Additional languages require language-specific routing, entity, safety, answer-quality, and accessibility evaluation; passing English evaluation shall not certify another language.
- **BICC-UX-010.** Ask shall respond briefly, naturally, and warmly to greetings, thanks, acknowledgements, and light rapport without inventing home facts, personal familiarity, memory, emotion, or completed work. Pure social turns shall not force tool execution, clarification, or a suggested-action row. Ask shall transition naturally to supported homeowner assistance when requested while preserving accessibility, authorization, and safety boundaries.

## 15. Operational and observability requirements

- **BICC-OPS-001.** Telemetry shall record stage timing, routing/planning lineage, target kind, answer mode, clarification, fallback reason, validation removals, cancellation, rate limiting, and model cost without logging prohibited sensitive content.
- **BICC-OPS-002.** Quality dashboards shall separate deterministic, provisional, model-planned, composed, document-grounded, and general-guidance outcomes.
- **BICC-OPS-003.** Provider/model failure shall degrade to deterministic reads, focused clarification, or a transparent unavailable result; it shall never broaden execution authority.
- **BICC-OPS-004.** An operation/capability inventory shall be generated from authoritative registries. Product documentation shall not maintain an unqualified hand-counted total.
- **BICC-OPS-005.** Each newly enabled answer mode or planning stratum shall have a named engineering owner, versioned automated evaluation artifact, operational control, rollback procedure, and failure-triage path. Passing is evaluated automatically in CI or the offline evaluation runner. This is not a user cohort rollout, staged release, or recurring manual release-certification gate.
- **BICC-OPS-006.** Every external model or evaluator call path shall appear in a provider-boundary register that records its purpose and stage; exact permitted fields and prohibited data categories; whether document text, images, addresses, identifiers, or home facts may be transmitted; minimization and redaction method; provider, model, region, retention, training-use, abuse-monitoring, and application-logging terms; deletion behavior; and approval evidence. Approval for synthetic evaluation data shall not authorize transmission of real homeowner data.
- **BICC-OPS-007.** External calls shall use a purpose-specific allowlisted serializer and a single governed egress boundary. Captured-payload tests shall prove that only approved minimized fields can reach the provider and that raw records, unrestricted conversation history, unrelated document content, credentials, and prohibited identifiers cannot leave through another path.
- **BICC-OPS-008.** Routing, document analysis, vision, synthesis, recommendation, and evaluation-judge providers shall be reviewed as separate data flows. An approval or minimization claim for one flow shall not be inherited by another.

## 16. Phased delivery

### Phase 0 — Baseline and contract

- Approve proposed gates.
- Produce the scenario taxonomy, rotating sealed held-out pool, burn/replenishment ledger, and versioned certification sets.
- Define and calibrate the automated claim-entailment and unsupported-claim scorer under BICC-EVAL-014.
- Complete the provider-boundary register and captured-payload test design for every proposed external call path.
- Establish end-to-end answer, latency, and cost baselines.
- Generate the authoritative operation/data-point inventory.

**Exit:** BICC-EVAL-001 through BICC-EVAL-017 are executable and a dated baseline exists.

### Phase 0.5 — Independent experience quick wins

This track runs in parallel with Phases 0 and 1 and does not wait for semantic planning, multimodal retrieval, or buyer-discovery architecture.

- Reproduce and correct mobile launcher/navigation, duplicate-close, FeedbackWidget, keyboard, and heading conflicts.
- Add real client cancellation and propagate cancellation to cancellable work; represent user stop as a normal state.
- Add copy and persisted feedback under the existing execution identity.
- Lazy-load the Ask workspace from non-Ask dashboard pages without losing launch context.
- Complete the existing voice-dictation states, transcript review, permission/error recovery, and accessibility behavior required by BICC-UX-008.
- Add focused accessibility and narrow-viewport tests for each corrected defect.

**Exit:** each accepted defect has a current reproduction, focused regression evidence, and no change to authorization, execution, confirmation, or result identity.

### Phase 1 — Conversational reach and answer modes

- Improve data-point and entity/value lookup.
- Add bounded candidate retrieval and planner validation.
- Deliver declared answer modes, the BICC-UX-010 warm social-turn contract, general guidance, and focused clarification.
- Certify active-emergency recall and benign-mention false-positive behavior under BICC-SAFE-001 through BICC-SAFE-003 and BICC-GATE-009.
- Deliver the explicit property-selection recovery required by BICC-PORT-003 for unsupported portfolio questions.
- Deliver the respectful, non-destructive unsupported-language recovery required by BICC-UX-009.

**Exit:** BICC-GATE-001 through BICC-GATE-009, including BICC-GATE-007B, pass for the approved Phase 1 domain and write-family matrix; BICC-EVAL-010 remains zero.

### Phase 2 — Continuity and composed reads

- Certify structured conversation summaries and entity references.
- Complete approved bounded multi-facet reads using the existing composition contract.
- Deliver safe regeneration with per-attempt persisted feedback.

**Exit:** compound and follow-up certification passes with no silent facet loss or property retargeting.

### Phase 3 — Multimodal and document-grounded answers

- Inline photo/document attachment and preview.
- Authorized, version-aware, deletion-aware retrieval with citations.
- Treat all attachment and retrieved content as untrusted evidence and pass the BICC-EVAL-015 injection corpus.
- Reviewed promotion of extracted candidates.

**Exit:** BICC-MM-001 through BICC-MM-012 pass, including injection isolation, access-loss, retention, promotion-boundary, and deletion tests.

### Phase 4 — Prospective Buyer Discovery

- Candidate-property workspace and comparison.
- Cost/cash scenarios and document review.
- Enforce the BICC-BUY-011 fair-housing refusal and objective-redirection boundary.
- Explicit candidate-to-contract promotion.

**Exit:** BICC-BUY-001 through BICC-BUY-011 pass without discriminatory steering, candidate data leaking into canonical homeowner behavior, or unauthenticated access crossing the approved account boundary.

### Phase 5 — Responsiveness, memory, and proactive concierge

- Staged delivery, building on Phase 0.5 cancellation.
- Workload-aware limits and measured performance.
- Opt-in preference memory and explainable proactive continuations.
- Remaining route-context starters, offline read behavior, and measured bundle and interaction budgets.

**Exit:** transport recovery, memory control, accessibility, and performance acceptance suites pass.

## 17. Non-goals

- An unrestricted autonomous agent or arbitrary tool execution.
- Model-authored canonical facts, calculations, permissions, or actions.
- Skipping confirmation based on model confidence.
- Composing writes.
- Treating candidate homes as owned homes before explicit promotion.
- Silent durable memory inferred from conversation.
- Diagnosing a home condition definitively from an image.
- Anonymous or unauthenticated guest Ask.
- Portfolio-wide multi-property questions until an explicit portfolio-read contract is approved.
- Languages other than English in v1; they require language-specific certification.
- Real-time duplex conversational voice; reviewed voice dictation remains in scope.
- Expanding household collaboration, inventing new household roles, or requiring multi-role parity in domains that currently support only the primary owner.
- Selecting `pgvector`, SSE, a model provider, or another specific technology without measured evidence.
- Registry consolidation that creates a second source of authority.
- Claiming “best in class” from feature count alone; the claim depends on the approved quality gates and comparative evaluation.

## 18. Open owner decisions

| ID | Decision |
|---|---|
| BICC-D01 | Approve or revise the automated offline/CI gates in §6.3, including corpus size, maintenance effort, execution time, and acceptable ongoing evaluation cost. |
| BICC-D02 | Approve the initial safe general-guidance policy and excluded high-risk topics. |
| BICC-D03 | Approve candidate-property retention, deletion, and promotion semantics. |
| BICC-D04 | Approve supported attachment types, size limits, and sensitive-document classes. |
| BICC-D05 | Approve preference-memory categories and default opt-in experience. |
| BICC-D06 | Select the Phase 1 domain matrix used for certification. |
| BICC-D07 | Decide whether staged delivery is required before multimodal delivery or may follow it based on measured latency. |
| BICC-D08 | After Phase 0 measurement, approve provisional p50, p95, timeout, first-useful-result, and per-turn model-cost budgets for deterministic reads, model-planned reads, composed reads, attachment analysis, and consequential confirmation. |
| BICC-D09 | Decide which authenticated account role or roles may enter `PROSPECTIVE_BUYER` mode and how the current `HOMEOWNER`-only client/server eligibility boundary changes. |
| BICC-D10 | Approve ephemeral chat-attachment retention, deletion, encryption/isolation, and sensitive-document policy. |
| BICC-D11 | Approve the broader held-out emergency-corpus recall and false-positive thresholds, sample floors, confidence method, and critical canonical emergency set used by BICC-GATE-009. |
| BICC-D12 | Approve the BICC-EVAL-014 scorer rubric, human-label protocol, judge calibration thresholds, and required adjudication classes before GATE-004B or GATE-007 is certifying. |

## 19. Requirement evidence and status

All `BICC-*` requirements begin as `UNVERIFIED`. Implementation work shall update `docs/library/requirement_status.csv` with requirement-specific acceptance evidence. A document header, route, component, model response, compile, or unit test alone does not establish end-to-end delivery.
