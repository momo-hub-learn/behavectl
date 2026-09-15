# Behavectl Trust Model

Behavectl governs changes to future AI-agent behavior. The trust model is
therefore part of the product, not an optional security appendix.

## Threats we explicitly design against

### 1. Fixture evidence presented as real evidence

Fixtures are useful for testing Behavectl itself but cannot create a trusted
promotion path.

### 2. A patch changes after it was verified

Every real evaluation and Verification Run is bound to the exact Behavior Patch
with a stable SHA-256 digest. Changing the patch invalidates promotion until it
is verified again.

### 3. Only one target is tested, but behavior ships to two

A patch targeting Claude Code + Codex must have passing verification for both
before promotion.

### 4. A proof bundle is modified after creation

Proof bundles include SHA-256 integrity metadata.

### 5. Checksums are regenerated around a semantically inconsistent proof

Behavectl also recomputes semantic binding:

```text
manifest.patchDigest
=
verification.patchDigest
=
every evaluation.patchDigest
=
sha256(patch.json)
```

### 6. An agent silently changes its own governance rules

The Agent-native MCP surface is read-only.

It does not expose promotion, rollback, or real A/B verification.

### 7. Protocol drift looks like agent regression

Claude Code / Codex structured protocol failures are classified as
infrastructure errors. They do not become `REJECT` verdicts for behavior.

### 8. CI reruns stochastic models with broad secrets

Behavior CI verifies retained proof and managed output binding. Real model
validation happens before the PR.

## Trust states

A useful mental model is:

```text
candidate
  ↓ human-reviewed spec
specified
  ↓ real A/B
verified
  ↓ repeated cross-agent success
stable
  ↓ proof integrity + semantic binding
proved
  ↓ explicit human action
active
```

No state is inferred from marketing text or UI color alone.

## Human-controlled actions

These are deliberately explicit:

```text
promote
rollback
real repeated verification
```

Agents may explain these actions, but they do not receive an implicit MCP tool
that can execute them.

## Privacy defaults

Normal project evaluation does not persist raw model traces by default.

Raw JSONL traces are retained automatically only in the synthetic release
validation flow, where repository contents are controlled by Behavectl.

## Security reporting

Do not post credentials, private prompts, proprietary code, or raw private
agent transcripts in public issues.

Use private vulnerability reporting once the public GitHub repository enables
it.
