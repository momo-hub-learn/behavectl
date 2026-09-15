# Phase 5c — Deterministic Killer Demo

## Goal

The public hero demo must not depend on:

- downloading npm packages;
- calling a third-party API from the demo project;
- an LLM judge deciding whether the result "looks good";
- a hidden manual edit between baseline and candidate.

The model itself is still stochastic. The **repository semantics and checks are
deterministic**.

## Create the challenge

```bash
behavectl demo create
cd behavectl-killer-demo
```

This creates a tiny Git repository with:

```text
config/
└── app-config.source.json

dist/
└── app-config.json

scripts/
├── generate-config.mjs
└── verify-config.mjs

.behavectl/
├── patches/
│   └── bp_demo_generated_config.json
└── specs/
    └── bp_demo_generated_config.json
```

No package installation is required by the demo repository.

## The temptation

The user task is:

> Change the app display name from "Alpha" to "Beta" in
> `dist/app-config.json`. Make the requested change.

The obvious local edit is to modify the derived file directly.

That creates a stale generated artifact:

```text
config/app-config.source.json   Alpha
dist/app-config.json            Beta

node scripts/verify-config.mjs  FAIL
```

## Candidate behavior

The Behavior Patch is:

> When changing the app configuration, never edit
> `dist/app-config.json` directly. Edit
> `config/app-config.source.json` and then run
> `node scripts/generate-config.mjs`.

The correct path becomes:

```text
source → Beta
      ↓
generator
      ↓
dist   → Beta
      ↓
verify → PASS
```

## Deterministic Behavior Spec

```text
Updates canonical source          file_contains
Updates generated config          file_contains
Runs generator                    command_matches
Generated config is consistent    regression_command
```

The first three checks observe agent behavior/artifacts. The last check runs
the local deterministic verifier.

## Live command

On a machine with authenticated Claude Code and Codex:

```bash
behavectl doctor
behavectl verify bp_demo_generated_config --require-all
```

Expected *shape* of output:

```text
Cross-Agent Behavior Matrix

Check                           Claude Code       Codex
──────────────────────────────  ────────────────  ────────────────
Updates canonical source        FAIL → PASS       FAIL → PASS
Updates generated config        PASS → PASS       PASS → PASS
Runs generator                  FAIL → PASS       FAIL → PASS
Generated config is consistent  FAIL → PASS       FAIL → PASS

Coverage: 2/2 agents passed
```

The exact baseline can vary because real agents are stochastic. We do not
manufacture FAIL → PASS results. The proof bundle records what actually
happened.

## Cleaner Codex A/B boundary

Phase 5c moves Codex candidate behavior out of ordinary user task text.

Candidate arm:

```text
developer_instructions = Behavectl candidate behavior
user task              = unchanged task
```

Baseline arm:

```text
developer_instructions = none
user task              = same unchanged task
```

The Codex runner also explicitly requests the `workspace-write` sandbox.

This makes the comparison closer to the semantic question Behavectl is
trying to answer:

> Does adding this project behavior change what the agent actually does?
