// HOA-association definition for the shared RecordEditor (FRD v1.388). The editor owns presentation and dirty state;
// this domain module owns canonical values, validation, changes-only review and the narrowed service patch.
import { HOA_DUES_FREQUENCIES, HOA_DUES_LABELS } from './hoaComplianceCommand';
import { diffEditorValues, readEditorAnswer, type RecordEditorDescriptor, type RecordEditorErrors, type RecordEditorField } from '../recordEditor/recordEditor.contract';

export const HOA_ASSOCIATION_EDITOR_SECTIONS = [
  { id: 'association', title: 'Association' },
  { id: 'contact', title: 'Contact' },
  { id: 'dues', title: 'Dues' },
  { id: 'additional', title: 'Additional information' },
] as const;

export const HOA_ASSOCIATION_EDITOR_FIELDS: readonly RecordEditorField[] = [
  { key: 'name', label: 'Association name', kind: 'TEXT', section: 'association', required: true, maxLength: 200 },
  { key: 'managementCompany', label: 'Management company', kind: 'TEXT', section: 'association', required: false, maxLength: 200 },
  { key: 'contactName', label: 'Contact name', kind: 'TEXT', section: 'contact', required: false, maxLength: 200 },
  { key: 'contactEmail', label: 'Contact email', kind: 'TEXT', inputType: 'email', section: 'contact', required: false, maxLength: 200 },
  { key: 'contactPhone', label: 'Contact phone', kind: 'TEXT', inputType: 'tel', section: 'contact', required: false, maxLength: 60 },
  { key: 'duesAmount', label: 'Dues amount', kind: 'MONEY', section: 'dues', required: false },
  { key: 'duesFrequency', label: 'Payment frequency', kind: 'SELECT', section: 'dues', required: false, options: HOA_DUES_FREQUENCIES.map((value) => ({ value, label: HOA_DUES_LABELS[value] })), emptyLabel: 'Not recorded' },
  { key: 'nextDueDate', label: 'Next due date', kind: 'DATE', section: 'dues', required: false },
  { key: 'notes', label: 'Notes', kind: 'TEXTAREA', section: 'additional', required: false, maxLength: 2000, placeholder: 'Add useful payment, portal, or contact context.' },
];

export interface HoaAssociationEditorRow {
  name: string;
  managementCompany: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  duesAmountCents: number | null;
  duesFrequency: string | null;
  nextDueDate: Date | null;
  notes: string | null;
}

const dateValue = (value: Date | null) => value ? value.toISOString().slice(0, 10) : '';
export const hoaAssociationEditorValues = (row?: HoaAssociationEditorRow | null): Record<string, string> => ({
  name: row?.name ?? '', managementCompany: row?.managementCompany ?? '', contactName: row?.contactName ?? '',
  contactEmail: row?.contactEmail ?? '', contactPhone: row?.contactPhone ?? '',
  duesAmount: row?.duesAmountCents != null ? (row.duesAmountCents / 100).toFixed(2) : '', duesFrequency: row?.duesFrequency ?? '',
  nextDueDate: dateValue(row?.nextDueDate ?? null), notes: row?.notes ?? '',
});

export const hoaAssociationEditorDescriptor = (row: HoaAssociationEditorRow | null, version: string): RecordEditorDescriptor => ({
  recordLabel: row ? `${row.name} HOA details` : 'HOA details', sections: HOA_ASSOCIATION_EDITOR_SECTIONS,
  fields: HOA_ASSOCIATION_EDITOR_FIELDS, original: hoaAssociationEditorValues(row), version,
});

export function validateHoaAssociationEditorAnswer(answer: unknown): { values: Record<string, string>; errors: RecordEditorErrors } {
  const { values, errors } = readEditorAnswer(HOA_ASSOCIATION_EDITOR_FIELDS, answer);
  if (!errors.contactEmail && values.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.contactEmail)) errors.contactEmail = 'Enter a valid email address.';
  if (!errors.duesAmount && !errors.duesFrequency && Boolean(values.duesAmount) !== Boolean(values.duesFrequency)) {
    const key = values.duesAmount ? 'duesFrequency' : 'duesAmount';
    errors[key] = values.duesAmount ? 'Choose how often these dues are paid.' : 'Enter the dues amount, or clear the payment frequency.';
  }
  return { values, errors };
}

export const hoaAssociationEditorChanges = (original: Record<string, string>, values: Record<string, string>) => diffEditorValues(HOA_ASSOCIATION_EDITOR_FIELDS, original, values);

export function hoaAssociationEditorFormValues(values: Record<string, string>): Record<string, unknown> {
  return {
    name: values.name,
    managementCompany: values.managementCompany || null, contactName: values.contactName || null,
    contactEmail: values.contactEmail || null, contactPhone: values.contactPhone || null,
    duesAmount: values.duesAmount ? Number(values.duesAmount) : null, duesFrequency: values.duesFrequency || null,
    nextDueDate: values.nextDueDate || null, notes: values.notes || null,
  };
}

export function hoaAssociationEditorPatch(changedKeys: readonly string[], values: Record<string, string>): Record<string, unknown> {
  const all = hoaAssociationEditorFormValues(values);
  return Object.fromEntries(changedKeys.map((key) => [key, all[key]]));
}
