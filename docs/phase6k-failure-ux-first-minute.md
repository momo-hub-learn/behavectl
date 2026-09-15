# Phase 6k — Failure UX + First-Minute Gate

## Goal

A polished developer tool is not judged only by its success path.

The real quality test is:

```text
missing authentication
protocol drift
stale verification
blocked promotion
invalid proof
wrong command
unexpected subsystem failure
```

Behavectl must stay calm, explicit, and reversible in all of them.

## Failure surface contract

Every user-facing fatal error should answer four questions:

```text
What happened?
Why did Behavectl stop?
Did persistent behavior change?
What should I do next?
```

The visual structure is:

```text
BLOCKED
   ↓
reason
   ↓
SAFETY
   ↓
what did NOT change
   ↓
RECOVER
   ↓
one or two concrete next actions
```

Example:

```text
╭ BEHAVECTL · Operation stopped safely ───────────── BLOCKED ╮

╭ AGENT PROTOCOL CHANGED ───────────────── ERR-PROTOCOL... ╮
│ Claude Code exited, but its structured event stream no   │
│ longer matches the parser contract.                      │
╰───────────────────────────────────────────────────────────╯

╭ SAFETY ─────────────────────────────── trust boundary ────╮
│ ● No behavior verdict was produced.                      │
╰───────────────────────────────────────────────────────────╯

╭ RECOVER ───────────────────────────────── next action ────╮
│ › behavectl replay claude <trace.jsonl>                  │
│ ◆ Upgrade Behavectl or inspect the retained trace.       │
╰───────────────────────────────────────────────────────────╯
```

## Error taxonomy

Initial launch categories:

```text
agent-run infrastructure failure
protocol parse failure
protocol replay drift
trace integrity failure
stale / unbound verification
stale / unbound evaluation
Release Candidate preflight failure
live validation preflight failure
live proof integrity failure
promotion policy failure
usage / argument error
unexpected failure
```

Infrastructure failure must never be rendered as a behavior rejection.

## Stack traces

Normal mode:

```text
no stack trace
```

Diagnostic mode:

```bash
BEHAVECTL_DEBUG=1 behavectl ...
```

Only explicit diagnostic mode renders a bounded debug panel.

This avoids leaking noisy implementation details into the normal product
experience while preserving an escape hatch for maintainers.

## Narrow-terminal behavior

Failure messages and recovery text are wrapped before styling.

No primary failure card should punch through its terminal panel because a
provider returns a long diagnostic string.

## First-Minute Gate

The launch repo now contains an executable stranger-experience contract:

```bash
npm run ux:check
```

It creates a fresh temporary repository and verifies the actual CLI:

```text
help
↓
demo
↓
read-only home
↓
agent-native install
↓
agent-native status
↓
blocked operation
```

It asserts that:

1. the category is immediately visible;
2. the demo is clearly a simulation;
3. demo/home inspection does not initialize project state;
4. a fresh project has one obvious next action;
5. Claude Code + Codex native entry points are visible;
6. the agent-native safety boundary is visible;
7. a failed operation renders recovery UI rather than a raw stack.

## Product principle

> **Failure is not an exception to the product experience.  
> Failure is one of the product experiences.**
