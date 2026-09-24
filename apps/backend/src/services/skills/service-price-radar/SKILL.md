# Service Price Radar Skill

## Purpose

Review the quote checks run in Service Price Radar for this home: each quoted price against the expected local range, with the verdict. Quote checks are kept for the home's primary account holder.

## Select this Skill when

- Show my service price radar
- Which of my price checks came in above the expected range?
- What did my past quote checks say?

## Do not select this Skill when

- Tell the contractor his quote is too high
- The request is to compare several contractor quotes (`quote-comparison`)
- The request is to run a new quote check (the Service Price Radar page)

## Operations

- `SERVICE_PRICE_CHECKS`

## Consumers

- ASK: SERVICE_PRICE_CHECKS

## Canonical ownership and boundaries

Operations remain owned by their registered canonical services and may be reached only through the adapters declared in the machine manifest. Context access is limited to declared providers. Peer Skill execution is prohibited; handoffs return to Ask for normal routing and authorization.
