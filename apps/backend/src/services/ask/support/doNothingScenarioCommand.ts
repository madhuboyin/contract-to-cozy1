// Do-Nothing Simulator scenarios inside Ask (register P2 "Do-Nothing Simulator"; FRD v1.336). Pure: declared messages, action ids, the form and its
// validation (the route's own schemas), and the merge that an edit needs because the service replaces a scenario's overrides wholesale.
import { z } from 'zod';

export const DO_NOTHING_PROPERTY_ENTITY_TYPE = 'DO_NOTHING_PROPERTY';
export const DO_NOTHING_SCENARIO_ENTITY_TYPE = 'DO_NOTHING_SCENARIO';
export const DO_NOTHING_SCENARIO_MESSAGES = {
  CREATE: 'Save a new do-nothing scenario.',
  EDIT: 'Change this do-nothing scenario.',
  DELETE: 'Delete this do-nothing scenario.',
} as const;
export type DoNothingScenarioKind = keyof typeof DO_NOTHING_SCENARIO_MESSAGES;
export const DO_NOTHING_SCENARIO_ACTION_IDS = { CREATE: 'do-nothing-scenario-create', EDIT: 'do-nothing-scenario-edit', DELETE: 'do-nothing-scenario-delete' } as const;
export const doNothingScenarioKindFromMessage = (message: string): DoNothingScenarioKind | null =>
  ((Object.entries(DO_NOTHING_SCENARIO_MESSAGES) as Array<[DoNothingScenarioKind, string]>).find(([, value]) => value === message)?.[0]) ?? null;
export const doNothingScenarioEntityType = (kind: DoNothingScenarioKind) => (kind === 'CREATE' ? DO_NOTHING_PROPERTY_ENTITY_TYPE : DO_NOTHING_SCENARIO_ENTITY_TYPE);
export type DoNothingFormKind = 'CREATE' | 'EDIT';
export const DO_NOTHING_FORM_CAPTURE_KEYS: Record<DoNothingFormKind, string> = { CREATE: 'DO_NOTHING_SCENARIO_CREATE', EDIT: 'DO_NOTHING_SCENARIO_EDIT' };
export const doNothingFormKindFromCaptureKey = (key: string): DoNothingFormKind | null =>
  ((Object.entries(DO_NOTHING_FORM_CAPTURE_KEYS) as Array<[DoNothingFormKind, string]>).find(([, value]) => value === key)?.[0]) ?? null;

export const DO_NOTHING_HORIZONS = [6, 12, 24, 36] as const;
export const DEDUCTIBLE_STRATEGIES = ['UNCHANGED', 'KEEP_HIGH', 'RAISE', 'LOWER'] as const;
export const DEDUCTIBLE_LABELS: Record<string, string> = { UNCHANGED: 'Leave it as it is', KEEP_HIGH: 'Keep it high', RAISE: 'Raise it', LOWER: 'Lower it' };
export const RISK_TOLERANCES = ['LOW', 'MEDIUM', 'HIGH'] as const;
export const RISK_TOLERANCE_LABELS: Record<string, string> = { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High' };

const blank = (value: unknown) => (value === '' || value === undefined || value === null ? null : value);
const yesNo = z.preprocess(blank, z.enum(['YES', 'NO']).nullable()).optional();
const base = {
  horizonMonths: z.preprocess(blank, z.coerce.number().refine((v) => (DO_NOTHING_HORIZONS as readonly number[]).includes(v)).nullable()).optional(),
  skipMaintenance: yesNo, skipWarranty: yesNo,
  deductibleStrategy: z.preprocess(blank, z.enum(DEDUCTIBLE_STRATEGIES).nullable()).optional(),
  cashBuffer: z.preprocess(blank, z.coerce.number().finite().min(0).max(100_000_000).nullable()).optional(),
  riskTolerance: z.preprocess(blank, z.enum(RISK_TOLERANCES).nullable()).optional(),
};
export const DoNothingScenarioCreateSchema = z.object({ name: z.string().trim().min(1).max(120), ...base, horizonMonths: z.coerce.number().refine((v) => (DO_NOTHING_HORIZONS as readonly number[]).includes(v)) }).strict();
export const DoNothingScenarioEditSchema = z.object({ name: z.preprocess(blank, z.string().trim().min(1).max(120).nullable()).optional(), ...base }).strict();

export interface DoNothingOverrides {
  skipMaintenance?: boolean; skipWarranty?: boolean; deductibleStrategy?: string; cashBufferCents?: number; riskTolerance?: string; ignoreTopRisks?: string[];
}
export type DoNothingScenarioChange = { name?: string; horizonMonths?: number; inputOverrides: DoNothingOverrides };

/** The form's changes against a scenario's current overrides: the service replaces the overrides wholesale, so an edit sends the merged set. */
export function parseDoNothingScenarioAnswer(kind: DoNothingFormKind, answer: unknown, currentOverrides: DoNothingOverrides = {}):
  { success: true; data: DoNothingScenarioChange; touched: string[] } | { success: false; reason: 'INVALID' | 'NOTHING' } {
  const parsed = (kind === 'CREATE' ? DoNothingScenarioCreateSchema : DoNothingScenarioEditSchema).safeParse(answer);
  if (!parsed.success) return { success: false, reason: 'INVALID' };
  const v = parsed.data as Record<string, any>;
  const overrides: DoNothingOverrides = { ...currentOverrides };
  const touched: string[] = [];
  if (v.skipMaintenance) { overrides.skipMaintenance = v.skipMaintenance === 'YES'; touched.push('skipMaintenance'); }
  if (v.skipWarranty) { overrides.skipWarranty = v.skipWarranty === 'YES'; touched.push('skipWarranty'); }
  if (v.deductibleStrategy) { overrides.deductibleStrategy = v.deductibleStrategy; touched.push('deductibleStrategy'); }
  if (typeof v.cashBuffer === 'number') { overrides.cashBufferCents = Math.round(v.cashBuffer * 100); touched.push('cashBufferCents'); }
  if (v.riskTolerance) { overrides.riskTolerance = v.riskTolerance; touched.push('riskTolerance'); }
  const data: DoNothingScenarioChange = { inputOverrides: overrides };
  if (typeof v.name === 'string') { data.name = v.name; touched.push('name'); }
  if (typeof v.horizonMonths === 'number') { data.horizonMonths = v.horizonMonths; touched.push('horizonMonths'); }
  if (kind === 'EDIT' && !touched.length) return { success: false, reason: 'NOTHING' };
  return { success: true, data, touched };
}
