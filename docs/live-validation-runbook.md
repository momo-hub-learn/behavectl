# Live Validation Runbook

This is the release-blocking runbook for the first public Behavectl demo.

## Preconditions

```bash
behavectl doctor
```

Required:

```text
✓ Git
✓ Claude Code
✓ Codex
✓ real Behavior Diff ready for both
```

Both CLIs must already be authenticated.

## Create a fresh challenge

```bash
behavectl demo create /tmp/behavectl-live-demo
cd /tmp/behavectl-live-demo
```

Never reuse a previously mutated demo directory.

## Verify both agents

```bash
behavectl verify bp_demo_generated_config --require-all --repeat 3
```

Do not edit the repository while verification is running.

## Inspect proof

The command creates a real proof bundle under:

```text
.behavectl/proofs/
```

Archive:

```text
PROOF.md
behavior-matrix.txt
evaluations/
diffs/
verification.json
manifest.json
```

## Release gate

Before recording the hero GIF:

1. Run one fresh `--repeat 3` verification with both agents.
2. Keep the complete proof bundle, including every trial.
3. Confirm no fixture evaluation exists in the promoted proof.
4. Confirm both arms use isolated workspaces.
5. Confirm candidate behavior is not present in the baseline arm.
6. Confirm Claude and Codex commands/artifacts are parsed from their native
   structured event streams.
7. Only record a run whose raw proof bundle is retained.

A flaky demo is a product bug, not a video-editing problem.
