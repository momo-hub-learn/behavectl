# Phase 6a — Live Validation Kit

## Why

Before a public launch, Behavectl needs one retained, reproducible proof
that the same Behavior Patch works across **real Claude Code and real Codex**.

A manual runbook is not enough. The validation itself should be productized.

## One command

```bash
behavectl live
```

Default plan:

```text
3 trials × 2 agents
= 6 A/B evaluations
= 12 real agent jobs
```

Because this may consume model time and credits, `behavectl live` never starts
silently.

Interactive terminals ask for confirmation. Scripts must use:

```bash
behavectl live --yes
```

Optional:

```bash
behavectl live --repeat 5 --yes
behavectl live --out ./artifacts/live-proof --yes
```

## Pipeline

```text
preflight
   ↓
fresh deterministic demo repo
   ↓
Claude Code baseline/candidate × N
   ↓
Codex baseline/candidate × N
   ↓
Behavior Stability Matrix
   ↓
persist every evaluation
   ↓
Behavior Proof
   ↓
Live Validation bundle
```

## Important correctness boundary

A CLI/auth/network failure is **not** a behavior failure.

```text
agent process exits non-zero
        ↓
SW_EVAL_RUNNER_FAILED
        ↓
diagnostic bundle retained
        ↓
NO behavior verdict
```

Behavectl must never turn:

> “Claude is not authenticated”

into:

> “The Behavior Patch regressed Claude.”

## Successful bundle

```text
behavectl-live-<timestamp>/
├── LIVE_VALIDATION.md
├── environment.json
├── preflight.json
├── result.json
├── proof/
│   ├── PROOF.md
│   ├── behavior-matrix.txt
│   ├── verification.json
│   ├── manifest.json
│   ├── evaluations/
│   └── diffs/
└── challenge/
    ├── config/
    ├── dist/
    └── scripts/
```

The challenge is synthetic. No user repository source is copied into this
bundle.

## Failure bundle

If a real runner fails:

```text
behavectl-live-<timestamp>/
├── LIVE_VALIDATION.md
├── environment.json
├── preflight.json
└── failure.json
```

The failure site is deliberately retained for diagnosis.

## Environment semantics

Binary detection only means **available**.

It does not mean:

- authenticated;
- within usage limits;
- network reachable;
- compatible with the current account.

Authentication/runtime readiness is proven by the first real evaluation.

The UI must never claim more than it knows.

## Public release gate

The first public alpha should retain one successful:

```bash
behavectl live --repeat 3 --yes
```

bundle showing:

```text
Claude Code  3/3 trials
Codex        3/3 trials

Trials: 6/6 passed
Verdict: STABLE ENOUGH TO PROMOTE
```

The raw proof bundle used for the README/GIF should be archived with the
release.
