import { z } from 'zod';

// Declared message and capture key for the "More room options" flow (FRD v1.470). It rides on the ROOM_RENAME command op,
// so no new operation is needed. The room profile questionnaire, the room checklist and deleting a room are all reached
// from one choice form, because a room row can carry at most four actions.
export const ROOM_MORE_MESSAGE = 'More options for this room.';
export const ROOM_DETAIL_CAPTURE_KEY = 'ROOM_DETAIL_INPUTS';

const titleCase = (value: string) => value.toLowerCase().replace(/_/g, ' ').replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
const opts = (values: string[]) => values.map((value) => ({ value, label: titleCase(value) }));
const YES_NO = opts(['YES', 'NO']);

export interface RoomProfileField { key: string; label: string; options: Array<{ value: string; label: string }> }
const COMMON: RoomProfileField[] = [
  { key: 'style', label: 'Primary style', options: opts(['TRADITIONAL', 'MODERN', 'TRANSITIONAL', 'MINIMALIST', 'INDUSTRIAL', 'COASTAL']) },
  { key: 'flooring', label: 'Flooring', options: opts(['HARDWOOD', 'TILE', 'VINYL', 'LAMINATE', 'CARPET', 'CONCRETE']) },
];
const f = (key: string, label: string, values: string[] | Array<{ value: string; label: string }>): RoomProfileField =>
  ({ key, label, options: typeof values[0] === 'string' ? opts(values as string[]) : values as Array<{ value: string; label: string }> });

// Mirrors the questionnaire the Rooms page shows (RoomProfileForm), one field list per kind of room.
const PROFILE_FIELDS: Record<string, RoomProfileField[]> = {
  KITCHEN: [...COMMON, f('countertops', 'Countertops', ['GRANITE', 'QUARTZ', 'MARBLE', 'LAMINATE', 'BUTCHER_BLOCK', 'CONCRETE']), f('cabinets', 'Cabinet finish', ['WHITE', 'OAK', 'MAPLE', 'WALNUT', 'PAINTED', 'LAMINATE']), f('backsplash', 'Backsplash', ['TILE', 'GLASS', 'STONE', 'PAINT', 'NONE']), f('ventHood', 'Vent hood type', ['CHIMNEY', 'UNDER_CABINET', 'ISLAND', 'MICROWAVE', 'NONE'])],
  LIVING: [...COMMON, f('seatingCapacity', 'Seating capacity', ['2', '3', '4', '5', '6', '8']), f('primaryUse', 'Primary use', ['FAMILY_TIME', 'ENTERTAINING', 'TV', 'MULTIPURPOSE']), f('tvMount', 'TV mount', ['WALL', 'STAND', 'NONE']), f('lighting', 'Lighting', ['RECESSED', 'LAMPS', 'PENDANT', 'MIXED'])],
  BEDROOM: [...COMMON, f('bedSize', 'Bed size', ['TWIN', 'FULL', 'QUEEN', 'KING']), f('nightLighting', 'Night lighting', ['LAMPS', 'SCONCES', 'NONE']), f('bedroomKind', 'Bedroom type', [{ value: 'MASTER', label: 'Master' }, { value: 'KIDS', label: 'Kids' }, { value: 'GUEST', label: 'Guest' }])],
  BATHROOM: [...COMMON, f('bathroomType', 'Bathroom type', ['FULL', 'HALF', 'PRIMARY']), f('showerType', 'Shower / tub type', ['SHOWER_ONLY', 'TUB_ONLY', 'SHOWER_TUB', 'NONE']), f('exhaustFan', 'Exhaust fan present', YES_NO), f('gfciPresent', 'GFCI outlets present', YES_NO), f('shutoffAccessible', 'Shutoff access is easy', YES_NO)],
  DINING: [...COMMON, f('seatingCapacity', 'Seating capacity', ['4', '6', '8', '10']), f('tableMaterial', 'Table material', ['WOOD', 'GLASS', 'MARBLE', 'METAL']), f('lighting', 'Lighting', ['CHANDELIER', 'PENDANT', 'RECESSED', 'MIXED']), f('highChairUse', 'High chair use', YES_NO)],
  LAUNDRY: [...COMMON, f('washerType', 'Washer type', ['FRONT_LOAD', 'TOP_LOAD']), f('dryerType', 'Dryer type', ['ELECTRIC', 'GAS']), f('ventingType', 'Venting type', ['RIGID', 'SEMI_RIGID', 'FLEX']), f('floorDrain', 'Floor drain', YES_NO), f('leakPan', 'Leak pan', YES_NO)],
  GARAGE: [...COMMON, f('carCapacity', 'Car capacity', ['1', '2', '3']), f('doorType', 'Door type', ['AUTO', 'MANUAL']), f('storageType', 'Storage type', ['SHELVES', 'CABINETS', 'MIXED', 'NONE']), f('waterHeaterLocatedHere', 'Water heater located here', YES_NO), f('fireExtinguisherPresent', 'Fire extinguisher present', YES_NO)],
  OFFICE: [...COMMON, f('primaryUse', 'Primary use', ['WFH', 'STUDY', 'GAMING', 'MIXED']), f('monitorCount', 'Monitor count', ['1', '2', '3', '4']), f('cableManagement', 'Cable management', ['TRAY', 'CLIPS', 'SLEEVES', 'NONE']), f('ergonomicSetup', 'Ergonomic setup', YES_NO), f('surgeProtection', 'Surge protection', YES_NO)],
  BASEMENT: [...COMMON, f('basementType', 'Basement type', ['FINISHED', 'UNFINISHED', 'PARTIAL']), f('humidityControl', 'Humidity control', ['DEHUMIDIFIER', 'HVAC', 'SENSOR_ONLY', 'NONE']), f('sumpPump', 'Sump pump present', YES_NO), f('floorDrain', 'Floor drain present', YES_NO), f('egressWindow', 'Egress window', YES_NO)],
  OTHER: [...COMMON],
};

const ROOM_BASE: Record<string, string> = { KITCHEN: 'KITCHEN', LIVING_ROOM: 'LIVING', BEDROOM: 'BEDROOM', BATHROOM: 'BATHROOM', DINING: 'DINING', LAUNDRY: 'LAUNDRY', GARAGE: 'GARAGE', OFFICE: 'OFFICE', BASEMENT: 'BASEMENT' };

export const roomProfileFields = (roomType: string | null | undefined): RoomProfileField[] => PROFILE_FIELDS[ROOM_BASE[roomType ?? ''] ?? 'OTHER'];

export const PROFILE_NOT_SET = '__NOT_SET__';

/** The profile as a plain object (a stored profile can be null or not an object). */
export const profileObject = (profile: unknown): Record<string, unknown> =>
  profile && typeof profile === 'object' && !Array.isArray(profile) ? { ...(profile as Record<string, unknown>) } : {};

/** Validates an answer against the room's questionnaire and returns only the fields that change. Unknown keys and values outside a field's options are rejected. */
export function profileChanges(roomType: string | null | undefined, current: unknown, answer: Record<string, unknown>): { ok: true; set: Record<string, string>; clear: string[] } | { ok: false; error: string } {
  const have = profileObject(current);
  const set: Record<string, string> = {}; const clear: string[] = [];
  for (const field of roomProfileFields(roomType)) {
    const raw = answer[field.key];
    if (raw === undefined || raw === null || raw === '') continue;
    const value = String(raw);
    const stored = typeof have[field.key] === 'string' ? have[field.key] as string : undefined;
    if (value === PROFILE_NOT_SET) { if (stored !== undefined) clear.push(field.key); continue; }
    if (!field.options.some((option) => option.value === value)) return { ok: false, error: `Choose one of the listed options for ${field.label}.` };
    if (stored !== value) set[field.key] = value;
  }
  return { ok: true, set, clear };
}

export const CHECKLIST_FREQUENCIES = ['ONCE', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'SEASONAL'] as const;
export const ChecklistFormSchema = z.object({
  title: z.string().trim().min(1).max(140),
  frequency: z.enum(CHECKLIST_FREQUENCIES).default('ONCE'),
});

/** The choice values of the "More room options" form. */
export const ROOM_CHOICE = { PROFILE: 'profile', ADD: 'add', DELETE: 'delete-room' } as const;
export type RoomChoice = { kind: 'PROFILE' | 'ADD' | 'DELETE' } | { kind: 'DONE' | 'REOPEN' | 'REMOVE' | 'EDIT'; itemId: string };
export function parseRoomChoice(value: unknown): RoomChoice | null {
  if (value === ROOM_CHOICE.PROFILE) return { kind: 'PROFILE' };
  if (value === ROOM_CHOICE.ADD) return { kind: 'ADD' };
  if (value === ROOM_CHOICE.DELETE) return { kind: 'DELETE' };
  const match = typeof value === 'string' ? /^(done|reopen|remove|edit):(.+)$/.exec(value) : null;
  return match ? { kind: match[1].toUpperCase() as 'DONE' | 'REOPEN' | 'REMOVE' | 'EDIT', itemId: match[2] } : null;
}

/** The choice for linking or unlinking a document on an item: `link:<id>` or `unlink:<id>`. */
export function parseDocumentChoice(value: unknown): { kind: 'LINK' | 'UNLINK'; documentId: string } | null {
  const match = typeof value === 'string' ? /^(link|unlink):(.+)$/.exec(value) : null;
  return match ? { kind: match[1].toUpperCase() as 'LINK' | 'UNLINK', documentId: match[2] } : null;
}
export const ITEM_DOCUMENTS_MESSAGE = 'Link or unlink a document on this inventory item.';
export const ITEM_DOCUMENT_CAPTURE_KEY = 'INVENTORY_ITEM_DOCUMENT_INPUTS';
