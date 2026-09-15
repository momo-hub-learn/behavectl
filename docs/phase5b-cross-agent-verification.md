# Phase 5b — Cross-Agent Verification

## Product decision

Cross-agent behavior should not be a file-sync feature.

It should be a **verification feature**.

```text
Behavior Patch
      ↓
same Behavior Spec
      ↓
┌──────────────┬──────────────┐
│ Claude Code  │    Codex     │
│ baseline/A   │ baseline/A   │
│ candidate/B  │ candidate/B  │
└──────┬───────┴──────┬───────┘
       ↓              ↓
    Behavior Diffs
       └──────┬───────┘
              ↓
   Cross-Agent Behavior Matrix
              ↓
        Behavior Proof
```

## Public command

```bash
behavectl verify bp_...
```

Default behavior:

- discover all real evaluators currently ready on the machine;
- use the same reviewed Behavior Spec;
- run isolated A/B evaluation for each agent;
- persist every real evaluation;
- render one aligned matrix;
- generate a multi-agent Behavior Proof.

Optional:

```bash
behavectl verify bp_... --agents claude
behavectl verify bp_... --agents codex
behavectl verify bp_... --agents claude,codex
behavectl verify bp_... --require-all
```

`--require-all` is useful for the release/demo path where both Claude Code and
Codex must be present.

## Signature output

```text
Cross-Agent Behavior Matrix · bp_...

Check                  Claude Code       Codex
─────────────────────  ────────────────  ────────────────
Uses pnpm              FAIL → PASS       FAIL → PASS
Avoids npm             FAIL → PASS       FAIL → PASS
No package-lock.json   FAIL → PASS       FAIL → PASS

Claude Code  PROMOTE
Codex        PROMOTE

Coverage: 2/2 agents passed
Verdict: READY TO PROMOTE ACROSS VERIFIED AGENTS
```

## Important distinction

Behavectl does not claim:

> a rule that works in Claude must work in Codex.

It tests that claim.

This is the difference between **cross-agent synchronization** and
**cross-agent behavior portability**.

The latter is the category Behavectl should own.

## Implementation note

Phase 5b also fixed an important adapter bug discovered during audit:
the Codex runner now parses Codex `command_execution` JSONL events through the
Codex-specific parser rather than the Claude stream parser.

This is exactly why vendor-specific protocol handling stays behind adapters.
