# Phase 6n — Proof of Release

A behavior proof is not enough if the package that gets published is not the exact artifact bound to the Release Candidate run.

Phase 6n closes that gap.

## New release invariant

```text
real Claude + Codex trials
        ↓
Behavior Proof
        ↓
RC trust gates
        ↓
npm pack
        ↓
SHA-256-bound publish artifact
        ↓
RELEASE_SEAL.md
```

A GO bundle now retains the npm tarball produced by the same RC execution and records its SHA-256 digest in `release-artifact.json`.

The RC gate fails if that tarball is missing, replaced, resized, or modified.

## Generated release evidence

```text
RELEASE_CANDIDATE.md
README_EVIDENCE.md
HERO_CAPTURE.txt
RELEASE_SEAL.md
release-candidate.json
release-artifact.json
behavectl-<version>.tgz
proof/
traces/
```

## Principle

> No artifact match, no release.
