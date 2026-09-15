# Phase 4c — Installation That Does Not Break

A 100k-star developer tool cannot have a magical demo and a fragile install.

## Problem

If a developer runs:

```bash
npx behavectl init
```

the package may be executed from an npm cache path. A hook configuration that
points back to that package path is fragile: the cache location is not a
durable runtime contract.

## Solution: project-local hook bridge

`behavectl init` writes one tiny dependency-free capture bridge:

```text
.behavectl/hooks/capture.mjs
```

Claude Code and Codex hooks point to that file, not to the transient npm
package location.

The bridge has one responsibility:

```text
native hook JSON
      ↓
normalize minimal stable fields
      ↓
append behavectl.event.v1
```

It does not perform model calls, proposal generation, or promotion.

This keeps hook execution:

- fast;
- local;
- network-free;
- dependency-free;
- stable after an `npx` one-shot install.

## Auto-detection

Plain:

```bash
behavectl init
```

detects Claude Code / Codex from installed binaries or project directories and
connects what is present.

Power users can force:

```bash
behavectl init --claude
behavectl init --codex
behavectl init --all
```

## Uninstall contract

```bash
behavectl uninstall
```

removes only Behavectl-owned hook groups. It preserves:

- unrelated Claude hooks;
- unrelated Codex hooks;
- local Behavectl history.

History deletion is intentionally separate and explicit.

## Product principle

> Install should feel reversible before the user has to trust the product.
