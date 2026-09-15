# Phase 3b — Real-Agent Protocol Hardening

## Claude Code

Behavectl's A/B runner now uses a constrained CLI profile:

```text
claude
  --bare
  --restricted
  -p
  --output-format stream-json
  --verbose
  --max-turns <N>
  --max-budget-usd 1.00
  --no-session-persistence
  --permission-mode auto
  --tools Bash,Edit,Read
```

Why:

- `--bare` removes discovered CLAUDE.md, auto memory, hooks, skills, plugins, MCP, custom commands and subagents from the controlled evaluation arm.
- `--restricted` is explicitly intended for evaluation harnesses on shared machines; file tooling is confined to working directories and user/project customizations are restricted.
- tool availability is explicit.
- no `--dangerously-skip-permissions` is used.
- session persistence is disabled.
- budget and turn count are bounded.

Candidate behavior is injected only through `--append-system-prompt`.

The stream parser accepts the documented assistant message shape:

```json
{
  "type": "assistant",
  "message": {
    "content": [
      {
        "type": "tool_use",
        "name": "Bash",
        "input": { "command": "..." }
      }
    ]
  }
}
```

Only actual Bash/PowerShell `tool_use` blocks count as command behavior.

## Codex

Current OpenAI Codex source defines the non-interactive exec flags used by Behavectl:

```text
codex exec
  --json
  --ephemeral
  --ignore-user-config
  --ignore-rules
```

`--json` emits JSONL `ThreadEvent` values. The official source currently defines:

```text
thread.started
turn.started
turn.completed
turn.failed
item.started
item.updated
item.completed
error
```

and command items as:

```json
{
  "type": "item.completed",
  "item": {
    "id": "...",
    "type": "command_execution",
    "command": "pnpm add zod",
    "aggregated_output": "...",
    "exit_code": 0,
    "status": "completed"
  }
}
```

Behavectl now parses this typed shape rather than recursively scanning arbitrary JSON fields.

This matters because **a behavior evaluator must distinguish model text mentioning a command from an actual command execution item**.

## Remaining real-machine validation

The current execution environment does not contain authenticated `claude` or `codex` binaries. Therefore:

```text
✓ protocol definitions verified against official docs/source
✓ parser behavior covered by tests
✗ live model execution not claimed
```

A public release remains blocked on live-machine fixture capture for both agents.


## Phase 5c Codex candidate injection

Current Codex source exposes `developer_instructions` as a separate instruction
layer and the shared CLI exposes `--sandbox workspace-write`.

Behavectl therefore evaluates Codex with:

```text
baseline:
  no candidate developer_instructions

candidate:
  -c developer_instructions="<Behavior Patch>"

both:
  --json
  --ephemeral
  --ignore-user-config
  --ignore-rules
  --sandbox workspace-write
```

The ordinary user task remains byte-for-byte the same across the two arms.
