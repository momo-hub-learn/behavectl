# Phase 6n.1 — Distributed Release Candidate

## The correction

Cross-agent verification does not imply colocation. Requiring Claude Code and Codex on one machine was an unnecessary infrastructure coupling.

Behavectl now separates **evidence production** from **evidence assembly**.

```text
Codex environment                 Claude Code environment
       │                                  │
       ▼                                  ▼
3× isolated A/B                    3× isolated A/B
       │                                  │
       ▼                                  ▼
Codex RC shard                    Claude RC shard
       │                                  │
       └────────── artifact-bound ────────┘
                       │
                       ▼
                offline RC merge
                       │
                       ▼
              RELEASE CANDIDATE: GO
```

## Shard commands

```bash
behavectl rc --agent codex \
  --artifact ./behavectl-0.1.0-alpha.1.tgz \
  --yes --out ./codex-shard

behavectl rc --agent claude-code \
  --artifact ./behavectl-0.1.0-alpha.1.tgz \
  --yes --out ./claude-shard
```

A valid shard is **not** a full release verdict. It proves only one agent in one native environment.

## Offline merge

```bash
behavectl rc merge ./claude-shard ./codex-shard \
  --out ./release-candidate
```

Before combining evidence, Behavectl requires exact agreement on:

- Behavior Patch id and SHA-256 digest;
- Behavior Spec id and digest;
- repeat count;
- package name and version;
- exact npm tarball filename and SHA-256.

The final merge then reconstructs the combined verification, merges and replays all 12 raw A/B traces, rebuilds a combined Behavior Proof, verifies semantic binding and integrity, and only then evaluates the normal Release Candidate Gate.

## Design rule

> **Cross-agent does not mean colocated. Evidence may be distributed; trust must still converge.**
