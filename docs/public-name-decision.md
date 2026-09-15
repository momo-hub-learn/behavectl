# Public Name Decision — Behavectl

## Decision

The public project name is:

# Behavectl

Package and CLI:

```bash
npx behavectl demo
behavectl init
behavectl review
behavectl rc --yes
```

Positioning remains:

> **Git for AI behavior.**

Category:

> **Change Control for AI Behavior.**

## Why this name

`Behavectl` compresses **behavior + control** into a developer-native CLI name.
It fits the product's actual job:

```text
detect behavior change
→ review
→ test
→ prove
→ promote
→ enforce in CI
→ roll back
```

It does not lock the product to one vendor, one model, memory, prompts, or one
agent framework.

## Collision audit before adoption

Pre-launch searches found:

- no exact public GitHub repository named `behavectl`;
- no indexed npm package result for `behavectl`;
- no indexed AI/devtool product using the exact name in the searches performed.

This is a practical launch check, not legal clearance or proof of trademark
availability. The package/repository name still needs to be reserved before
public launch.

## Naming rule

Internal code, schemas, local storage, managed Claude rules, CI workflow names,
and public documentation use `Behavectl` / `behavectl` consistently from the
first public alpha onward.

The public interface uses `Behavectl` / `behavectl` consistently from the first alpha.
