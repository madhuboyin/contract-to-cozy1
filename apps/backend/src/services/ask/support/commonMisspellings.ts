// Ask handler support: common misspellings and split words in home vocabulary. The deterministic routing rules read the message as typed, so
// "maintainence" or "neighbor hood" missed every rule (and the better-spelled sentence sometimes routed worse than the typo: review screenshots,
// 2026-11-07). A closed list, whole words only; anything not listed is left exactly as typed. Used for routing only, never for what is stored or shown.
const CORRECTIONS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\b(?:maintainence|maintanence|maintenence|maintainance|maintanance|maintenace|maintnance)\b/gi, 'maintenance'],
  [/\b(?:neigh?bou?r\s+hood|neighbou?rhood|neigborhood|neighbor-hood)\b/gi, 'neighborhood'],
  [/\bbed\s+room(s?)\b/gi, 'bedroom$1'],
  [/\bbath\s+room(s?)\b/gi, 'bathroom$1'],
  [/\bhouse\s+hold\b/gi, 'household'],
  [/\bhome\s+owner(s?)\b/gi, 'homeowner$1'],
  [/\b(?:insurence|insurrance|insuranse)\b/gi, 'insurance'],
  [/\bwarrenty\b/gi, 'warranty'],
  [/\b(?:refinace|refinence|refinanse)\b/gi, 'refinance'],
  [/\b(?:mortage|morgage|mortgege)\b/gi, 'mortgage'],
  [/\b(?:apliance|appliace|applience)(s?)\b/gi, 'appliance$1'],
  [/\bfurnance\b/gi, 'furnace'],
  [/\bthermastat\b/gi, 'thermostat'],
  [/\b(?:refridgerator|refrigarator|refrigerater)\b/gi, 'refrigerator'],
  [/\bcontracter(s?)\b/gi, 'contractor$1'],
];

export function correctKnownMisspellings(message: string): string {
  return CORRECTIONS.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), message);
}
