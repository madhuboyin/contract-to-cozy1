# Ask orchestrator decomposition: review, pilot and plan

**Date:** September 25, 2026 (updated the same day: the plan was carried out; see section 10)
**Subject:** `apps/backend/src/services/ask/askOrchestrator.service.ts`
**Governing docs:** `ASK_COZY_TARGET_PRODUCT_AND_ARCHITECTURE.md` §12 (the decomposition decision), `ASK_COZY_CONVERSATIONAL_ARCHITECTURE_AUDIT.md` (finding 1, "single-file orchestrator"), `AUDIT_METHODOLOGY.md` (applied below).

Each claim is labelled **Executed** (a command was run and its output read), **Code-traced** (read in the source, not run) or **Inferred** (extrapolated). Commands are given so a reader can reproduce the executed ones.

## 1. Summary

- The file has doubled since the audit that first called it too big, from about 10,150 lines to 20,639 (**Executed**: `wc -l`; the audit's figure is from that document).
- The earlier plan was to make the orchestrator a coordinator and move the handler bodies out (Target Architecture §12). Half of that has happened: the capability registry exists and 111 handlers register through it, but **every handler body still lives in the file**.
- The move is mechanical and low risk for production code, because almost nothing imports the file by value. The real cost is in the tests: 103 test files import from it and 40 read its source text.
- A pilot (Status Board, plus the shared formatters) moved 109 lines out with the full `tests/ask` suite unchanged (1,210 tests, 1,209 pass, 1 skipped, as before the pilot). It shows the approach works and what a phase costs.
- Recommendation: continue in slices of a handful of handlers, gated on typecheck and the chunked Ask suite, and keep the source-text tests working through one helper. Do it before the next round of new operations, since each new operation adds to the file.

## 2. What the file is made of (Executed)

Command: a script over the file's top-level declarations (`function`, `const`, `registerCapabilityHandler(`), measuring each from its line to the next declaration.

| Measure | Value |
|---|---|
| Lines | 20,639 (20,535 after the pilot) |
| Top-level declarations | 807 |
| Import statements | 187 |
| Exported names | 142 |
| `registerCapabilityHandler(` calls in the file | 112 before the pilot, 111 after |
| Functions or constants of 150+ lines | 16, totalling 4,493 lines |
| Functions or constants of 60+ lines | 96 |
| Read handlers and presentation builders (`…Result`, `…FromView`, block builders) | about 8,400 lines |
| Write flows (propose, confirm, capture, correct, update) | about 7,200 lines |
| Everything else (helpers, label tables, maps) | about 3,500 lines |
| Execution lifecycle | about 1,300 lines |

The line counts by category are a name-pattern estimate (**Inferred** for the exact split), not a measured ownership. The largest units are `submitAskCapture` (813 lines), `createAskExecution` (438), `confirmAskExecution` (402), `maintenanceResult` (343), `getConciergeHome` (340) and `propertySummaryResult` (295).

## 3. The earlier plan and what is done

**Code-traced** from the Target Architecture §12: the orchestrator keeps conversation state, routing, capability selection, response assembly of cross-cutting blocks, capture coordination and trust validation. It gives up execution coordination (to `capability.invoke`) and next-action generation (to `askNextActions.ts`). The file "should be decomposed ... rather than containing all of their logic inline", with "the ~40 handler function bodies" moving to skill packages.

Done, **Executed** (directory listing and counts): `capabilityHandlerRegistry.ts` and `confirmCapabilityHandlerRegistry.ts` exist; `askNextActions.ts`, the routing cascade, the trust validators, `conversationalUnderstanding/`, `decisionThreadPresentationBlocks.ts` and eight `ask*Intent.ts` and presentation modules are separate files.

Not done: the handler bodies. The registry comment in the file says a handler "whose body lives in its own file" can call `registerCapabilityHandler` directly, but none did before the pilot. The write flows and the execution lifecycle are also still inline.

## 4. What constrains the move

**Who imports the file by value (Executed):** `grep -rl askOrchestrator.service src`, then reading each hit. Three modules only: `src/index.ts` (a side-effect import that registers the handlers), `controllers/ask.controller.ts` (the lifecycle functions) and `decisionPlatform/homeActionProactiveDelivery.service.ts` (`createAskExecution`). The other hits are comments. So there are **no import cycles by value**.

**Tests (Executed):** `grep -rl "askOrchestrator.service" tests | wc -l` gives 103 files that import from it. `grep -rln "readFileSync(.*askOrchestrator" tests | wc -l` gives 40 files that read its **source text** and assert on it with regular expressions (for example that a function body calls a service, or that a block id sits next to a field). These fail when code moves, even if behaviour is identical.

**Test stubbing (Code-traced, confirmed by the pilot):** the tests replace service functions by assigning to the service module's export. That works from a new file too, because TypeScript compiles calls to `module_1.fn(...)`, looked up at call time.

**Registration order (Code-traced):** a handler registers when its file is imported. The orchestrator must import each handler file, and `src/index.ts` already imports the orchestrator.

**Earlier lessons (from the project notes):** a circular import in the Stage 3 work once deadlocked the file at load, so a new module must not import the orchestrator.

## 5. Pilot (Executed)

Moved out of the file:

- `askFormatting.ts`: `humanDate`, `money` and `readableCode`, which many handlers use.
- `handlers/statusBoard.handler.ts`: `statusBoardFromView`, `statusBoardMeta`, `statusBoardShelfFacts`, the constants, `homeStatusBoardResult` and its `registerCapabilityHandler('status-board.read', …)`.
- The orchestrator now imports the formatters and the handler file, and re-exports the handler's names, so no test import changed.

Results, all Executed:

- `npm run typecheck` clean.
- `npm run test:ask:chunked`: 1,210 tests, 1,209 pass, 0 fail, 1 skipped, the same as before the pilot.
- No source-text test broke, because none pinned the Status Board code.
- The full `npm run test:chunked` showed failures in `tests/unit` (tool capability and tool discovery tests) that do not import any file changed here; the one inspected expects a rollout-key environment setting. I did not compare them with a clean checkout, so treat "unrelated" as **Code-traced**, not proven.

What the pilot does not show: a phase that moves a handler whose source a test reads, or one with a large label table shared with another handler.

## 6. Target structure and phases

Target (**Inferred** as the natural reading of §12): the orchestrator becomes a coordinator of about 2,500 lines or fewer.

```
services/ask/
  askOrchestrator.service.ts        coordinator + re-exports
  askFormatting.ts                  shared formatters (done)
  handlers/<domain>/<name>.handler.ts   one read or write handler, self-registering
  presentation/<name>.ts            pure block builders (the display-pattern builders)
  execution/                        create, confirm, capture, clarification, concierge
```

| Phase | Move | Size (est.) | Gate |
|---|---|---|---|
| 0 (done) | Formatters, Status Board, the `handlers/` convention | 109 lines | typecheck, chunked Ask |
| 1 | The self-contained "capability card" read handlers (each `…FromView` plus its labels and registration): digital will, home habits, upgrade planner, do-nothing, price finalization, DIY, radar, and similar | about 4,000 lines in slices of 4 to 6 handlers | as phase 0, plus the tests that name the moved functions |
| 2 | Pure presentation builders added for the display patterns (strips, rings, shelf facts, track builders) | about 1,500 lines | as above |
| 3 | Write flows per domain, next to `confirmCapabilityHandlerRegistry.ts` | about 7,000 lines | as above, plus every confirm and idempotency test |
| 4 | Execution lifecycle split into `execution/`; `getConciergeHome` to its own service | about 1,300 lines | as above, plus the acceptance Playwright suite |

Rules for every slice: code moves unchanged (no edits inside a moved body), the orchestrator re-exports the moved names, and one commit moves one group.

## 7. Handling the 40 source-text tests

Options, in order of preference:

1. Add one test helper, `readAskOrchestratorSources()`, that returns the orchestrator's text plus the handler files' text, and switch the 40 tests to it. The regular expressions keep working wherever the code lives. This is a small, mechanical edit.
2. Where a test only pins a behaviour that can be run (as with the refinance scenario test, replaced in FRD v1.87 by a run over deliberately different inputs), replace the source check with a behavioural one as the code moves.
3. Do not weaken a test to make a move pass.

## 8. Risks

| Risk | Mitigation |
|---|---|
| A handler file imports the orchestrator and creates a cycle | Handler files import only services, contracts, the registry and `askFormatting`; a review check |
| A handler is never imported, so it never registers | The orchestrator imports every handler file; a test that lists the registry against `ASK_OPERATION_DEFINITIONS` (one exists for adapter keys) catches a missing one |
| Merge conflicts with concurrent work in the file | Small, single-purpose commits; check `git status` before and after (the working tree is shared) |
| Behaviour changes hidden in a "move" | Move only; diff the moved body against the original |
| Label tables shared by two handlers | Move to a shared module in the same slice, not by copy |

## 9. Recommendation

Proceed with phase 1 in slices. It is where most of the reduction is, it carries the least risk (self-contained read handlers), and it is also where new operations keep landing. After phase 1, the file drops by about a fifth; phases 2 to 4 bring it to the target.

This review did not run the full `test:chunked` against a clean checkout, did not measure how long the type check takes before and after, and did not move any handler whose source a test reads.

## 10. Result (Executed, September 25, 2026)

The phases in section 6 were carried out in ten slices, each gated on `npm run typecheck` and the chunked Ask suite (1,210 tests, 1,209 pass, 1 skipped, unchanged after every slice).

| Measure | Before | After |
|---|---|---|
| `askOrchestrator.service.ts` | 20,639 lines | about 100 lines: imports and re-exports only |
| Handler files (`handlers/*.handler.ts`) | 0 | 44, about 16,100 lines |
| Lifecycle files (`execution/*.ts`) | 0 | 8, about 4,100 lines |
| Shared support (`askHandlerSupport.ts`, `askFormatting.ts`) | 0 | about 1,300 lines |
| Names exported by the orchestrator | 142 | 142 (checked by loading the module against the list taken from the commit before the pilot) |
| Test files that read the source text | 40, reading one file | 41, reading `tests/helpers/askOrchestratorSources.js` (orchestrator, support, handlers, execution) |

How it was done: a script moved named top-level declarations unchanged, with a closure rule (a helper only the moved code uses moves with it; a helper shared with other code goes to `askHandlerSupport.ts`), then re-exported the moved names from the orchestrator. The scripts are not in the repository; the moves are in git history, one commit per slice.

**Layers.** `execution/executeOperation.ts` (dispatch, refresh and reconcile after a write) sits below the handlers and imports only the registry, so a write handler can import it without a cycle. The handlers import it and the support module. The lifecycle files (create, capture, clarification, confirm) import the handlers where they call one directly.

**Tests changed to survive the move, without weakening them:** two tests that pinned the order of code inside one file (a registration before the dispatch call; a function ending where the next one began) now check the registration exists and is imported, and end a function at its closing brace.

**Full backend `test:chunked`.** After the split: 5,214 tests, 4,951 pass, 237 fail. Before the split, run on a clean copy of the earlier commit: 354 fail, because that copy had no `.env` and several tests behave differently without it. The failing tests are in `tests/unit` and `tests/integration` and do not touch the moved code. Three tests failed only after the split and not before: two database certification tests and an OCR test. With the `.env` copied into the clean copy they fail the same way there (Prisma cannot connect to a database), so they are environmental. **Not investigated:** why about 230 other tests fail in this environment.

**Known leftovers.** `askHandlerSupport.ts` (1,250 lines) is a shared bucket and could be split by subject. `roomMapFacts` and a few other helpers sit in the file of the handler they were found in (for example `homeTimeline.handler.ts`) rather than with their own domain. Some handler files still import each other's exports (`miscHandlers` imports from `homeRecordWrites`); no cycle exists today (the test suite loads everything), but nothing enforces it.

**Guardrail suggested:** a test that fails if `askOrchestrator.service.ts` grows past 300 lines, and one that fails if any file under `handlers/` imports `askOrchestrator.service`.
