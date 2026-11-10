// Composition FRD §12.1: the multi-turn slot corpus. Each row is a carried context (what the last answered turn left), an elliptical follow-up, and the
// expected outcome. Rows are explicit; nothing here is derived from the code under test.
const roof = { item: 'roof', targetDate: 'in 5 years', operationId: 'ITEM_REPLACEMENT_COST', referencedExecutionId: 'e1' };
const heater = { item: 'water heater', operationId: 'INVENTORY_LOOKUP', referencedExecutionId: 'e1' };
const funding = { item: 'roof', targetDate: 'in 3 years', operationId: 'CAPITAL_ITEM_FUNDING_GOAL', referencedExecutionId: 'e1' };
const warranty = { item: 'dishwasher', operationId: 'WARRANTY_LOOKUP', referencedExecutionId: 'e1' };
const noOp = { item: 'roof', operationId: 'HOME_TIMELINE_EVENTS', referencedExecutionId: 'e1' };

const R = (carried, message, resolved) => ({ carried, message, expect: { kind: 'RESOLVED', message: resolved } });
const N = (carried, message) => ({ carried, message, expect: { kind: 'NOT_ELLIPTICAL' } });
const S = (carried, message, missing) => ({ carried, message, expect: { kind: 'NEEDS_SLOT', missing } });

module.exports = [
  // "what about <item>": the same question about another item, keeping the date
  R(roof, 'what about the water heater?', 'how much does a new water heater cost in 5 years'),
  R(roof, 'what about my furnace', 'how much does a new hvac cost in 5 years'),
  R(roof, 'how about the dishwasher', 'how much does a new dishwasher cost in 5 years'),
  R(roof, 'and the refrigerator?', 'how much does a new refrigerator cost in 5 years'),
  R(roof, 'and what about the microwave', 'how much does a new microwave cost in 5 years'),
  R(roof, 'what about the sump pump', 'how much does a new sump pump cost in 5 years'),
  R(funding, 'what about the water heater', 'how should I save to replace my water heater in 3 years'.replace('how should I save', 'how much should I save')),
  R(funding, 'and the furnace?', 'how much should I save to replace my hvac in 3 years'),
  R(funding, 'how about my dishwasher', 'how much should I save to replace my dishwasher in 3 years'),
  R(heater, 'what about the roof?', 'how old is my roof'),
  R(heater, 'and the dishwasher', 'how old is my dishwasher'),
  R(heater, 'what about the refrigerator', 'how old is my refrigerator'),
  R(heater, 'and my furnace?', 'how old is my hvac'),
  R(warranty, 'what about the water heater', 'what warranties cover my water heater'),
  R(warranty, 'and the roof?', 'what warranties cover my roof'),
  R(warranty, 'how about my refrigerator', 'what warranties cover my refrigerator'),
  // "make it N years" / "what if it is 2032": the same question and item, a new date
  R(roof, 'make it 10 years', 'how much does a new roof cost in 10 years'),
  R(roof, 'make it 3 years', 'how much does a new roof cost in 3 years'),
  R(roof, 'make it two years', 'how much does a new roof cost in two years'),
  R(roof, 'and if it is 2032', 'how much does a new roof cost by the end of 2032'),
  R(roof, 'what if it is 18 months', 'how much does a new roof cost in 18 months'),
  R(roof, 'and in 7 years?', 'how much does a new roof cost in 7 years'),
  R(roof, 'how about in 15 years', 'how much does a new roof cost in 15 years'),
  R(funding, 'make it 10 years', 'how much should I save to replace my roof in 10 years'),
  R(funding, 'make it 5 years', 'how much should I save to replace my roof in 5 years'),
  R(funding, 'what if it is 2030', 'how much should I save to replace my roof by the end of 2030'),
  R(funding, 'and in 2 years?', 'how much should I save to replace my roof in 2 years'),
  R({ ...roof, item: 'water heater' }, 'make it 4 years', 'how much does a new water heater cost in 4 years'),
  R({ ...roof, item: 'hvac' }, 'make it 6 years', 'how much does a new hvac cost in 6 years'),
  R({ ...roof, item: 'dishwasher' }, 'and in 9 years', 'how much does a new dishwasher cost in 9 years'),
  // "what would it cost": the cost of the carried item
  R(heater, 'what would it cost?', 'how much does a new water heater cost'),
  R(heater, 'how much would that be', 'how much does a new water heater cost'),
  R(heater, 'and what would a new one cost', 'how much does a new water heater cost'),
  R(heater, 'what does a replacement run', 'how much does a new water heater cost'),
  R(warranty, 'what would it cost', 'how much does a new dishwasher cost'),
  R(warranty, 'how much would a new one be', 'how much does a new dishwasher cost'),
  R(noOp, 'what would it cost', 'how much does a new roof cost'),
  R(roof, 'what would it cost?', 'how much does a new roof cost in 5 years'),
  R(funding, 'how much would that be?', 'how much does a new roof cost in 3 years'),
  R(warranty, 'and the dryer?', 'what warranties cover my dryer'),
  R(heater, 'how about the oven', 'how old is my oven'),
  R(roof, 'and the freezer', 'how much does a new freezer cost in 5 years'),
  R(funding, 'what about the roof', 'how much should I save to replace my roof in 3 years'),
  R(roof, 'what about the dehumidifier?', 'how much does a new dehumidifier cost in 5 years'),
  // an elliptical message with no usable context is never guessed
  S(null, 'what would it cost?', 'item'),
  S({ operationId: 'ITEM_REPLACEMENT_COST' }, 'make it 10 years', 'item'),
  S(noOp, 'what about the water heater', 'operation'),
  S(noOp, 'make it 10 years', 'operation'),
  S(null, 'what about the water heater', 'operation'),
  S({ operationId: 'DO_NOTHING_SIMULATION', item: 'roof' }, 'and the furnace', 'operation'),
  // not elliptical: routed by the ordinary router
  N(roof, 'how much does a new roof cost'),
  N(roof, 'show my capital plan'),
  N(roof, 'what about my mortgage rate'),
  N(roof, 'how old is my roof and what would a new one cost'),
  N(roof, 'should I repair or replace my roof'),
  N(heater, 'what warranties do I have'),
  N(heater, 'I can save $300 a month'),
  N(heater, 'how much should I save for the roof in 5 years'),
  N(null, 'show my home timeline'),
  N(roof, 'what is my maintenance budget'),
];
