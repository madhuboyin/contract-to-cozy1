const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Routing guard for the Inline Workspace correction commands. They are excluded from fuzzy semantic retrieval
// (a plain read question scored as a near match for a write example), so they must be reached only by an
// explicit correction phrasing or a declared item action -- and ordinary read questions must never land on them.

const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const CORRECTION_OPERATIONS = new Set(['INVENTORY_ITEM_CORRECT', 'HOME_EVENT_CORRECT', 'WARRANTY_CORRECT', 'ROOM_RENAME', 'ROOM_CREATE', 'INVENTORY_ITEM_CREATE', 'PROPERTY_CONTEXT_AREA_CAPTURE', 'HOME_EVENT_VISIBILITY']);
const routeOf = (message) => resolveAskRoutingCascade(message, { localRoutingEnabled: true }).operation.operationId;

const READS = [
  'When was my water heater last serviced?', 'When was my dishwasher installed?', 'When did I purchase the refrigerator?', 'How old is my furnace?',
  'What is the install date of my HVAC system?', 'Show the purchase date for my dishwasher', 'What do you know about my water heater?', 'Show my appliance details',
  'When was the roof replaced?', 'What happened with my roof last year?', 'Show my home timeline', 'What is the date of my last repair?',
  'When does my HVAC warranty expire?', 'Who is the provider on my home warranty?', 'Show my warranties', 'Is my furnace under warranty?',
  'What is in the kitchen?', 'Show my rooms', 'How many rooms are in my house?', 'What is the name of the room with the water heater?',
  'Show incomplete inventory records', 'What appliances do I have?', 'Which items were serviced this year?', 'What is the warranty expiration date for the roof?',
  // read questions about the detail fields
  'What is the model of my furnace?', 'What condition is my water heater in?', 'How much did I pay for my dishwasher?', 'What is the serial number of my refrigerator?',
  'What brand is my dryer?', 'What is the replacement cost of my roof?', 'Show the notes on my furnace', 'What is the condition of my appliances?',
  // read questions about the event and warranty detail fields
  'What type of event was the roof replacement?', 'How much did the roof replacement cost?', 'What is the summary of my last repair?', 'How important is the roof event?',
  'What is the policy number on my home warranty?', 'How much does my home warranty cost?', 'What does my HVAC warranty cover?', 'When did my warranty start?',
  'What type of warranty do I have?', 'Show the coverage details for my furnace warranty',
  // read questions about an event's room/item link that must stay reads
  'What room is the roof replacement linked to?', 'Which room is the roof event in?', 'What item is this timeline event about?', 'Is this event linked to my water heater?',
  // read questions about visibility that must stay reads
  'Who can see my home timeline?', 'Which events are private?', 'What is the visibility of the roof replacement event?', 'Show my home timeline', 'Which events are shared in my resale pack?',
  'Make my property private', 'Change my privacy settings',
  // the add-an-item action's own message and read questions near it: the add command is reached only by the declared action
  'Add an item to my home inventory.', 'Add a room to my home record.', 'Fill in the missing structure details.', 'Fill in the missing safety details.', 'How many items are in my inventory?', 'Show my inventory', 'Do I have a dishwasher in my inventory?',
  // read questions about a room's type and floor level
  'What type of room is the office?', 'What floor is the bedroom on?', 'What floor level is my basement room?', 'Show room types', 'What is the floor level of the kitchen?', 'Which floor is the laundry room on?',
  // wording that resembles a correction but belongs to other operations
  'Update the notes on this maintenance task', 'Edit the notes for this seller prep checklist item', 'Change the model number on my quote request',
];

const WRITES = [
  ['Correct the install date of this inventory item.', 'INVENTORY_ITEM_CORRECT'], ['Correct the purchase date of this inventory item.', 'INVENTORY_ITEM_CORRECT'],
  ['Correct the last serviced date of this inventory item.', 'INVENTORY_ITEM_CORRECT'], ['The install date on my water heater item is wrong, please fix the install date', 'INVENTORY_ITEM_CORRECT'],
  ['Correct the condition of this inventory item.', 'INVENTORY_ITEM_CORRECT'], ['Correct the brand of this inventory item.', 'INVENTORY_ITEM_CORRECT'],
  ['Correct the model of this inventory item.', 'INVENTORY_ITEM_CORRECT'], ['Correct the serial number of this inventory item.', 'INVENTORY_ITEM_CORRECT'],
  ['Correct the purchase cost of this inventory item.', 'INVENTORY_ITEM_CORRECT'], ['Correct the replacement cost of this inventory item.', 'INVENTORY_ITEM_CORRECT'],
  ['Correct the notes of this inventory item.', 'INVENTORY_ITEM_CORRECT'], ['Please fix the serial number on my inventory record for the dryer', 'INVENTORY_ITEM_CORRECT'],
  ['Correct the title of this timeline event.', 'HOME_EVENT_CORRECT'], ['Correct the date of this timeline event.', 'HOME_EVENT_CORRECT'],
  ['Correct the provider of this warranty.', 'WARRANTY_CORRECT'], ['Correct the expiry date of this warranty.', 'WARRANTY_CORRECT'],
  ['Correct the summary of this timeline event.', 'HOME_EVENT_CORRECT'], ['Correct the amount of this timeline event.', 'HOME_EVENT_CORRECT'],
  ['Correct the type of this timeline event.', 'HOME_EVENT_CORRECT'], ['Correct the importance of this timeline event.', 'HOME_EVENT_CORRECT'],
  ['Correct the start date of this warranty.', 'WARRANTY_CORRECT'], ['Correct the coverage type of this warranty.', 'WARRANTY_CORRECT'],
  ['Correct the policy number of this warranty.', 'WARRANTY_CORRECT'], ['Correct the cost of this warranty.', 'WARRANTY_CORRECT'],
  ['Correct the coverage details of this warranty.', 'WARRANTY_CORRECT'],
  ['Change the visibility of this timeline event.', 'HOME_EVENT_VISIBILITY'], ['Make this timeline event private', 'HOME_EVENT_VISIBILITY'], ['Share this timeline event in resale summaries', 'HOME_EVENT_VISIBILITY'], ['Who can see this timeline event?', 'HOME_EVENT_VISIBILITY'],
  ['Correct the room of this timeline event.', 'HOME_EVENT_CORRECT'], ['Correct the inventory item of this timeline event.', 'HOME_EVENT_CORRECT'], ['Change the room for this timeline event to the kitchen', 'HOME_EVENT_CORRECT'],
  ['Rename this room.', 'ROOM_RENAME'], ['Can you rename the spare room to office', 'ROOM_RENAME'],
  ['Change the type of this room.', 'ROOM_RENAME'], ['Change the floor level of this room.', 'ROOM_RENAME'], ['Correct the room type of the office', 'ROOM_RENAME'], ['Change the floor level of the guest room', 'ROOM_RENAME'],
];

test('ordinary read questions never route to a correction command', () => {
  const misrouted = READS.map((message) => [message, routeOf(message)]).filter(([, operationId]) => CORRECTION_OPERATIONS.has(operationId));
  assert.deepEqual(misrouted, []);
});

test('explicit correction phrasings and the declared item-action messages route to the right command', () => {
  const wrong = WRITES.map(([message, expected]) => [message, routeOf(message), expected]).filter(([, actual, expected]) => actual !== expected);
  assert.deepEqual(wrong, []);
});
