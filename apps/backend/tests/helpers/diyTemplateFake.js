// A database-free stand-in for the DIY template and revision tables, shared by the revision-service and lifecycle tests. It is NOT Postgres. What
// it does model, because the code under test relies on it: the (templateId, revision) unique key (P2002), `where` equality/null/in/not-null,
// conditional updateMany counts, and TRANSACTIONS that serialize like row locks under READ COMMITTED (a second transaction waits for the first to
// commit, then re-evaluates its conditional writes against the committed state) and roll everything back on a throw. It records every write.

const isOperator = (value) => value !== null && typeof value === 'object' && !(value instanceof Date) && !Array.isArray(value);

// Supports the Prisma where forms the DIY code uses: equality, null, in, not, contains (case-insensitive), has, is / isNot (to-one relations), OR, AND.
const matches = (record, where = {}) => Object.entries(where).every(([key, value]) => {
  if (key === 'OR') return value.some((clause) => matches(record, clause));
  if (key === 'AND') return value.every((clause) => matches(record, clause));
  if (isOperator(value)) {
    if ('is' in value) return record[key] != null && matches(record[key], value.is);
    if ('isNot' in value) return value.isNot === null ? record[key] != null : !(record[key] != null && matches(record[key], value.isNot));
    if ('in' in value) return value.in.includes(record[key]);
    if ('not' in value) return value.not === null ? record[key] != null : record[key] !== value.not;
    if ('contains' in value) return String(record[key] ?? '').toLowerCase().includes(String(value.contains).toLowerCase());
    if ('has' in value) return Array.isArray(record[key]) && record[key].includes(value.has);
    return record[key] != null && matches(record[key], value); // a nested relation filter, e.g. project: { propertyId }
  }
  if (value instanceof Date) return record[key] instanceof Date && record[key].getTime() === value.getTime();
  return value === null ? record[key] == null : record[key] === value;
});

const pickKeys = (record, select) => Object.fromEntries(Object.keys(select).filter((key) => select[key]).map((key) => [key, record[key]]));

function makeDiyDb(templateSeeds = [], hooks = {}) {
  const state = { templates: new Map(), revisions: [], writes: [], projects: [], events: [], domainEvents: [], uncommittedProjects: new Set(), txDepth: 0 };
  for (const seed of templateSeeds) {
    state.templates.set(seed.id, structuredClone({
      status: 'DRAFT', approvedBy: null, approvedAt: null, publishedRevisionId: null, featuredOrder: null, geminiPromptHint: null,
      steps: [], materials: [], tools: [], ...seed,
    }));
  }
  let revisionSeq = 1; let childSeq = 1;
  const fail = (name) => { if (hooks.fail && hooks.fail(name)) throw new Error(`injected failure at ${name}`); };

  // A template with its published head attached, so relation filters, orderings and includes can be evaluated.
  const joined = (template) => ({ ...template, publishedRevision: state.revisions.find((row) => row.id === template.publishedRevisionId) ?? null });
  const valueAt = (record, pathOrObject) => {
    const [key, rest] = Object.entries(pathOrObject)[0];
    return typeof rest === 'string' ? record?.[key] : valueAt(record?.[key], rest);
  };
  const directionOf = (orderBy) => { const [, rest] = Object.entries(orderBy)[0]; return typeof rest === 'string' ? rest : directionOf(rest); };
  const queryTemplates = ({ where, orderBy, take, cursor, skip, select, include } = {}) => {
    let rows = [...state.templates.values()].map(joined).filter((row) => matches(row, where));
    if (orderBy) {
      const dir = directionOf(orderBy) === 'desc' ? -1 : 1;
      rows = [...rows].sort((a, b) => {
        const x = valueAt(a, orderBy); const y = valueAt(b, orderBy);
        return x === y ? 0 : (x == null ? 1 : y == null ? -1 : (x < y ? -1 : 1) * dir);
      });
    }
    if (cursor) { const at = rows.findIndex((row) => row.id === cursor.id); rows = rows.slice(at < 0 ? 0 : at + (skip ?? 0)); }
    if (take !== undefined) rows = rows.slice(0, take);
    return rows.map((row) => (select ? pickKeys(structuredClone(row), select) : templateView(row, { include })));
  };

  const templateView = (template, { select, include } = {}) => {
    if (!template) return null;
    const { steps, materials, tools, ...row } = structuredClone(template);
    if (select) return pickKeys(row, select);
    const head = state.revisions.find((revision) => revision.id === template.publishedRevisionId);
    const out = { ...row };
    delete out.publishedRevision;
    if (include?.publishedRevision) {
      const spec = include.publishedRevision;
      out.publishedRevision = head ? (spec && typeof spec === 'object' && spec.select ? pickKeys(structuredClone(head), spec.select) : structuredClone(head)) : null;
    }
    if (include?._count) out._count = Object.fromEntries(Object.keys(include._count.select).map((key) => [key, (template[key] ?? []).length]));
    return include ? { ...out, steps: include.steps ? steps : undefined, materials: include.materials ? materials : undefined, tools: include.tools ? tools : undefined } : out;
  };
  // A project row created inside an open transaction is visible through the transaction client only, never through the global client, until the
  // transaction commits (what Postgres does under READ COMMITTED). `seesUncommitted` is true for the transaction client.
  const stamp = () => new Date(Date.now());
  const visible = (seesUncommitted) => (project) => seesUncommitted || !state.uncommittedProjects.has(project.id);
  function projectDelegate(seesUncommitted) {
    const see = visible(seesUncommitted);
    return {
      async create({ data }) {
        fail('project.create');
        const project = { id: `project-${state.projects.length + 1}`, steps: [], materials: [], tools: [], aiGuide: null, updatedAt: stamp(), createdAt: stamp(), ...structuredClone(data) };
        state.projects.push(project);
        if (state.txDepth > 0) state.uncommittedProjects.add(project.id);
        state.writes.push({ model: 'project', op: 'create', data: structuredClone(data) });
        return structuredClone(project);
      },
      async findFirst({ where, select }) {
        const row = state.projects.find((project) => matches(project, where) && see(project));
        if (!row) return null;
        return select ? pickKeys(structuredClone(row), select) : structuredClone(row);
      },
      async findUnique({ where }) { const row = state.projects.find((project) => project.id === where.id && see(project)); return row ? structuredClone(row) : null; },
      async updateMany({ where, data }) {
        state.writes.push({ model: 'project', op: 'updateMany', where, dataKeys: Object.keys(data) });
        fail('project.updateMany');
        const rows = state.projects.filter((project) => matches(project, where) && see(project));
        rows.forEach((row) => Object.assign(row, structuredClone(data), { updatedAt: data.updatedAt ?? stamp() }));
        return { count: rows.length };
      },
      async update({ where, data }) {
        state.writes.push({ model: 'project', op: 'update', dataKeys: Object.keys(data) });
        fail('project.update');
        const row = state.projects.find((project) => project.id === where.id);
        if (!row) { const error = new Error('Record not found'); error.code = 'P2025'; throw error; }
        Object.assign(row, structuredClone(data), { updatedAt: data.updatedAt ?? stamp() });
        return structuredClone(row);
      },
    };
  }
  const stepRecords = () => state.projects.flatMap((project) => project.steps.map((step) => ({ step, project })));
  const joinedStep = ({ step, project }) => ({ ...step, projectId: project.id, project: { id: project.id, propertyId: project.propertyId, status: project.status } });
  const projectStepDelegate = {
    async createMany({ data }) {
      fail('project.steps.createMany');
      const project = state.projects.find((row) => row.id === data[0]?.projectId);
      if (project) data.forEach((row) => project.steps.push({ id: `steps-${childSeq++}`, status: 'PENDING', notes: null, completedAt: null, completedByUserId: null, updatedAt: stamp(), ...structuredClone(row) }));
      return { count: data.length };
    },
    async findFirst({ where }) {
      const hit = stepRecords().find((record) => matches(joinedStep(record), where));
      return hit ? structuredClone(joinedStep(hit)) : null;
    },
    async findMany({ where, orderBy, select }) {
      let rows = stepRecords().filter((record) => matches(joinedStep(record), where)).map(joinedStep);
      if (orderBy?.stepNumber === 'asc') rows = [...rows].sort((a, b) => a.stepNumber - b.stepNumber);
      return rows.map((row) => (select ? pickKeys(structuredClone(row), select) : structuredClone(row)));
    },
    async updateMany({ where, data }) {
      state.writes.push({ model: 'step', op: 'updateMany', where, dataKeys: Object.keys(data) });
      fail('step.updateMany');
      const hits = stepRecords().filter((record) => matches(joinedStep(record), where));
      hits.forEach(({ step }) => Object.assign(step, structuredClone(data), { updatedAt: data.updatedAt ?? stamp() }));
      return { count: hits.length };
    },
  };
  const projectEventDelegate = {
    async create({ data }) {
      fail('event.create');
      const row = { id: `event-${state.events.length + 1}`, at: stamp(), ...structuredClone(data) };
      state.events.push(row);
      return structuredClone(row);
    },
  };
  // Household access: `hooks.role(userId, propertyId)` returns 'VIEWER' | 'CONTRIBUTOR' | 'OWNER' or null (no access). Default: everyone is a CONTRIBUTOR.
  const roleOf = (userId, propertyId) => (hooks.role ? hooks.role(userId, propertyId) : 'CONTRIBUTOR');
  const householdMemberDelegate = {
    async findUnique({ where }) { const role = roleOf(where.propertyId_userId.userId, where.propertyId_userId.propertyId); return role ? { role } : null; },
  };
  const propertyDelegate = { async findFirst() { return null; } };
  // Maintenance tasks, only for the link check at project creation: `hooks.tasks` is [{ id, propertyId }].
  const maintenanceTaskDelegate = { async findFirst({ where }) { const row = (hooks.tasks ?? []).find((task) => matches(task, where)); return row ? { id: row.id } : null; } };
  // The outbox: unique idempotencyKey (P2002), recorded in `state.domainEvents`, rolled back with the transaction.
  const domainEventDelegate = {
    async findUnique({ where, select }) { const row = state.domainEvents.find((event) => event.idempotencyKey === where.idempotencyKey); return row ? (select ? pickKeys(structuredClone(row), select) : structuredClone(row)) : null; },
    async updateMany({ where, data }) {
      state.writes.push({ model: 'domainEvent', op: 'updateMany', where, dataKeys: Object.keys(data) });
      fail('domainEvent.updateMany');
      const rows = state.domainEvents.filter((event) => matches(event, where));
      rows.forEach((row) => Object.assign(row, structuredClone(data), { updatedAt: new Date(Math.max(Date.now(), (row.updatedAt?.getTime() ?? 0) + 1)) }));
      return { count: rows.length };
    },
    async create({ data }) {
      fail('domainEvent.create');
      if (data.idempotencyKey && state.domainEvents.some((event) => event.idempotencyKey === data.idempotencyKey)) { const error = new Error('Unique constraint failed'); error.code = 'P2002'; throw error; }
      const row = { id: `domain-event-${state.domainEvents.length + 1}`, status: 'PENDING', attempts: 0, updatedAt: stamp(), ...structuredClone(data) };
      state.domainEvents.push(row);
      return structuredClone(row);
    },
  };
  const projectChildren = (name) => ({
    async createMany({ data }) {
      fail(`project.${name}.createMany`);
      const project = state.projects.find((row) => row.id === data[0]?.projectId);
      if (project) data.forEach((row) => project[name].push({ id: `${name}-${childSeq++}`, ...structuredClone(row) }));
      return { count: data.length };
    },
  });
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
      async findMany(args) { return queryTemplates(args); },
      async findFirst(args) { return queryTemplates({ ...args, take: 1 })[0] ?? null; },
      async count({ where }) { return [...state.templates.values()].map(joined).filter((row) => matches(row, where)).length; },
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
    diySkillProfile: { async findUnique() { return hooks.skillProfile ?? null; } },
    diyProject: projectDelegate(false),
    diyProjectStep: projectStepDelegate,
    diyProjectEvent: projectEventDelegate,
    householdMember: householdMemberDelegate,
    property: propertyDelegate,
    propertyMaintenanceTask: maintenanceTaskDelegate,
    domainEvent: domainEventDelegate,
    diyProjectMaterial: projectChildren('materials'),
    diyProjectTool: projectChildren('tools'),
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
      const snapshot = structuredClone({ templates: [...state.templates], revisions: state.revisions, projects: state.projects, events: state.events, domainEvents: state.domainEvents });
      const tx = { ...db, diyProject: projectDelegate(true) };
      state.txDepth += 1;
      try {
        const result = await work(tx);
        state.uncommittedProjects.clear(); // commit
        return result;
      } catch (error) {
        state.templates = new Map(snapshot.templates);
        state.revisions = snapshot.revisions;
        state.projects = snapshot.projects;
        state.events = snapshot.events;
        state.domainEvents = snapshot.domainEvents;
        state.uncommittedProjects.clear();
        throw error;
      } finally {
        state.txDepth -= 1;
        release();
      }
    },
    __tail: Promise.resolve(),
  };
  return db;
}

module.exports = { makeDiyDb, matches };
