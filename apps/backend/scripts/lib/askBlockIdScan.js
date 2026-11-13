// Shared by the answer-contract manifest script and its test.
// Block ids are read from block-shaped objects only (`type: 'SUMMARY', id: 'x'` or `id: 'x', type: 'SUMMARY'`), so action, filter and option ids are not mistaken for blocks. Template ids keep their static prefix (`prefix*`).
const blockIds = (text) => {
  const found = new Set();
  const rx = [/\btype:\s*'([A-Z][A-Z_]+)'\s*,\s*id:\s*(?:'([a-z0-9][a-z0-9_.:-]*)'|`([a-z0-9][a-z0-9_.:-]*)\$\{)/g, /\bid:\s*(?:'([a-z0-9][a-z0-9_.:-]*)'|`([a-z0-9][a-z0-9_.:-]*)\$\{)\s*,\s*type:\s*'([A-Z][A-Z_]+)'/g];
  for (const m of text.matchAll(rx[0])) found.add(`${m[1]}:${m[2] ?? `${m[3]}*`}`);
  for (const m of text.matchAll(rx[1])) found.add(`${m[3]}:${m[4 - 3] ?? `${m[2]}*`}`);
  return [...found].sort();
};
module.exports = { blockIds };
