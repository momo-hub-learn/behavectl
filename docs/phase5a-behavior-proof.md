# Phase 5a — Behavior Proof

## Problem

A terminal screenshot saying "PASS" is not a trustworthy artifact.

Agent behavior changes need a portable proof chain.

## Behavior Proof

A Behavior Proof binds:

```text
Behavior Patch
+ source provenance
+ evidence
+ Behavior Spec
+ real-agent A/B evaluation
+ Behavior Diff
+ runner identity
+ verdict
```

into one local, shareable directory.

```text
.behavectl/proofs/<evaluation-id>/
├── manifest.json
├── patch.json
├── evaluation.json
├── behavior-diff.txt
└── PROOF.md
```

Fixture evaluations are explicitly excluded.

## Why this matters

The long-term product is not just a prettier prompt editor.

It is a change-control system for agent behavior.

Change control needs artifacts that can be:

- reviewed;
- attached to PRs;
- archived;
- audited;
- compared;
- reproduced later.

`Behavior Proof` is the first portable unit for that future.
