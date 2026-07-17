'use client';

import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/lib/api/client';

export type PropertyContextDecision = {
  status: 'APPLICABLE' | 'NOT_APPLICABLE' | 'UNKNOWN';
  reasonCodes: string[];
  usedFactKeys: string[];
  missingFactKeys: string[];
  conflictedFactKeys: string[];
  validUntil: string | null;
  correctionPaths?: string[];
};

export type PropertyContextEnvelope = {
  contextVersion: string;
  generatedContextVersion?: string | null;
  isStale?: boolean;
  decision: PropertyContextDecision;
  reconciliation?: {
    status: 'CURRENT' | 'REVIEW_REQUIRED';
    requiresReview: boolean;
    contextVersion?: string;
    reasonCodes: string[];
    affectedOutputs?: Array<{ factKey: string; outputType: string; count: number }>;
  };
};

function label(value: string) {
  return value.toLowerCase().replace(/_/g, ' ').replace(/^./, (character) => character.toUpperCase());
}

type CaptureQuestion = { prompt: string; options: Array<{ label: string; value: unknown }> };

const enumOptions = (values: string[]) => values.map((value) => ({ label: label(value), value }));
const yesNoOptions = [{ label: 'Yes', value: true }, { label: 'No', value: false }];
const responsibilityOptions = enumOptions(['OWNER', 'ASSOCIATION', 'LANDLORD', 'SHARED', 'UNKNOWN']);
const CAPTURE_QUESTIONS: Record<string, CaptureQuestion> = {
  'core.dwellingType': { prompt: 'What kind of home is this?', options: enumOptions(['DETACHED_SINGLE_FAMILY', 'ATTACHED_SINGLE_FAMILY', 'TOWNHOUSE', 'CONDO_UNIT', 'APARTMENT_UNIT', 'DUPLEX', 'MULTI_FAMILY', 'MANUFACTURED_HOME', 'OTHER', 'UNKNOWN']) },
  'core.ownershipForm': { prompt: 'How is the property owned?', options: enumOptions(['FEE_SIMPLE', 'CONDOMINIUM', 'COOPERATIVE', 'LEASEHOLD', 'OTHER', 'UNKNOWN']) },
  'core.propertyUse': { prompt: 'How is this property used?', options: enumOptions(['PRIMARY_RESIDENCE', 'SECOND_HOME', 'LONG_TERM_RENTAL', 'SHORT_TERM_RENTAL', 'VACANT', 'UNDER_RENOVATION', 'FOR_SALE', 'OTHER', 'UNKNOWN']) },
  'core.occupancyStatus': { prompt: 'Who currently occupies it?', options: enumOptions(['OWNER_OCCUPIED', 'TENANT_OCCUPIED', 'FAMILY_OCCUPIED', 'MIXED', 'VACANT', 'UNKNOWN']) },
  'systems.heatingType': { prompt: 'What is the main heating system?', options: enumOptions(['HVAC', 'FURNACE', 'HEAT_PUMP', 'RADIATORS', 'UNKNOWN']) },
  'systems.coolingType': { prompt: 'What is the main cooling system?', options: enumOptions(['CENTRAL_AC', 'WINDOW_AC', 'UNKNOWN']) },
  'systems.waterHeaterType': { prompt: 'What kind of water heater is installed?', options: enumOptions(['TANK', 'TANKLESS', 'HEAT_PUMP', 'SOLAR', 'UNKNOWN']) },
  'exterior.hasPrivateOutdoorSpace': { prompt: 'Does this home have private outdoor space?', options: yesNoOptions },
  'exterior.hasLawn': { prompt: 'Does this home have a lawn?', options: yesNoOptions },
  'exterior.hasTreesOrShrubs': { prompt: 'Are there trees or shrubs to maintain?', options: yesNoOptions },
  'exterior.hasDriveway': { prompt: 'Does this home have a driveway?', options: yesNoOptions },
  'safety.hasSmokeDetectors': { prompt: 'Are smoke detectors installed?', options: yesNoOptions },
  'safety.hasCoDetectors': { prompt: 'Are carbon-monoxide detectors installed?', options: yesNoOptions },
};

function captureQuestionFor(factKey: string): CaptureQuestion | undefined {
  if (factKey.startsWith('responsibility.')) {
    return { prompt: `Who is responsible for ${label(factKey.replace('responsibility.', ''))}?`, options: responsibilityOptions };
  }
  return CAPTURE_QUESTIONS[factKey];
}

export function PropertyContextNotice({
  context,
  title = 'Property context',
}: {
  context?: PropertyContextEnvelope | null;
  title?: string;
}) {
  const [saving, setSaving] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  if (!context) return null;
  const needsAttention = context.isStale || context.decision.status !== 'APPLICABLE';
  const paths = context.decision.correctionPaths ?? [];
  const propertyId = paths.map((path) => path.match(/\/dashboard\/properties\/([^/]+)/)?.[1]).find(Boolean);
  const captureFactKey = propertyId
    ? context.decision.missingFactKeys.find((factKey) => Boolean(captureQuestionFor(factKey)))
    : undefined;
  const question = captureFactKey ? captureQuestionFor(captureFactKey) : undefined;

  const capture = async (value: unknown) => {
    if (!propertyId || !captureFactKey) return;
    setSaving(true);
    setCaptureError(null);
    try {
      const response = await api.capturePropertyContextFact(propertyId, captureFactKey, value);
      if (!response.success) throw new Error(response.message || 'Could not save this detail.');
      window.location.reload();
    } catch (error) {
      setCaptureError(error instanceof Error ? error.message : 'Could not save this detail.');
      setSaving(false);
    }
  };

  return (
    <div className={`rounded-2xl border p-4 text-sm ${needsAttention ? 'border-amber-200 bg-amber-50 text-amber-950' : 'border-slate-200 bg-slate-50 text-slate-800'}`}>
      <p className="font-semibold">{context.isStale ? `${title} changed` : title}</p>
      <p className="mt-1">
        {context.isStale
          ? 'This result was generated from an older property context. Refresh or rerun it before acting.'
          : context.decision.reasonCodes.map(label).join(' · ')}
      </p>
      {(context.decision.missingFactKeys.length > 0 || context.decision.conflictedFactKeys.length > 0) ? (
        <p className="mt-1 text-xs opacity-80">
          {[...context.decision.missingFactKeys, ...context.decision.conflictedFactKeys].map(label).join(' · ')}
        </p>
      ) : null}
      {question ? (
        <div className="mt-3 rounded-xl border border-amber-200/80 bg-white/70 p-3">
          <p className="font-medium">{question.prompt}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {question.options.map((option) => (
              <button
                key={String(option.value)}
                type="button"
                disabled={saving}
                onClick={() => capture(option.value)}
                className="rounded-full border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-amber-100 disabled:opacity-50"
              >
                {option.label}
              </button>
            ))}
          </div>
          {captureError ? <p className="mt-2 text-xs text-red-700">{captureError}</p> : null}
        </div>
      ) : null}
      {paths.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-3">
          {paths.map((path, index) => (
            <Link key={`${path}-${index}`} href={path} className="font-medium underline underline-offset-2">
              Correct property details{paths.length > 1 ? ` ${index + 1}` : ''}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
