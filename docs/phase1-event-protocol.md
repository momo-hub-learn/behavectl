# Phase 1 — Event Protocol

Behavectl's first hard engineering boundary is a versioned local event protocol.

## Why

Harness vendors will change their native hook payloads over time. Behavectl core should not depend on those payloads directly.

```text
Claude hook JSON
      ↓
Claude source adapter
      ↓
behavectl.event.v1
      ↓
core detector / patch engine
```

Later:

```text
Codex hooks/app-server events
      ↓
Codex source adapter
      ↓
the same behavectl.event.v1
```

## Envelope

```json
{
  "schema": "behavectl.event.v1",
  "id": "evt_...",
  "source": "claude-code",
  "kind": "UserPromptSubmit",
  "observedAt": "2026-09-10T...",
  "repoRoot": "/repo",
  "cwd": "/repo",
  "sessionId": "abc123",
  "data": {
    "prompt": "Don't use npm in this repo. We always use pnpm."
  },
  "rawMeta": {
    "permissionMode": "default"
  }
}
```

### Design rules

- The envelope is stable even if native hook schemas change.
- `data` contains only fields used by Behavectl behavior logic.
- raw transcript contents are not copied into the store.
- source adapters may preserve small non-sensitive metadata for debugging.
- the event log is append-only.
- event processing is idempotent through `state.json`.
- capture is separate from proposal; proposal is separate from promotion.

## Claude Code hook events used in Phase 1

- `UserPromptSubmit`: primary correction signal.
- `PostToolUse`: behavior/action evidence.
- `PostToolUseFailure`: failure evidence.
- `Stop`: turn boundary and final assistant message.
- `SessionEnd`: session boundary.

We intentionally do not parse the full Claude transcript in Phase 1. The hook API gives us enough stable fields for the first product loop.

## Hook installer

`behavectl init --claude` merges Behavectl hooks into `.claude/settings.local.json`.

Requirements:

- preserve unrelated user settings;
- preserve existing hook groups;
- idempotent install;
- local-only by default;
- command hook stays quiet and fast;
- no network call.

## Detection philosophy

Phase 1 only creates candidates for high-confidence explicit corrections.

Examples:

```text
Don't use npm in this repo. Use pnpm.
Always run integration tests before committing.
For this project, never edit generated files.
Use the repository factory instead.
```

Ordinary tasks should not trigger.

False negatives are acceptable in Phase 1. False positives damage trust.

## Next Phase

Phase 2 will add:

- evidence enrichment from repository state;
- deterministic Behavior Specs;
- a managed behavior compiler for Claude Code;
- a clean promotion/rollback journal.
