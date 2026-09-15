# Phase 2 — Promotion & Cross-Agent Compilation

Phase 2 adds the first complete change-control loop:

```text
Claude/Codex correction
        ↓
   behavectl.event.v1
        ↓
 high-confidence detector
        ↓
   Behavior Patch
        ↓
 repo evidence enrichment
        ↓
      behavectl diff
        ↓
    behavectl promote
        ↓
canonical active patch
     ┌──────┴──────┐
     ↓             ↓
Claude rule      AGENTS.md managed block
     ↓             ↓
   Claude          Codex
        ↓
   behavectl rollback
```

## Why compile rather than sync files

Behavectl does not copy `CLAUDE.md` into `AGENTS.md`. It owns a harness-neutral canonical patch and compiles that patch into each runtime's native behavior surface.

This avoids coupling the core model to any vendor's file format.

## Claude target

Active patches compile into:

```text
.claude/rules/behavectl/<patch-id>.md
```

This keeps machine-managed behavior separate from human-authored `CLAUDE.md`.

## Codex target

Active patches compile into one explicit generated block inside root `AGENTS.md`:

```md
<!-- behavectl:start -->
...
<!-- behavectl:end -->
```

Human-authored text outside the block is preserved. Compilation is idempotent.

## Current safety rule

Promotion is explicit. `behavectl learn` only creates candidates.

```text
capture != propose != promote
```

This separation is a core product invariant, not a temporary limitation.

## Next: Phase 3

The next milestone is the signature feature:

> **Behavior Diff**

Phase 3 will run isolated before/after scenarios and attach an `EvaluationResult` to the candidate before promotion.
