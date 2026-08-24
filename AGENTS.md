## Graphify

This project has a knowledge graph at `graphify-out/` with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:

- For codebase questions, first run `graphify query "<question>"` when `graphify-out/graph.json` exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts.
- Dirty `graphify-out/` files are expected and are not a reason to skip Graphify. Only skip it when the task concerns stale or incorrect graph output, or the user explicitly says not to use it.
- Use `graphify-out/wiki/index.md` for broad navigation when it exists. Read `graphify-out/GRAPH_REPORT.md` only for broad architecture reviews or when query, path, and explain do not provide enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

## Requirements and ambiguity

- Before making or fixing code, identify and read the relevant FRD, implementation plan, architecture documentation, feature README files, and other related product documents.
- Use Graphify to locate requirements and trace the complete affected workflow when the relevant documents or code paths are not obvious.
- Documents may be stale. Cross-check them against the current implementation, database schema, API contracts, configuration, tests, and related documents. Neither documentation nor existing code is automatically authoritative.
- Do not invent missing requirements or silently choose between conflicting sources. If repository evidence resolves the issue, use the best-supported interpretation and report the evidence. If material ambiguity remains, especially around behavior, data, security, integrations, or architecture, ask the user before implementing.
- Update affected documentation when an approved implementation materially changes documented behavior.

## Database and implementation

- Prioritize correct, complete, seamless functionality over keeping existing tests unchanged.
- If functionality requires a database change, update the Prisma schema and all affected contracts, types, and services. Do not create database migration scripts; the user will create and run migrations.
- There are no real users or production user data. Do not avoid necessary schema or behavior changes solely for backward compatibility.
- Do not weaken security, authorization, data-integrity, or business-rule safeguards to simplify implementation or satisfy a test.

## Validation and rollout

- There is no development or test environment. Do not spend time finding, configuring, starting, or troubleshooting services, Docker containers, databases, seeded users, or browser-based test infrastructure.
- Validate primarily through requirements review, Graphify, code-path tracing, contract inspection, and careful code review. Run lightweight static checks only when already available and they require no environment setup.
- Do not treat unavailable runtime tests as a blocker. Report what was checked, what was not run, and never claim inspected functionality was executed.
- Do not add approval gates, gated releases, staged rollouts, pilot cohorts, canary logic, feature flags, manual release certification, or compatibility layers solely to protect nonexistent users. Add them only when explicitly required by the user or an authoritative product requirement.
- Preserve application-level authentication, authorization, security, data-integrity, consequential-action confirmation, and genuine business approval workflows. If it is unclear whether a gate is release machinery or required product behavior, ask the user.
