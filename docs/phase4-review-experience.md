# Phase 4 — Review Experience

The first public release should not feel like a bag of commands. It should feel like a **change review system**.

The design goal is a terminal surface that a developer understands in one screenshot:

```text
BEHAVECTL
Behavior change review

────────────────────────────────────────────────────────────────────────

bp_...  CANDIDATE  risk L1

What changed
  Don't use npm in this repo. We always use pnpm.

Why Behavectl surfaced it
  ✓ Explicit user correction · confidence 0.92
  ✓ pnpm-lock.yaml · project evidence

Scope & targets
  Scope    project
  Targets  claude-code, codex

Expected behavior
  ○ Uses pnpm
  ○ Avoids npm
  ○ No package-lock.json

Latest Behavior Diff
  Uses pnpm              FAIL → PASS
  Avoids npm             FAIL → PASS
  No package-lock.json   FAIL → PASS
  Verdict                SAFE TO PROMOTE

────────────────────────────────────────────────────────────────────────
[ T ] Test    [ P ] Promote    [ D ] Details    [ Q ] Quit
```

## Product rules

1. **One decision per screen.** The user is reviewing one behavior change, not browsing an analytics dashboard.
2. **Semantics before mechanics.** Show “Uses pnpm”, not regexes or parser fields.
3. **Evidence before action.** The reason a patch exists must be visible before promotion controls.
4. **Risk and scope are always visible.** A behavior change is dangerous when its blast radius is unclear.
5. **No fake confidence.** If a real Behavior Diff has not run, the UI says so.
6. **Plain mode is first-class.** `behavectl review <id> --plain` makes docs, issue reports, CI logs, and README captures reproducible.
7. **No dependency-heavy TUI for v0.1.** The interaction is implemented with Node's standard terminal APIs so installation remains one package and startup stays instant.

## Commands

```text
behavectl inbox
behavectl review [patch-id]
behavectl review [patch-id] --plain
```

`behavectl review` without an id opens the most recent candidate/tested patch.

## Why this matters for an open-source launch

The review screen is the project's signature visual. The architecture may be sophisticated, but the user should experience a simple proposition:

> **An agent wants to change how it behaves. Here is why, here is the evidence, here is the measured effect, and here is the decision.**

That is the product.
