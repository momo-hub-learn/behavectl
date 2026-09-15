# Phase 3 — Behavior Diff

> Signature feature: compare actual agent behavior before and after a candidate Behavior Patch.

## Product invariant

A Behavior Patch is not considered safe because an LLM says it is good.

Behavectl evaluates:

```text
same repository baseline
same task
same agent runner
without candidate behavior
vs.
with candidate behavior
```

Then it checks deterministic observations.

## Evaluation pipeline

```text
Behavior Patch + Behavior Spec
              ↓
      create two isolated workspaces
        ┌─────┴─────┐
        ↓           ↓
     baseline    candidate
        │           │
   real agent    real agent
        │           │
   observe       observe
        └─────┬─────┘
              ↓
       deterministic checks
              ↓
         Behavior Diff
              ↓
   persist EvaluationResult
              ↓
      promotion gate
```

## Isolation

Behavectl prefers detached Git worktrees from the same `HEAD`. If worktrees are unavailable, it falls back to a temporary project copy while excluding `.git`, `.behavectl`, and `node_modules`.

The user's working tree is never the evaluation workspace.

## Claude Code runner

The current runner uses the official non-interactive surface:

```text
claude --bare -p
       --output-format stream-json
       --verbose
       --no-session-persistence
```

Candidate behavior is injected with:

```text
--append-system-prompt
```

`--bare` is important because it disables automatic CLAUDE.md, auto-memory, hooks, skills, plugins, MCP, custom commands, and subagents. This gives the evaluator a much cleaner A/B boundary.

The runner does **not** use `--dangerously-skip-permissions`. Public release will keep evaluation permissions narrow rather than gaining convenience by weakening machine safety.

## Codex runner

The current integration targets the source-confirmed non-interactive Codex Exec surface:

```text
codex exec
  --json
  --ephemeral
  --ignore-user-config
  --ignore-rules
```

Current Codex source defines `--ephemeral` as running without persisting session files and `--json` as JSONL event output. It also exposes `--ignore-user-config` and `--ignore-rules`, which help reduce unrelated harness variation during controlled evaluation.

The evaluator does not scrape the interactive TUI. Project `AGENTS.md` behavior is still treated as part of the current project baseline; the candidate behavior is injected separately so both arms share the same repository baseline.

## Behavior Spec

Machine predicates and human-facing labels are separate:

```json
{
  "schema": "behavectl.behavior-spec.v1",
  "id": "pnpm-install",
  "task": "Add zod as a dependency.",
  "checks": [
    {
      "id": "uses-pnpm",
      "label": "Uses pnpm",
      "kind": "command_matches",
      "value": "pnpm\\s+add\\s+zod"
    },
    {
      "id": "avoids-npm",
      "label": "Avoids npm",
      "kind": "command_not_matches",
      "value": "npm\\s+install"
    }
  ]
}
```

This is a deliberate product choice: users should see **behavior semantics**, not implementation regexes.

Initial deterministic check kinds:

```text
command_matches
command_not_matches
file_exists
file_not_exists
output_contains
regression_command
```

No LLM judge is required for the first signature demo.

## Honest evaluation contract

The repository contains a `FixtureRunner` for unit-testing the A/B engine.

It is deliberately labeled:

```text
fixture (engine test only; not a real agent evaluation)
```

`behavectl test` never silently falls back to the fixture runner.

If Claude/Codex is not installed and authenticated, real evaluation fails clearly.

This is a trust requirement.

## Promotion gate

Normal promotion now requires at least one persisted real evaluation with:

```text
runner != fixture
verdict == promote
```

Engineering tests may use an explicit force path internally, but the public workflow is:

```text
candidate
→ real Behavior Diff
→ tested
→ human promote
→ active
```

## Next refinement

Before launch quality:

1. capture Claude tool-use command structure against real `stream-json`;
2. capture current Codex Exec event schema against real `--json`;
3. add runner capability/version detection;
4. add cost/token metrics;
5. render Behavior Diff with polished terminal tables;
6. generate starter Behavior Specs from common correction classes;
7. add regression-spec selection rather than running every check.
