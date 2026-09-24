# Material Specs Skill

## Purpose

Look up the paint colours, tile, flooring, fixtures and suppliers recorded in this home's Material Specs, so a finish can be matched or replaced later. Records are as entered; confirm with the supplier before buying a match.

## Select this Skill when

- Show my material specs
- What paint colour did we use in the living room?
- Which tile and flooring did we put in the kitchen?

## Do not select this Skill when

- Order two more gallons of the living room paint
- The request asks which colour or product to choose (design advice)
- The request is about appliances and belongings (`property-record`) or reviewing extracted material fields (`document-promotion`)

## Operations

- `MATERIAL_SPECS_LIST`

## Consumers

- ASK: MATERIAL_SPECS_LIST

## Canonical ownership and boundaries

Operations remain owned by their registered canonical services and may be reached only through the adapters declared in the machine manifest. Context access is limited to declared providers. Peer Skill execution is prohibited; handoffs return to Ask for normal routing and authorization.
