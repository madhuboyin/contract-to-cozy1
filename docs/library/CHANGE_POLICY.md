# Product requirement change policy

Use this checklist for every enhancement, behavior change, schema change, or retirement.

## Before implementation

1. Find the feature in [README.md](README.md) and read its flags.
2. Use [AUTHORITY.md](AUTHORITY.md) to identify the governing FRD, addendum, ADR, and domain rules.
3. Select requirement IDs from [requirements.csv](requirements.csv). If the source has `UNNUMBERED`, assign stable IDs in the source before implementation.
4. Resolve any conflict between the requirement, schema, contract, and current code. Record unresolved product decisions before coding.
5. Write acceptance criteria that cover the user-visible result, authorization, validation, failure behavior, data effects, and recovery.

## In the same change

1. Update the governing FRD when approved behavior changes. Do not use an implementation plan or audit to silently rewrite a requirement.
2. Update `requirement_status.csv` with the new status and evidence paths. Use `PARTIAL` when any acceptance criterion remains unmet.
3. Update ADRs for architecture decisions and `FLAGS.md` for newly discovered conflict or drift.
4. Regenerate the library and ledger:

```bash
python3 docs/library/tools/build_library.py
python3 docs/library/tools/build_requirements.py
python3 docs/library/tools/check_library.py
```

5. Update affected wiki pages when observable current behavior changes.

## Evidence rules

- `IMPLEMENTED_STATIC` requires current route/service/schema plus its reachable UI or job, as applicable.
- `VERIFIED_RUNTIME` additionally requires a focused test or executed behavior and the exact test/command in `notes`.
- A model, component, route, status document, or passing compile by itself does not prove end-to-end implementation.
- Evidence paths must exist. CI checks this and rejects stale generated artifacts or broken library links.
- If code and target requirements disagree, keep the requirement status `PARTIAL` or `UNVERIFIED` until product resolves the behavior.

## Review and retirement

- Product reviews intended behavior and precedence.
- Engineering reviews implementation evidence and technical constraints.
- Security/data reviewers approve changes to authorization, privacy, safety, audit, or consequential actions.
- Delete a source document only when a named successor preserves every still-relevant requirement or the removed content is explicitly classified as historical. Add a retirement banner first and keep the Git history reference in `FLAGS.md`.
