# Behavectl Architecture

Behavectl is a change-control layer for **persistent AI-agent behavior**.

The system intentionally separates learning from shipping:

```text
native learning / user correction
            ↓
      Behavior Patch
            ↓
   evidence · scope · risk
            ↓
      Behavior Spec
            ↓
  isolated before / after
            ↓
 cross-agent verification
            ↓
      Stability Gate
            ↓
      Behavior Proof
            ↓
     human promotion
            ↓
  compiled agent behavior
            ↓
   CI · observe · rollback
```

## Core invariant

> No persistent behavior change without provenance, evaluation, and rollback.

## Core objects

### Event

A normalized observation from a source such as a user correction or coding
agent hook.

### Behavior Patch

A structured proposal to change future agent behavior.

```text
statement
scope
targets
risk
evidence
status
```

A patch is a proposal, not active behavior.

### Behavior Spec

A deterministic test hypothesis for a patch. Machine checks are intentionally
separate from human semantic review.

### Evaluation

One isolated baseline/candidate A/B run using a real coding-agent runner or an
explicit fixture runner.

Fixture evaluations can test Behavectl itself, but never unlock promotion.

### Verification Run

A persisted set of evaluations across one or more agents and trials.

The verification record is the source of truth for promotion eligibility.

### Behavior Proof

A portable evidence bundle binding the exact Behavior Patch to its real
Verification Run and evaluations.

Proof validity requires both:

```text
byte integrity
+
semantic patch binding
```

## Source and target adapters

Capture and compilation are separate concerns:

```text
SourceAdapter
  detect
  capture
  snapshot

TargetAdapter
  compile
  apply
  rollback
```

This prevents Behavectl from becoming a vendor-specific rule-sync tool.

## Agent-native layer

```text
Claude Code / Codex / codebase agent
              │
        Agent Skill
              │
      read-only MCP tools
              │
              ↓
         Behavectl Core
```

The MCP surface is read-only by design. An agent may inspect and explain
Behavectl state, but cannot silently promote, roll back, or launch expensive
real-agent verification.

## Storage

Project-local state lives under:

```text
.behavectl/
```

The default architecture requires no daemon and no Behavectl cloud service.

Read-only commands do not initialize or mutate this directory.

## Real-agent evaluation

Claude Code and Codex runs use isolated workspaces and structured vendor
protocols.

Behavectl only counts typed execution events as commands:

> Agent mentioning a command ≠ agent executing a command.

Protocol/parser failures are infrastructure failures, not behavior verdicts.

## Trust boundaries

Behavectl deliberately separates:

```text
capture
proposal
evaluation
proof
promotion
```

No layer silently collapses into the next.

Important boundaries:

- fixtures cannot unlock promotion;
- a patch changed after verification requires re-verification;
- every declared target must be covered before promotion;
- public CLI has no force-promotion path;
- MCP cannot mutate durable behavior;
- proof checksums alone are not sufficient without semantic binding.

## Team workflow

A normal team flow is:

```text
developer machine
  ↓
real A/B verification
  ↓
Behavior Proof
  ↓
commit managed behavior + proof
  ↓
pull request
  ↓
Behavior CI
  ↓
merge
```

CI verifies retained proof instead of rerunning stochastic models on every PR.

## Why the architecture is small

Behavectl is not trying to be an agent framework, memory database, prompt
manager, or orchestration runtime.

It owns one boundary:

> **What deserves to become persistent future behavior?**
