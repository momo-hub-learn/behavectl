# Phase 6b — Behavior Proof Integrity

## Problem

A directory named `Behavior Proof` is not useful if someone can edit:

```text
evaluations/codex-trial-02.json
```

from:

```text
"verdict": "reject"
```

to:

```text
"verdict": "promote"
```

without the proof noticing.

## Integrity layer

Every generated Behavior Proof now includes:

```text
checksums.json
```

using SHA-256 over every tracked proof artifact except the checksum document
itself.

Example shape:

```json
{
  "schema": "behavectl.proof-integrity.v1",
  "algorithm": "sha256",
  "files": {
    "PROOF.md": "...",
    "manifest.json": "...",
    "verification.json": "...",
    "evaluations/claude-code-trial-01.json": "..."
  }
}
```

## Verify

```bash
behavectl proof verify .behavectl/proofs/proof_...
```

Valid:

```text
BEHAVECTL
Behavior Proof integrity

✓ VALID

Algorithm  SHA256
Files      18
```

Modified, deleted, or inserted artifacts invalidate the proof:

```text
✗ INVALID

Changed    evaluations/codex-trial-02.json
Unexpected looks-legit.txt
Missing    patch.json
```

## What this proves

SHA-256 integrity gives **tamper evidence after proof generation**.

It detects:

- changed evaluation JSON;
- changed human-readable report;
- deleted artifacts;
- inserted untracked artifacts;
- symlinks inside a proof bundle.

It does **not** prove:

- who generated the proof;
- that the machine was trusted;
- that the runner binary was authentic;
- that an external signer endorsed it.

Those require a future signed-attestation layer.

The product must not confuse integrity with identity.

## Live validation

`behavectl live` verifies the copied proof bundle before declaring a live-validation
bundle complete.

If Behavectl cannot verify its own generated proof, live validation fails
with an infrastructure error instead of publishing a questionable result.

## Design principle

> **A proof you cannot verify after copying is only a report.**
