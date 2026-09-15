# Phase 6c — Behavior CI

## Goal

Make agent behavior changes visible and enforceable in pull requests without
putting Claude/Codex credentials inside CI.

The core principle is:

> **Real model evaluation happens before the PR. CI verifies the proof.**

That keeps GitHub Actions deterministic, cheap, and secret-light.

## Install

```bash
behavectl ci init
```

This writes:

```text
.github/workflows/behavectl-behavior-ci.yml
```

The workflow:

- checks out full Git history;
- uses Node 22;
- runs the pinned Behavectl package version;
- passes the PR base SHA;
- requires only `contents: read`;
- does **not** require Anthropic/OpenAI credentials.

## PR behavior

For ordinary code/docs changes:

```text
✓ NO BEHAVIOR CHANGE
```

For Behavectl-managed behavior changes with a valid proof:

```text
BEHAVECTL
Behavior CI

✓ SAFE TO MERGE

Behavior changes
  A  .behavectl/patches/bp_...
  A  .claude/rules/behavectl/bp_....md
  A  AGENTS.md

Trust checks
  ✓ Behavior changes use Behavectl-managed surfaces
  ✓ Every changed Behavior Patch has a passing proof
  ✓ Proof integrity
  ✓ Passing proof verdict
  ✓ Proof covers changed agent targets
  ✓ Managed outputs match proved behavior
```

For a manual change to `CLAUDE.md`, a non-Behavectl `.claude/rules/*`
file, or human-authored `AGENTS.md` content:

```text
✗ BLOCKED

✗ Behavior changes use Behavectl-managed surfaces
  Unmanaged: AGENTS.md
```

This is intentional. Behavior CI is a change-control policy, not a passive
linter.

## Why CI verifies proof instead of rerunning agents

Rerunning real models in every PR has several problems:

```text
model credentials in CI
variable cost
network dependency
stochastic reruns
provider outages
different model versions
```

Behavectl instead separates:

```text
developer machine
  ↓
real A/B
  ↓
3×3 Stability Gate
  ↓
Behavior Proof
  ↓
commit behavior + proof
  ↓
GitHub PR
  ↓
Behavior CI verifies proof + output binding
```

The CI check is deterministic.

## What CI validates

### 1. Behavior-surface detection

Initial supported behavior surfaces:

```text
.behavectl/patches/*.json
.claude/rules/behavectl/*.md
CLAUDE.md
.claude/rules/*
AGENTS.md
```

### 2. Managed vs unmanaged behavior

Behavectl-managed:

```text
Behavior Patch
.claude/rules/behavectl/<patch>.md
Behavectl managed block in root AGENTS.md
```

Human-authored agent instruction changes are considered unmanaged and blocked
by the initial strict policy.

### 3. Every changed patch has proof

Multiple patches in one PR require multiple acceptable proofs.

One valid proof cannot hide another unproved Behavior Patch.

### 4. Proof integrity

Every selected proof must pass:

```bash
behavectl proof verify <proof-dir>
```

### 5. Proof verdict

The proof must have:

```text
verdict = promote
```

### 6. Agent coverage

If the PR changes both Claude and Codex behavior, the proof must contain real
verification coverage for both.

### 7. Managed output binding

CI checks that the current managed output still contains the exact Behavior
Patch stored in the proof.

This catches:

```text
proof says: use pnpm
AGENTS.md says: use npm
```

even when the proof bundle itself is still intact.

## GitHub Step Summary

Inside Actions, `behavectl ci` automatically writes a Markdown report to
`$GITHUB_STEP_SUMMARY`.

The intended PR surface is:

```text
Behavectl Behavior CI

✅ SAFE TO MERGE

Changed behavior surfaces
...
Trust checks
...
Behavior Proofs
...
```

No custom GitHub App is required for v0.1.

## Trust boundary

Behavior CI v0.1 proves:

- the PR touches known behavior surfaces;
- behavior changes follow Behavectl-managed paths;
- every changed patch has a valid passing proof;
- proofs are byte-integrity-valid;
- required agent targets were verified;
- generated managed behavior still matches the proof.

It does **not** yet provide cryptographic author identity. Signed attestation
remains a later layer.

## Product significance

Before Behavior CI:

> Behavectl is a strong individual developer tool.

After Behavior CI:

> Behavectl becomes a team change-control system for AI behavior.

That is the first natural bridge from:

```text
Git for AI behavior
```

to:

```text
Agent Behavior Control Plane
```
