export const ASK_HOMEOWNER_INTERFACE_CONTRACT_VERSION = '1';

export interface ServiceBuildIdentity {
  version: string;
  revision: string | null;
  builtAt: string | null;
  askHomeownerInterfaceContractVersion: string;
}

type BuildEnvironment = Record<string, string | undefined>;

function firstNonEmpty(environment: BuildEnvironment, names: readonly string[]): string | null {
  for (const name of names) {
    const value = environment[name]?.trim();
    if (value) return value;
  }
  return null;
}

function normalizedTimestamp(value: string | null): string | null {
  if (!value) return null;
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? null : timestamp.toISOString();
}

export function resolveServiceBuildIdentity(
  environment: BuildEnvironment = process.env,
): ServiceBuildIdentity {
  return {
    version: firstNonEmpty(environment, ['APP_VERSION', 'npm_package_version']) ?? '1.0.0',
    revision: firstNonEmpty(environment, [
      'DEPLOYMENT_REVISION',
      'RENDER_GIT_COMMIT',
      'GIT_SHA',
      'SOURCE_VERSION',
    ]),
    builtAt: normalizedTimestamp(firstNonEmpty(environment, ['BUILD_TIMESTAMP', 'BUILD_TIME'])),
    askHomeownerInterfaceContractVersion: ASK_HOMEOWNER_INTERFACE_CONTRACT_VERSION,
  };
}
