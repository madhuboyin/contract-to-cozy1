import { createHash } from 'node:crypto';
import { z } from 'zod';
import { type AskCaptureRequest } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { registerConfirmCapabilityHandler, type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { HomeDigitalWillService, type DigitalWillDTO } from '../../homeDigitalWill.service';

const CREATE_MESSAGE = 'Create my home continuity plan';
const PUBLISH_MESSAGE = 'Publish my home continuity plan';
const METADATA_MESSAGE = 'Edit my home continuity plan details';
export const HOME_DIGITAL_WILL_METADATA_CAPTURE_KEY = 'HOME_DIGITAL_WILL_METADATA_INPUTS';
export const HOME_DIGITAL_WILL_EDITOR_CAPTURE_KEY = 'HOME_DIGITAL_WILL_EDITOR_INPUTS';
export const HomeDigitalWillMetadataInputSchema = z.object({
  title: z.string().trim().min(1).max(255),
  status: z.enum(['DRAFT', 'ARCHIVED']),
  readiness: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'NEEDS_REVIEW']),
  lastReviewedAt: z.string().trim().max(10).optional().default(''),
});
export type HomeDigitalWillMetadataInput = z.infer<typeof HomeDigitalWillMetadataInputSchema>;
const optionalText = (max: number) => z.string().trim().max(max).optional().default('');
export const HomeDigitalWillEntryInputSchema = z.object({
  title: z.string().trim().min(1).max(500), entryType: z.enum(['INSTRUCTION', 'LOCATION_NOTE', 'CONTACT_NOTE', 'SERVICE_PREFERENCE', 'MAINTENANCE_RULE', 'POLICY_NOTE', 'ACCESS_NOTE', 'GENERAL_NOTE']),
  content: optionalText(10000), summary: optionalText(1000), priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  isPinned: z.enum(['YES', 'NO']), isEmergency: z.enum(['YES', 'NO']), targetSectionId: z.string().min(1), effectiveFrom: optionalText(10), effectiveTo: optionalText(10),
});
export const HomeDigitalWillContactInputSchema = z.object({
  name: z.string().trim().min(1).max(255), email: optionalText(255), phone: optionalText(50), relationship: optionalText(255),
  role: z.enum(['SPOUSE', 'FAMILY_MEMBER', 'PROPERTY_MANAGER', 'EMERGENCY_CONTACT', 'CARETAKER', 'OTHER']), accessLevel: z.enum(['VIEW', 'EDIT', 'EMERGENCY_ONLY']), isPrimary: z.enum(['YES', 'NO']), notes: optionalText(2000),
}).refine((value) => !value.email || z.string().email().safeParse(value.email).success, { message: 'Enter a valid email address.' });
export const HomeDigitalWillSectionInputSchema = z.object({
  type: z.enum(['EMERGENCY', 'CRITICAL_INFO', 'CONTRACTORS', 'MAINTENANCE_KNOWLEDGE', 'UTILITIES', 'INSURANCE', 'HOUSE_RULES', 'GENERAL_NOTES']),
  title: z.string().trim().min(1).max(255), description: optionalText(1000), isEnabled: z.enum(['YES', 'NO']),
});
export type HomeDigitalWillEditorKind = 'ENTRY_CREATE' | 'ENTRY_EDIT' | 'CONTACT_CREATE' | 'CONTACT_CREATE_REACHABLE' | 'CONTACT_EDIT' | 'SECTION_CREATE' | 'SECTION_EDIT';
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const isoDate = (value: string) => value ? `${value}T12:00:00.000Z` : null;
const yn = (value: boolean) => value ? 'YES' : 'NO';
const stamp = (value: Date | string | undefined) => value instanceof Date ? value.toISOString() : value ?? '';
export const homeDigitalWillPlanVersion = (plan: DigitalWillDTO) => sha(`home-digital-will:${plan.id}:${stamp(plan.updatedAt)}:${plan.sections.map((s) => `${s.id}:${stamp(s.updatedAt)}:${s.entries.map((e) => `${e.id}:${stamp(e.updatedAt)}`).join(',')}`).join('|')}:${plan.trustedContacts.map((c) => `${c.id}:${stamp(c.updatedAt)}`).join('|')}`);

export async function homeDigitalWillCreateResult(propertyId: string): Promise<AskOperationResult> {
  const existing = await new HomeDigitalWillService().getByProperty(propertyId);
  if (existing) {
    return {
      status: 'ANSWERED', reasonCode: 'HOME_DIGITAL_WILL_ALREADY_EXISTS',
      blocks: [{ type: 'SUMMARY', id: 'home-digital-will-create-existing', title: 'Your Home Continuity Plan already exists', body: 'Nothing was created or changed.', tone: 'DEFAULT', actions: [{ id: 'home-digital-will-review', label: 'Review my plan', interactionType: 'START_WORKFLOW', message: 'Show my home continuity plan', operationId: 'HOME_DIGITAL_WILL', style: 'PRIMARY' }] }],
      suggestions: [],
    };
  }
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'HOME_DIGITAL_WILL_CREATE_CONFIRMATION_REQUIRED',
    parameters: { homeDigitalWillCreate: true, confirmationVersion: 1, confirmationExpiresAt: expiresAt },
    blocks: [{ type: 'SUMMARY', id: 'home-digital-will-create-review', title: 'Create your Home Continuity Plan', body: 'Ask will create a private draft with the standard sections. It will not publish the plan, invite anyone, or send anything.', tone: 'DEFAULT', actions: [] }],
    confirmation: {
      confirmationId: `home-digital-will-create-${sha(propertyId).slice(0, 12)}-1`, version: 1,
      title: 'Create this Home Continuity Plan?',
      description: 'This creates the shared-home draft and its standard sections. You can add emergency instructions and trusted contacts next.',
      fields: [{ label: 'Status', value: 'Private draft' }, { label: 'Initial contents', value: 'Eight standard sections' }],
      editableFields: [], confirmLabel: 'Create plan', consentText: 'I authorize creating this Home Continuity Plan in the shared home record.', expiresAt,
    },
    suggestions: [],
  };
}

async function homeDigitalWillPublishResult(propertyId: string, planId: string | null): Promise<AskOperationResult> {
  const plan = await new HomeDigitalWillService().getByProperty(propertyId);
  if (!plan || !planId || plan.id !== planId) return { status: 'NOT_APPLICABLE', reasonCode: 'HOME_DIGITAL_WILL_NOT_FOUND', blocks: [{ type: 'SUMMARY', id: 'home-digital-will-publish-missing', title: 'That plan is no longer available', body: 'Nothing was published.', tone: 'CAUTION', actions: [] }], suggestions: [] };
  if (plan.status === 'ACTIVE') return { status: 'ANSWERED', reasonCode: 'HOME_DIGITAL_WILL_ALREADY_PUBLISHED', blocks: [{ type: 'SUMMARY', id: 'home-digital-will-publish-existing', title: 'This plan is already marked ready', body: 'Nothing changed.', tone: 'DEFAULT', actions: [] }], suggestions: [] };
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  return { status: 'NEEDS_CONFIRMATION', reasonCode: 'HOME_DIGITAL_WILL_PUBLISH_CONFIRMATION_REQUIRED', parameters: { homeDigitalWillPublish: { planId }, confirmationVersion: 1, confirmationExpiresAt: expiresAt }, blocks: [{ type: 'SUMMARY', id: 'home-digital-will-publish-review', title: 'Mark this plan ready', body: 'This records the plan as published and reviewed. It does not invite contacts or grant access.', tone: 'DEFAULT', actions: [] }], confirmation: { confirmationId: `home-digital-will-publish-${sha(`${propertyId}:${planId}:${plan.updatedAt.toISOString()}`).slice(0, 12)}-1`, version: 1, title: 'Mark this Home Continuity Plan ready?', description: 'The readiness checks currently pass. Publishing sets the plan to active and records today as its review date.', fields: [{ label: 'Plan', value: plan.title }, { label: 'Entries', value: String(plan.counts.entryCount) }, { label: 'Trusted contacts', value: String(plan.counts.trustedContactCount) }], editableFields: [], confirmLabel: 'Mark plan ready', consentText: 'I authorize publishing this Home Continuity Plan in the shared home record.', expiresAt }, suggestions: [] };
}

export async function homeDigitalWillMetadataResult(userId: string, propertyId: string, planId: string | null, supplied?: HomeDigitalWillMetadataInput): Promise<AskOperationResult> {
  const plan = await new HomeDigitalWillService().getByProperty(propertyId);
  if (!plan || plan.id !== planId) return { status: 'NOT_APPLICABLE', reasonCode: 'HOME_DIGITAL_WILL_NOT_FOUND', blocks: [{ type: 'SUMMARY', id: 'home-digital-will-metadata-missing', title: 'That plan is no longer available', body: 'Nothing was changed.', tone: 'CAUTION', actions: [] }], suggestions: [] };
  const contextVersion = sha(`home-digital-will-metadata:${plan.id}:${plan.updatedAt.toISOString()}`);
  const current = { title: plan.title, status: plan.status === 'ARCHIVED' ? 'ARCHIVED' : 'DRAFT', readiness: plan.readiness === 'READY' ? 'IN_PROGRESS' : plan.readiness, lastReviewedAt: plan.lastReviewedAt?.toISOString().slice(0, 10) ?? '' } as HomeDigitalWillMetadataInput;
  const capture: AskCaptureRequest = { requirementId: 'home-digital-will-metadata-inputs', captureKey: HOME_DIGITAL_WILL_METADATA_CAPTURE_KEY, classification: 'WORKFLOW_INPUT', state: 'KNOWN', presentation: 'FORM', title: 'Edit plan details', question: 'What should the plan details say?', helpText: 'Ready is set only by publishing. Nothing is saved until you review and confirm.', inputSchema: { type: 'GROUP', groups: [
    { id: 'identity', title: 'Plan identity', description: 'Name the plan and choose whether it is active work or archived.', fieldKeys: ['title', 'status'] },
    { id: 'review', title: 'Readiness and review', description: 'Record its current preparation state and latest review date.', fieldKeys: ['readiness', 'lastReviewedAt'] },
  ], fields: [
    { key: 'title', label: 'Plan title', required: true, inputSchema: { type: 'SHORT_TEXT', maxLength: 255 } },
    { key: 'status', label: 'Status', required: true, inputSchema: { type: 'SINGLE_SELECT', options: [{ label: 'Draft', value: 'DRAFT' }, { label: 'Archived', value: 'ARCHIVED' }] } },
    { key: 'readiness', label: 'Readiness', required: true, inputSchema: { type: 'SINGLE_SELECT', options: [{ label: 'Not started', value: 'NOT_STARTED' }, { label: 'In progress', value: 'IN_PROGRESS' }, { label: 'Needs review', value: 'NEEDS_REVIEW' }] } },
    { key: 'lastReviewedAt', label: 'Last reviewed date', required: false, inputSchema: { type: 'SHORT_TEXT', maxLength: 10 } },
  ] } as AskCaptureRequest['inputSchema'], currentAnswer: supplied ?? current, allowNotSure: false, sensitivity: 'SECURITY', destinationLabel: 'Updates the shared Home Continuity Plan after confirmation', confirmationText: null, expectedContextVersion: contextVersion };
  if (!supplied) return { status: 'NEEDS_CONTEXT', reasonCode: 'HOME_DIGITAL_WILL_METADATA_INPUT_REQUIRED', contextVersion, parameters: { homeDigitalWillMetadataLaunch: { planId } }, blocks: [{ type: 'SUMMARY', id: 'home-digital-will-metadata-input', title: 'Edit plan details', body: 'The form shows what is recorded. Nothing is saved until you confirm.', tone: 'DEFAULT', actions: [] }], captureRequests: [capture], suggestions: [] };
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  return { status: 'NEEDS_CONFIRMATION', reasonCode: 'HOME_DIGITAL_WILL_METADATA_CONFIRMATION_REQUIRED', contextVersion, parameters: { homeDigitalWillMetadata: { planId, values: supplied }, homeDigitalWillMetadataContextVersion: contextVersion, confirmationVersion: 1, confirmationExpiresAt: expiresAt }, blocks: [{ type: 'SUMMARY', id: 'home-digital-will-metadata-review', title: 'Review these plan details', body: 'Nothing is saved until you confirm.', tone: 'DEFAULT', actions: [] }], confirmation: { confirmationId: `home-digital-will-metadata-${sha(`${plan.id}:${JSON.stringify(supplied)}`).slice(0, 12)}-1`, version: 1, title: 'Save these plan details?', description: 'This updates the plan metadata. It does not publish the plan or notify anyone.', fields: [{ label: 'Title', value: supplied.title }, { label: 'Status', value: supplied.status === 'DRAFT' ? 'Draft' : 'Archived' }, { label: 'Readiness', value: supplied.readiness.toLowerCase().replace('_', ' ') }, { label: 'Last reviewed', value: supplied.lastReviewedAt || 'Not set' }], editableFields: [], confirmLabel: 'Save details', consentText: 'I authorize updating these Home Continuity Plan details.', expiresAt }, captureRequests: [capture], suggestions: [] };
}

const entryTypes = ['INSTRUCTION', 'LOCATION_NOTE', 'CONTACT_NOTE', 'SERVICE_PREFERENCE', 'MAINTENANCE_RULE', 'POLICY_NOTE', 'ACCESS_NOTE', 'GENERAL_NOTE'] as const;
const sectionTypes = ['EMERGENCY', 'CRITICAL_INFO', 'CONTRACTORS', 'MAINTENANCE_KNOWLEDGE', 'UTILITIES', 'INSURANCE', 'HOUSE_RULES', 'GENERAL_NOTES'] as const;
const roleValues = ['SPOUSE', 'FAMILY_MEMBER', 'PROPERTY_MANAGER', 'EMERGENCY_CONTACT', 'CARETAKER', 'OTHER'] as const;
const select = (values: readonly string[]) => values.map((value) => ({ label: value.toLowerCase().replace(/_/g, ' ').replace(/^./, (c: string) => c.toUpperCase()), value }));

export async function homeDigitalWillEditorResult(userId: string, propertyId: string, kind: HomeDigitalWillEditorKind, entityId: string | null, supplied?: unknown): Promise<AskOperationResult> {
  const plan = await new HomeDigitalWillService().getByProperty(propertyId);
  if (!plan) return { status: 'NOT_APPLICABLE', reasonCode: 'HOME_DIGITAL_WILL_NOT_FOUND', blocks: [{ type: 'SUMMARY', id: 'home-digital-will-editor-missing', title: 'That plan is no longer available', body: 'Nothing changed.', tone: 'CAUTION', actions: [] }], suggestions: [] };
  const section = plan.sections.find((row) => row.id === entityId) ?? null;
  const entrySection = plan.sections.find((row) => row.entries.some((entry) => entry.id === entityId)) ?? null;
  const entry = entrySection?.entries.find((row) => row.id === entityId) ?? null;
  const contact = plan.trustedContacts.find((row) => row.id === entityId) ?? null;
  if ((kind === 'ENTRY_EDIT' && !entry) || (kind === 'ENTRY_CREATE' && !section) || (kind === 'CONTACT_EDIT' && !contact) || (kind === 'SECTION_EDIT' && !section)) return { status: 'NOT_APPLICABLE', reasonCode: 'HOME_DIGITAL_WILL_ITEM_NOT_FOUND', blocks: [{ type: 'SUMMARY', id: 'home-digital-will-editor-item-missing', title: 'That item is no longer available', body: 'Nothing changed.', tone: 'CAUTION', actions: [] }], suggestions: [] };
  const version = homeDigitalWillPlanVersion(plan);
  const sectionOptions = plan.sections.map((row) => ({ label: row.title, value: row.id }));
  const missingTypes = sectionTypes.filter((type) => !plan.sections.some((row) => row.type === type));
  let schema: AskCaptureRequest['inputSchema']; let currentAnswer: Record<string, unknown>; let title: string;
  if (kind.startsWith('ENTRY_')) {
    title = kind === 'ENTRY_CREATE' ? 'Add plan entry' : 'Edit plan entry';
    currentAnswer = entry ? { title: entry.title, entryType: entry.entryType, content: entry.content ?? '', summary: entry.summary ?? '', priority: entry.priority, isPinned: yn(entry.isPinned), isEmergency: yn(entry.isEmergency), targetSectionId: entrySection!.id, effectiveFrom: entry.effectiveFrom?.toISOString().slice(0, 10) ?? '', effectiveTo: entry.effectiveTo?.toISOString().slice(0, 10) ?? '' } : { title: '', entryType: section?.type === 'EMERGENCY' ? 'INSTRUCTION' : 'GENERAL_NOTE', content: '', summary: '', priority: section?.type === 'EMERGENCY' ? 'CRITICAL' : 'MEDIUM', isPinned: 'NO', isEmergency: section?.type === 'EMERGENCY' ? 'YES' : 'NO', targetSectionId: section!.id, effectiveFrom: '', effectiveTo: '' };
    schema = { type: 'GROUP', groups: [
      { id: 'essentials', title: 'Entry essentials', description: 'Name the entry and choose how it is organized.', fieldKeys: ['title', 'entryType', 'priority', 'targetSectionId'] },
      { id: 'details', title: 'Instructions', description: 'Add the useful detail someone needs when taking over.', fieldKeys: ['content', 'summary'] },
      { id: 'visibility', title: 'Visibility and timing', description: 'Choose where the entry appears and when it applies.', fieldKeys: ['isPinned', 'isEmergency', 'effectiveFrom', 'effectiveTo'] },
    ], fields: [
      { key: 'title', label: 'Title', required: true, inputSchema: { type: 'SHORT_TEXT', maxLength: 500 } }, { key: 'entryType', label: 'Type', required: true, inputSchema: { type: 'SINGLE_SELECT', options: select(entryTypes) } },
      { key: 'content', label: 'Full instructions or details', required: false, inputSchema: { type: 'LONG_TEXT', maxLength: 10000 } }, { key: 'summary', label: 'Short summary', required: false, inputSchema: { type: 'LONG_TEXT', maxLength: 1000 } },
      { key: 'priority', label: 'Priority', required: true, inputSchema: { type: 'SINGLE_SELECT', options: select(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']) } }, { key: 'targetSectionId', label: 'Section', required: true, inputSchema: { type: 'SINGLE_SELECT', options: sectionOptions } },
      { key: 'isPinned', label: 'Pin this entry', required: true, inputSchema: { type: 'SINGLE_SELECT', options: [{ label: 'Yes', value: 'YES' }, { label: 'No', value: 'NO' }] } }, { key: 'isEmergency', label: 'Show in Emergency view', required: true, inputSchema: { type: 'SINGLE_SELECT', options: [{ label: 'Yes', value: 'YES' }, { label: 'No', value: 'NO' }] } },
      { key: 'effectiveFrom', label: 'Effective from (YYYY-MM-DD)', required: false, inputSchema: { type: 'SHORT_TEXT', maxLength: 10 } }, { key: 'effectiveTo', label: 'Effective to (YYYY-MM-DD)', required: false, inputSchema: { type: 'SHORT_TEXT', maxLength: 10 } },
    ] } as AskCaptureRequest['inputSchema'];
  } else if (kind.startsWith('CONTACT_')) {
    title = kind === 'CONTACT_CREATE_REACHABLE' ? 'Add reachable primary contact' : kind === 'CONTACT_CREATE' ? 'Add trusted contact' : 'Edit trusted contact';
    currentAnswer = contact ? { name: contact.name, email: contact.email ?? '', phone: contact.phone ?? '', relationship: contact.relationship ?? '', role: contact.role, accessLevel: contact.accessLevel, isPrimary: yn(contact.isPrimary), notes: contact.notes ?? '' } : { name: '', email: '', phone: '', relationship: '', role: 'EMERGENCY_CONTACT', accessLevel: 'EMERGENCY_ONLY', isPrimary: kind === 'CONTACT_CREATE_REACHABLE' || !plan.trustedContacts.length ? 'YES' : 'NO', notes: '' };
    schema = { type: 'GROUP', groups: [
      { id: 'person', title: 'Contact', description: 'Identify the person and their relationship to the home.', fieldKeys: ['name', 'relationship', 'role'] },
      { id: 'access', title: 'Access and reachability', description: kind === 'CONTACT_CREATE_REACHABLE' ? 'Provide an email or phone number. This person will be the primary contact.' : 'Set access and provide at least one way to reach them.', fieldKeys: ['accessLevel', 'email', 'phone', 'isPrimary'] },
      { id: 'notes', title: 'Private notes', description: 'Add optional context for household members.', fieldKeys: ['notes'] },
    ], fields: [
      { key: 'name', label: 'Name', required: true, inputSchema: { type: 'SHORT_TEXT', maxLength: 255 } }, { key: 'relationship', label: 'Relationship', required: false, inputSchema: { type: 'SHORT_TEXT', maxLength: 255 } },
      { key: 'role', label: 'Role', required: true, inputSchema: { type: 'SINGLE_SELECT', options: select(roleValues) } }, { key: 'accessLevel', label: 'Access level', required: true, inputSchema: { type: 'SINGLE_SELECT', options: select(['VIEW', 'EDIT', 'EMERGENCY_ONLY']) } },
      { key: 'email', label: 'Email', required: false, inputSchema: { type: 'SHORT_TEXT', maxLength: 255 } }, { key: 'phone', label: 'Phone', required: false, inputSchema: { type: 'SHORT_TEXT', maxLength: 50 } },
      { key: 'isPrimary', label: 'Primary contact', required: true, inputSchema: { type: 'SINGLE_SELECT', options: [{ label: 'Yes', value: 'YES' }, { label: 'No', value: 'NO' }] } }, { key: 'notes', label: 'Private notes', required: false, inputSchema: { type: 'LONG_TEXT', maxLength: 2000 } },
    ] } as AskCaptureRequest['inputSchema'];
  } else {
    title = kind === 'SECTION_CREATE' ? 'Restore plan section' : 'Edit plan section';
    if (kind === 'SECTION_CREATE' && missingTypes.length === 0) return { status: 'ANSWERED', reasonCode: 'HOME_DIGITAL_WILL_ALL_SECTIONS_EXIST', blocks: [{ type: 'SUMMARY', id: 'home-digital-will-sections-complete', title: 'All supported sections already exist', body: 'You can edit, disable, reorder, or delete an existing section. A deleted section can be restored later.', tone: 'DEFAULT', actions: [] }], suggestions: [] };
    currentAnswer = section ? { type: section.type, title: section.title, description: section.description ?? '', isEnabled: yn(section.isEnabled) } : { type: missingTypes[0], title: select([missingTypes[0]])[0].label, description: '', isEnabled: 'YES' };
    schema = { type: 'GROUP', groups: [
      { id: 'section', title: 'Section details', description: 'Choose the topic, label, and whether it appears in the plan.', fieldKeys: ['type', 'title', 'description', 'isEnabled'] },
    ], fields: [
      { key: 'type', label: 'Section type', required: true, inputSchema: { type: 'SINGLE_SELECT', options: select(kind === 'SECTION_CREATE' ? missingTypes : [section!.type]) } }, { key: 'title', label: 'Title', required: true, inputSchema: { type: 'SHORT_TEXT', maxLength: 255 } },
      { key: 'description', label: 'Description', required: false, inputSchema: { type: 'LONG_TEXT', maxLength: 1000 } }, { key: 'isEnabled', label: 'Enabled', required: true, inputSchema: { type: 'SINGLE_SELECT', options: [{ label: 'Yes', value: 'YES' }, { label: 'No', value: 'NO' }] } },
    ] } as AskCaptureRequest['inputSchema'];
  }
  const capture: AskCaptureRequest = { requirementId: `home-digital-will-${kind.toLowerCase()}`, captureKey: HOME_DIGITAL_WILL_EDITOR_CAPTURE_KEY, classification: 'WORKFLOW_INPUT', state: 'KNOWN', presentation: 'FORM', title, question: `${title} details`, helpText: 'Nothing is saved until you review and confirm.', inputSchema: schema, currentAnswer: supplied ?? currentAnswer, allowNotSure: false, sensitivity: 'SECURITY', destinationLabel: 'Updates the shared Home Continuity Plan after confirmation', confirmationText: null, expectedContextVersion: version };
  if (!supplied) return { status: 'NEEDS_CONTEXT', reasonCode: `HOME_DIGITAL_WILL_${kind}_INPUT_REQUIRED`, contextVersion: version, parameters: { homeDigitalWillEditorLaunch: { kind, entityId } }, blocks: [{ type: 'SUMMARY', id: `home-digital-will-${kind.toLowerCase()}-input`, title, body: 'Review the current values, then continue.', tone: 'DEFAULT', actions: [] }], captureRequests: [capture], suggestions: [] };
  const parsed = kind.startsWith('ENTRY_') ? HomeDigitalWillEntryInputSchema.safeParse(supplied) : kind.startsWith('CONTACT_') ? HomeDigitalWillContactInputSchema.safeParse(supplied) : HomeDigitalWillSectionInputSchema.safeParse(supplied);
  if (!parsed.success) throw Object.assign(new Error('Check the required fields and formats.'), { code: 'ASK_CAPTURE_VALIDATION_ERROR' });
  if (kind === 'CONTACT_CREATE_REACHABLE' && 'email' in parsed.data && !parsed.data.email && !parsed.data.phone) throw Object.assign(new Error('Enter an email address or phone number for the primary contact.'), { code: 'ASK_CAPTURE_VALIDATION_ERROR' });
  const values = parsed.data; const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  return { status: 'NEEDS_CONFIRMATION', reasonCode: `HOME_DIGITAL_WILL_${kind}_CONFIRMATION_REQUIRED`, contextVersion: version, parameters: { homeDigitalWillEditor: { kind, entityId, values }, homeDigitalWillEditorContextVersion: version, confirmationVersion: 1, confirmationExpiresAt: expiresAt }, blocks: [{ type: 'SUMMARY', id: `home-digital-will-${kind.toLowerCase()}-review`, title: `Review: ${title}`, body: 'Nothing is saved until you confirm.', tone: 'DEFAULT', actions: [] }], confirmation: { confirmationId: `home-digital-will-editor-${sha(`${kind}:${entityId ?? plan.id}:${JSON.stringify(values)}`).slice(0, 12)}-1`, version: 1, title: `${title}?`, description: 'This changes the shared Home Continuity Plan. It does not notify trusted contacts.', fields: [{ label: 'Action', value: title }, { label: 'Name', value: String('title' in values ? values.title : 'name' in values ? values.name : '') }], editableFields: [], confirmLabel: kind.includes('_CREATE') ? 'Add' : 'Save changes', consentText: 'I authorize this Home Continuity Plan change.', expiresAt }, captureRequests: [capture], suggestions: [] };
}

type EntryOrderCommand = 'ENTRY_DELETE' | 'ENTRY_MOVE_UP' | 'ENTRY_MOVE_DOWN';
async function homeDigitalWillEntryOrderResult(propertyId: string, command: EntryOrderCommand, entryId: string): Promise<AskOperationResult> {
  const plan = await new HomeDigitalWillService().getByProperty(propertyId);
  const section = plan?.sections.find((candidate) => candidate.entries.some((entry) => entry.id === entryId));
  const entry = section?.entries.find((candidate) => candidate.id === entryId);
  if (!section || !entry) return { status: 'NOT_APPLICABLE', reasonCode: 'HOME_DIGITAL_WILL_ENTRY_NOT_FOUND', blocks: [{ type: 'SUMMARY', id: 'home-digital-will-entry-missing', title: 'That entry is no longer available', body: 'Nothing changed.', tone: 'CAUTION', actions: [] }], suggestions: [] };
  const version = sha('home-digital-will-entry:' + section.id + ':' + section.entries.map((row) => row.id + ':' + row.updatedAt.toISOString() + ':' + row.sortOrder).join('|'));
  const deleting = command === 'ENTRY_DELETE'; const direction = command === 'ENTRY_MOVE_UP' ? 'up' : 'down';
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  return { status: 'NEEDS_CONFIRMATION', reasonCode: 'HOME_DIGITAL_WILL_ENTRY_CONFIRMATION_REQUIRED', contextVersion: version, parameters: { homeDigitalWillEntryOrder: { command, entryId, sectionId: section.id }, homeDigitalWillEntryOrderContextVersion: version, confirmationVersion: 1, confirmationExpiresAt: expiresAt }, blocks: [{ type: 'SUMMARY', id: 'home-digital-will-entry-order-review', title: deleting ? 'Delete ' + entry.title + '?' : 'Move ' + entry.title + ' ' + direction + '?', body: deleting ? 'Deleting permanently removes this entry from the shared plan.' : 'This changes only the entry order.', tone: deleting ? 'CAUTION' : 'DEFAULT', actions: [] }], confirmation: { confirmationId: 'home-digital-will-entry-' + sha(command + ':' + entryId + ':' + version).slice(0, 12) + '-1', version: 1, title: deleting ? 'Delete "' + entry.title + '"?' : 'Move "' + entry.title + '" ' + direction + '?', description: deleting ? 'This permanently deletes the entry.' : 'This changes its position within ' + section.title + '.', fields: [{ label: 'Section', value: section.title }, { label: 'Entry', value: entry.title }], editableFields: [], confirmLabel: deleting ? 'Delete entry' : 'Move entry', consentText: deleting ? 'I authorize permanently deleting this plan entry.' : 'I authorize changing this entry order.', expiresAt }, suggestions: [] };
}

type DirectCommand = 'CONTACT_DELETE' | 'CONTACT_PRIMARY' | 'SECTION_DELETE' | 'SECTION_MOVE_UP' | 'SECTION_MOVE_DOWN';
async function homeDigitalWillDirectActionResult(propertyId: string, command: DirectCommand, entityId: string): Promise<AskOperationResult> {
  const plan = await new HomeDigitalWillService().getByProperty(propertyId);
  const contact = plan?.trustedContacts.find((row) => row.id === entityId); const section = plan?.sections.find((row) => row.id === entityId);
  if (!plan || (command.startsWith('CONTACT_') ? !contact : !section)) return { status: 'NOT_APPLICABLE', reasonCode: 'HOME_DIGITAL_WILL_ITEM_NOT_FOUND', blocks: [{ type: 'SUMMARY', id: 'home-digital-will-action-missing', title: 'That item is no longer available', body: 'Nothing changed.', tone: 'CAUTION', actions: [] }], suggestions: [] };
  const deleting = command.endsWith('DELETE'); const label = contact?.name ?? section!.title; const version = homeDigitalWillPlanVersion(plan); const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  return { status: 'NEEDS_CONFIRMATION', reasonCode: 'HOME_DIGITAL_WILL_ACTION_CONFIRMATION_REQUIRED', contextVersion: version, parameters: { homeDigitalWillDirectAction: { command, entityId }, homeDigitalWillDirectActionContextVersion: version, confirmationVersion: 1, confirmationExpiresAt: expiresAt }, blocks: [{ type: 'SUMMARY', id: 'home-digital-will-action-review', title: `${deleting ? 'Delete' : command === 'CONTACT_PRIMARY' ? 'Make primary' : 'Move'} ${label}?`, body: deleting ? 'Deletion is permanent. Deleting a section also deletes every entry in it.' : 'Review this shared-plan change.', tone: deleting ? 'CAUTION' : 'DEFAULT', actions: [] }], confirmation: { confirmationId: `home-digital-will-action-${sha(`${command}:${entityId}:${version}`).slice(0, 12)}-1`, version: 1, title: `${deleting ? 'Delete' : command === 'CONTACT_PRIMARY' ? 'Make primary' : 'Move'} “${label}”?`, description: deleting ? 'This cannot be undone.' : 'This updates the shared Home Continuity Plan.', fields: [{ label: command.startsWith('CONTACT_') ? 'Contact' : 'Section', value: label }], editableFields: [], confirmLabel: deleting ? 'Delete' : command === 'CONTACT_PRIMARY' ? 'Make primary' : 'Move', consentText: 'I authorize this Home Continuity Plan change.', expiresAt }, suggestions: [] };
}

export async function homeDigitalWillEmergencyResult(propertyId: string): Promise<AskOperationResult> {
  const plan = await new HomeDigitalWillService().getByProperty(propertyId);
  if (!plan) return { status: 'NOT_APPLICABLE', reasonCode: 'HOME_DIGITAL_WILL_NOT_FOUND', blocks: [{ type: 'SUMMARY', id: 'home-digital-will-emergency-missing', title: 'No Home Continuity Plan yet', body: 'Create the plan before opening Emergency view.', tone: 'CAUTION', actions: [] }], suggestions: [] };
  const primary = plan.trustedContacts.find((row) => row.isPrimary); const otherContacts = plan.trustedContacts.filter((row) => !row.isPrimary);
  const orderedSections = [...plan.sections.filter((row) => row.isEnabled)].sort((a, b) => a.type === 'EMERGENCY' ? -1 : b.type === 'EMERGENCY' ? 1 : a.type === 'UTILITIES' ? -1 : b.type === 'UTILITIES' ? 1 : a.sortOrder - b.sortOrder);
  const sections: Array<{ id: string; title: string; count: number; items: Array<{ id: string; title: string; description: string; meta: string[]; status: string; href: null }> }> = orderedSections.map((section) => ({ id: `emergency-${section.id}`, title: section.title, count: section.entries.filter((entry) => section.type === 'EMERGENCY' || section.type === 'UTILITIES' || entry.isEmergency || entry.isPinned || entry.priority === 'CRITICAL').length, items: section.entries.filter((entry) => section.type === 'EMERGENCY' || section.type === 'UTILITIES' || entry.isEmergency || entry.isPinned || entry.priority === 'CRITICAL').map((entry) => ({ id: entry.id, title: entry.title, description: entry.content || entry.summary || 'No details recorded.', meta: [entry.priority.toLowerCase(), ...(entry.isEmergency ? ['Emergency'] : []), ...(entry.isPinned ? ['Pinned'] : [])], status: entry.priority, href: null })) })).filter((section) => section.count);
  if (primary || otherContacts.length) sections.unshift({ id: 'emergency-contacts', title: 'Trusted contacts', count: plan.trustedContacts.length, items: [primary, ...otherContacts].filter(Boolean).map((contact) => ({ id: contact!.id, title: `${contact!.name}${contact!.isPrimary ? ' — Primary' : ''}`, description: [contact!.phone, contact!.email].filter(Boolean).join(' · ') || 'No contact method recorded.', meta: [contact!.role.toLowerCase().replace(/_/g, ' '), contact!.accessLevel.toLowerCase().replace(/_/g, ' ')], status: contact!.isPrimary ? 'PRIMARY' : 'CONTACT', href: null })) });
  return { status: 'ANSWERED', reasonCode: 'HOME_DIGITAL_WILL_EMERGENCY_VIEW', blocks: [{ type: 'SUMMARY', id: 'home-digital-will-emergency-summary', title: 'Emergency view', body: 'Critical instructions and reachable contacts from the current Home Continuity Plan are shown below. This is a read-only view.', tone: 'CAUTION', actions: [{ id: 'home-digital-will-review', label: 'Back to full plan', interactionType: 'START_WORKFLOW', message: 'Show my home continuity plan', operationId: 'HOME_DIGITAL_WILL', style: 'SECONDARY' }] }, { type: 'GROUPED_LIST', id: 'home-digital-will-emergency-items', title: 'Emergency information', description: 'This answer contains sensitive home instructions and contact methods.', filters: [], sections, actions: [] }], suggestions: [] };
}

registerCapabilityHandler('home-digital-will.create', async (envelope) => {
  const launch = envelope.launchContext;
  const messageAction: Record<string, string> = {
    'Add an emergency instruction to my home continuity plan': 'ENTRY_CREATE', 'Add an entry to this home continuity plan section': 'ENTRY_CREATE', 'Edit this home continuity plan entry': 'ENTRY_EDIT',
    'Add a trusted contact to my home continuity plan': 'CONTACT_CREATE', 'Add a reachable primary contact to my home continuity plan': 'CONTACT_CREATE_REACHABLE', 'Edit this trusted contact': 'CONTACT_EDIT', 'Edit my primary trusted contact': 'CONTACT_EDIT',
    'Edit this home continuity plan section': 'SECTION_EDIT', 'Restore a section in my home continuity plan': 'SECTION_CREATE', 'Move this home continuity plan section up': 'SECTION_MOVE_UP', 'Move this home continuity plan section down': 'SECTION_MOVE_DOWN', 'Delete this home continuity plan section': 'SECTION_DELETE',
    'Make this my primary trusted contact': 'CONTACT_PRIMARY', 'Delete this trusted contact': 'CONTACT_DELETE', 'Move this home continuity plan entry up': 'ENTRY_MOVE_UP', 'Move this home continuity plan entry down': 'ENTRY_MOVE_DOWN', 'Delete this home continuity plan entry': 'ENTRY_DELETE',
  };
  const action = launch?.actionId ?? messageAction[envelope.message];
  if (launch?.operationId === 'HOME_DIGITAL_WILL_CREATE' && launch.surface !== 'ASK_REFRESH' && launch.entityType === 'HOME_DIGITAL_WILL_EMERGENCY') return homeDigitalWillEmergencyResult(envelope.propertyId!);
  if (launch?.operationId === 'HOME_DIGITAL_WILL_CREATE' && launch.surface !== 'ASK_REFRESH' && launch.entityId && action && ['ENTRY_CREATE', 'ENTRY_EDIT', 'CONTACT_CREATE', 'CONTACT_CREATE_REACHABLE', 'CONTACT_EDIT', 'SECTION_CREATE', 'SECTION_EDIT'].includes(action)) return homeDigitalWillEditorResult(envelope.userId, envelope.propertyId!, action as HomeDigitalWillEditorKind, launch.entityId);
  if (launch?.operationId === 'HOME_DIGITAL_WILL_CREATE' && launch.surface !== 'ASK_REFRESH' && launch.entityId && action && ['CONTACT_DELETE', 'CONTACT_PRIMARY', 'SECTION_DELETE', 'SECTION_MOVE_UP', 'SECTION_MOVE_DOWN'].includes(action)) return homeDigitalWillDirectActionResult(envelope.propertyId!, action as DirectCommand, launch.entityId);
  if (launch?.operationId === 'HOME_DIGITAL_WILL_CREATE' && launch.surface !== 'ASK_REFRESH' && launch.entityId && action && ['ENTRY_DELETE', 'ENTRY_MOVE_UP', 'ENTRY_MOVE_DOWN'].includes(action)) return homeDigitalWillEntryOrderResult(envelope.propertyId!, action as EntryOrderCommand, launch.entityId);
  if (envelope.launchContext?.operationId === 'HOME_DIGITAL_WILL_CREATE' && envelope.launchContext.surface !== 'ASK_REFRESH' && envelope.message === METADATA_MESSAGE && envelope.launchContext.entityType === 'HOME_DIGITAL_WILL_METADATA') return homeDigitalWillMetadataResult(envelope.userId, envelope.propertyId!, envelope.launchContext.entityId ?? null);
  if (envelope.launchContext?.operationId === 'HOME_DIGITAL_WILL_CREATE' && envelope.launchContext.surface !== 'ASK_REFRESH' && envelope.message === PUBLISH_MESSAGE && envelope.launchContext.entityType === 'HOME_DIGITAL_WILL_PUBLISH') return homeDigitalWillPublishResult(envelope.propertyId!, envelope.launchContext.entityId ?? null);
  const declared = envelope.launchContext?.operationId === 'HOME_DIGITAL_WILL_CREATE'
    && envelope.launchContext.surface !== 'ASK_REFRESH' && envelope.message === CREATE_MESSAGE;
  if (!declared) return { status: 'NOT_APPLICABLE', reasonCode: 'HOME_DIGITAL_WILL_CREATE_NOT_DECLARED', blocks: [{ type: 'SUMMARY', id: 'home-digital-will-create-not-declared', title: 'Start from Create my plan', body: 'Nothing was created or changed.', tone: 'DEFAULT', actions: [] }], suggestions: [] };
  return homeDigitalWillCreateResult(envelope.propertyId!);
});

async function confirmHomeDigitalWillCreate(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const editor = ctx.parameters.homeDigitalWillEditor as { kind?: unknown; entityId?: unknown; values?: unknown } | undefined;
  if (editor) {
    if (typeof editor.kind !== 'string' || !['ENTRY_CREATE', 'ENTRY_EDIT', 'CONTACT_CREATE', 'CONTACT_CREATE_REACHABLE', 'CONTACT_EDIT', 'SECTION_CREATE', 'SECTION_EDIT'].includes(editor.kind)) throw Object.assign(new Error('This editor is no longer active.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
    const kind = editor.kind as HomeDigitalWillEditorKind; const service = new HomeDigitalWillService(); const plan = await service.getByProperty(ctx.execution.propertyId);
    if (!plan || ctx.parameters.homeDigitalWillEditorContextVersion !== homeDigitalWillPlanVersion(plan)) throw Object.assign(new Error('The plan changed while you were reviewing. Open the editor again.'), { code: 'ASK_CONTEXT_VERSION_CONFLICT' });
    let artifactType = 'HOME_DIGITAL_WILL'; let artifactId = plan.id; let title = 'Plan updated';
    if (kind.startsWith('ENTRY_')) {
      const parsed = HomeDigitalWillEntryInputSchema.safeParse(editor.values); if (!parsed.success) throw Object.assign(new Error('The entry details are invalid.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' }); const value = parsed.data;
      const body = { entryType: value.entryType, title: value.title, content: value.content || null, summary: value.summary || null, priority: value.priority, isPinned: value.isPinned === 'YES', isEmergency: value.isEmergency === 'YES', effectiveFrom: isoDate(value.effectiveFrom), effectiveTo: isoDate(value.effectiveTo) };
      if (kind === 'ENTRY_CREATE') { const created = await service.createEntry(value.targetSectionId, ctx.userId, body); artifactId = created.id; title = 'Entry added'; }
      else { if (typeof editor.entityId !== 'string') throw Object.assign(new Error('That entry is no longer available.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' }); const original = plan.sections.find((s) => s.entries.some((e) => e.id === editor.entityId)); if (!original) throw Object.assign(new Error('That entry is no longer available.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' }); await service.updateEntry(editor.entityId, ctx.userId, body); if (original.id !== value.targetSectionId) await service.moveEntry(editor.entityId, value.targetSectionId, ctx.userId); artifactId = editor.entityId; title = 'Entry updated'; }
      artifactType = 'HOME_DIGITAL_WILL_ENTRY';
    } else if (kind.startsWith('CONTACT_')) {
      const parsed = HomeDigitalWillContactInputSchema.safeParse(editor.values); if (!parsed.success) throw Object.assign(new Error('The contact details are invalid.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' }); const value = parsed.data;
      const body = { name: value.name, email: value.email || null, phone: value.phone || null, relationship: value.relationship || null, role: value.role, accessLevel: value.accessLevel, isPrimary: value.isPrimary === 'YES', notes: value.notes || null };
      if (kind === 'CONTACT_CREATE' || kind === 'CONTACT_CREATE_REACHABLE') { const created = await service.createTrustedContact(plan.id, ctx.userId, body); artifactId = created.id; title = kind === 'CONTACT_CREATE_REACHABLE' ? 'Reachable primary contact added' : 'Trusted contact added'; } else { if (typeof editor.entityId !== 'string') throw Object.assign(new Error('That contact is no longer available.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' }); await service.updateTrustedContact(editor.entityId, ctx.userId, body); artifactId = editor.entityId; title = 'Trusted contact updated'; }
      artifactType = 'HOME_DIGITAL_WILL_CONTACT';
    } else {
      const parsed = HomeDigitalWillSectionInputSchema.safeParse(editor.values); if (!parsed.success) throw Object.assign(new Error('The section details are invalid.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' }); const value = parsed.data;
      if (kind === 'SECTION_CREATE') { const created = await service.createSection(plan.id, ctx.userId, { type: value.type, title: value.title, description: value.description || null, isEnabled: value.isEnabled === 'YES', sortOrder: plan.sections.length }); artifactId = created.id; title = 'Section restored'; } else { if (typeof editor.entityId !== 'string') throw Object.assign(new Error('That section is no longer available.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' }); await service.updateSection(editor.entityId, ctx.userId, { title: value.title, description: value.description || null, isEnabled: value.isEnabled === 'YES' }); artifactId = editor.entityId; title = 'Section updated'; }
      artifactType = 'HOME_DIGITAL_WILL_SECTION';
    }
    const result: AskOperationResult = { status: 'COMPLETED', reasonCode: 'HOME_DIGITAL_WILL_EDITOR_COMPLETED', blocks: [{ type: 'WORKFLOW_PROGRESS', id: `home-digital-will-editor-complete-${artifactId}`, title, status: 'COMPLETED', description: 'The shared Home Continuity Plan was updated. Sensitive details are not repeated in this receipt.', details: [], actions: [{ id: 'home-digital-will-review', label: 'Review my plan', interactionType: 'START_WORKFLOW', message: 'Show my home continuity plan', operationId: 'HOME_DIGITAL_WILL', style: 'PRIMARY' }] }], suggestions: [] };
    const refresh = await reconcileAskExecutionSideEffects(ctx.userId, ctx.execution, ctx.parameters); return { result, artifactType, artifactId, refreshedExecutions: refresh.refreshedExecutions };
  }
  const direct = ctx.parameters.homeDigitalWillDirectAction as { command?: unknown; entityId?: unknown } | undefined;
  if (direct) {
    if (typeof direct.command !== 'string' || typeof direct.entityId !== 'string' || !['CONTACT_DELETE', 'CONTACT_PRIMARY', 'SECTION_DELETE', 'SECTION_MOVE_UP', 'SECTION_MOVE_DOWN'].includes(direct.command)) throw Object.assign(new Error('This action is no longer active.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
    const service = new HomeDigitalWillService(); const plan = await service.getByProperty(ctx.execution.propertyId); if (!plan || ctx.parameters.homeDigitalWillDirectActionContextVersion !== homeDigitalWillPlanVersion(plan)) throw Object.assign(new Error('The plan changed while you were reviewing. Open the action again.'), { code: 'ASK_CONTEXT_VERSION_CONFLICT' });
    let title = 'Plan updated'; let artifactType = 'HOME_DIGITAL_WILL';
    if (direct.command === 'CONTACT_DELETE') { await service.deleteTrustedContact(direct.entityId, ctx.userId); title = 'Trusted contact deleted'; artifactType = 'HOME_DIGITAL_WILL_CONTACT'; }
    else if (direct.command === 'CONTACT_PRIMARY') { await service.updateTrustedContact(direct.entityId, ctx.userId, { isPrimary: true }); title = 'Primary contact updated'; artifactType = 'HOME_DIGITAL_WILL_CONTACT'; }
    else if (direct.command === 'SECTION_DELETE') { await service.deleteSection(direct.entityId, ctx.userId); title = 'Section deleted'; artifactType = 'HOME_DIGITAL_WILL_SECTION'; }
    else { const at = plan.sections.findIndex((s) => s.id === direct.entityId); if (at < 0) throw Object.assign(new Error('That section is no longer available.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' }); const next = direct.command === 'SECTION_MOVE_UP' ? Math.max(0, at - 1) : Math.min(plan.sections.length - 1, at + 1); const ids = plan.sections.map((s) => s.id); ids.splice(at, 1); ids.splice(next, 0, direct.entityId); if (next !== at) await service.reorderSections(plan.id, ctx.userId, { orderedIds: ids }); title = next === at ? 'Section is already at the edge' : 'Section moved'; artifactType = 'HOME_DIGITAL_WILL_SECTION'; }
    const result: AskOperationResult = { status: 'COMPLETED', reasonCode: 'HOME_DIGITAL_WILL_ACTION_COMPLETED', blocks: [{ type: 'WORKFLOW_PROGRESS', id: `home-digital-will-action-complete-${direct.entityId}`, title, status: 'COMPLETED', description: 'The shared Home Continuity Plan was updated.', details: [], actions: [{ id: 'home-digital-will-review', label: 'Review my plan', interactionType: 'START_WORKFLOW', message: 'Show my home continuity plan', operationId: 'HOME_DIGITAL_WILL', style: 'PRIMARY' }] }], suggestions: [] };
    const refresh = await reconcileAskExecutionSideEffects(ctx.userId, ctx.execution, ctx.parameters); return { result, artifactType, artifactId: direct.entityId, refreshedExecutions: refresh.refreshedExecutions };
  }
  const entryOrder = ctx.parameters.homeDigitalWillEntryOrder as { command?: unknown; entryId?: unknown; sectionId?: unknown } | undefined;
  if (entryOrder) {
    if (typeof entryOrder.command !== 'string' || !['ENTRY_DELETE', 'ENTRY_MOVE_UP', 'ENTRY_MOVE_DOWN'].includes(entryOrder.command) || typeof entryOrder.entryId !== 'string' || typeof entryOrder.sectionId !== 'string') throw Object.assign(new Error('This entry action is no longer active.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
    const service = new HomeDigitalWillService(); const plan = await service.getByProperty(ctx.execution.propertyId); const section = plan?.sections.find((row) => row.id === entryOrder.sectionId); const entry = section?.entries.find((row) => row.id === entryOrder.entryId);
    if (!section || !entry) throw Object.assign(new Error('That entry is no longer available.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
    const version = sha('home-digital-will-entry:' + section.id + ':' + section.entries.map((row) => row.id + ':' + row.updatedAt.toISOString() + ':' + row.sortOrder).join('|'));
    if (ctx.parameters.homeDigitalWillEntryOrderContextVersion !== version) throw Object.assign(new Error('This section changed while you were reviewing. Open the action again.'), { code: 'ASK_CONTEXT_VERSION_CONFLICT' });
    let title = 'Entry deleted';
    if (entryOrder.command === 'ENTRY_DELETE') await service.deleteEntry(entry.id, ctx.userId);
    else { const ids = section.entries.map((row) => row.id); const at = ids.indexOf(entry.id); const next = entryOrder.command === 'ENTRY_MOVE_UP' ? Math.max(0, at - 1) : Math.min(ids.length - 1, at + 1); ids.splice(at, 1); ids.splice(next, 0, entry.id); if (next !== at) await service.reorderEntries(section.id, ctx.userId, { orderedIds: ids }); title = next === at ? 'Entry is already at the end' : 'Entry moved'; }
    const result: AskOperationResult = { status: 'COMPLETED', reasonCode: 'HOME_DIGITAL_WILL_ENTRY_ACTION_COMPLETED', blocks: [{ type: 'WORKFLOW_PROGRESS', id: 'home-digital-will-entry-action-' + entry.id, title, status: 'COMPLETED', description: 'The shared Home Continuity Plan was updated. Sensitive entry details are not repeated here.', details: [{ label: 'Section', value: section.title }, { label: 'Entry', value: entry.title }], actions: [{ id: 'home-digital-will-review', label: 'Review my plan', interactionType: 'START_WORKFLOW', message: 'Show my home continuity plan', operationId: 'HOME_DIGITAL_WILL', style: 'PRIMARY' }] }], suggestions: [] };
    const refresh = await reconcileAskExecutionSideEffects(ctx.userId, ctx.execution, ctx.parameters); return { result, artifactType: 'HOME_DIGITAL_WILL_ENTRY', artifactId: entry.id, refreshedExecutions: refresh.refreshedExecutions };
  }
  const metadata = ctx.parameters.homeDigitalWillMetadata as { planId?: unknown; values?: unknown } | undefined;
  if (metadata) {
    if (typeof metadata.planId !== 'string') throw Object.assign(new Error('This edit is no longer active.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
    const values = HomeDigitalWillMetadataInputSchema.safeParse(metadata.values);
    if (!values.success) throw Object.assign(new Error('The plan details are invalid.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
    const service = new HomeDigitalWillService(); const current = await service.getByProperty(ctx.execution.propertyId);
    if (!current || current.id !== metadata.planId) throw Object.assign(new Error('That plan is no longer available.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
    const expected = typeof ctx.parameters.homeDigitalWillMetadataContextVersion === 'string' ? ctx.parameters.homeDigitalWillMetadataContextVersion : null;
    if (expected !== sha(`home-digital-will-metadata:${current.id}:${current.updatedAt.toISOString()}`)) throw Object.assign(new Error('The plan changed while this form was open. Open Edit details again.'), { code: 'ASK_CONTEXT_VERSION_CONFLICT' });
    const plan = await service.updateWill(current.id, ctx.userId, { title: values.data.title, status: values.data.status, readiness: values.data.readiness, lastReviewedAt: values.data.lastReviewedAt ? new Date(`${values.data.lastReviewedAt}T12:00:00.000Z`).toISOString() : null });
    const result: AskOperationResult = { status: 'COMPLETED', reasonCode: 'HOME_DIGITAL_WILL_METADATA_UPDATED', blocks: [{ type: 'WORKFLOW_PROGRESS', id: `home-digital-will-metadata-updated-${plan.id}`, title: 'Plan details updated', status: 'COMPLETED', description: 'The Home Continuity Plan metadata was saved. The plan was not published and nobody was notified.', details: [{ label: 'Title', value: plan.title }, { label: 'Status', value: plan.status }, { label: 'Readiness', value: plan.readiness }], actions: [{ id: 'home-digital-will-review', label: 'Review my plan', interactionType: 'START_WORKFLOW', message: 'Show my home continuity plan', operationId: 'HOME_DIGITAL_WILL', style: 'PRIMARY' }] }], suggestions: [] };
    const refresh = await reconcileAskExecutionSideEffects(ctx.userId, ctx.execution, ctx.parameters);
    return { result, artifactType: 'HOME_DIGITAL_WILL', artifactId: plan.id, refreshedExecutions: refresh.refreshedExecutions };
  }
  const publish = ctx.parameters.homeDigitalWillPublish as { planId?: unknown } | undefined;
  if (publish) {
    if (typeof publish.planId !== 'string') throw Object.assign(new Error('This publication is no longer active.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
    const service = new HomeDigitalWillService();
    const current = await service.getByProperty(ctx.execution.propertyId);
    if (!current || current.id !== publish.planId) throw Object.assign(new Error('That plan is no longer available.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
    const plan = current.status === 'ACTIVE' ? current : await service.publishWill(current.id, ctx.userId);
    const result: AskOperationResult = { status: 'COMPLETED', reasonCode: current.status === 'ACTIVE' ? 'HOME_DIGITAL_WILL_ALREADY_PUBLISHED' : 'HOME_DIGITAL_WILL_PUBLISHED', blocks: [{ type: 'WORKFLOW_PROGRESS', id: `home-digital-will-published-${plan.id}`, title: current.status === 'ACTIVE' ? 'Plan already marked ready' : 'Home Continuity Plan marked ready', status: 'COMPLETED', description: 'The plan is active and its review date is recorded. No invitations were sent.', details: [{ label: 'Status', value: 'Ready' }], actions: [{ id: 'home-digital-will-review', label: 'Review my plan', interactionType: 'START_WORKFLOW', message: 'Show my home continuity plan', operationId: 'HOME_DIGITAL_WILL', style: 'PRIMARY' }] }], suggestions: [] };
    const refresh = await reconcileAskExecutionSideEffects(ctx.userId, ctx.execution, ctx.parameters);
    return { result, artifactType: 'HOME_DIGITAL_WILL', artifactId: plan.id, refreshedExecutions: refresh.refreshedExecutions };
  }
  if (ctx.parameters.homeDigitalWillCreate !== true) throw Object.assign(new Error('This plan creation is no longer active.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
  const service = new HomeDigitalWillService();
  const existing = await service.getByProperty(ctx.execution.propertyId);
  const plan = existing ?? await service.getOrCreateByProperty(ctx.execution.propertyId, { title: 'Home Continuity Plan' });
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: existing ? 'HOME_DIGITAL_WILL_ALREADY_EXISTS' : 'HOME_DIGITAL_WILL_CREATED',
    blocks: [{ type: 'WORKFLOW_PROGRESS', id: `home-digital-will-created-${plan.id}`, title: existing ? 'Plan already exists' : 'Home Continuity Plan created', status: 'COMPLETED', description: existing ? 'No duplicate was created.' : 'Your private draft and its standard sections are ready.', details: [{ label: 'Status', value: 'Private draft' }], actions: [{ id: 'home-digital-will-review', label: 'Continue setup', interactionType: 'START_WORKFLOW', message: 'Show my home continuity plan', operationId: 'HOME_DIGITAL_WILL', style: 'PRIMARY' }] }],
    suggestions: [],
  };
  const refresh = await reconcileAskExecutionSideEffects(ctx.userId, ctx.execution, ctx.parameters);
  if (refresh.attemptedAndFailed) result.blocks.push({ type: 'BOUNDARY', id: 'home-digital-will-create-refresh-failed', title: 'Created; view could not refresh', body: 'The plan was created, but the earlier answer could not refresh automatically. Ask to show the plan again.', severity: 'INFO', suggestions: [] });
  return { result, artifactType: 'HOME_DIGITAL_WILL', artifactId: plan.id, refreshedExecutions: refresh.refreshedExecutions };
}

registerConfirmCapabilityHandler('home-digital-will.create', confirmHomeDigitalWillCreate);
