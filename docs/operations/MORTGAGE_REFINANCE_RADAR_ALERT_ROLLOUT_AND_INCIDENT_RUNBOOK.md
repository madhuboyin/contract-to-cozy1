# Mortgage Refinance Radar alert rollout and incident runbook

**Owners:** Financial Intelligence Product, Backend Platform, Messaging Operations, Data & Trust Operations  
**Applies to:** refinance email and Web Push only  
**Default state:** in-product Home monitoring on; external delivery off; cohort mode `ALLOWLIST`

## Non-negotiable boundaries

- Keep `REFINANCE_ALERT_ROLLOUT_MODE=ALLOWLIST` until every gate in this runbook passes and the
  promotion is recorded.
- Keep `REFINANCE_EXTERNAL_ALERTS_ENABLED=false`, `REFINANCE_PUSH_ALERTS_ENABLED=false`, and
  `WEB_PUSH_DELIVERY_ENABLED=false` in the committed production baseline.
- Store `REFINANCE_ALERT_RECIPIENT_EMAIL_ALLOWLIST` and the VAPID private key in `app-secrets`, not
  source control or a ConfigMap.
- Email and push are approved independently. Success on one channel does not approve the other.
- Alert flags authorize notifications only. They never authorize lender transmission, referral,
  lead sale, application submission, or another commercial action.
- Automated lender transmission requires a separate product, privacy, compliance, security, and
  operations review plus an explicit implementation and rollback plan. There is no implied or
  inherited authorization from an alert rollout.

## Gate composition

An external alert is deliverable only when all applicable layers allow it:

1. global outbound notifications are enabled;
2. the selected refinance channel flag is enabled;
3. push transport and complete VAPID configuration are enabled for push;
4. the homeowner explicitly opted into that channel;
5. the recipient belongs to the internal rollout allowlist;
6. current mortgage and market evidence passes freshness checks;
7. confidence and sensitivity are compatible;
8. quiet hours, cadence, cooldown, and material-change policy allow delivery; and
9. the transport repeats recipient-cohort admission before sending.

Missing or invalid configuration must suppress delivery. It must not fall back to a broader cohort.

## Entry checklist for an internal cohort

- [ ] Named Product, Backend Platform, Messaging Operations, and Data & Trust owners.
- [ ] Current rollback operator and incident channel recorded.
- [ ] SMTP or VAPID provider readiness validated without a homeowner payload.
- [ ] Internal recipient allowlist stored in `app-secrets` and reviewed by two operators.
- [ ] `REFINANCE_ALERT_ROLLOUT_MODE=ALLOWLIST` confirmed in the deployed environment.
- [ ] Startup validation passes for the selected channel.
- [ ] Consent, opt-out, quiet-hours, cooldown, stale-input, low-confidence, and non-cohort
      suppression tests pass.
- [ ] Notification preview contains no balance, rate, payment, savings, closing-cost, lender, or
      offer values.
- [ ] In-product Home monitoring works with every external flag disabled.

Enable one channel-specific flag only after this checklist is recorded. For push, enable the global
Web Push transport before the refinance-specific push flag. Do not change the cohort mode.

## Evidence required before `GENERAL`

Use the authorized `/api/admin/analytics/refinance-radar` report and incident records. The review
window must contain enough representative controlled-cohort volume; a single successful delivery
is not release evidence.

| Gate | Required evidence |
| --- | --- |
| Delivery | Selected channel succeeds end to end; no unresolved provider or startup-validation defect. |
| Evaluation freshness | At least 99% of eligible property/snapshot claims complete within 24 hours; no alert uses stale inputs. |
| Duplicate rate | At least 20 notification records and duplicate rate no greater than 5%. |
| Usefulness | At least 20 feedback responses and helpful rate at least 60%. |
| Opt-out | Every tested opt-out takes effect before another send; no delivery occurs after revoked consent. |
| Complaints | No unresolved material complaint, privacy incident, or consent defect; complaint trend reviewed by Data & Trust Operations. |
| Suppression | Non-cohort, stale, no-consent, cooldown, confidence, and notification-policy suppressions are observable and correct. |
| Canonical integrity | No alert remains current after its opportunity closes; no duplicate canonical Home Action. |

Promotion requires written approval from Financial Intelligence Product, Backend Platform,
Messaging Operations, Data & Trust Operations, Privacy/Compliance, and Security. Record the report
window, results, approvers, rollout time, operator, and rollback owner. Change `GENERAL` through the
normal reviewed deployment process; never through an unrecorded live edit.

## Rollback

Use the narrowest applicable kill switch, then broaden if the issue is uncertain:

1. set `REFINANCE_PUSH_ALERTS_ENABLED=false` or `REFINANCE_EXTERNAL_ALERTS_ENABLED=false`;
2. if push transport itself is implicated, set `WEB_PUSH_DELIVERY_ENABLED=false`;
3. set `REFINANCE_ALERT_ROLLOUT_MODE=DISABLED` to deny all refinance recipients;
4. if the notification boundary is implicated, disable global outbound notifications; and
5. preserve in-product monitoring unless its underlying evaluation is unsafe.

Confirm the deployed values and observe that new transition processing records a suppression rather
than a send. Do not delete durable events, notifications, decisions, or preference evidence during
rollback.

## Incident classes and response

### Wrong recipient, missing consent, or sensitive payload

1. Disable the affected channel immediately; use the global outbound kill switch if scope is
   uncertain.
2. Notify Privacy/Compliance, Security, Data & Trust Operations, and the incident commander.
3. Preserve notification, preference, rollout-decision, and transport evidence.
4. Determine whether another recipient or channel is affected.
5. Do not resume until consent/cohort admission is corrected, payload minimization is verified, and
   Privacy/Compliance and Security approve.

### Duplicate, noisy, stale, or false-urgency alert

1. Disable the affected refinance channel or set rollout mode to `DISABLED`.
2. Inspect transition idempotency, cooldown, material UPDATE thresholds, freshness, confidence,
   preference sensitivity, and transport retry behavior.
3. Confirm the canonical Home Action lifecycle independently of external delivery.
4. Replay only through the approved idempotent path; never create a manual replacement alert.
5. Restart the controlled cohort from `ALLOWLIST`, not `GENERAL`.

### Provider or VAPID failure

1. Disable only the affected transport when consent and data boundaries are intact.
2. Validate startup configuration and provider health without a real homeowner payload.
3. Allow in-product monitoring and the other independently approved channel to continue only if the
   incident scope is proven separate.
4. Remove invalid push subscriptions through the existing stale-subscription path.

### Evaluation coverage, retry, or dead-letter breach

1. Keep external channels disabled while freshness or coverage is uncertain.
2. Inspect the rate snapshot, per-property claims, leases, retries, and dead letters.
3. Resume the idempotent property sweep for the same snapshot after correcting the cause.
4. Verify CLOSED resolution and DATA_REQUIRED behavior before re-enabling the cohort.

## Closeout evidence

Record timeline, affected channel/cohort, configuration before and after, durable event IDs,
suppression/send counts, root cause, homeowner/privacy impact, corrective tests, and all resumption
approvals. Update this runbook when a new failure mode or gate is discovered.

Measurement definitions and service-level ownership are maintained in
[Mortgage Refinance Radar measurement and optimization](./MORTGAGE_REFINANCE_RADAR_MEASUREMENT_AND_OPTIMIZATION.md).
