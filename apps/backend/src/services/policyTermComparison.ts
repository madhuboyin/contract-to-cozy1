export const OBSERVED_POLICY_CHANGE_KEYS = [
  'ANNUAL_PREMIUM',
  'ALL_PERIL_DEDUCTIBLE',
  'DWELLING_LIMIT',
  'PERSONAL_PROPERTY_LIMIT',
  'LIABILITY_LIMIT',
  'POLICY_FORM',
  'VALUATION_BASIS',
  'ENDORSEMENTS',
] as const;

export type ObservedPolicyChangeKey = (typeof OBSERVED_POLICY_CHANGE_KEYS)[number];

export type ComparablePolicyFact = {
  id: string;
  factKey: string;
  valueType: string;
  amountValue: number | null;
  textValue: string | null;
  booleanValue: boolean | null;
  jsonValue: unknown;
  currency: string | null;
  confirmationStatus: string;
  sourceDocumentId: string | null;
  sourcePage: number | null;
  extractionMethod: string;
  confirmedAt: Date | null;
};

export type ComparablePolicyTerm = {
  id: string;
  insurancePolicyId: string;
  termStart: Date | null;
  termEnd: Date | null;
  verificationStatus: string;
  sourceDocumentId: string | null;
  facts: ComparablePolicyFact[];
};

export type ObservedPolicyTermChange = {
  changeKey: ObservedPolicyChangeKey;
  category: 'PREMIUM' | 'DEDUCTIBLE' | 'LIMIT' | 'ENDORSEMENT' | 'FORM';
  oldValue: Record<string, unknown>;
  newValue: Record<string, unknown>;
  sourceEvidence: {
    from: Record<string, unknown>;
    to: Record<string, unknown>;
  };
};

function categoryFor(key: ObservedPolicyChangeKey): ObservedPolicyTermChange['category'] {
  if (key === 'ANNUAL_PREMIUM') return 'PREMIUM';
  if (key === 'ALL_PERIL_DEDUCTIBLE') return 'DEDUCTIBLE';
  if (key === 'ENDORSEMENTS') return 'ENDORSEMENT';
  if (key === 'POLICY_FORM' || key === 'VALUATION_BASIS') return 'FORM';
  return 'LIMIT';
}

function valueSnapshot(fact: ComparablePolicyFact): Record<string, unknown> {
  if (fact.valueType === 'AMOUNT') {
    return {
      valueType: 'AMOUNT',
      amountValue: fact.amountValue,
      currency: fact.currency ?? 'USD',
    };
  }
  if (fact.valueType === 'BOOLEAN') {
    return { valueType: 'BOOLEAN', booleanValue: fact.booleanValue };
  }
  if (fact.valueType === 'JSON') {
    return { valueType: 'JSON', jsonValue: fact.jsonValue };
  }
  return { valueType: 'TEXT', textValue: fact.textValue };
}

function evidenceSnapshot(term: ComparablePolicyTerm, fact: ComparablePolicyFact) {
  return {
    policyTermId: term.id,
    factId: fact.id,
    confirmationStatus: fact.confirmationStatus,
    confirmedAt: fact.confirmedAt?.toISOString() ?? null,
    sourceDocumentId: fact.sourceDocumentId ?? term.sourceDocumentId,
    sourcePage: fact.sourcePage,
    extractionMethod: fact.extractionMethod,
  };
}

export function compareVerifiedPolicyTerms(
  fromTerm: ComparablePolicyTerm,
  toTerm: ComparablePolicyTerm
): ObservedPolicyTermChange[] {
  if (
    fromTerm.insurancePolicyId !== toTerm.insurancePolicyId ||
    fromTerm.verificationStatus !== 'VERIFIED' ||
    toTerm.verificationStatus !== 'VERIFIED'
  ) {
    return [];
  }

  const fromFacts = new Map(
    fromTerm.facts
      .filter((fact) => fact.confirmationStatus === 'CONFIRMED')
      .map((fact) => [fact.factKey, fact])
  );
  const toFacts = new Map(
    toTerm.facts
      .filter((fact) => fact.confirmationStatus === 'CONFIRMED')
      .map((fact) => [fact.factKey, fact])
  );

  return OBSERVED_POLICY_CHANGE_KEYS.flatMap((changeKey) => {
    const fromFact = fromFacts.get(changeKey);
    const toFact = toFacts.get(changeKey);
    // An absent value is unknown, not evidence that coverage was removed.
    if (!fromFact || !toFact) return [];
    const oldValue = valueSnapshot(fromFact);
    const newValue = valueSnapshot(toFact);
    if (JSON.stringify(oldValue) === JSON.stringify(newValue)) return [];

    return [{
      changeKey,
      category: categoryFor(changeKey),
      oldValue,
      newValue,
      sourceEvidence: {
        from: evidenceSnapshot(fromTerm, fromFact),
        to: evidenceSnapshot(toTerm, toFact),
      },
    }];
  });
}
