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

This is an unpublished alpha candidate. Public adapter-certification claims are
gated on retained authenticated evidence for the explicitly declared target
profile; Behavectl does not require every supported Agent to participate.

### Interface

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
