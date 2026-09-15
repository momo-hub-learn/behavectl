# Phase 2 validation

The Phase 2 repository is executable with Node.js and has no runtime dependencies.

Validated locally:

```text
✓ Claude UserPromptSubmit normalization
✓ Codex UserPromptSubmit normalization
✓ explicit correction detection
✓ ordinary-task false-positive guard
✓ append-only event store
✓ patch registry
✓ Claude hook install is additive and idempotent
✓ Codex hook install is additive and idempotent
✓ repository evidence enrichment
✓ promotion compiles Claude managed rules
✓ promotion preserves human-authored AGENTS.md content
✓ rollback removes Behavectl-managed behavior
✓ rollback deletes AGENTS.md when Behavectl created the entire file
```

The current Phase 2 `promote` command is an engineering-spike path. Before public release, Phase 3 will put `Behavior Eval` in front of promotion so that the public default is:

```text
candidate → evaluated → human-approved → active
```

and not:

```text
candidate → active
```

This distinction is a release blocker, not a nice-to-have.
