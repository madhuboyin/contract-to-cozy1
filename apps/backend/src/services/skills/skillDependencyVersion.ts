const VERSION_PATTERN = /^\d+\.\d+(?:\.\d+)?$/;
const COMPATIBLE_RANGE_PATTERN = /^\^(\d+\.\d+(?:\.\d+)?)$/;

interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
}

function parseVersion(version: string): ParsedVersion | null {
  if (!VERSION_PATTERN.test(version)) return null;
  const [major, minor, patch = 0] = version.split('.').map(Number);
  return { major, minor, patch };
}

function compareVersions(left: string, right: string): number {
  const a = parseVersion(left)!;
  const b = parseVersion(right)!;
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch || left.localeCompare(right);
}

export function isSupportedSkillDependencyVersionSpec(specification: string): boolean {
  return VERSION_PATTERN.test(specification) || COMPATIBLE_RANGE_PATTERN.test(specification);
}

/** Supports exact versions and conservative npm-style caret compatibility. */
export function selectSkillDependencyVersion(
  specification: string,
  availableVersions: readonly string[],
): string | null {
  const validVersions = [...new Set(availableVersions.filter((version) => VERSION_PATTERN.test(version)))];
  if (VERSION_PATTERN.test(specification)) return validVersions.includes(specification) ? specification : null;
  const match = specification.match(COMPATIBLE_RANGE_PATTERN);
  if (!match) return null;
  const minimum = parseVersion(match[1])!;
  const compatible = validVersions.filter((version) => {
    const candidate = parseVersion(version)!;
    if (compareVersions(version, match[1]) < 0) return false;
    if (minimum.major > 0) return candidate.major === minimum.major;
    if (minimum.minor > 0) return candidate.major === 0 && candidate.minor === minimum.minor;
    return candidate.major === 0 && candidate.minor === 0 && candidate.patch === minimum.patch;
  });
  return compatible.sort((left, right) => compareVersions(right, left))[0] ?? null;
}
