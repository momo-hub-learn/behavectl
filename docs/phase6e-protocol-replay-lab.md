# Phase 6e — Protocol Replay Lab

## Why this exists

Behavectl depends on structured CLI protocols from real coding agents.

That creates a release risk:

```text
Claude Code / Codex update
        ↓
JSONL shape changes
        ↓
parser extracts the wrong behavior signal
        ↓
Behavior Diff becomes misleading
```

A parser problem must never be reported as an agent behavior regression.

## Offline replay

Single trace:

```bash
behavectl replay claude path/to/trace.jsonl
behavectl replay codex path/to/trace.jsonl
```

Whole live-validation bundle:

```bash
behavectl replay bundle behavectl-live-2026-.../
```

The bundle command accepts either:

```text
<live-bundle>/
```

or:

```text
<live-bundle>/traces/
```

## What replay reports

Claude:

```text
event count
top-level event types
content/tool use count
commands
usage presence
terminal result presence
```

Codex:

```text
event count
top-level event types
item types
command_execution events
file changes
commands
usage presence
turn.completed presence
```

Replay never invents command behavior from arbitrary text.

The rule remains:

> **Agent mentioning a command ≠ agent executing a command.**

## Live-validation trace capture

Raw trace persistence is opt-in by product context.

Normal user-project evaluation:

```text
behavectl test / behavectl verify
→ no raw model trace persistence by default
```

Synthetic release validation:

```text
behavectl live
→ raw Claude/Codex JSONL captured
→ traces/trace-manifest.json
→ traces/protocol-report.json
```

This avoids accidentally turning ordinary project evaluations into a log of
private prompts, code, or tool output.

The `behavectl live` challenge is synthetic, so retaining its raw traces is useful and
low-risk.

## Live bundle shape

```text
behavectl-live-.../
├── proof/
├── challenge/
├── environment.json
├── result.json
└── traces/
    ├── trace-manifest.json
    ├── protocol-report.json
    ├── claude-code/
    │   ├── trial-01-baseline.jsonl
    │   ├── trial-01-candidate.jsonl
    │   └── ...
    └── codex/
        ├── trial-01-baseline.jsonl
        ├── trial-01-candidate.jsonl
        └── ...
```

Each raw trace receives a SHA-256 digest in the trace manifest.

The trace manifest is a debugging/reproducibility aid. Behavior Proof remains
the release trust artifact.

## Protocol failure semantics

These are infrastructure/protocol failures:

```text
exit 0 + no parseable structured events
exit 0 + Claude terminal result missing
exit 0 + Codex turn.completed missing
live raw traces replay unhealthy
```

They produce:

```text
SW_PROTOCOL_PARSE_FAILED
or
SW_PROTOCOL_DRIFT
```

They do **not** produce:

```text
REJECT
```

for the Behavior Patch.

## Release workflow

After the first authenticated 3×3 live run:

```bash
behavectl live --repeat 3 --yes
behavectl replay bundle ./behavectl-live-...
```

Then retain:

```text
raw traces
protocol report
Behavior Proof
environment manifest
Stability Matrix
```

When a future Claude/Codex CLI release changes behavior, replay the old bundle
with the new Behavectl parser before changing parser logic.

That gives Behavectl a real protocol regression corpus instead of parser
guesswork.
