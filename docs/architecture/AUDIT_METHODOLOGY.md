# Architecture Audit & Gap-Analysis Verification Standard

This checklist exists because the first draft of `ASK_COZY_CONVERSATIONAL_ARCHITECTURE_AUDIT.md`
shipped five claims that an external technical review falsified on direct inspection of the
code — including one genuine, previously-unflagged correctness bug (a non-transactional
confirm/persist path). None of the five were subtle: each was catchable by asking one specific
question the original pass never asked. This document is that set of questions, so the next
audit asks them the first time.

Apply this before publishing any audit, gap-analysis, or "current state" architecture document
in this repo — not only when a reviewer asks for a fix. **Items 11-18 apply specifically to
target-architecture/design documents** (which make decisions rather than report findings) —
see the note after item 10.

## 1. Label every claim as executed, code-traced, or inferred — and say so in the text

- **Executed**: you ran the actual code (a pure function, a script, a test) and observed the
  output. Cite the exact command and include the output (or a representative excerpt) so it is
  reproducible by someone else.
- **Code-traced**: you read the source and are stating what it would do, but did not run it —
  this covers almost all claims about database contents ("this table is populated"), exact
  runtime text, and anything requiring a live database or request context.
- **Inferred**: you are extrapolating from a pattern (naming, a similar function elsewhere,
  a comment) rather than either of the above.

Never let a code-traced or inferred claim read as if it were executed. If a document contains a
line like "empirically verified" or "confirmed live," it must be backed by an actual run, not a
read.

## 2. Don't call a write path "safe," "sound," or "fully wired" without a failure-mode test

For any multi-step write (status update + domain write + audit/artifact write), ask explicitly:
*what happens if step N succeeds and step N+1 throws?* Trace the actual catch/rollback logic
against that scenario. A `try/catch` that resets a status flag does **not** undo an
already-committed side-effect (e.g., a separate Prisma write that already returned). If the
steps aren't inside one `prisma.$transaction` (or equivalent), assume they are not atomic until
proven otherwise — don't infer atomicity from the presence of error handling.

**Sibling-branch check:** when a function has multiple branches doing structurally similar
things (e.g., one branch per "kind" of proposal/command), diff them against each other. An
inconsistency between siblings — one wrapped in a transaction, another not — is a strong bug
signal that reading any single branch in isolation will miss.

## 3. Trace every branch of a conditional before generalizing from one

A defect found in one branch of an `if`/`switch` does not establish behavior for the other
branches. Before writing "X is always excluded" or "Y is never possible," check the
`else`/default case too — it may behave the opposite way. State the scope of a defect precisely
(e.g., "excluded for component-scoped queries," not "excluded from the system").

## 4. Verify the full causal chain, both directions, before calling something "one line away"

Before writing "this is disconnected by exactly one line" or "just needs a populator":

- Check every **consumer** of the value in question, not just the producer that's obviously
  broken. A hardcoded empty value might be one of two-or-more independent breaks.
- Check whether the **target schema/contract** can actually represent the example you're using
  to illustrate the gap. If the worked example has three attributes, verify all three have
  somewhere to go — not just the one that happens to already exist.

## 5. Search `docs/product/*FRD*.md` and `docs/architecture/*.md` for governing docs, as an early, dedicated step

Do not rely on stumbling across a relevant FRD while reading code. Before drafting any "open
design question" (e.g., a confirmation policy, a materiality threshold, a provenance model),
run a dedicated `find`/`grep` pass over `docs/product/` and `docs/architecture/` for the
subject area and read what's already there. Posing a question as open when a governing FRD
already answers it unconditionally is a research-completeness failure, not a legitimate
open question — always cite and defer to the existing doc, or explicitly explain why it should
change.

## 6. Keep provenance/trust axes separate

Source (who supplied a fact), capture channel (which UI surface captured it), extraction
confidence (how sure the parsing step was), and confirmation state (has this specific claim
been affirmed) are four independent dimensions. Don't fold "arrived via chat" into a single
lower-trust source-type value — model it as its own field, and let existing confirmation/
materiality policy (see #5) govern whether it needs review, rather than inventing a new
trust ranking from first principles.

## 7. Run one adversarial pass before publishing, separate from the research pass

The single biggest reason five issues survived the original draft: the research and
verification passes both asked "is this consistent with what I've read?" instead of "what
specific scenario would break this claim?" Consistency-checking against your own gathered
evidence only catches contradictions between sources — it does not catch a correctness bug no
source happened to flag.

Before publishing, do one more pass whose only job is to take every claim of the form "already
exists," "fully wired," "transactionally sound," or "X is impossible/invisible," write down the
specific scenario that would falsify it, and check the code against that scenario. This is a
different exercise from gathering the findings and should be done as a distinct step, ideally
after the rest of the document is otherwise complete.

**Make this pass mechanical, not just attitudinal — run it against the whole document, not just
the section you're currently writing.** A fast way to find candidates: grep the draft itself for
absolute language before publishing —

```
grep -noE "\b(never|always|none|zero|nothing|fully|completely|entirely|invisible|impossible|cannot|can't|structurally|does not exist|doesn't exist)\b" <the-document>.md
```

Every hit is a claim strong enough to be falsified by one counter-example. Check each one
against the code (a grep for the thing being claimed absent, at minimum) before the document
ships — do not limit this pass to whatever a reviewer already flagged, and do not skip it just
because the document "looks done." Two consecutive review rounds on the same document (see
Revision notes 1 and 2 in `ASK_COZY_CONVERSATIONAL_ARCHITECTURE_AUDIT.md`) each found issues of
exactly this shape that a grep like the one above, run before publishing, would have caught
without needing an external reviewer at all.

## 8. Separate what's required from how it could be built

When a document says closing a gap "requires" a specific mechanism (a new extraction stage, a
new enum value, a new table), check whether that's actually established or whether only the
*outcome* is established (e.g., "free text needs to become a structured fact somehow"). State
correctness/reachability fixes (a transactional bug, a missing wire-up) as true requirements —
they're bugs, not designs. State everything else as an outcome with candidate designs, and don't
let a stronger phrasing survive in a summary, a matrix row, or a scenario writeup after the
detailed section has already been correctly hedged — this is a specific case of item 9 below.

## 9. When correcting an overclaim, check whether the fix itself becomes a new overclaim

A false "zero X" is easy to overcorrect into "always X" without tracing the value all the way
downstream. If a function returns a non-empty value, check every filter/suppression/gating step
between that return and what the user actually sees before asserting the value survives. Apply
the same failure-mode-first standard (item 2) to your own corrections that you applied to find
the original issue — a correction is a new claim, not an exemption from verification.

## 10. After fixing any claim, grep the whole document for its repeats

A finding stated once is often restated — in a table row, a KEEP/EXTEND verdict, an
"opportunities" bullet, a readiness score, the executive summary, and the final verdict. Fixing
the first occurrence and moving on leaves the others contradicting it. Two of the five issues in
a second review round were exactly this: a corrected claim in one section, still wrong verbatim
in two or three other places. Before considering any correction complete, search the full
document for the term/claim being fixed (a name, a "zero X" phrasing, a recommended enum value)
and check every hit, not just the one a reviewer pointed at.

## 11. Before deciding to reuse an existing field for a new purpose, find every existing consumer

*(Design documents.)* A Stage 2 draft proposed reusing `PropertyFactEvidence.confidence` (and its
`HomeEvent` analog) to also carry "how confident was the extraction step," reasoning that the one
consumer it remembered (`decideFactMerge`'s priority arbitration) would tolerate the new meaning.
It missed a second, already-existing consumer (`groundedAsk.service.ts` averaging that same field
into answer-level confidence) that assumes a *different* meaning (fact reliability, not parse
confidence) — reusing the field would have let a well-parsed but unreliable claim ("the listing
says...") silently inherit high trust. Before deciding a field's meaning can be safely extended,
grep for every place that reads it, not just the one place you remember deciding its current
meaning.

## 12. A worked example must not manufacture precision the input doesn't contain

*(Design documents.)* A design document's own example ("I replaced my roof last summer for
$14,500... 10-year warranty") turned "last summer" into a specific month and derived an exact
warranty expiry date and issuer from data the statement never supplied — because a worked example
reads better when it's clean and fully resolved. Check a worked example against the schema's
actual constraints (a required exact date field cannot be populated from a vague duration) the
same way you'd check a factual claim about existing code. If the honest answer is "this needs a
clarifying question," show that step, don't skip past it for narrative tidiness.

## 13. "Never blocks" and "merges into the same response" cannot both be true without saying how

*(Design documents.)* A design that says a step "does not block the response" and also "merges its
output into that same response" has left out the mechanism that reconciles the two — a bounded
synchronous wait, a background/async path with a different delivery point, or an admission that it
does block after all. State which one, with a concrete fallback for the case the fast path doesn't
apply.

## 14. Idempotency checks must be scoped to "did this exact operation already run," not to current state

*(Design documents.)* A replay-safety design filtered its dedup lookup to non-superseded/currently-
active rows — reasonable-sounding, and wrong: if the row this specific execution wrote has since
been superseded by a *different*, later execution, the filtered lookup finds nothing, concludes no
prior write exists, and resurrects the stale value. "Did this execution's write already happen" and
"is this the current value" are different questions; the first must be answered by matching the
execution's own identity (a source/execution id in the uniqueness key) regardless of what happened
to the record since, never by filtering on whether the record is still active.

## 15. Persist intent before attempting the risky operation, not after it succeeds

*(Design documents.)* A background/retryable step's durable record (an outbox event, a job row) was
written only after the risky work — an LLM call, a network request — completed, with the work
itself run as an in-process task in between. A crash inside that window loses the work with no
trace it was ever supposed to happen. The record that makes something retryable must exist *before*
the risk window it's meant to protect, even if that means writing a record for work that (on the
fast path) completes a moment later and never needs to be retried at all.

## 16. Before adding a uniqueness constraint on an existing field, check its granularity matches the new use

*(Design documents.)* A fix reused an existing polymorphic-source field for a new uniqueness
constraint, having confirmed the field existed and was semantically plausible — but every existing
caller populated it at a coarser grain (one value per *user*, not per *operation*), so the
constraint collided on a second, legitimate use by the same user and silently swallowed it as a
"duplicate." Finding a field is not the same as finding a field with the right grain. Before
keying a new constraint on an existing field, check what value every existing caller actually
writes into it, not just what the field is named or what it's documented to mean.

## 17. Synchronizing two independent operations by checking each other's state at completion time races

*(Design documents.)* A design had operation A, on completing, check whether sibling operation B
had also completed yet, and vice versa — intending whichever finished second to do a follow-up
step. If both complete close together, each can check before the other has committed, both see
"not done," and neither ever checks again. Any time two independent operations need to synchronize
by observing each other, do it asynchronously against durably-committed state (an event processed
after commit, not a query run during it) — the operation that commits later is then guaranteed to
see the earlier one already done, because durable processing happens strictly after commit, not
in a window that can race it.

## 18. A fast inline path and a durable background worker for the same job need one shared claim, not two triggers

*(Design documents.)* A design let a job run either inline (as a latency optimization) or via a
durable background worker (as the retry path), coordinating them after the fact by having the
worker check whether the inline path already produced a result. This under-specifies what happens
when a result is partial (multiple items expected, only some produced) and doesn't prevent both
paths from running concurrently. The fix is one shared claim/lease that both triggers compete for
— whichever wins is the only one that runs the job — plus atomic all-or-nothing persistence of
whatever the job produces, so "partially done" is never an observable state either trigger has to
reason about.

---

*Items 1-10 were written after external review of `ASK_COZY_CONVERSATIONAL_ARCHITECTURE_AUDIT.md`;
items 11-18 after external review of `ASK_COZY_TARGET_PRODUCT_AND_ARCHITECTURE.md` — see each
document's "Revision note" for the specific findings that prompted them.*
