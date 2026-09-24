# Price Finalization Skill

## Purpose

Review the prices and terms recorded in Price Finalization: each vendor's accepted price against the quote, the agreed scope, payment, warranty and timeline, and whether it was finalized or booked. Only the home's primary owner can see these records.

## Select this Skill when

- Show my price finalizations
- What price did we agree with the plumber?
- Which vendor terms have we finalized?

## Do not select this Skill when

- Finalize the plumber price at $1,200
- The request compares quotes or checks whether a price is fair (`quote-comparison`, `service-price-radar`)
- The request is about negotiating with a contractor (`negotiation-shield`)

## Operations

- `PRICE_FINALIZATIONS_LIST`

## Consumers

- ASK: PRICE_FINALIZATIONS_LIST

## Canonical ownership and boundaries

Operations remain owned by their registered canonical services and may be reached only through the adapters declared in the machine manifest. Context access is limited to declared providers. Peer Skill execution is prohibited; handoffs return to Ask for normal routing and authorization.
