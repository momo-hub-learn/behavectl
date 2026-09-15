# Phase 6f — Release Candidate Gate

## Goal

Behavectl should not rely on maintainers manually deciding whether a live
validation bundle is "good enough" for launch.

The release gate is itself executable:

```bash
behavectl rc --agent <codex|claude-code> --artifact <candidate.tgz> --yes
# then: behavectl rc merge <claude-shard> <codex-shard> --out <rc-dir>
```

Default policy:

```text
3 trials × 2 real agents
= 6 A/B evaluations
= 12 real agent jobs
= 12 retained raw protocol traces
```

## What `behavectl rc` does

```text
real preflight
    ↓
fresh deterministic challenge
    ↓
Claude Code baseline/candidate × 3
    ↓
Codex baseline/candidate × 3
    ↓
raw structured trace capture
    ↓
protocol replay
    ↓
trace integrity
    ↓
Stability Matrix
    ↓
Behavior Proof
    ↓
proof byte integrity
    ↓
proof semantic binding
    ↓
artifact lineage
    ↓
GO / NO-GO
```

## GO criteria

Every gate must pass:

```text
Real validation mode
At least 3 trials per agent
Claude Code + Codex both verified
Every required trial passed
Verification verdict = PROMOTE
Result / verification / proof share one lineage
Protocol replay healthy
Every A/B arm has a raw trace
Raw trace integrity valid
Behavior Proof integrity valid
Behavior Proof semantic binding valid
Agent CLI versions recorded
```

One failure means:

```text
RELEASE CANDIDATE: NO-GO
```

There is no "mostly green" release state.

## Artifact lineage

A bundle is only coherent when:

```text
result.patchId
=
verification.patchId
=
proof.manifest.patchId
```

and:

```text
result.verificationId
=
verification.id
=
proof.manifest.verificationId
```

This prevents a valid proof from one run being accidentally combined with the
result metadata from another run.

## Trace coverage

A 3×3 release run must retain:

```text
3 trials
× 2 agents
× 2 arms (baseline + candidate)
= 12 raw traces
```

A missing raw trace makes the release candidate invalid even when all parsed
evaluations happen to be present.

## Full proof verification

`behavectl proof verify <proof-dir>` now means complete proof validation:

```text
Byte integrity
+
Semantic binding
+
Promotable verification verdict
+
Declared target coverage
```

It no longer means only "checksums.json matches".

## Offline inspection

An existing live bundle can be checked without model calls:

```bash
behavectl rc inspect ./behavectl-live-...
```

`inspect` is read-only.

It does not rewrite the bundle or regenerate release assets.

## Launch artifacts

A successful `behavectl rc` automatically creates:

```text
RELEASE_CANDIDATE.md
release-candidate.json
README_EVIDENCE.md
HERO_CAPTURE.txt
```

`README_EVIDENCE.md` is generated from the exact retained Verification Run.
It should replace illustrative README output before public launch.

`HERO_CAPTURE.txt` is the terminal-ready evidence surface for the final launch
recording.

## Release principle

> **Do not launch because the implementation feels complete.  
> Launch when the retained evidence bundle says GO.**
