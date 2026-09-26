# Warranties Skill

## Purpose

Review the warranties recorded for this home: provider, category and dates, whether each is active, expiring within 60 days or expired, and the coverage text exactly as recorded. This reports recorded information only. It does not determine whether a repair is covered, and it does not file a claim.

## Select this Skill when

- Show my warranties
- Which warranties expire within 60 days?
- Is my roof warranty still active?
- What warranty information is recorded for my HVAC?

## Do not select this Skill when

- Add a warranty to my home record (`CAPTURE_WARRANTY_CONFIRM`)
- Correct the expiry date on my warranty (`WARRANTY_CORRECT`)
- The request is about missing protection or coverage gaps (`coverage`)
- The request is to file or advance a claim (`incident-claim`)

## Operations

- `WARRANTY_LOOKUP`

## Consumers

- ASK: WARRANTY_LOOKUP

## Canonical ownership and boundaries

Operations remain owned by their registered canonical services and may be reached only through the adapters declared in the machine manifest. Context access is limited to declared providers. Peer Skill execution is prohibited; handoffs return to Ask for normal routing and authorization.
