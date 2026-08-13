import type { SkillContextProviderDefinition } from './skillContext.contract';
import { maintenanceTaskContextProvider } from './maintenanceTaskContext.provider';

const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;

export function skillContextProviderKey(provider: { id: string; version: string }): string {
  return `${provider.id}@${provider.version}`;
}

export const SKILL_CONTEXT_PROVIDERS = Object.freeze({
  [skillContextProviderKey(maintenanceTaskContextProvider)]: maintenanceTaskContextProvider,
} satisfies Readonly<Record<string, SkillContextProviderDefinition>>);

export const REGISTERED_SKILL_CONTEXT_PROVIDER_REFS: ReadonlySet<string> = new Set(Object.keys(SKILL_CONTEXT_PROVIDERS));

export function getSkillContextProvider(id: string, version: string): SkillContextProviderDefinition | undefined {
  return SKILL_CONTEXT_PROVIDERS[skillContextProviderKey({ id, version })];
}

export function validateSkillContextProviderDefinitions(
  providers: Readonly<Record<string, SkillContextProviderDefinition>> = SKILL_CONTEXT_PROVIDERS,
): string[] {
  const issues: string[] = [];
  for (const [key, provider] of Object.entries(providers)) {
    if (key !== skillContextProviderKey(provider)) issues.push(`${key}: provider key mismatch`);
    if (!provider.id || !SEMVER_PATTERN.test(provider.version)) issues.push(`${key}: invalid provider identity or version`);
    if (!provider.canonicalOwner || !provider.description) issues.push(`${key}: missing canonical ownership metadata`);
    if (!provider.supportedOperations.length) issues.push(`${key}: no supported operations`);
    if (!Number.isInteger(provider.defaultTimeoutMs) || provider.defaultTimeoutMs <= 0) issues.push(`${key}: invalid timeout`);
    if (!Number.isInteger(provider.maxSerializedBytes) || provider.maxSerializedBytes <= 0) issues.push(`${key}: invalid byte limit`);
    if (typeof provider.load !== 'function') issues.push(`${key}: missing loader`);
  }
  return issues;
}
