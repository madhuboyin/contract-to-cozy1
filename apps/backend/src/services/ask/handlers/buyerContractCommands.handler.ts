// The buyer's contract revisions inside Ask (register P2 "Buyer Closing"; FRD v1.349). Reached only by the declared actions on the contract timeline
// answer. Every write is BuyerContractService's own method (the routes' calls), behind a review and a confirmation bound to the workspace's revisions.
// Confirmation keeps the desktop's per-field attestation; Ask offers no blanket "confirm everything".
import { createHash } from 'node:crypto';
import { HouseholdRole } from '@prisma/client';
import { type AskCaptureRequest } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { registerConfirmCapabilityHandler, type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { humanDate } from '../askFormatting';
import { BuyerContractService } from '../../buyerContract.service';
import {
  CONTINGENCY_STATUS_LABELS, CONTRACT_CAPTURE_KEYS, CONTRACT_CONTINGENCY_TYPES, CONTRACT_ENTITY_TYPE, CONTRACT_FIELD_LABELS, CONTRACT_MESSAGES, confirmableFields, contractKindFromMessage,
  parseContractAnswer, type ContractFormKind, type ContractKind,
} from '../support/buyerContractCommand';

/** The list fields of a draft the edit form can replace, with their labels (one entry per line). */
const LIST_FIELDS: Array<[string, string]> = [['buyerNames', 'Buyer name(s)'], ['sellerNames', 'Seller name(s)'], ['includedItems', 'Included items'], ['excludedItems', 'Excluded items'], ['agreedRepairs', 'Agreed repairs']];
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const stale = (message: string, code = 'ASK_CONFIRMATION_NOT_ACTIVE') => Object.assign(new Error(message), { code });
const back = { id: 'buyer-contract-back', label: 'Back to my contract timeline', interactionType: 'START_WORKFLOW' as const, message: 'Show my contract timeline', operationId: 'BUYER_CONTRACT_TIMELINE' as const, style: 'SECONDARY' as const };
const unavailable = (reasonCode: string, title: string, body: string): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode, blocks: [{ type: 'SUMMARY', id: 'buyer-contract-unavailable', title, body, tone: 'DEFAULT', actions: [back] }], suggestions: [],
});
const dollars = (cents: number) => `$${Math.round(cents / 100).toLocaleString('en-US')}`;
const isoDay = (day: string) => new Date(`${day}T12:00:00.000Z`).toISOString();
const dayOnly = (day: string) => day;

interface Contingency { id: string; contingencyKey: string; type: string; label: string; status: string; dueAt: string | null; notes: string | null }
interface Revision {
  id: string; status: string; revisionNumber: number; updatedAt: string; propertyAddress: string | null; buyerNames: string[]; sellerNames: string[];
  acceptedAt: string | null; targetClosingDate: string | null; possessionAt: string | null; possessionTerms: string | null;
  earnestMoneyAmountCents: number | null; earnestMoneyRecipient: string | null; earnestMoneyMethod: string | null; sellerCreditsCents: number | null;
  includedItems: string[]; excludedItems: string[]; agreedRepairs: string[]; specialConditions: string | null; contingencies: Contingency[];
}
interface Snapshot { revisions: Revision[]; propertyAddress: string }
async function load(userId: string, propertyId: string): Promise<Snapshot> {
  const data = await BuyerContractService.get(userId, propertyId);
  const workspace = data.workspace as unknown as { revisions: Revision[] } | null;
  return { revisions: workspace?.revisions ?? [], propertyAddress: data.propertyAddress as string };
}
const draftOf = (s: Snapshot) => s.revisions.find((r) => r.status === 'DRAFT') ?? null;
const confirmedOf = (s: Snapshot) => s.revisions.find((r) => r.status === 'CONFIRMED') ?? null;
const version = (s: Snapshot) => sha(`buyer-contract:${s.revisions.map((r) => `${r.id}:${r.status}:${r.updatedAt}:${r.contingencies.map((c) => `${c.contingencyKey}:${c.status}:${c.dueAt ?? ''}`).join(',')}`).join('|')}`);

function formCapture(kind: ContractFormKind, contextVersion: string, draft: Revision | null, contingency: Contingency | null, entered?: Record<string, unknown>): AskCaptureRequest {
  const day = (key: string, label: string) => ({ key, label, required: false, inputSchema: { type: 'APPROXIMATE_DATE' as const, allowedPrecisions: ['EXACT_DATE'], allowFuture: true } });
  const money = (key: string, label: string) => ({ key, label, required: false, inputSchema: { type: 'NUMBER' as const, min: 0, max: 1_000_000_000 } });
  const specs = {
    DRAFT_EDIT: { title: 'Edit your contract revision', question: 'What changed? Leave the rest blank.', seed: {}, fields: [
      day('acceptedDate', 'Acceptance date'), day('targetClosingDate', 'Target closing date'), day('possessionDate', 'Possession date'),
      money('earnestMoney', 'Earnest money ($)'), { key: 'earnestRecipient', label: 'Earnest money held by', required: false, inputSchema: { type: 'SHORT_TEXT' as const, maxLength: 300 } },
      money('sellerCredits', 'Seller credits ($)'), { key: 'specialConditions', label: 'Special conditions', required: false, inputSchema: { type: 'LONG_TEXT' as const, maxLength: 4000 } },
      ...LIST_FIELDS.map(([key, label]) => ({
        key, label, required: false, helpText: `One per line. ${(draft as unknown as Record<string, string[]> | null)?.[key]?.length ? `Now: ${(draft as unknown as Record<string, string[]>)[key].join('; ').slice(0, 160)}. Typing here replaces the whole list; type "none" to empty it.` : 'Leave blank to keep the list as it is.'}`,
        inputSchema: { type: 'LONG_TEXT' as const, maxLength: 4000 },
      })),
    ] },
    CONTINGENCY_UPDATE: { title: `Update ${contingency?.label ?? 'this contingency'}`, question: 'Where does it stand?', seed: { status: contingency?.status ?? 'ACTIVE' }, fields: [
      { key: 'status', label: 'Status', required: true, inputSchema: { type: 'SINGLE_SELECT' as const, options: Object.entries(CONTINGENCY_STATUS_LABELS).map(([value, label]) => ({ label, value })) } },
      day('dueDate', 'Deadline'),
    ] },
    CONTINGENCY_ADD: { title: 'Add a contingency to the draft', question: 'Which protection does your contract include, and where does it stand?', seed: { status: 'ACTIVE' }, fields: [
      { key: 'type', label: 'Contingency', required: true, inputSchema: { type: 'SINGLE_SELECT' as const, options: Object.entries(CONTRACT_CONTINGENCY_TYPES).filter(([value]) => !(draft?.contingencies ?? []).some((c) => c.type === value)).map(([value, label]) => ({ label, value })) } },
      { key: 'status', label: 'Status', required: true, inputSchema: { type: 'SINGLE_SELECT' as const, options: Object.entries(CONTINGENCY_STATUS_LABELS).map(([value, label]) => ({ label, value })) } },
      day('dueDate', 'Deadline'),
    ] },
    CONFIRM: { title: 'Which fields did you check against your signed contract?', question: 'Choose every field you verified. The property address is required.', seed: { fields: ['PROPERTY_ADDRESS'] }, fields: [
      { key: 'fields', label: 'Fields you checked', required: true, inputSchema: { type: 'MULTI_SELECT' as const, maxItems: 15,
        options: confirmableFields((draft ?? {}) as unknown as Record<string, unknown>).map((value) => ({ label: CONTRACT_FIELD_LABELS[value], value })) } },
    ] },
  } as const;
  const spec = specs[kind];
  return {
    requirementId: `buyer-contract-${kind.toLowerCase().replace(/_/g, '-')}-inputs`, captureKey: CONTRACT_CAPTURE_KEYS[kind], classification: 'WORKFLOW_INPUT', state: 'UNKNOWN',
    title: spec.title, question: spec.question, helpText: 'ContractToCozy does not review your contract. Nothing is saved until you confirm.',
    inputSchema: { type: 'GROUP', fields: spec.fields } as unknown as AskCaptureRequest['inputSchema'], currentAnswer: entered ?? spec.seed, allowNotSure: false, sensitivity: 'STANDARD',
    destinationLabel: 'Used to prepare this change; nothing is saved until you confirm', confirmationText: null, expectedContextVersion: contextVersion,
  };
}

export async function contractCommandResult(
  userId: string, propertyId: string, launch: { kind: ContractKind; entityId: string | null; sourceExecutionId: string | null }, supplied?: Record<string, unknown>,
): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role === HouseholdRole.VIEWER) {
    return { status: 'BLOCKED', reasonCode: 'ASK_PERMISSION_REQUIRED', blocks: [{ type: 'SUMMARY', id: 'buyer-contract-permission', title: 'A contributor or owner can change this', body: 'Your role can view this purchase but not change it. Nothing has changed.', tone: 'CAUTION', actions: [] }], suggestions: [] };
  }
  const kind = launch.kind;
  const snap = await load(userId, propertyId);
  const contextVersion = version(snap);
  const draft = draftOf(snap);
  const confirmed = confirmedOf(snap);
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  const base = { sourceExecutionId: launch.sourceExecutionId, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() };
  const consent = 'I authorize this change to the shared purchase record.';
  const confirmation = (id: string, title: string, description: string, confirmLabel: string, fields: Array<{ label: string; value: string }>) => ({
    confirmationId: `buyer-contract-${id}-1`, version: 1, title, description, fields, editableFields: [] as never[], confirmLabel, consentText: consent, expiresAt: expiresAt.toISOString(),
  });

  if (kind === 'DRAFT_START') {
    if (draft) return unavailable('BUYER_CONTRACT_DRAFT_EXISTS', 'You already have a draft', 'Edit or confirm that draft first. Nothing has changed.');
    const from = confirmed;
    return {
      status: 'NEEDS_CONFIRMATION', reasonCode: 'BUYER_CONTRACT_DRAFT_START_CONFIRMATION_REQUIRED', contextVersion,
      parameters: { contractCommand: { kind, entityId: null }, contractContextVersion: contextVersion, ...base },
      blocks: [{ type: 'SUMMARY', id: 'buyer-contract-start-review', title: 'Start a contract revision?', body: 'Nothing changes until you confirm.', tone: 'DEFAULT', actions: [] }],
      confirmation: confirmation(`start-${sha(contextVersion).slice(0, 12)}`, 'Start a revision of your contract terms?',
        'This opens a draft you can edit and then confirm against the signed contract. Your plan does not change until you confirm the draft.', 'Start the draft',
        [{ label: 'Based on', value: from ? `Confirmed revision ${from.revisionNumber}` : 'A blank draft with your property address' }]),
      suggestions: [],
    };
  }
  if (!draft) return unavailable('BUYER_CONTRACT_NO_DRAFT', 'There is no draft to change', 'Start a revision first. Nothing has changed.');
  const contingency = launch.entityId ? draft.contingencies.find((c) => c.id === launch.entityId) ?? null : null;
  if (kind === 'CONTINGENCY_UPDATE' && !contingency) return unavailable('BUYER_CONTRACT_CONTINGENCY_NOT_FOUND', 'That contingency is no longer in the draft', 'Nothing has changed.');
  if (kind === 'CONTINGENCY_ADD' && Object.keys(CONTRACT_CONTINGENCY_TYPES).every((type) => draft.contingencies.some((c) => c.type === type))) {
    return unavailable('BUYER_CONTRACT_NO_CONTINGENCY_TO_ADD', 'Every contingency is already in the draft', 'Update one from the draft instead. Nothing has changed.');
  }
  const formKind = kind as ContractFormKind;
  if (kind === 'CONFIRM' && !draft.propertyAddress) {
    return unavailable('BUYER_CONTRACT_INCOMPLETE', 'The draft needs the property address', 'Complete the property address before confirming. Nothing has changed.');
  }
  if (!supplied) {
    return {
      status: 'NEEDS_CONTEXT', reasonCode: `BUYER_CONTRACT_${kind}_INPUT_REQUIRED`, contextVersion,
      parameters: { contractLaunch: { kind, entityId: launch.entityId, sourceExecutionId: launch.sourceExecutionId } },
      blocks: [{ type: 'SUMMARY', id: 'buyer-contract-input', title: `Contract revision ${draft.revisionNumber} (draft)`, body: 'Nothing has been saved yet; you will review the change first.', tone: 'DEFAULT', actions: [] }],
      captureRequests: [formCapture(formKind, contextVersion, draft, contingency)], suggestions: [],
    };
  }
  const parsed = parseContractAnswer(formKind, supplied);
  if (!parsed.success) return unavailable('BUYER_CONTRACT_INPUT_INVALID', 'Check the details', parsed.error.issues[0]?.message?.includes('property address') ? 'Confirm the property address. Nothing has changed.' : 'Fill in what the form asks for. Nothing has changed.');
  const d = parsed.data as Record<string, unknown>;
  const shown = (value: string | null | undefined) => (value ? humanDate(new Date(value.length === 10 ? isoDay(value) : value)) ?? value : 'Not set');
  let spec: ReturnType<typeof confirmation>;
  const id = `${kind.toLowerCase()}-${sha(JSON.stringify(supplied)).slice(0, 12)}`;
  if (formKind === 'DRAFT_EDIT') {
    const fields = [
      ...(d.acceptedDate ? [{ label: 'Acceptance date', value: `${shown(draft.acceptedAt)} → ${shown(String(d.acceptedDate))}` }] : []),
      ...(d.targetClosingDate ? [{ label: 'Target closing date', value: `${shown(draft.targetClosingDate)} → ${shown(String(d.targetClosingDate))}` }] : []),
      ...(d.possessionDate ? [{ label: 'Possession date', value: `${shown(draft.possessionAt)} → ${shown(String(d.possessionDate))}` }] : []),
      ...(d.earnestMoney !== undefined ? [{ label: 'Earnest money', value: `${draft.earnestMoneyAmountCents != null ? dollars(draft.earnestMoneyAmountCents) : 'Not set'} → ${dollars(Number(d.earnestMoney) * 100)}` }] : []),
      ...(d.earnestRecipient ? [{ label: 'Earnest money held by', value: `${draft.earnestMoneyRecipient ?? 'Not set'} → ${String(d.earnestRecipient)}` }] : []),
      ...(d.sellerCredits !== undefined ? [{ label: 'Seller credits', value: `${draft.sellerCreditsCents != null ? dollars(draft.sellerCreditsCents) : 'Not set'} → ${dollars(Number(d.sellerCredits) * 100)}` }] : []),
      ...(d.specialConditions ? [{ label: 'Special conditions', value: 'Updated' }] : []),
      ...LIST_FIELDS.filter(([key]) => d[key] !== undefined).map(([key, label]) => ({
        label, value: `${((draft as unknown as Record<string, string[]>)[key] ?? []).length} → ${(d[key] as string[]).length ? (d[key] as string[]).join('; ').slice(0, 200) : 'none'}`,
      })),
    ];
    spec = confirmation(id, 'Save these changes to the draft?', 'This changes the draft only. Your plan and deadlines do not change until you confirm the draft against your signed contract.', 'Save to the draft', fields);
  } else if (formKind === 'CONTINGENCY_ADD') {
    if (draft.contingencies.some((c) => c.type === d.type)) return unavailable('BUYER_CONTRACT_CONTINGENCY_EXISTS', 'That contingency is already in the draft', 'Update it instead. Nothing has changed.');
    spec = confirmation(id, 'Add this contingency to the draft?', 'This records a contingency your contract includes, in the draft only. It does not start, waive or satisfy anything with the seller, and the plan does not change until you confirm the draft.', 'Add to the draft', [
      { label: 'Contingency', value: CONTRACT_CONTINGENCY_TYPES[String(d.type)] },
      { label: 'Status', value: CONTINGENCY_STATUS_LABELS[String(d.status)] },
      ...(d.dueDate ? [{ label: 'Deadline', value: shown(String(d.dueDate)) }] : []),
    ]);
  } else if (formKind === 'CONTINGENCY_UPDATE') {
    spec = confirmation(id, 'Update this contingency in the draft?', 'This records your own note in the draft. It does not waive or satisfy anything with the seller, and the plan does not change until you confirm the draft.', 'Update the draft', [
      { label: 'Contingency', value: contingency!.label },
      { label: 'Status', value: `${CONTINGENCY_STATUS_LABELS[contingency!.status]} → ${CONTINGENCY_STATUS_LABELS[String(d.status)]}` },
      ...(d.dueDate ? [{ label: 'Deadline', value: `${shown(contingency!.dueAt)} → ${shown(String(d.dueDate))}` }] : []),
    ]);
  } else {
    const picked = (d.fields as string[]).filter((f) => confirmableFields(draft as unknown as Record<string, unknown>).includes(f));
    if (!picked.includes('PROPERTY_ADDRESS')) return unavailable('BUYER_CONTRACT_INPUT_INVALID', 'Check the details', 'Confirm the property address. Nothing has changed.');
    const moves = [
      picked.includes('TARGET_CLOSING_DATE') ? 'your plan’s closing date and the deadlines counted from it' : null,
      picked.includes('ACCEPTANCE_DATE') ? 'the contract-accepted milestone' : null,
      picked.includes('POSSESSION_DATE') ? 'the possession milestone' : null,
      draft.contingencies.some((c) => c.dueAt) ? 'the contingency deadlines in the draft' : null,
    ].filter(Boolean);
    spec = confirmation(id, 'Confirm this revision against your signed contract?',
      `You are saying you checked ${picked.length} field${picked.length === 1 ? '' : 's'} against the signed contract. Confirming makes this revision your current one and updates ${moves.length ? moves.join(', ') : 'your contract record'}. ContractToCozy does not review contracts, and this waives nothing.`,
      'Confirm the revision', picked.map((f) => ({ label: CONTRACT_FIELD_LABELS[f], value: 'Checked' })));
  }
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: `BUYER_CONTRACT_${kind}_CONFIRMATION_REQUIRED`, contextVersion,
    parameters: { contractCommand: { kind, entityId: launch.entityId }, contractForm: supplied, contractContextVersion: contextVersion, ...base },
    blocks: [{ type: 'SUMMARY', id: 'buyer-contract-review', title: spec.title, body: 'Nothing is saved until you confirm.', tone: kind === 'CONFIRM' ? 'CAUTION' : 'DEFAULT', actions: [] }],
    confirmation: spec, captureRequests: [formCapture(formKind, contextVersion, draft, contingency, supplied)], suggestions: [],
  };
}

registerCapabilityHandler('buyer-contract.command', async (envelope) => {
  const launch = envelope.launchContext;
  const kind = contractKindFromMessage(envelope.message);
  const needsEntity = kind === 'CONTINGENCY_UPDATE';
  if (!kind || launch?.operationId !== 'BUYER_CONTRACT_COMMAND' || launch.surface === 'ASK_REFRESH' || (needsEntity && (launch.entityType !== CONTRACT_ENTITY_TYPE || !launch.entityId))) {
    return unavailable('ASK_BUYER_CONTRACT_NOT_DIRECTLY_ROUTABLE', 'Open your contract timeline first', 'A contract revision is changed from your contract timeline. Nothing has changed.');
  }
  return contractCommandResult(envelope.userId, envelope.propertyId!, { kind, entityId: needsEntity ? launch.entityId! : null, sourceExecutionId: launch.sourceExecutionId ?? null });
});

async function confirmContract(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  const command = parameters.contractCommand as { kind?: unknown; entityId?: unknown } | undefined;
  const kind = command?.kind as ContractKind | undefined;
  if (!kind || !(kind in CONTRACT_MESSAGES)) throw stale('The change to make is invalid.');
  const propertyId = execution.propertyId;
  const entityId = typeof command?.entityId === 'string' ? command.entityId : null;
  let title: string;
  try {
    const snap = await load(userId, propertyId);
    if (parameters.contractContextVersion !== version(snap)) throw stale('Your contract revision changed while the confirmation was open. Review it again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
    const draft = draftOf(snap);
    if (kind === 'DRAFT_START') {
      if (draft) throw stale('You already have a draft.');
      const from = confirmedOf(snap);
      await BuyerContractService.createRevision(userId, propertyId, {
        sourceType: 'MANUAL', propertyAddress: from?.propertyAddress ?? snap.propertyAddress,
        buyerNames: from?.buyerNames ?? [], sellerNames: from?.sellerNames ?? [], includedItems: from?.includedItems ?? [], excludedItems: from?.excludedItems ?? [], agreedRepairs: from?.agreedRepairs ?? [],
        ...(from?.acceptedAt ? { acceptedAt: dayOnly(from.acceptedAt) } : {}), ...(from?.targetClosingDate ? { targetClosingDate: dayOnly(from.targetClosingDate) } : {}),
        ...(from?.possessionAt ? { possessionAt: from.possessionAt } : {}), ...(from?.possessionTerms ? { possessionTerms: from.possessionTerms } : {}),
        ...(from?.earnestMoneyAmountCents != null ? { earnestMoneyAmountCents: from.earnestMoneyAmountCents } : {}),
        ...(from?.earnestMoneyRecipient ? { earnestMoneyRecipient: from.earnestMoneyRecipient } : {}), ...(from?.earnestMoneyMethod ? { earnestMoneyMethod: from.earnestMoneyMethod } : {}),
        ...(from?.sellerCreditsCents != null ? { sellerCreditsCents: from.sellerCreditsCents } : {}), ...(from?.specialConditions ? { specialConditions: from.specialConditions } : {}),
        contingencies: (from?.contingencies ?? []).map((c) => ({ contingencyKey: c.contingencyKey, type: c.type, label: c.label, status: c.status, ...(c.dueAt ? { dueAt: c.dueAt } : {}), ...(c.notes ? { notes: c.notes } : {}) })),
      } as never);
      title = 'Draft started';
    } else {
      if (!draft) throw stale('There is no draft to change.');
      const parsed = parseContractAnswer(kind, parameters.contractForm);
      if (!parsed.success) throw stale('The details to save are invalid.');
      const d = parsed.data as Record<string, unknown>;
      if (kind === 'DRAFT_EDIT') {
        await BuyerContractService.updateDraft(userId, propertyId, draft.id, {
          ...(d.acceptedDate ? { acceptedAt: String(d.acceptedDate) } : {}), ...(d.targetClosingDate ? { targetClosingDate: String(d.targetClosingDate) } : {}),
          ...(d.possessionDate ? { possessionAt: isoDay(String(d.possessionDate)) } : {}),
          ...(d.earnestMoney !== undefined ? { earnestMoneyAmountCents: Math.round(Number(d.earnestMoney) * 100) } : {}),
          ...(d.earnestRecipient ? { earnestMoneyRecipient: String(d.earnestRecipient) } : {}),
          ...(d.sellerCredits !== undefined ? { sellerCreditsCents: Math.round(Number(d.sellerCredits) * 100) } : {}),
          ...(d.specialConditions ? { specialConditions: String(d.specialConditions) } : {}),
          ...Object.fromEntries(LIST_FIELDS.filter(([key]) => d[key] !== undefined).map(([key]) => [key, d[key]])),
        } as never);
        title = 'Draft updated';
      } else if (kind === 'CONTINGENCY_ADD') {
        if (draft.contingencies.some((c) => c.type === d.type)) throw stale('That contingency is already in the draft.');
        await BuyerContractService.updateDraft(userId, propertyId, draft.id, {
          contingencies: [
            ...draft.contingencies.map((c) => ({ contingencyKey: c.contingencyKey, type: c.type, label: c.label, status: c.status, ...(c.dueAt ? { dueAt: c.dueAt } : {}), ...(c.notes ? { notes: c.notes } : {}) })),
            { contingencyKey: `contract:${String(d.type).toLowerCase()}`, type: d.type, label: CONTRACT_CONTINGENCY_TYPES[String(d.type)], status: d.status ?? 'ACTIVE', ...(d.dueDate ? { dueAt: isoDay(String(d.dueDate)) } : {}) },
          ],
        } as never);
        title = 'Contingency added';
      } else if (kind === 'CONTINGENCY_UPDATE') {
        const target = draft.contingencies.find((c) => c.id === entityId);
        if (!target) throw stale('That contingency is no longer in the draft.');
        await BuyerContractService.updateDraft(userId, propertyId, draft.id, {
          contingencies: draft.contingencies.map((c) => ({
            contingencyKey: c.contingencyKey, type: c.type, label: c.label, status: c.id === target.id ? d.status : c.status,
            ...((c.id === target.id && d.dueDate ? isoDay(String(d.dueDate)) : c.dueAt) ? { dueAt: c.id === target.id && d.dueDate ? isoDay(String(d.dueDate)) : c.dueAt } : {}),
            ...(c.notes ? { notes: c.notes } : {}),
          })),
        } as never);
        title = 'Contingency updated';
      } else {
        const picked = (d.fields as string[]).filter((f) => confirmableFields(draft as unknown as Record<string, unknown>).includes(f));
        if (!picked.includes('PROPERTY_ADDRESS')) throw stale('Confirm the property address.');
        await BuyerContractService.confirm(userId, propertyId, draft.id, { confirmed: true, fieldConfirmations: picked.map((fieldKey) => ({ fieldKey })) } as never);
        title = 'Revision confirmed';
      }
    }
  } catch (error) {
    if (error instanceof Error && (!(error as { code?: unknown }).code || (error as { statusCode?: unknown }).statusCode)) throw stale(error.message);
    throw error;
  }
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: `BUYER_CONTRACT_${kind}_COMPLETED`,
    blocks: [{ type: 'WORKFLOW_PROGRESS', id: `buyer-contract-${kind.toLowerCase()}-${entityId ?? propertyId}`, title, status: 'COMPLETED', description: kind === 'CONFIRM' ? 'It is now your current contract revision. Nothing was reviewed, waived or sent.' : 'It is on your contract revision draft. Your plan has not changed.', details: [], actions: [{ ...back, style: 'PRIMARY' as const }] }],
    suggestions: [],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({ type: 'LIMITATION', id: 'buyer-contract-refresh-failed', severity: 'CAUTION', title: 'Saved; view could not refresh',
      body: 'The change was saved. The answer you were viewing could not refresh automatically, so ask for it again to see it.' });
  }
  return { result, artifactType: 'BUYER_CONTRACT_REVISION', artifactId: entityId ?? propertyId, refreshedExecutions: refresh.refreshedExecutions };
}
registerConfirmCapabilityHandler('buyer-contract.command', confirmContract);
