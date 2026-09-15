# The Behavectl Laws

Behavectl exists because persistent agent behavior is becoming an engineering
surface of its own.

These laws are the product boundary. Features can change. The laws should be
much harder to change.

## I. Learning is a proposal, not a deployment

An agent may infer a preference, detect a convention, or learn from a
correction automatically.

That does **not** mean the learned behavior should silently become project-wide
policy.

```text
learned
  ≠ approved
  ≠ verified
  ≠ active
```

Capture can be automatic. Promotion is explicit.

## II. Behavior must be diffable

A durable behavior change should have a before and an after that another human
can inspect.

```text
before behavior
      ↓
proposed patch
      ↓
after behavior
```

If the effect cannot be explained or evaluated, it is not ready to ship.

## III. A verdict is weaker than a proof

A green line in a terminal is not enough.

A Behavior Proof binds the exact patch to the verification and evaluations that
produced the verdict.

```text
Patch digest
   ↕
Verification
   ↕
Evaluations
   ↕
Proof integrity
```

Old evidence must not bless new behavior.

## IV. Agent-native does not mean agent-controlled

Agents should be able to inspect behavior state, explain patches, and verify
proofs from inside their own workflow.

They should not silently govern themselves.

```text
inspect       ✓
explain       ✓
propose       ✓

promote       human-gated
rollback      human-gated
costly A/B    explicit
```

The closer Behavectl gets to the agent, the clearer this boundary should become.

## V. Infrastructure failure is not behavior failure

Authentication errors, quota limits, parser drift, network problems, and broken
agent CLIs are not evidence that a Behavior Patch is bad.

Behavectl must refuse to manufacture a behavior verdict from an infrastructure
failure.

```text
runner failed
    ↓
no verdict
```

Trust requires knowing when **not** to decide.

## VI. Every durable change needs a way back

Rollback is part of the normal lifecycle, not an emergency feature.

```text
propose → verify → prove → promote → observe → rollback
```

A system that can change behavior but cannot explain or reverse that change is
not under control.

## VII. The product includes the failure path

A blocked operation should still answer:

```text
What happened?
Why did Behavectl stop?
What did NOT change?
What should I do next?
```

Safety should be visible, not implied.

---

The shortest version is this:

> **Learning can be automatic. Shipping behavior should not be.**

## VIII. What ships must be what was proved

A valid behavior proof is not enough if the artifact that reaches users is a
different build.

The Release Candidate must bind the retained live evidence to the exact package
that is going to be published.

```text
real behavior evidence
        ↓
Release Candidate
        ↓
exact npm artifact
        ↓
SHA-256 release seal
```

If the artifact changes, the release proof no longer applies.

> **No artifact match, no release.**


## IX. Cross-agent does not mean colocated

Claude Code and Codex may produce independent, artifact-bound evidence in their native environments. Cross-agent trust is established by deterministic merge constraints, not by requiring every provider CLI on one machine.


## X. Supported does not mean required

Behavectl can know about many Agent Adapters without forcing every project,
Behavior Patch, or Release Candidate to exercise all of them.

The required set is explicit:

```text
Behavior Patch targets
        or
RC certification profile
        ↓
required adapters
```

Everything else is irrelevant to that proof.

> **Declared targets are required. Installed-but-undeclared agents are not.**

## XI. Vendor differences belong in adapters, not Core

A new coding agent should contribute a new adapter, not another vendor branch in
the behavior lifecycle.

```text
Behavectl Core
      ↓
Agent Adapter Contract
      ↓
vendor runtime / protocol / persistent surface
```

Core owns change control. Adapters absorb runtime differences.

> **Adding an agent should add an adapter, not a branch in Core.**
