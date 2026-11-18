// Review-time coverage check for a warranty being recorded through Ask (Actionable Result Enrichment FRD §5.2-5.3).
//
// Runs after the homeowner submits the Record warranty form and before the confirmation card is shown. It chooses the review surface:
//   - exact duplicate      -> a terminal ANSWERED result: summary + the existing warranty in the standard warranty-results block (inline detail).
//                             No confirmation, no consent checkbox, no confirm button, no pending capture request.
//   - equivalent / overlap -> the normal confirmation card relabelled "Record anyway", bound to a single-use fingerprint of the current matches.
//   - no match             -> the normal confirmation card, unchanged.
// The write itself re-runs the complete check under an advisory lock (captureWarranty.ts); nothing here authorizes a write.
import { prisma } from '../../../lib/prisma';
import { findWarrantyCoverage } from '../../../modules/propertyContext/application/captureWarranty';
import { warrantyOverrideFingerprint, type ExistingWarrantyRecord } from '../../../modules/propertyContext/application/warrantyCoverageMatch';
import { assertCanonicalWarrantyScope } from '../../warrantyCanonicalModel';
import { warrantiesFromRecords } from '../handlers/warranties.handler';
import type { AskOperationResult } from '../askOperationRegistry';

const dayText = (date: Date) => date.toISOString().slice(0, 10);
const describe = (record: ExistingWarrantyRecord) => `${record.providerName}, ${dayText(record.startDate)} to ${dayText(record.expiryDate)}`;

export async function reviewWarrantyCoverageForEdit(input: {
  execution: { id: string; propertyId: string | null };
  userId: string;
  edited: AskOperationResult;
}): Promise<AskOperationResult> {
  const { execution, userId, edited } = input;
  const propertyId = execution.propertyId;
  if (!propertyId) return edited;
  const parameters = edited.parameters as Record<string, unknown> | undefined;
  if (edited.status !== 'NEEDS_CONFIRMATION' || !edited.confirmation || !parameters) return edited;
  const { providerName, category, startDate, expiryDate } = parameters;
  if (typeof providerName !== 'string' || typeof category !== 'string' || typeof startDate !== 'string' || typeof expiryDate !== 'string') return edited;
  const inventoryItemId = typeof parameters.inventoryItemId === 'string' ? parameters.inventoryItemId : null;

  let scopeKind: string;
  try {
    scopeKind = assertCanonicalWarrantyScope({
      category, scopeKind: inventoryItemId ? 'ITEM_SPECIFIC' : null, propertyId: propertyId, inventoryItemId,
    });
  } catch {
    // A scope the writer will reject is reported by the confirmation, exactly as before; the coverage check needs a valid target.
    return edited;
  }

  const coverage = await findWarrantyCoverage(prisma, propertyId, inventoryItemId, {
    providerName, category, scopeKind,
    policyNumber: typeof parameters.policyNumber === 'string' ? parameters.policyNumber : null,
    startDate: new Date(startDate), expiryDate: new Date(expiryDate),
  });
  const withoutOverride = { ...parameters };
  delete withoutOverride.overrideFingerprint;

  if (coverage.outcome === 'NO_MATCH') return { ...edited, parameters: withoutOverride };

  if (coverage.outcome === 'EXACT_DUPLICATE') {
    const existingId = coverage.matches[0].id;
    const row = await prisma.warranty.findFirst({
      where: { id: existingId, propertyId: propertyId },
      select: {
        id: true, propertyId: true, providerName: true, category: true, coverageDetails: true, startDate: true, expiryDate: true, updatedAt: true,
        inventoryItem: { select: { name: true } }, documents: { select: { id: true } },
      },
    });
    const owned = row ? await prisma.warranty.count({ where: { id: row.id, homeownerProfile: { userId } } }) : 0;
    const listed = row
      ? warrantiesFromRecords({ message: 'Show my warranties', propertyId: propertyId, records: [row], canWrite: false, ownedIds: new Set(owned ? [row.id] : []) })
      : null;
    const list = listed?.blocks.find((block) => block.type === 'GROUPED_LIST' && block.id === 'warranty-results');
    return {
      status: 'ANSWERED',
      reasonCode: 'WARRANTY_ALREADY_RECORDED',
      blocks: [
        {
          type: 'SUMMARY', id: 'warranty-already-recorded', title: 'This warranty is already recorded',
          body: 'An identical warranty is already in your home record, so nothing was added. Nothing was changed.',
          tone: 'DEFAULT', actions: [],
        },
        ...(list && list.type === 'GROUPED_LIST' ? [{ ...list, actions: [], filters: [] }] : []),
      ],
      confirmation: null, captureRequests: [], suggestions: [],
      parameters: withoutOverride,
    };
  }

  // Equivalent or overlapping: the override is bound to this execution, this user and the complete current match set (single use: the
  // confirmation claim is the atomic boundary, and the writer recomputes this under the lock).
  const fingerprint = warrantyOverrideFingerprint({ executionId: execution.id, userId, propertyId: propertyId, inventoryItemId, matches: coverage.matches });
  const overlapping = coverage.outcome === 'OVERLAPPING_CONFLICT';
  const existingFields = coverage.matches.slice(0, 3).map((record) => ({ label: 'Already recorded', value: describe(record) }));
  return {
    ...edited,
    blocks: edited.blocks.map((block) => block.type === 'SUMMARY'
      ? {
        ...block,
        title: overlapping ? 'This overlaps coverage already recorded' : 'Similar coverage is already recorded',
        body: `${block.body} Coverage on this item is already recorded. Review it before recording this one as well.`,
      }
      : block),
    confirmation: {
      ...edited.confirmation,
      title: overlapping ? 'Record this warranty alongside existing coverage?' : 'Record this similar warranty anyway?',
      description: `${edited.confirmation.description} Existing coverage is shown below; confirming adds this one as well.`,
      fields: [...existingFields, ...edited.confirmation.fields],
      confirmLabel: 'Record anyway',
    },
    parameters: { ...parameters, overrideFingerprint: fingerprint },
  };
}
