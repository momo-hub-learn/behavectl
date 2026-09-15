# Phase 6d — Launch-Grade UX + Promotion Policy

## Goal

First release quality is not "more commands".

It is:

```text
understand in 30 seconds
trust promotion semantics
see history clearly
never confuse simulation with proof
```

## 1. Zero-setup product tour

```bash
npx behavectl demo
```

The tour is intentionally:

- fixture-only;
- offline;
- read-only to the current project;
- explicit that no real model ran;
- unable to create Behavior Proofs;
- unable to unlock promotion.

This lets a new GitHub visitor understand the product before connecting Claude
Code or Codex.

## 2. Promotion Policy v1

Old engineering spike behavior was too weak:

```text
any passing real eval
→ promote
```

Public behavior is now:

```text
current Behavior Patch
        ↓
SHA-256 patch fingerprint
        ↓
persisted real Verification Run
        ↓
same patch fingerprint?
        ↓
all declared targets covered?
        ↓
verification verdict = promote?
        ↓
human runs behavectl promote
```

A patch changed after evaluation is no longer promotable.

A patch targeting:

```text
Claude Code + Codex
```

cannot be promoted after only Claude passes.

The public CLI does not expose force-promotion.

## 3. Proof binding

Behavior Proof v4 records:

```text
patchDigest
verification.patchDigest
evaluation.patchDigest
```

All must refer to the exact same Behavior Patch.

Changing the patch after verification requires another verification before a
new proof can be created.

SHA-256 file integrity and semantic proof binding solve different problems:

```text
checksums.json
→ did proof files change?

patchDigest chain
→ does this proof actually describe this patch?
```

Behavior CI validates both.

## 4. Persisted Verification Run is the source of truth

Review UI no longer reconstructs promotion eligibility from "latest eval per
agent".

It reads the persisted Verification Run.

That means a real:

```text
Claude 3/3
Codex  3/3
```

stays a 3×3 Stability result in Review rather than degrading into a one-run
snapshot.

## 5. Behavior Log

```bash
behavectl log
```

shows the local durable behavior history:

```text
ACTIVE    bp_...   6/6  proof VALID
  Always use pnpm.
  claude-code · project · Claude + Codex · 2026-09-11 11:00Z
```

It combines:

- patch status;
- behavior statement;
- source;
- scope;
- targets;
- latest verification;
- proof integrity.

`behavectl log` is read-only and does not initialize Behavectl in an untouched
repository.

## Product rule

> A read command must not mutate state.  
> A proof must prove the exact patch.  
> A promotion must cover every declared target.


## 6. CI verifies semantic proof binding

Behavior CI does not stop at `checksums.json`.

It recomputes the digest of `patch.json` and requires:

```text
manifest.patchDigest
=
verification.patchDigest
=
every evaluation.patchDigest
=
sha256(current proof patch)
```

A proof can therefore be byte-integrity-valid and still fail CI when its
semantic chain is inconsistent.

This distinction is deliberate:

```text
file integrity
≠
proof semantic binding
```
