# Phase 6j — Open-Source Launch Surface

## Goal

Behavectl should look and behave like a serious open-source infrastructure
project the moment the repository becomes public.

The repository itself is part of the product.

## Added launch surfaces

```text
README category clarity
Architecture
Trust model
Quickstart
Adapter guide
Contributing guide
Security policy
Community conduct
Issue templates
PR template
Cross-platform CI
OSS launch gate
Examples
```

## OSS launch gate

```bash
npm run oss:check
```

The gate checks:

- required public repository files;
- package identity / license / zero-runtime-dependency contract;
- README product contract;
- public CI does not request model-provider secrets;
- CI runs the canonical release gate;
- local Markdown links resolve;
- Agent Skill / Claude plugin launch artifacts exist.

It is also part of:

```bash
npm run release:check
```

## Public CI

The repository CI has two layers:

```text
matrix test
  Ubuntu / macOS / Windows
  Node 20 / Node 22

release gate
  Ubuntu / Node 22
  npm run release:check
  npm publish --dry-run
```

No Anthropic/OpenAI secrets are required for public pull-request CI.

## Contributor path

A new contributor should be able to answer these questions without reading the
phase-history documents:

```text
What is Behavectl?
What invariant does it enforce?
How do I run it locally?
How do I add an agent integration?
What is fixture evidence allowed to do?
What is considered a security boundary?
How do I report protocol drift?
```

The new architecture, trust, quickstart, and adapter docs are the canonical
entry points.

## Community rule

Behavectl is a trust tool. The community should not reward exaggerated claims.

The repository explicitly asks contributors to distinguish:

```text
fixture-tested
locally tested
real-agent validated
publicly released
```

## Launch principle

> A 10k-star project cannot feel like a zip file uploaded by one person.
> The repository must already be ready for the first hundred contributors.
