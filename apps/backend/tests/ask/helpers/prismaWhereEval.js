// A small in-memory evaluator for the Prisma where shapes the Record collection readers emit, so cursors and filters are exercised
// against real predicate semantics instead of asserting on query text.
const cmp = (a, b) => {
  const x = a instanceof Date ? a.getTime() : a;
  const y = b instanceof Date ? b.getTime() : b;
  return x < y ? -1 : x > y ? 1 : 0;
};
const same = (a, b) => (a instanceof Date || b instanceof Date ? a?.getTime?.() === b?.getTime?.() : a === b);

function matchesField(value, condition) {
  if (condition === null) return value === null || value === undefined;
  if (condition instanceof Date || typeof condition !== 'object') return same(value, condition);
  return Object.entries(condition).every(([operator, operand]) => {
    switch (operator) {
      case 'gt': return value != null && cmp(value, operand) > 0;
      case 'lt': return value != null && cmp(value, operand) < 0;
      case 'lte': return value != null && cmp(value, operand) <= 0;
      case 'not': return operand === null ? value != null : !same(value, operand);
      case 'in': return operand.includes(value);
      case 'notIn': return !operand.includes(value);
      case 'has': return Array.isArray(value) && value.includes(operand);
      case 'contains': return value != null && String(value).toLowerCase().includes(String(operand).toLowerCase());
      case 'mode': return true;
      case 'some': return Array.isArray(value) && value.some((entry) => matches(entry, operand));
      case 'none': return !Array.isArray(value) || !value.some((entry) => matches(entry, operand));
      default: throw new Error(`Unsupported where operator: ${operator}`);
    }
  });
}

function matches(row, where) {
  return Object.entries(where).every(([key, condition]) => {
    if (key === 'AND') return [].concat(condition).every((clause) => matches(row, clause));
    if (key === 'OR') return condition.some((clause) => matches(row, clause));
    if (key === 'NOT') return ![].concat(condition).some((clause) => matches(row, clause));
    return matchesField(row[key], condition);
  });
}

module.exports = { matches, cmp };
