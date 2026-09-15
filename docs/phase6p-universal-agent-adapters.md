# Phase 6p — Universal Agent Adapter Architecture

## Why this exists

Behavectl governs persistent behavior, not vendor CLIs. Codex, CodeBuddy Code,
Claude Code, and future coding agents are runtimes behind a common control-plane
boundary.

```text
Behavior Patch / Spec / Proof / Policy
                │
                ▼
          BEHAVECTL CORE
                │
                ▼
     Agent Adapter Contract v1
        ┌───────┼────────┐
        ▼       ▼        ▼
      Codex  CodeBuddy  community
```

## Architectural invariant

Core must not branch on vendor identity to decide where promoted behavior lives
or how a retained protocol trace is parsed. Those responsibilities belong to
the adapter.

## Certification invariant

A release is certified against an explicit profile. The profile may contain one
adapter or several. It is not equivalent to the global list of supported
adapters.

```text
supported adapters = capability catalog
certification profile = proof obligation
Behavior Patch targets = behavior proof obligation
```

This keeps Behavectl extensible without making every new integration a new global
release dependency.
