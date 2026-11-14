// What a server-authored data-point launch (a model request-plan facet that became a composed component) may carry besides the point id (FR-DATA-15): an entity reference, and a short ALLOWLIST of parameters. Pure.
// Nothing here reaches a query: a hint is turned into words the ordinary point reader already understands (the item to name, the tax year to read), so it is matched against the home's own records under the caller's authorization
// exactly like typed text. Any parameter outside the allowlist is refused, never guessed, because a model-chosen key is not a reviewed filter (the raw-predicate path FR-DATA-15 forbids).
export type LaunchParameters = Readonly<Record<string, string | number | boolean | null>>;
export type LaunchHintOutcome = { readonly kind: 'OK'; readonly message: string } | { readonly kind: 'UNSUPPORTED'; readonly keys: readonly string[] };

const ENTITY_KEYS = new Set(['entity', 'item', 'itemname', 'name']);
const YEAR_KEYS = new Set(['taxyear', 'year']);
const norm = (key: string) => key.toLowerCase().replace(/[^a-z]/g, '');
/** A name the model gave for an item: letters, digits, spaces and hyphens only, bounded, so it can only ever act as a name to match. */
export const cleanEntityName = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const name = value.replace(/[^A-Za-z0-9 -]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  return name.length >= 2 ? name : null;
};
const mentions = (message: string, name: string) => ` ${message.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ')} `.includes(` ${name.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()} `);

/**
 * The message the point reader should read for a launch: the child's own clause, plus the entity the plan carried across facets ("when was it last serviced" for the furnace) and an allowlisted tax year, each added only
 * when the clause does not already say it. Null or empty values are ignored; an unknown key with a value makes the launch unsupported.
 */
export function applyLaunchHints(message: string, hints: { entityRef?: string | null; parameters?: LaunchParameters }): LaunchHintOutcome {
  let entity = cleanEntityName(hints.entityRef); let year: number | null = null; const unknown: string[] = [];
  for (const [key, value] of Object.entries(hints.parameters ?? {})) {
    if (value === null || value === '' || value === undefined) continue;
    const k = norm(key);
    if (ENTITY_KEYS.has(k)) { entity = entity ?? cleanEntityName(value); continue; }
    if (YEAR_KEYS.has(k)) { const n = Number(value); if (Number.isInteger(n) && n >= 2000 && n <= 2099) { year = n; continue; } }
    unknown.push(key);
  }
  if (unknown.length) return { kind: 'UNSUPPORTED', keys: unknown };
  let out = message.replace(/\?+\s*$/, '').trim();
  if (entity && !mentions(out, entity)) out = `${out} for my ${entity}`;
  if (year !== null && !new RegExp(`\\b${year}\\b`).test(out)) out = `${out} for ${year}`;
  return { kind: 'OK', message: out === message.replace(/\?+\s*$/, '').trim() ? message : `${out}?` };
}
