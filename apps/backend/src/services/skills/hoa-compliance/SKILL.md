# HOA Compliance Skill

## Purpose

Review this home's HOA records: the association and dues, approval requests with the association's recorded decision, and violations with cure deadlines and fines. A status the household reported is not an association approval.

## Select this Skill when

- Show my HOA records
- Did the HOA approve our fence request?
- Are there any open HOA violations?

## Do not select this Skill when

- Report an HOA violation for the trash cans
- The request asks whether planned work needs approval (`renovation`)
- The request is about HOA items before closing on a purchase (`buyer-closing`)

## Operations

- `HOA_COMPLIANCE_STATUS`

## Consumers

- ASK: HOA_COMPLIANCE_STATUS

## Canonical ownership and boundaries

Operations remain owned by their registered canonical services and may be reached only through the adapters declared in the machine manifest. Context access is limited to declared providers. Peer Skill execution is prohibited; handoffs return to Ask for normal routing and authorization.
