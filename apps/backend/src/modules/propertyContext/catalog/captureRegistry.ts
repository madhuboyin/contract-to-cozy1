import {
  CoolingType,
  DwellingType,
  FoundationType,
  HeatingType,
  OccupancyStatus,
  OutdoorSpaceType,
  OwnershipForm,
  PropertyUse,
  ResponsibleParty,
  RoofType,
  WaterHeaterType,
} from '@prisma/client';
import type { CaptureInputSchema, ContextCaptureDefinition, ScalarCaptureInputSchema } from '../domain/contracts';
import { getFactDefinition, PROPERTY_FACT_CATALOG } from './factCatalog';
import { isContextCaptureSupported } from '../application/capturePropertyFact';

type CaptureCopy = Pick<ContextCaptureDefinition, 'title' | 'question' | 'helpText' | 'allowNotSure'>;

const humanize = (value: string) => value
  .replace(/([a-z])([A-Z])/g, '$1 $2')
  .replace(/[._]/g, ' ')
  .replace(/\b\w/g, (character) => character.toUpperCase());

const enumSchema = (values: readonly string[]): ScalarCaptureInputSchema => ({
  type: 'SINGLE_SELECT',
  options: values.map((value) => ({ label: humanize(value.toLowerCase()), value })),
});

const booleanSchema: ScalarCaptureInputSchema = { type: 'BOOLEAN', trueLabel: 'Yes', falseLabel: 'No' };
const nonNegativeInteger = (unit?: string): ScalarCaptureInputSchema => ({ type: 'INTEGER', min: 0, unit });
const nonNegativeDecimal = (unit?: string): ScalarCaptureInputSchema => ({ type: 'DECIMAL', min: 0, unit });

const inputSchemas: Record<string, CaptureInputSchema> = {
  'core.dwellingType': enumSchema(Object.values(DwellingType)),
  'core.ownershipForm': enumSchema(Object.values(OwnershipForm)),
  'core.propertyUse': enumSchema(Object.values(PropertyUse)),
  'core.occupancyStatus': enumSchema(Object.values(OccupancyStatus)),
  'core.isPrimary': booleanSchema,
  'core.yearBuilt': { type: 'INTEGER', min: 1600, max: 2200, unit: 'year' },
  'core.propertySizeSqFt': nonNegativeInteger('sq ft'),
  'core.bedrooms': nonNegativeInteger('bedrooms'),
  'core.bathrooms': nonNegativeDecimal('bathrooms'),
  'location.city': { type: 'SHORT_TEXT', maxLength: 100 },
  'location.state': { type: 'SHORT_TEXT', maxLength: 2 },
  'location.zipCode': { type: 'SHORT_TEXT', maxLength: 5 },
  'location.timezone': { type: 'SHORT_TEXT', maxLength: 200 },
  'structure.roofType': enumSchema(Object.values(RoofType)),
  'structure.roofReplacementYear': { type: 'INTEGER', min: 1600, max: 2200, unit: 'year' },
  'structure.foundationType': enumSchema(Object.values(FoundationType)),
  'structure.sidingType': { type: 'SHORT_TEXT', maxLength: 200 },
  'structure.electricalPanelAgeYears': nonNegativeInteger('years'),
  'exterior.outdoorSpaceTypes': {
    type: 'MULTI_SELECT',
    options: Object.values(OutdoorSpaceType).map((value) => ({ label: humanize(value.toLowerCase()), value })),
    maxItems: 7,
  },
  'exterior.lotSizeSqFt': nonNegativeDecimal('sq ft'),
  'systems.heatingType': enumSchema(Object.values(HeatingType)),
  'systems.coolingType': enumSchema(Object.values(CoolingType)),
  'systems.waterHeaterType': enumSchema(Object.values(WaterHeaterType)),
};

for (const key of [
  'exterior.hasPrivateOutdoorSpace', 'exterior.hasLawn', 'exterior.hasTreesOrShrubs',
  'exterior.hasDriveway', 'exterior.hasFence', 'exterior.hasPoolOrSpa', 'exterior.hasIrrigation',
  'exterior.hasOutdoorFaucets', 'exterior.hasDrainageIssues', 'safety.hasSmokeDetectors',
  'safety.hasCoDetectors', 'safety.hasSecuritySystem', 'safety.hasFireExtinguisher',
  'safety.hasSumpPumpBackup',
]) inputSchemas[key] = booleanSchema;

for (const definition of PROPERTY_FACT_CATALOG.filter(({ key }) => key.startsWith('responsibility.'))) {
  inputSchemas[definition.key] = enumSchema(Object.values(ResponsibleParty));
}

const copy: Record<string, CaptureCopy> = {
  'core.dwellingType': { title: 'Home type', question: 'What kind of home is this?', allowNotSure: true },
  'core.ownershipForm': { title: 'Ownership', question: 'How is the property owned?', allowNotSure: true },
  'core.propertyUse': { title: 'Property use', question: 'How is this property used?', allowNotSure: true },
  'core.occupancyStatus': { title: 'Occupancy', question: 'Who currently occupies it?', allowNotSure: true },
  'systems.heatingType': { title: 'Heating system', question: 'What is the main heating system?', allowNotSure: true },
  'systems.coolingType': { title: 'Cooling system', question: 'What is the main cooling system?', allowNotSure: true },
  'systems.waterHeaterType': { title: 'Water heater', question: 'What kind of water heater is installed?', allowNotSure: true },
  'exterior.hasPrivateOutdoorSpace': {
    title: 'Outdoor recommendations',
    question: 'Does this home have private outdoor space?',
    helpText: 'This determines whether outdoor recommendations apply to this home.',
    allowNotSure: true,
  },
};

function defaultCopy(factKey: string): CaptureCopy {
  const subject = humanize(factKey.split('.').slice(1).join(' '));
  if (factKey.startsWith('responsibility.')) {
    return { title: `${subject} responsibility`, question: `Who is responsible for ${subject.toLowerCase()}?`, allowNotSure: true };
  }
  return { title: subject, question: `What should we know about ${subject.toLowerCase()}?`, allowNotSure: true };
}

const definitions = new Map<string, ContextCaptureDefinition>();
for (const [factKey, inputSchema] of Object.entries(inputSchemas)) {
  const fact = getFactDefinition(factKey);
  const captureKey = factKey.replace(/([a-z])([A-Z])/g, '$1_$2').replace(/[.]/g, '_').toUpperCase();
  definitions.set(captureKey, {
    captureKey,
    factKeys: [factKey],
    mode: 'SCALAR',
    ...(copy[factKey] ?? defaultCopy(factKey)),
    inputSchema,
    canonicalOwner: fact.canonicalOwner,
    actionKey: 'CAPTURE_PROPERTY_SCALAR',
    sensitivity: 'STANDARD',
  });
}

const structuredDefinitions: ContextCaptureDefinition[] = [
  {
    captureKey: 'OUTDOOR_SPACE_PROFILE',
    factKeys: ['exterior.hasPrivateOutdoorSpace', 'exterior.outdoorSpaceTypes', 'responsibility.landscaping'],
    mode: 'STRUCTURED',
    title: 'Outdoor space details',
    question: 'Tell us about the outdoor space this home is responsible for.',
    helpText: 'Follow-up details appear only when private outdoor space is present.',
    inputSchema: {
      type: 'GROUP',
      fields: [
        { key: 'hasPrivateOutdoorSpace', label: 'Private outdoor space', required: true, inputSchema: booleanSchema },
        {
          key: 'outdoorSpaceTypes',
          label: 'Outdoor space types',
          required: true,
          inputSchema: inputSchemas['exterior.outdoorSpaceTypes'] as ScalarCaptureInputSchema,
          when: { fieldKey: 'hasPrivateOutdoorSpace', operator: 'EQUALS', value: true },
        },
        {
          key: 'landscapingResponsibility',
          label: 'Who handles landscaping?',
          required: true,
          inputSchema: enumSchema(Object.values(ResponsibleParty)),
          when: { fieldKey: 'hasPrivateOutdoorSpace', operator: 'EQUALS', value: true },
        },
      ],
    },
    allowNotSure: true,
    canonicalOwner: 'PropertyExteriorProfile + PropertyResponsibility',
    actionKey: 'CAPTURE_OUTDOOR_SPACE_PROFILE',
    sensitivity: 'STANDARD',
    answerBindings: {
      hasPrivateOutdoorSpace: 'exterior.hasPrivateOutdoorSpace',
      outdoorSpaceTypes: 'exterior.outdoorSpaceTypes',
      landscapingResponsibility: 'responsibility.landscaping',
    },
  },
  {
    captureKey: 'HVAC_SYSTEM_PROFILE',
    factKeys: ['systems.heatingType', 'systems.coolingType', 'responsibility.hvac'],
    mode: 'STRUCTURED',
    title: 'Heating and cooling details',
    question: 'Which heating and cooling systems serve this home?',
    helpText: 'Choose “Unknown” when a system type is present but not yet identified.',
    inputSchema: {
      type: 'GROUP',
      fields: [
        { key: 'heatingType', label: 'Main heating system', required: true, inputSchema: inputSchemas['systems.heatingType'] as ScalarCaptureInputSchema },
        { key: 'coolingType', label: 'Main cooling system', required: true, inputSchema: inputSchemas['systems.coolingType'] as ScalarCaptureInputSchema },
        { key: 'hvacResponsibility', label: 'Who handles HVAC?', required: true, inputSchema: enumSchema(Object.values(ResponsibleParty)) },
      ],
    },
    allowNotSure: true,
    canonicalOwner: 'Property + PropertyResponsibility',
    actionKey: 'CAPTURE_HVAC_SYSTEM_PROFILE',
    sensitivity: 'STANDARD',
    answerBindings: {
      heatingType: 'systems.heatingType',
      coolingType: 'systems.coolingType',
      hvacResponsibility: 'responsibility.hvac',
    },
  },
  {
    captureKey: 'SAFETY_DETECTOR_PROFILE',
    factKeys: ['safety.hasSmokeDetectors', 'safety.hasCoDetectors', 'responsibility.commonSafety'],
    mode: 'STRUCTURED',
    title: 'Home safety devices',
    question: 'Confirm the home’s detector coverage and responsibility.',
    inputSchema: {
      type: 'GROUP',
      fields: [
        { key: 'hasSmokeDetectors', label: 'Smoke detectors installed', required: true, inputSchema: booleanSchema },
        { key: 'hasCoDetectors', label: 'Carbon-monoxide detectors installed', required: true, inputSchema: booleanSchema },
        { key: 'commonSafetyResponsibility', label: 'Who handles common safety devices?', required: true, inputSchema: enumSchema(Object.values(ResponsibleParty)) },
      ],
    },
    allowNotSure: true,
    canonicalOwner: 'Property + PropertyResponsibility',
    actionKey: 'CAPTURE_SAFETY_DETECTOR_PROFILE',
    sensitivity: 'SECURITY',
    answerBindings: {
      hasSmokeDetectors: 'safety.hasSmokeDetectors',
      hasCoDetectors: 'safety.hasCoDetectors',
      commonSafetyResponsibility: 'responsibility.commonSafety',
    },
  },
  {
    captureKey: 'ROOF_STRUCTURE_PROFILE',
    factKeys: ['structure.roofType', 'structure.roofReplacementYear', 'responsibility.roof'],
    mode: 'STRUCTURED',
    title: 'Roof details',
    question: 'Confirm the roof type, replacement year, and responsibility.',
    inputSchema: {
      type: 'GROUP',
      fields: [
        { key: 'roofType', label: 'Roof type', required: true, inputSchema: inputSchemas['structure.roofType'] as ScalarCaptureInputSchema },
        { key: 'roofReplacementYear', label: 'Approximate replacement year', required: false, inputSchema: inputSchemas['structure.roofReplacementYear'] as ScalarCaptureInputSchema },
        { key: 'roofResponsibility', label: 'Who handles the roof?', required: true, inputSchema: enumSchema(Object.values(ResponsibleParty)) },
      ],
    },
    allowNotSure: true,
    canonicalOwner: 'Property + PropertyResponsibility',
    actionKey: 'CAPTURE_ROOF_STRUCTURE_PROFILE',
    sensitivity: 'STANDARD',
    answerBindings: {
      roofType: 'structure.roofType',
      roofReplacementYear: 'structure.roofReplacementYear',
      roofResponsibility: 'responsibility.roof',
    },
  },
];

for (const definition of structuredDefinitions) definitions.set(definition.captureKey, definition);

const relationalDefinitions: ContextCaptureDefinition[] = [
  {
    captureKey: 'INVENTORY_ITEM_SELECT_OR_CREATE',
    factKeys: ['inventory.items'],
    mode: 'RELATIONAL',
    title: 'Add an installed item or system',
    question: 'Which item or home system should this feature use?',
    helpText: 'Select an existing record or add only the details needed to continue.',
    inputSchema: {
      type: 'RELATIONAL_SELECT_CREATE',
      entityType: 'INVENTORY_ITEM',
      selectLabel: 'Select an existing item',
      createLabel: 'Add an item',
      options: [],
      createFields: [
        { key: 'name', label: 'Item or system name', required: true, inputSchema: { type: 'SHORT_TEXT', maxLength: 120 } },
        { key: 'category', label: 'Category', required: true, inputSchema: enumSchema(['APPLIANCE', 'HVAC', 'PLUMBING', 'ELECTRICAL', 'ROOF_EXTERIOR', 'SAFETY', 'SMART_HOME', 'OTHER']) },
        { key: 'condition', label: 'Current condition', required: true, inputSchema: enumSchema(['NEW', 'GOOD', 'FAIR', 'POOR', 'UNKNOWN']) },
      ],
    },
    allowNotSure: false,
    canonicalOwner: 'InventoryItem',
    actionKey: 'SELECT_OR_CREATE_INVENTORY_ITEM',
    sensitivity: 'STANDARD',
    relationalAdapterKey: 'INVENTORY_ITEM',
  },
  {
    captureKey: 'INSURANCE_POLICY_SELECT_OR_CREATE',
    factKeys: ['coverage.insurancePolicies'],
    mode: 'RELATIONAL',
    title: 'Add an insurance policy',
    question: 'Which property policy should Coverage Intelligence use?',
    helpText: 'Add the minimum policy details needed for a coverage assessment. You can complete the full record later.',
    inputSchema: {
      type: 'RELATIONAL_SELECT_CREATE',
      entityType: 'INSURANCE_POLICY',
      selectLabel: 'Select an existing policy',
      createLabel: 'Add a policy',
      options: [],
      createFields: [
        { key: 'carrierName', label: 'Insurance carrier', required: true, inputSchema: { type: 'SHORT_TEXT', maxLength: 120 } },
        { key: 'policyNumber', label: 'Policy number', required: true, inputSchema: { type: 'SHORT_TEXT', maxLength: 120 } },
        { key: 'coverageType', label: 'Coverage type', required: true, inputSchema: { type: 'SINGLE_SELECT', options: [
          { label: 'Homeowner', value: 'HOMEOWNER' }, { label: 'Landlord', value: 'LANDLORD' },
          { label: 'Flood', value: 'FLOOD' }, { label: 'Other', value: 'OTHER' },
        ] } },
        { key: 'premiumAmount', label: 'Annual premium', required: true, inputSchema: { type: 'DECIMAL', min: 0, unit: 'USD' } },
        { key: 'startDate', label: 'Policy start date', helpText: 'Use YYYY-MM-DD.', required: true, inputSchema: { type: 'SHORT_TEXT', maxLength: 10 } },
        { key: 'expiryDate', label: 'Policy expiry date', helpText: 'Use YYYY-MM-DD.', required: true, inputSchema: { type: 'SHORT_TEXT', maxLength: 10 } },
      ],
    },
    allowNotSure: false,
    canonicalOwner: 'InsurancePolicy',
    actionKey: 'SELECT_OR_CREATE_INSURANCE_POLICY',
    sensitivity: 'FINANCIAL',
    relationalAdapterKey: 'INSURANCE_POLICY',
  },
];

for (const definition of relationalDefinitions) definitions.set(definition.captureKey, definition);

export const CONTEXT_CAPTURE_DEFINITIONS = [...definitions.values()];

export function getCaptureDefinition(captureKey: string): ContextCaptureDefinition {
  const definition = definitions.get(captureKey);
  if (!definition) throw new Error(`Property Context capture key is not registered: ${captureKey}`);
  return definition;
}

export function getCaptureDefinitionForFact(factKey: string): ContextCaptureDefinition | undefined {
  return CONTEXT_CAPTURE_DEFINITIONS.find((definition) => definition.mode === 'SCALAR' && definition.factKeys.includes(factKey))
    ?? CONTEXT_CAPTURE_DEFINITIONS.find((definition) => definition.factKeys.includes(factKey));
}

export function validateCaptureRegistry(): void {
  const problems: string[] = [];
  for (const fact of PROPERTY_FACT_CATALOG.filter(({ writable }) => writable)) {
    if (!isContextCaptureSupported(fact.key)) problems.push(`${fact.key}: no canonical scalar command`);
    if (!getCaptureDefinitionForFact(fact.key)) problems.push(`${fact.key}: no capture definition`);
  }
  for (const definition of CONTEXT_CAPTURE_DEFINITIONS) {
    for (const factKey of definition.factKeys) {
      const fact = getFactDefinition(factKey);
      if (definition.mode !== 'RELATIONAL' && !fact.writable) problems.push(`${definition.captureKey}: fact is not writable`);
      if (definition.mode === 'SCALAR' && fact.canonicalOwner !== definition.canonicalOwner) problems.push(`${definition.captureKey}: canonical owner drift`);
    }
    if (definition.mode === 'STRUCTURED') {
      if (definition.inputSchema.type !== 'GROUP') problems.push(`${definition.captureKey}: structured capture requires group schema`);
      const boundFacts = new Set(Object.values(definition.answerBindings ?? {}));
      for (const factKey of definition.factKeys) if (!boundFacts.has(factKey)) problems.push(`${definition.captureKey}: missing answer binding for ${factKey}`);
    }
    if (definition.mode === 'RELATIONAL') {
      if (definition.inputSchema.type !== 'RELATIONAL_SELECT_CREATE') problems.push(`${definition.captureKey}: relational capture requires select/create schema`);
      if (!definition.relationalAdapterKey) problems.push(`${definition.captureKey}: relational capture requires an allowlisted adapter`);
      if (definition.canonicalOwner !== getFactDefinition(definition.factKeys[0]).canonicalOwner) problems.push(`${definition.captureKey}: canonical owner drift`);
    }
  }
  if (problems.length) throw new Error(`Invalid Property Context capture registry:\n${problems.join('\n')}`);
}

validateCaptureRegistry();
