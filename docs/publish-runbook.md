# Behavectl Alpha Publish Runbook

Public release is blocked on retained real evidence for one explicitly chosen
certification profile. Supported adapters outside that profile are irrelevant to
that RC.

## 1. Pack the exact candidate

```bash
npm pack
```

Keep the resulting `behavectl-0.1.0-alpha.1.tgz`. Every distributed shard must
bind the exact same artifact SHA-256.

## 2. Choose the certification profile

For the current killer demo:

```text
codex,codebuddy
```

This is a release decision, not a permanent product requirement.

## 3A. Same machine

If all profile adapters are authenticated on one machine:

```bash
behavectl rc --agents codex,codebuddy \
  --artifact ./behavectl-0.1.0-alpha.1.tgz \
  --yes --out ./release-candidate
```

## 3B. Distributed native environments

If the adapters live on different machines, each machine receives the **same
candidate tarball**.

Codex machine:

```bash
behavectl rc --agent codex \
  --profile codex,codebuddy \
  --artifact ./behavectl-0.1.0-alpha.1.tgz \
  --yes --out ./codex-shard
```

CodeBuddy machine:

```bash
behavectl rc --agent codebuddy \
  --profile codex,codebuddy \
  --artifact ./behavectl-0.1.0-alpha.1.tgz \
  --yes --out ./codebuddy-shard
```

Merge on any machine; no model runtime is required:

```bash
behavectl rc merge ./codex-shard ./codebuddy-shard \
  --out ./release-candidate
```

## 4. Accept only GO

The retained bundle must report:

```text
RELEASE CANDIDATE: GO
```

It must include valid protocol replay, raw-trace integrity, Behavior Proof
integrity + semantic binding, complete certification-profile coverage, and an
exact bound npm artifact / release seal.

## 5. Publish exactly the sealed artifact

Do not repack after RC. Publish the tarball retained by the GO bundle with the
alpha dist-tag.

> **What ships must be what was proved.**
