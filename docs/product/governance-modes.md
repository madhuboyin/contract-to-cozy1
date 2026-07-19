# Human policy governance modes

ContractToCozy currently has no real users. Human policy attestations are therefore advisory during internal beta, while technical safety controls remain mandatory in every environment.

## Configuration

`ENFORCE_HUMAN_POLICY_APPROVALS` is owned by the Kubernetes `app-config` ConfigMap and read only by the backend.

| Value | Mode | Behavior |
| --- | --- | --- |
| `false`, missing, or malformed | Internal beta | Missing Product, Domain, Trust, Legal/Compliance, or Commercial Integrity attestations are reported and audited but do not block test activation or qualified new-home plan creation. |
| Exact string `true` | Real-user launch | Tier-specific recommendation approvals and controlled new-home cohort admission are hard launch gates. |

The flag does not disable schema validation, evidence requirements, confidence and missing-context handling, commercial disclosure, jurisdiction checks, professional boundaries, emergency escalation, verified closure, MFA, authorization, financial approvals, provider compliance, or database acceptance safeguards.

## Phase audit

| Phase | Human-policy dependency | Beta behavior |
| --- | --- | --- |
| 0 | Framework policy register | Deferred until real-user launch; technical exit criteria remain complete. |
| 1 | External launch approval for material first value | Advisory; trigger-first testing remains available. |
| 2 | Reviewed personalization content in the canonical feed | Definitions may be activated in beta advisory mode; technical recommendation contracts still apply. |
| 3 | None | Credential-gated database/object-storage tests and verified closure remain unchanged. |
| 4 | Tier-specific recommendation attestations | Missing roles remain visible and auditable but do not block beta activation. |
| 5 | None | Schema application and pilot evidence gates remain unchanged. |
| 6 | Operator cohort admission | Automated qualification still applies; operator admission is advisory in beta and enforced for real-user launch. Expansion evidence remains non-bypassable. |

## Real-user launch checklist

Before admitting any real user:

1. Set `ENFORCE_HUMAN_POLICY_APPROVALS: "true"` in `infrastructure/kubernetes/base/configmap.yaml` and deploy the backend.
2. Record the accountable framework approvals for the current policy version in `phase0/approval-register.md`.
3. Record every tier-required approval for active recommendation definitions.
4. Admit each new-home pilot property into a named controlled cohort.
5. Confirm the Admin UI reports policy-approved readiness rather than beta advisory readiness.
6. Run the Phase 0 contract suite and applicable database acceptance harnesses.

Do not mark deferred reviews as approved and do not use direct SQL to manufacture approval history.
