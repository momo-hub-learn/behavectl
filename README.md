<p align="center">
  <strong>BEHAVE<span>CTL</span></strong>
</p>

<h1 align="center">Git for AI behavior.</h1>

<p align="center">
  <strong>Agents learn. Behavectl decides what gets to stick.</strong><br/>
  Turn persistent agent behavior into reviewable patches you can test, prove, promote, and roll back.
</p>

<p align="center">
  Agent-agnostic core · Codex · CodeBuddy Code · Claude Code · local-first · zero runtime dependencies
</p>
---

```text
user correction
      ↓
Behavior Patch
      ↓
real before / after
      ↓
Behavior Proof
      ↓
human promotion
      ↓
future agent behavior
      ↘ rollback
```

### Open the visual workbench
Run `node src/cli/behavectl.mjs studio`, then open `http://127.0.0.1:4317`.
Installed users run `behavectl studio` from their project. The example is simulated;
the project view connects editing, verification, evidence, promotion and rollback.
Real verification requires confirmation and may incur model costs.

### See the whole idea in 30 seconds

This is an **unpublished alpha candidate**. From this source directory, run:

```bash
node src/cli/behavectl.mjs demo
```

No account. No project setup. No model call. The tour is explicitly marked
**SIMULATION** and can never unlock a real promotion.

When the idea clicks:

```bash
node src/cli/behavectl.mjs init
```

No cloud. No daemon. No silent promotion.

[Install the local candidate and use it in your project →](docs/quickstart.md)
---

## The problem is not memory. It is change control.

Agents now remember corrections, write rules, install skills, and adapt their own
workflows. That is useful — until a one-off instruction quietly becomes durable
behavior and nobody can answer:

```text
What changed?
Why did it change?
Did it actually improve behavior?
Which agents were tested?
Can we prove this is the exact version we verified?
Can we undo it safely?
```

Behavectl makes the behavior change itself a first-class artifact: a
**Behavior Patch**.

| Layer | Main question |
|---|---|
| Memory | What should the agent remember? |
| Rule / config sync | Where should this instruction be copied? |
| Eval harness | Did this task pass? |
| **Behavectl** | **What deserves to become persistent behavior?** |

That difference is the product.
---

## A real correction, measured before and after

![Recorded Codex evidence: complete task passes improved from 1/3 to 3/3.](docs/assets/codex-proof.svg)

A generated configuration can look fixed while its source is still wrong.
The next generation step brings the bug back. Behavectl tests whether an agent
fixes the canonical source, runs the generator, and leaves both files consistent.

The correction: **edit the source of truth, then regenerate the output.**

On September 16, 2026, we ran three paired trials with the native Codex CLI:
three tasks without the rule and three with it. Complete task passes improved
from **1/3 to 3/3**. Two pairs improved; one already passed before the correction.

Retained certification output:

```text
Cross-Agent Behavior Matrix · bp_demo_generated_config

Check                           Codex
──────────────────────────────  ──────────────────
Updates canonical source        1/3 → 3/3
Updates generated config        3/3 → 3/3
Runs generator                  1/3 → 3/3
Generated config is consistent  1/3 → 3/3

Coverage: 1/1 agents stable
Trials: 3/3 passed
Verdict: STABLE ENOUGH TO PROMOTE

Protocol replay     VALID
Trace integrity     VALID
Proof integrity     VALID
Proof binding       VALID

RELEASE CANDIDATE: GO
```

All 13 release-candidate checks passed, with six raw execution traces and a
proof bound to the exact package. This is one generated-config task on
Codex, with three pairs—not a claim about every task or other agents.
[Certification record and artifact fingerprint →](LAUNCH_CHECKLIST.md)

Studio lets you inspect the actual commands and file changes before promoting
the verified rule. Promotion persists the instruction in the agent's native
rule file; rollback removes the managed change.

> **Learning can be automatic. Shipping behavior should not be.**

---

## Bring the agents you already use

Behavectl does **not** require every supported coding agent to be installed. A
Behavior Patch declares its targets, and only those targets must be proved.

```bash
behavectl agents
```

```text
BEHAVECTL · Agent Registry

● Codex              DETECTED     stable
● CodeBuddy Code     DETECTED     beta
○ Claude Code        NOT DETECTED stable

Declared targets are opt-in. Behavectl never requires every supported agent.
Detection does not verify authentication or model access.
```

Create the killer demo specifically for the agents on your machine:

```bash
behavectl demo create --agents codex
cd behavectl-killer-demo
behavectl verify bp_demo_generated_config --repeat 3
```

The core invariant is simple:

> **Behavectl governs behavior. Adapters translate that behavior into each agent's native runtime.**

Current adapters (adapter status is separate from release certification):

| Adapter | Real A/B eval | Promotion surface | Status |
|---|---:|---|---|
| Codex | ✓ | `AGENTS.md` managed block | Stable |
| CodeBuddy Code | ✓ | `.codebuddy/rules/behavectl/*.md` | Beta |
| Claude Code | ✓ | `.claude/rules/behavectl/*.md` | Stable |

The first alpha RC is certified for **Codex**. CodeBuddy Code and Claude Code
are supported adapters without certification in this release.
Cross-agent does not mean colocated, and supported does not mean required.

### Bring another agent without changing Core

The public Adapter SDK is intentionally small:

```bash
behavectl adapter scaffold my-agent
behavectl adapter check ./behavectl-adapter-my-agent/adapter.mjs
behavectl agents --adapter ./behavectl-adapter-my-agent/adapter.mjs
```

An adapter owns vendor differences — runtime detection, real execution, native
persistent surfaces, and protocol replay. Behavectl Core owns the lifecycle and
trust rules.

```text
Behavectl Core
      ↓
Agent Adapter Contract v1
      ↓
Codex · CodeBuddy · Claude Code · community adapters
```

> **Adding an agent should add an adapter, not a branch in Core.**

[Build an adapter →](docs/adapter-guide.md)

---

## Start with one command

Connect Behavectl to a real project:

```bash
behavectl init
```

Run `behavectl` at any time. The home screen is context-aware and read-only until
initialization:

```text
╭────────────────────────────────────────────────────────────────────────────╮
│ ◆ BEHAVECTL  Git for AI behavior.                        acme-api   LOCAL  │
╰────────────────────────────────────────────────────────────────────────────╯

╭ BEHAVIOR ───────────────────────────────────────────────────────── 4 total ╮
│   01 review      00 tested      03 active                                  │
╰────────────────────────────────────────────────────────────────────────────╯

╭ NEXT ───────────────────────────────────────────────────────── human-gated ╮
│   Review 1 proposed behavior change.                                       │
│   › behavectl review                                                       │
│   Promotion stays human-controlled.                                        │
╰────────────────────────────────────────────────────────────────────────────╯

  local-first · reversible · human-gated
  Nothing becomes active behavior without an explicit promotion.
```

### The everyday loop

```bash
behavectl inbox
behavectl review
behavectl verify bp_... --repeat 3
behavectl proof bp_...
behavectl promote bp_...
behavectl rollback bp_...
```

Behavectl keeps the workflow deliberately small: **capture → review → verify →
prove → promote → rollback**.

---

## Use Behavectl *inside* your coding agent

Behavectl can install agent-native entry points where the host supports them:

```bash
behavectl agent install --all --mcp
```

| Agent | Native entry point |
|---|---|
| Claude Code | project Skill → `/behavectl` |
| Codex | project Skill → `$behavectl` |

The read-only MCP/Skill layer can inspect, explain, and verify. Promotion,
rollback, and costly real A/B runs still require explicit human intent.

> **Agent-native does not mean agent-controlled.**

---

## Behavior Proof: the part you can hand to someone else

A terminal verdict is not enough. Behavectl can export a portable proof bundle:

```bash
behavectl proof bp_...
```

```text
.behavectl/proofs/<proof-id>/
├── PROOF.md
├── behavior-matrix.txt
├── patch.json
├── verification.json
├── manifest.json
├── checksums.json
├── evaluations/
│   ├── codex-trial-01.json
│   └── codebuddy-trial-01.json
└── diffs/
    ├── codex-trial-01.txt
    └── codebuddy-trial-01.txt
```

The chain is explicit:

```text
source
  → proposed behavior
  → evidence
  → deterministic checks
  → real before / after
  → stable cross-agent result
  → exact patch digest
  → proof
  → promotion
```

Verify a copied proof offline:

```bash
behavectl proof verify .behavectl/proofs/proof_...
```

A valid proof requires both:

```text
SHA-256 byte integrity
+
Patch ↔ Verification ↔ Evaluation semantic binding
```

A changed patch cannot reuse old evidence. A fixture cannot generate a
promotable proof.

---

## Put behavior changes behind CI

```bash
behavectl ci init
```

Behavior CI verifies retained evidence instead of rerunning stochastic model
calls in GitHub Actions:

```text
BEHAVECTL
Behavior CI

✓ SAFE TO MERGE

Trust checks
  ✓ Behavior changes use Behavectl-managed surfaces
  ✓ Every changed Behavior Patch has a passing proof
  ✓ Proof integrity is valid
  ✓ Proof covers changed agent targets
  ✓ Managed outputs match proved behavior
```

If someone edits a managed behavior surface outside the governed path, CI
blocks the change.

> **Don't rerun stochastic agents in CI just to rediscover whether a behavior
> worked. Verify the proof.**

---

## Release certification is a profile, not a vendor list

A release certifies the adapters it intentionally names — not every adapter
Behavectl happens to support.

```bash
behavectl rc --agents codex,codebuddy --artifact ./behavectl-0.1.0-alpha.1.tgz --yes
```

Adapters can also produce artifact-bound shards in their own native environments
and merge them offline. The merge requires one exact profile, patch, spec, trial
policy, package identity, and artifact SHA-256.

> **Evidence may be distributed. Trust must converge.**

[Certification profiles + distributed RC →](docs/publish-runbook.md)

---

## Trust is a product surface

Behavectl is opinionated about the boundaries that matter:

- **Local-first.** No Behavectl cloud account is required.
- **Human-gated.** Capture, proposal, evaluation, and promotion are separate.
- **Real behavior tests.** No mock result can unlock production promotion.
- **Isolated A/B runs.** Your working tree is not the evaluation sandbox.
- **Exact-version promotion.** Promotion is bound to the verified patch digest.
- **Full target coverage.** Every Agent declared by a patch must pass; undeclared Agents are irrelevant.
- **Proof integrity.** Byte integrity and semantic binding are both checked.
- **Failure is safe.** Infrastructure failure is never converted into a behavior verdict.
- **Rollback is first-class.** Active behavior can be retired and regenerated.
- **Surgical uninstall.** Behavectl removes only Behavectl-owned hooks and keeps history.

The public CLI intentionally has no force-promotion path.

---

## Failure should still feel designed

Protocol drift, missing authentication, stale verification, an invalid proof, or
a blocked promotion all render the same four answers:

```text
What happened?
Why did Behavectl stop?
What did NOT change?
What should I do next?
```

Example:

```text
BEHAVECTL · Operation stopped safely                         BLOCKED
AGENT PROTOCOL CHANGED                         ERR-PROTOCOL-PARSE-FAILED
● No behavior verdict was produced.
› behavectl replay <agent> <trace.jsonl>
```

Normal failures hide stack traces. Maintainers can opt into bounded diagnostics
with `BEHAVECTL_DEBUG=1`.

---

## Built for stochastic agents, not happy-path demos

A single passing run is evidence, not stability.

```bash
behavectl verify bp_... --repeat 3
```

Behavectl preserves every trial. One failed required trial blocks promotion.

Coding-agent protocols also change. Release validation can retain raw synthetic
traces and replay them offline:

```bash
behavectl replay bundle ./behavectl-live-...
```

Parser drift is treated as an infrastructure problem, not an agent regression.

---

## The release itself is evidence-gated

Maintainers do not publish because the code *feels* ready. Release evidence is
**profile-scoped**: a release states exactly which Agent adapters were
authenticated and proved. Supporting an adapter never makes every release or
every Behavior Patch depend on it.

```text
selected certification profile
        ↓
authenticated adapter evidence
        ↓
exact patch + spec + trial policy
        ↓
Behavior Proof
        ↓
exact npm artifact SHA-256
        ↓
RELEASE CANDIDATE: GO
```

A profile may certify Codex + CodeBuddy, Claude Code alone, or another declared
set as adapters mature. Behavectl must never imply universal coverage from a
smaller proof set.

No retained real proof for the declared profile, no public claim for that
profile.

---

## Proof of Release

The RC binds real evidence to the exact npm tarball and seals its SHA-256. Change
the artifact and the release proof fails.

> **No artifact match, no release.**

## Current status

Behavectl is an **unpublished alpha candidate**.

Implemented today:

```text
Behavior Patch registry
Agent Registry + pluggable adapters
Codex adapter
CodeBuddy Code adapter
Claude Code adapter
agent-native Skills + read-only MCP where supported
isolated before / after evaluation
cross-agent Stability Gate
Behavior Proof + integrity verification
human promotion + rollback
Behavior CI + protocol replay
terminal-native success + failure UX
```

The local release gate is automated. Authenticated model evidence is still an
explicit blocker for any public adapter-certification claim, and this repository
does not claim real model results until those runs are retained.

---

## Read the system, not just the pitch

- [The Behavectl Laws](docs/principles.md)
- [60-second quickstart](docs/quickstart.md)
- [Architecture](docs/architecture.md)
- [Trust model](docs/trust-model.md)
- [Agent-native mode](docs/phase6i-agent-native-mode.md)
- [Adding a coding-agent integration](docs/adapter-guide.md)
- [Contributing](CONTRIBUTING.md)
- [Security](SECURITY.md)
- [Roadmap](ROADMAP.md)

---

## North star

> **Make every persistent agent behavior explainable, testable, versioned, and reversible.**

Today that means project behavior across the Agent adapters you explicitly
target. The control surface can expand without changing the principle:

```text
Memory → Rule → Skill → Tool policy → Workflow → Harness change
```

If you believe agent behavior deserves the same engineering discipline as code,
Behavectl is for you.
