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
import type { CaptureInputSchema, ContextCaptureDefinition } from '../domain/contracts';
import { getFactDefinition, PROPERTY_FACT_CATALOG } from './factCatalog';
import { isContextCaptureSupported } from '../application/capturePropertyFact';

type CaptureCopy = Pick<ContextCaptureDefinition, 'title' | 'question' | 'helpText' | 'allowNotSure'>;

const humanize = (value: string) => value
  .replace(/([a-z])([A-Z])/g, '$1 $2')
  .replace(/[._]/g, ' ')
  .replace(/\b\w/g, (character) => character.toUpperCase());

const enumSchema = (values: readonly string[]): CaptureInputSchema => ({
  type: 'SINGLE_SELECT',
  options: values.map((value) => ({ label: humanize(value.toLowerCase()), value })),
});

const booleanSchema: CaptureInputSchema = { type: 'BOOLEAN', trueLabel: 'Yes', falseLabel: 'No' };
const nonNegativeInteger = (unit?: string): CaptureInputSchema => ({ type: 'INTEGER', min: 0, unit });
const nonNegativeDecimal = (unit?: string): CaptureInputSchema => ({ type: 'DECIMAL', min: 0, unit });

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

export const CONTEXT_CAPTURE_DEFINITIONS = [...definitions.values()];

export function getCaptureDefinition(captureKey: string): ContextCaptureDefinition {
  const definition = definitions.get(captureKey);
  if (!definition) throw new Error(`Property Context capture key is not registered: ${captureKey}`);
  return definition;
}

export function getCaptureDefinitionForFact(factKey: string): ContextCaptureDefinition | undefined {
  return CONTEXT_CAPTURE_DEFINITIONS.find((definition) => definition.factKeys.includes(factKey));
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
      if (!fact.writable) problems.push(`${definition.captureKey}: fact is not writable`);
      if (fact.canonicalOwner !== definition.canonicalOwner) problems.push(`${definition.captureKey}: canonical owner drift`);
    }
  }
  if (problems.length) throw new Error(`Invalid Property Context capture registry:\n${problems.join('\n')}`);
}

validateCaptureRegistry();
