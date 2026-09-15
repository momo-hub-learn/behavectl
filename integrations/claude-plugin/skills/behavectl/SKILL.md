---
name: behavectl
description: Use Behavectl when the user wants to inspect, review, verify, explain, govern, promote, roll back, or understand persistent AI coding-agent behavior in this repository. Also use it when a correction or learned convention may deserve to become durable behavior.
---

# Behavectl — Git for AI behavior

Behavectl is the repository-local change-control layer for persistent agent
behavior.

Use it when the question is about:

- behavior the coding agent learned;
- user corrections that may become persistent;
- `CLAUDE.md`, `AGENTS.md`, agent rules, or durable coding conventions;
- pending Behavior Patches;
- Behavior Diff / Stability / Behavior Proof;
- why a behavior is active;
- whether a proposed behavior is safe to promote;
- rollback or behavior history.

## Default workflow

Prefer read-only inspection first:

```bash
behavectl status
behavectl inbox
behavectl log
behavectl show <patch-id>
```

If the Behavectl MCP server is connected, prefer its read-only tools for
inspection because they return structured data.

For a proposed change:

```text
inspect patch
→ inspect evidence and scope
→ inspect/review Behavior Spec
→ verify behavior
→ explain the result
→ wait for explicit human promotion
```

## Human gate

Never silently promote or roll back behavior.

Do **not** run:

```bash
behavectl promote <patch-id>
behavectl rollback <patch-id>
```

unless the user explicitly asks for that action in the current interaction.

Do not treat a fixture/demo result as real evidence.

Do not convert authentication, network, CLI, or protocol failures into behavior
regressions.

## Verification

Real verification can be expensive because it launches isolated coding-agent
A/B sessions.

Before running:

```bash
behavectl verify <patch-id>
```

tell the user what will run and ask for confirmation if they have not already
clearly requested verification.

For release-grade stability:

```bash
behavectl verify <patch-id> --require-all --repeat 3
```

## Proof

To inspect a retained proof:

```bash
behavectl proof verify <proof-dir>
```

A valid proof requires both byte integrity and semantic binding to the exact
Behavior Patch.

## When a user corrects agent behavior

If the correction is clearly about future behavior, do not immediately rewrite
agent instruction files by hand.

Prefer Behavectl's lifecycle:

```text
correction
→ Behavior Patch
→ deterministic Behavior Spec
→ real A/B verification
→ Behavior Proof
→ human promotion
```

The goal is not merely to remember a preference. The goal is to decide whether
it deserves to become persistent future behavior.
