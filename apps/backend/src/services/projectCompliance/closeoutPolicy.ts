export const CLOSEOUT_DECLARATION_CATEGORIES = [
  'PUNCH_LIST',
  'CORRECTIONS',
  'LIEN_WAIVER',
  'PAYMENT',
  'WARRANTY',
  'COMMISSIONING',
  'SAFETY',
  'INSPECTION',
] as const;

export type CloseoutDeclarationCategory =
  typeof CLOSEOUT_DECLARATION_CATEGORIES[number];

export type CloseoutDeclarationDisposition =
  | 'SATISFIED'
  | 'NOT_APPLICABLE'
  | 'OPEN_EXCEPTION';

export type CloseoutDeclaration = {
  category: CloseoutDeclarationCategory;
  disposition: CloseoutDeclarationDisposition;
  evidenceDocumentIds: string[];
  notes: string;
  responsibleParty?: 'HOUSEHOLD' | 'CONTRACTOR' | 'SHARED' | 'AUTHORITY';
  dueAt?: string;
};

export type CloseoutChecklistItem = {
  key: string;
  label: string;
  applicability: 'REQUIRED' | 'NOT_APPLICABLE' | 'UNRESOLVED';
  status: 'SATISFIED' | 'NOT_APPLICABLE' | 'OPEN_EXCEPTION';
  passed: boolean;
  evidenceDocumentIds: string[];
  blockers: string[];
};

export function declarationToChecklistItem(
  declaration: CloseoutDeclaration,
): CloseoutChecklistItem {
  const notApplicable = declaration.disposition === 'NOT_APPLICABLE';
  const satisfied = declaration.disposition === 'SATISFIED';
  return {
    key: declaration.category.toLowerCase(),
    label: declaration.category.toLowerCase().replace(/_/g, ' '),
    applicability: notApplicable ? 'NOT_APPLICABLE' : 'REQUIRED',
    status: declaration.disposition,
    passed: satisfied || notApplicable,
    evidenceDocumentIds: declaration.evidenceDocumentIds,
    blockers: declaration.disposition === 'OPEN_EXCEPTION'
      ? [declaration.notes || `${declaration.category} remains unresolved.`]
      : [],
  };
}

export function validateCloseoutDeclarations(
  declarations: CloseoutDeclaration[],
  verifiedSuccess: boolean,
): { items: CloseoutChecklistItem[]; missingCategories: CloseoutDeclarationCategory[]; blockers: string[] } {
  const byCategory = new Map(declarations.map((item) => [item.category, item]));
  const missingCategories = CLOSEOUT_DECLARATION_CATEGORIES.filter(
    (category) => !byCategory.has(category),
  );
  const items = declarations.map(declarationToChecklistItem);
  const blockers = [
    ...(verifiedSuccess
      ? missingCategories.map((category) => `${category.toLowerCase().replace(/_/g, ' ')} applicability was not declared.`)
      : []),
    ...(verifiedSuccess
      ? items.flatMap((item) => item.passed ? [] : item.blockers)
      : []),
  ];
  return { items, missingCategories, blockers };
}

export function closeoutWriteBackKey(
  projectId: string,
  targetSystem: string,
  targetRecordId?: string | null,
): string {
  return `project-closeout:${projectId}:${targetSystem}:${targetRecordId ?? 'property'}`;
}

export function caseOutcomeForProjectOutcome(outcome: string): {
  lifecycle: 'VERIFIED_COMPLETE' | 'COMPLETED_WITH_OPEN_ITEMS';
  outcomeStatus: 'VERIFIED_SUCCESS' | 'COMPLETED_WITH_OPEN_ITEMS';
} {
  return outcome === 'VERIFIED_SUCCESS'
    ? { lifecycle: 'VERIFIED_COMPLETE', outcomeStatus: 'VERIFIED_SUCCESS' }
    : { lifecycle: 'COMPLETED_WITH_OPEN_ITEMS', outcomeStatus: 'COMPLETED_WITH_OPEN_ITEMS' };
}

export const VERIFIED_CLOSEOUT_REFRESH_TARGETS = [
  'DIGITAL_TWIN',
  'PROPERTY_TAX',
  'OWNERSHIP_COST',
  'CAPITAL_PLAN',
] as const;
