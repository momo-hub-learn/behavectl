# Security

Behavectl changes future AI-agent behavior, so security boundaries are product
boundaries.

## Supported versions

During alpha, only the newest published alpha is supported. Security fixes may
require upgrading rather than backporting.

## Security defaults

- local-first storage;
- no Behavectl cloud requirement;
- no transcript upload by default;
- no silent promotion;
- no public force-promotion path;
- isolated evaluation workspaces;
- no dangerous permission bypass in real-agent evaluators;
- machine-managed behavior separated from human-authored instructions;
- read-only Agent-native MCP surface;
- rollback is first-class;
- fixture evidence cannot unlock promotion;
- proof integrity and semantic binding are both required.

## Sensitive surfaces

Please treat these as security-sensitive:

```text
promotion / rollback policy
Behavior Proof validation
patch-digest binding
Claude / Codex protocol parsing
hook capture normalization
managed AGENTS.md / Claude rule compilation
MCP permissions
path traversal / repository-boundary checks
release evidence lineage
```

## Reporting a vulnerability

Do **not** open a public issue for a vulnerability that exposes credentials,
private repository content, prompts, traces, or a behavior-governance bypass.

Use GitHub private vulnerability reporting once the public repository is
available. Until then, contact the repository owner privately through the
account that publishes the project.

Include only the minimum sanitized reproduction needed to demonstrate the
issue.

## What not to attach publicly

- credentials or tokens;
- private prompts;
- proprietary source code;
- private agent transcripts;
- raw traces from a private repository;
- unredacted filesystem paths that reveal sensitive information.

## Trust-model reference

See [`docs/trust-model.md`](docs/trust-model.md) for the product-level threat
model and invariants.
