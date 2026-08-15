export type AskLanguageCode = string;
export type AskLanguageCertificationStatus = 'CERTIFIED' | 'CERTIFICATION_REQUIRED' | 'DISABLED';

export interface AskLanguageCertification {
  version: string;
  routingSuite: string;
  entitySuite: string;
  presentationSuite: string;
  trustSuite: string;
}

export interface AskLanguageRegistration {
  code: AskLanguageCode;
  displayName: string;
  status: AskLanguageCertificationStatus;
  normalizationContractVersion: string;
  presentationLocale: string;
  semanticIndexNamespace: string;
  certification: AskLanguageCertification | null;
}

export const ASK_DEFAULT_LANGUAGE = 'en';

const registrations: Readonly<Record<string, AskLanguageRegistration>> = Object.freeze({
  en: Object.freeze({
    code: 'en',
    displayName: 'English',
    status: 'CERTIFIED',
    normalizationContractVersion: 'en-normalization-1.0',
    presentationLocale: 'en-US',
    semanticIndexNamespace: 'ask-operations-en-v1',
    certification: Object.freeze({
      version: 'ask-en-certification-1.0',
      routingSuite: 'ask-operation-routing-en',
      entitySuite: 'ask-entity-resolution-en',
      presentationSuite: 'ask-presentation-en',
      trustSuite: 'ask-answer-trust-en',
    }),
  }),
});

export const ASK_LANGUAGE_REGISTRY = registrations;

export function getAskLanguageRegistration(language: AskLanguageCode): AskLanguageRegistration | null {
  return ASK_LANGUAGE_REGISTRY[language] ?? null;
}

export function requireCertifiedAskLanguage(language: AskLanguageCode): AskLanguageRegistration {
  const registration = getAskLanguageRegistration(language);
  if (!registration || registration.status !== 'CERTIFIED' || !registration.certification) {
    const error = new Error(`Ask language is not registered and certified: ${language}`);
    (error as Error & { code?: string }).code = 'ASK_LANGUAGE_NOT_CERTIFIED';
    throw error;
  }
  return registration;
}

export function validateAskLanguageRegistration(registration: AskLanguageRegistration): string[] {
  const issues: string[] = [];
  if (!/^[a-z]{2,3}(?:-[A-Z]{2})?$/.test(registration.code)) issues.push('invalid language code');
  if (!registration.displayName.trim()) issues.push('missing display name');
  if (!registration.normalizationContractVersion.trim()) issues.push('missing normalization contract version');
  if (!registration.presentationLocale.trim()) issues.push('missing presentation locale');
  if (!registration.semanticIndexNamespace.trim()) issues.push('missing semantic index namespace');
  if (registration.status === 'CERTIFIED') {
    if (!registration.certification) issues.push('certified language requires certification evidence');
    else {
      for (const [key, value] of Object.entries(registration.certification)) {
        if (!value.trim()) issues.push(`missing certification ${key}`);
      }
    }
  }
  if (registration.status !== 'CERTIFIED' && registration.certification) {
    issues.push('uncertified language cannot publish certification evidence');
  }
  return issues;
}

export function validateAskLanguageRegistry(): string[] {
  return Object.entries(ASK_LANGUAGE_REGISTRY).flatMap(([key, registration]) => {
    const issues = key === registration.code ? [] : ['registry key does not match language code'];
    return [...issues, ...validateAskLanguageRegistration(registration)].map((issue) => `${key}: ${issue}`);
  });
}
