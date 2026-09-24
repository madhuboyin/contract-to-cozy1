# Plant Advisor Care Outlook Skill

## Purpose

Review weather-aware care for this home's tracked plants and garden zones: what to change now or soon and why. When a weather, air-quality or drought source is unavailable, the answer says so rather than reporting no care changes.

## Select this Skill when

- Show my plant care outlook
- Do my plants need anything with this weather?
- How should I care for my garden zones this week?

## Do not select this Skill when

- Which plants should I buy for my living room? (the page's room recommendations)
- Diagnose the disease on my plant from this photo
- The request is about severe weather alerts or home maintenance tasks (`maintenance`)

## Operations

- `PLANT_CARE_OUTLOOK`

## Consumers

- ASK: PLANT_CARE_OUTLOOK

## Canonical ownership and boundaries

Operations remain owned by their registered canonical services and may be reached only through the adapters declared in the machine manifest. Context access is limited to declared providers. Peer Skill execution is prohibited; handoffs return to Ask for normal routing and authorization.
