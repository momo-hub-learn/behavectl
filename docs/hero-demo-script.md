# Hero Demo — Recording Script

Target length: **25–35 seconds**.

The hero demo must be a real authenticated run. No fixture output is allowed.

## Scene 1 — the learning signal

Claude Code session:

```text
User:
Don't use npm in this repo. We always use pnpm.
```

Behavectl captures the correction through the local hook bridge.

## Scene 2 — the inbox

```bash
behavectl review
```

Show only long enough to read:

```text
What changed
  Don't use npm in this repo. We always use pnpm.

Why Behavectl surfaced it
  ✓ Explicit user correction
  ✓ pnpm-lock.yaml
  ✓ packageManager = pnpm@10.4.1
```

## Scene 3 — verification

Press `T`.

If both agents are installed, review now verifies the same Behavior Patch
against Claude Code and Codex.

Cut directly to:

```text
Cross-Agent Behavior Matrix

                       Claude Code       Codex
Uses pnpm              FAIL → PASS       FAIL → PASS
Avoids npm             FAIL → PASS       FAIL → PASS

Coverage: 2/2 agents passed
```

## Scene 4 — promotion

Press `P`.

```text
✓ Behavior promoted

Claude Code   .claude/rules/behavectl/...
Codex         AGENTS.md

Rollback anytime:
behavectl rollback bp_...
```

## Scene 5 — proof

Very short final cut:

```bash
behavectl proof bp_...
```

and:

```text
PROOF.md
behavior-matrix.txt
evaluations/
diffs/
```

End card:

> **Behavectl — Git for AI behavior.**

> **Your agents already learn. Make learning safe to ship.**

## Recording rules

- real Claude Code and real Codex;
- clean repository;
- no API keys visible;
- no hidden edits between cuts;
- terminal at readable font size;
- one dark terminal theme;
- no decorative dashboard;
- no fixture or mock labels in the hero demo because fixtures are not used;
- preserve the raw proof bundle used for the recording.
