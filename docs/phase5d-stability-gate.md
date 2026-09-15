# Phase 5d — Stability Gate

## Why one passing run is not enough

Real coding agents are stochastic.

A Behavior Patch that passes once may fail on the next run because of:

- sampling variation;
- different planning choices;
- tool ordering;
- model-side changes;
- latent ambiguity in the Behavior Spec.

Behavectl should not confuse **one successful sample** with **stable behavior**.

## Command

```bash
behavectl verify bp_... --repeat 3
```

For two agents this means:

```text
Claude Code  baseline/candidate × 3
Codex        baseline/candidate × 3
```

Every trial uses a fresh isolated evaluation workspace.

## Stability Matrix

Single-run verification stays simple:

```text
Uses pnpm     FAIL → PASS
```

Repeated verification becomes empirical:

```text
Check                  Claude Code       Codex
─────────────────────  ────────────────  ────────────────
Uses pnpm              0/3 → 3/3         0/3 → 3/3
Runs generator         0/3 → 3/3         0/3 → 3/3

Claude Code  3/3 trials
Codex        3/3 trials

Coverage: 2/2 agents stable
Trials: 6/6 passed
Verdict: STABLE ENOUGH TO PROMOTE
```

If even one required trial fails:

```text
Claude Code  2/3 trials

Verdict: NOT STABLE
```

The default remains `--repeat 1` because real evaluations consume model time
and money. Repetition is explicit.

## Promotion semantics

Repeated verification uses a strict initial policy:

> **Every selected agent must pass every requested trial.**

No average score, majority vote, or hidden confidence threshold in v0.1.

This is intentionally conservative.

Later versions may support policy objects such as:

```text
3/3 required for L2 project policy
4/5 required for low-risk preference
cross-model compatibility threshold
cost/latency budget
```

but those policies should be explicit and reviewable.

## Verification Run

Phase 5d promotes `VerificationRun` into a persistent object:

```text
.behavectl/verifications/verify_....json
```

It records:

```text
patch
spec
agents
repeat count
every A/B evaluation
agent pass rates
global verdict
```

Behavior Proof v3 references the latest persisted verification and preserves
every trial. It never cherry-picks only the successful run.

## Release gate

The public hero demo should use:

```bash
behavectl verify bp_demo_generated_config \
  --require-all \
  --repeat 3
```

and retain all six real agent trials in the proof bundle.

A flaky hero demo is a product bug.
