# Phase 6i — Agent-Native Mode

## Goal

Behavectl must not force developers to leave the coding agent they already use.

The product should work in two ways at the same time:

```text
terminal-native
+
agent-native
```

A developer can still run:

```bash
behavectl review
```

but they should also be able to stay inside Claude Code or Codex and say:

```text
"What behavior changes are waiting for review?"
```

## Architecture

```text
Claude Code / Codex / other codebase agent
                │
                ├── Agent Skill
                │     intent recognition
                │     lifecycle knowledge
                │     safety rules
                │
                ├── MCP
                │     read-only structured state
                │
                └── shell / CLI
                      explicit mutating actions
                            │
                            ↓
                       Behavectl Core
```

The key product rule is:

> **Agent-native ≠ agent-controlled.**

Agents can inspect behavior state automatically. Durable mutation remains
human-gated.

## Claude Code

Project skill:

```text
.claude/
└── skills/
    └── behavectl/
        └── SKILL.md
```

After installation, Claude Code can explicitly invoke:

```text
/behavectl
```

or select the skill automatically when a user asks about learned behavior,
Behavior Patches, verification, proof, promotion, or rollback.

Optional project MCP config:

```text
.mcp.json
```

connects the read-only Behavectl stdio MCP server.

Install:

```bash
behavectl agent install --claude --mcp
```

`behavectl init --claude --mcp` performs the same agent-native setup as part of
normal project initialization.

A distributable Claude Code plugin is also included under:

```text
integrations/claude-plugin/
```

It packages:

```text
Claude Skill
+
Behavectl MCP
```

## Codex

Repository skill:

```text
.agents/
└── skills/
    └── behavectl/
        ├── SKILL.md
        └── agents/
            └── openai.yaml
```

Explicit invocation:

```text
$behavectl
```

Codex can also discover the skill implicitly when the user request matches its
description.

Install:

```bash
behavectl agent install --codex
```

The SKILL.md is intentionally the same workflow used for Claude Code. Behavectl
does not maintain one governance philosophy per vendor.

## Generic codebase agents

The architecture has two portable integration lanes:

```text
Agent Skills
MCP
```

An agent that supports either can integrate Behavectl without a bespoke core
adapter.

This is how the project should expand to additional codebase-aware agents:
adapter-specific capture/eval where necessary, but shared governance semantics.

## MCP safety model

The v0.1 MCP surface is deliberately **read-only**.

Tools:

```text
behavectl_status
behavectl_inbox
behavectl_patch
behavectl_history
behavectl_proof_verify
behavectl_next_action
```

Not exposed:

```text
promote
rollback
real verify
real test
```

Why?

### Promotion and rollback

These change persistent future behavior.

An LLM must not gain a hidden tool that can silently mutate its own durable
policy.

### Real verification

Real verification can launch multiple isolated Claude/Codex sessions and incur
cost. Exposing it as an implicitly callable MCP tool would make accidental
nested agent execution too easy.

The Agent Skill instead tells the coding agent to explain the cost and obtain
explicit user intent before invoking the CLI.

## Human gate inside an agent session

The skill contains this policy:

```text
inspect freely
explain freely
propose freely

verify only after clear user intent
promote only after explicit user request
rollback only after explicit user request
```

This means Behavectl feels native inside the agent without giving the agent
control over its own governance boundary.

## First-minute flow

```bash
npm install -g behavectl
cd my-project
behavectl init --all --mcp
```

Then, inside Claude Code:

```text
/behavectl
```

or:

```text
What behavior changes are waiting for review?
```

Inside Codex:

```text
$behavectl
```

or ask the same question naturally.

## Why both Skill and MCP?

A Skill answers:

> **When should the agent use Behavectl, and what is the safe workflow?**

MCP answers:

> **What is the current structured Behavectl state?**

The combination is materially better than either alone:

```text
Skill only
→ knows the workflow but must shell out / parse text

MCP only
→ has tools but lacks product policy and invocation guidance

Skill + MCP
→ native intent + structured state + explicit mutation gate
```

## Distribution

The npm package includes:

```text
integrations/
├── agent-skill/
│   └── behavectl/
│       ├── SKILL.md
│       └── agents/openai.yaml
└── claude-plugin/
    ├── .claude-plugin/plugin.json
    ├── .mcp.json
    └── skills/behavectl/SKILL.md
```

This gives Behavectl three distribution paths:

```text
CLI install
Agent Skill
Claude Code plugin
```

without adding a runtime dependency.
