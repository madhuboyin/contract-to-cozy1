// DATA_POINT_READ (reliability FRD D12, Phase 1b): "what is the serial number of my fridge", "when was my furnace installed", "what did I pay for my dryer".
// A STANDARD, read-only fact read through the one allowlisted template in dataPoint/dataPointReader.ts. No side effects; a value that is not recorded is said plainly,
// with the authorised way to add it, and never guessed (FR-REC-2 MISSING_RECORD_DATA).
import { sourceRef } from '../composition/sourceAuthorization';
import { type AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { humanDate, money } from '../askFormatting';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { resolveDataPoint, roleMayRead, type DataPointDefinition } from '../dataPoint/dataPointCatalogue';
import { readDataPoint } from '../dataPoint/dataPointReader';

const ENTITY_COPY: Record<string, { plural: string; singular: string; collection: string; record: string }> = {
  InventoryItem: { plural: 'items', singular: 'inventory', collection: 'inventory', record: 'Home inventory record' },
  Warranty: { plural: 'warranties', singular: 'warranty', collection: 'warranties', record: 'Warranty record' },
  InsurancePolicy: { plural: 'insurance policies', singular: 'insurance policy', collection: 'insurance policies', record: 'Insurance policy record' },
  PropertyMaintenanceTask: { plural: 'maintenance tasks', singular: 'maintenance task', collection: 'maintenance tasks', record: 'Maintenance task record' },
};
const words = (v: unknown) => String(v).toLowerCase().replace(/_/g, ' ');
export function formatDataPointValue(point: DataPointDefinition, value: unknown): string {
  switch (point.family) {
    case 'date': return humanDate(value instanceof Date ? value : new Date(String(value))) ?? '';
    case 'money': return money(Math.round(Number(value) / 100));
    case 'dollars': return money(Math.round(Number(typeof value === 'object' && value && 'toNumber' in value ? (value as { toNumber(): number }).toNumber() : value)));
    case 'enum': return words(value);
    case 'tags': return (value as unknown[]).map(String).join(', ');
    default: return String(value);
  }
}
const notice = (reasonCode: string, id: string, title: string, body: string): AskOperationResult => ({
  status: 'READY_WITH_LIMITATIONS', reasonCode, parameters: { sources: [] }, blocks: [{ type: 'SUMMARY', id, title, body, tone: 'CAUTION', actions: [] } as AskPresentationBlock], suggestions: [],
});

export async function dataPointReadResult(userId: string, propertyId: string, message: string): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  const role = String(access.role);
  const point = resolveDataPoint(message);
  if (!point) return notice('DATA_POINT_NOT_IDENTIFIED', 'data-point-unidentified', 'Which detail do you mean?', 'Tell me the detail and the item, for example “the serial number of my refrigerator” or “when my furnace was installed”.');
  if (!roleMayRead(role, point)) {
    return notice('DATA_POINT_RESTRICTED', 'data-point-restricted', 'That detail is shown to contributors and owners', `${point.label} is only shown to household members who can edit this home. Ask the home’s owner if you need it.`);
  }
  const read = await readDataPoint(propertyId, role, point, message);
  const where = ENTITY_COPY[point.entity];
  if (read.status === 'AMBIGUOUS') return notice('DATA_POINT_AMBIGUOUS', 'data-point-ambiguous', `Which ${where.singular} do you mean?`, `You have more than one: ${read.rows.map((r) => r.name).join(', ')}. Name one and I’ll tell you ${point.label.charAt(0).toLowerCase()}${point.label.slice(1)}.`);
  if (read.status === 'ITEM_NOT_FOUND') return notice('DATA_POINT_NO_INVENTORY', 'data-point-no-inventory', `No ${where.plural} are recorded yet`, `Add it to your home record and I can tell you its details.`);
  if (read.status === 'NO_ITEM_NAMED') return notice('DATA_POINT_ITEM_NOT_FOUND', 'data-point-item-not-found', `I don’t see that in your ${where.collection}`, `${point.label} comes from the ${where.singular} record. Name one you have recorded, or add it first.`);
  const present = read.rows.filter((r) => r.value !== null && r.value !== '' && !(Array.isArray(r.value) && r.value.length === 0));
  if (read.status === 'NOT_RECORDED') {
    const names = read.rows.map((r) => r.name).join(' and ');
    return notice('DATA_POINT_NOT_RECORDED', 'data-point-not-recorded', `${point.label.replace(/^The /, 'The ')} for your ${names} isn’t recorded`, `Nothing is saved for this yet. You can add it by editing the record, and then I can tell you.`);
  }
  const sentences = present.map((r) => `Your ${r.name} ${point.sentence} ${formatDataPointValue(point, r.value)}.`);
  const missing = read.rows.length - present.length;
  if (missing > 0) sentences.push(`${missing === 1 ? 'One matching item has' : `${missing} matching items have`} nothing recorded for this.`);
  return {
    status: missing > 0 ? 'READY_WITH_LIMITATIONS' : 'ANSWERED', reasonCode: missing > 0 ? 'DATA_POINT_PARTIAL' : undefined,
    parameters: { sources: present.map((r) => ({ ...sourceRef(point.entity, r.id), ...(point.audience !== 'VIEWER' ? { minRole: point.audience } : {}) })) },
    blocks: [
      { type: 'SUMMARY', id: 'data-point-summary', title: `${point.label}: ${present.map((r) => formatDataPointValue(point, r.value)).join('; ')}`, body: sentences.join(' '), tone: missing > 0 ? 'CAUTION' : 'DEFAULT', actions: [] },
      { type: 'EVIDENCE', id: 'data-point-evidence', title: 'Where this comes from', items: present.map((r) => ({ label: r.name, source: `${where.record}${r.roomName ? ` (${r.roomName})` : ''}`, observedAt: null })) },
    ] as AskPresentationBlock[],
    suggestions: [],
  };
}

registerCapabilityHandler('data-point-read.read', async (envelope) => dataPointReadResult(envelope.userId, envelope.propertyId!, envelope.message));
