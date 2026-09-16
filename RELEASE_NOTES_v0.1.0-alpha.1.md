# Behavectl v0.1.0-alpha.1

**Git for AI behavior.**

Behavectl gives persistent coding-agent behavior the same change-control
discipline we already expect for code:

```text
learn
→ patch
→ review
→ test
→ stability
→ proof
→ promote
→ CI
→ rollback
```

### What is in the first alpha

- Agent Registry with Codex, CodeBuddy Code, and Claude Code behavior adapters
- public `behavectl.agent-adapter.v1` SDK for explicit community adapters
- adapter-owned native compilation and protocol replay; Core has no vendor surface branches
- declared Release Candidate certification profiles instead of a mandatory vendor pair
- Behavior Patch and deterministic Behavior Spec
- isolated real-agent A/B evaluation
- cross-agent Stability Matrix
- tamper-evident, patch-bound Behavior Proof
- Behavior CI for pull requests
- protocol replay for vendor CLI drift
- human promotion and immediate rollback
- local-first architecture with zero runtime dependencies

### Trust boundary

Behavectl does not silently promote behavior, does not treat fixture results as
real evidence, and does not convert authentication/network/parser failures into
behavior regressions.

### Status

This is an **unpublished alpha candidate with a verified Codex RC GO**.
On September 16, 2026, three paired native Codex trials (six real tasks) improved
complete-task passes from **1/3 to 3/3** on the generated-config challenge.
All 13 RC checks passed, including protocol replay, trace and proof integrity,
and binding to the retained publish artifact.

This result covers one challenge and the recorded Codex CLI version; it does
not establish broad benchmark performance. CodeBuddy Code and Claude Code
remain supported adapters without certification in this release.

Certified artifact SHA-256:
`d073d2c9f99b7e66c7f2163b77b8f38fa0fd4e8fa23795c0b41e598fa19fc30e`.
Publish the retained artifact without repacking it.
See [the launch checklist](LAUNCH_CHECKLIST.md) for certification lineage and
remaining publication steps.

### Interface

- local Studio with project-rule diagnosis and an explicit correction-to-draft workflow
- editable behavior rules, target agents, validation tasks, and checks
- real A/B commands and bounded before/after file contents retained for review
- per-trial results shown as each paired trial finishes; partial results cannot enable promotion
- event-backed task stages and elapsed time, with completed tasks distinguished from passing checks
- explicit stale-evidence labels when a rule or project specification changes

- stable public error references for known user-facing failures
- typo-aware command recovery for common near-miss commands
- Launch-grade terminal UI with a consistent Behavectl visual language
- electric cyan / violet / green semantic color system
- status meaning preserved without color
- animated scanner during real A/B evaluation
- screenshot-quality plain mode for CI, docs, and issue reports

### Agent-native

- Behavectl can be invoked directly inside Claude Code as `/behavectl`
- Behavectl can be invoked in Codex as `$behavectl`
- repository-scoped Agent Skills share one governance workflow across vendors
- optional read-only MCP gives agents structured Behavectl state
- durable behavior mutation remains human-gated
