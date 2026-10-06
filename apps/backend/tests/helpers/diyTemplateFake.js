// A database-free stand-in for the DIY template and revision tables, shared by the revision-service and lifecycle tests. It is NOT Postgres. What
// it does model, because the code under test relies on it: the (templateId, revision) unique key (P2002), `where` equality/null/in/not-null,
// conditional updateMany counts, and TRANSACTIONS that serialize like row locks under READ COMMITTED (a second transaction waits for the first to
// commit, then re-evaluates its conditional writes against the committed state) and roll everything back on a throw. It records every write.

const matches = (record, where = {}) => Object.entries(where).every(([key, value]) => {
  if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
    if ('in' in value) return value.in.includes(record[key]);
    if ('not' in value) return value.not === null ? record[key] != null : record[key] !== value.not;
  }
  return value === null ? record[key] == null : record[key] === value;
});

const pickKeys = (record, select) => Object.fromEntries(Object.keys(select).filter((key) => select[key]).map((key) => [key, record[key]]));

function makeDiyDb(templateSeeds = [], hooks = {}) {
  const state = { templates: new Map(), revisions: [], writes: [] };
  for (const seed of templateSeeds) {
    state.templates.set(seed.id, structuredClone({
      status: 'DRAFT', approvedBy: null, approvedAt: null, publishedRevisionId: null, featuredOrder: null, geminiPromptHint: null,
      steps: [], materials: [], tools: [], ...seed,
    }));
  }
  let revisionSeq = 1; let childSeq = 1;
  const fail = (name) => { if (hooks.fail && hooks.fail(name)) throw new Error(`injected failure at ${name}`); };

  const templateView = (template, { select, include } = {}) => {
    if (!template) return null;
    const { steps, materials, tools, ...row } = structuredClone(template);
    if (select) return pickKeys(row, select);
    return include ? { ...row, steps: include.steps ? steps : undefined, materials: include.materials ? materials : undefined, tools: include.tools ? tools : undefined } : row;
  };
  const children = (name) => ({
    async deleteMany({ where }) { fail(`${name}.deleteMany`); const t = state.templates.get(where.templateId); const count = t[name].length; t[name] = []; return { count }; },
    async createMany({ data }) {
      fail(`${name}.createMany`);
      const t = state.templates.get(data[0].templateId);
      data.forEach((row) => t[name].push({ id: `${name}-${childSeq++}`, ...structuredClone(row) }));
      return { count: data.length };
    },
  });

  const db = {
    state,
    diyProjectTemplate: {
      async findUnique({ where, select, include }) { return templateView(state.templates.get(where.id), { select, include }); },
      async findMany({ where, select }) {
        return [...state.templates.values()].filter((row) => matches(row, where)).map((row) => (select ? pickKeys(structuredClone(row), select) : templateView(row)));
      },
      async count({ where }) { return [...state.templates.values()].filter((row) => matches(row, where)).length; },
      async update({ where, data }) {
        fail('template.update');
        const row = state.templates.get(where.id);
        if (!row) { const error = new Error('Record not found'); error.code = 'P2025'; throw error; }
        state.writes.push({ model: 'template', op: 'update', where, data });
        Object.assign(row, structuredClone(data));
        return templateView(row);
      },
      async updateMany({ where, data }) {
        state.writes.push({ model: 'template', op: 'updateMany', where, data });
        if (hooks.beforeTemplateUpdate) await hooks.beforeTemplateUpdate(state);
        fail('template.updateMany');
        const rows = [...state.templates.values()].filter((row) => matches(row, where));
        rows.forEach((row) => Object.assign(row, structuredClone(data)));
        return { count: rows.length };
      },
    },
    diyTemplateStep: children('steps'),
    diyTemplateMaterial: children('materials'),
    diyTemplateTool: children('tools'),
    diyTemplateRevision: {
      async findFirst({ where, orderBy, select }) {
        let rows = state.revisions.filter((row) => matches(row, where));
        if (orderBy?.revision === 'desc') rows = [...rows].sort((a, b) => b.revision - a.revision);
        if (!rows[0]) return null;
        return select ? pickKeys(structuredClone(rows[0]), select) : structuredClone(rows[0]);
      },
      async create({ data }) {
        if (hooks.barrier) await hooks.barrier();
        fail('revision.create');
        if (state.revisions.some((row) => row.templateId === data.templateId && row.revision === data.revision)) {
          const error = new Error('Unique constraint failed'); error.code = 'P2002'; throw error;
        }
        const row = {
          id: `rev-${revisionSeq++}`, provenance: 'GOVERNED', approvedBy: null, approvedAt: null, publishedBy: null, publishedAt: null,
          returnedAt: null, retiredAt: null, retiredReason: null, ...structuredClone(data),
        };
        state.revisions.push(row);
        state.writes.push({ model: 'revision', op: 'create', data: Object.keys(data) });
        return structuredClone(row);
      },
      async updateMany({ where, data }) {
        state.writes.push({ model: 'revision', op: 'updateMany', where, dataKeys: Object.keys(data) });
        fail('revision.updateMany');
        const rows = state.revisions.filter((row) => matches(row, where));
        rows.forEach((row) => Object.assign(row, structuredClone(data)));
        return { count: rows.length };
      },
    },
    // Serialized like row locks, all-or-nothing like a transaction.
    async $transaction(work) {
      const previous = db.__tail;
      let release; db.__tail = new Promise((resolve) => { release = resolve; });
      await previous;
      const snapshot = structuredClone({ templates: [...state.templates], revisions: state.revisions });
      try {
        return await work(db);
      } catch (error) {
        state.templates = new Map(snapshot.templates);
        state.revisions = snapshot.revisions;
        throw error;
      } finally {
        release();
      }
    },
    __tail: Promise.resolve(),
  };
  return db;
}

module.exports = { makeDiyDb, matches };
