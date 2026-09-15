# Phase 3c — Behavior Spec Suggestion

A behavior-testing product cannot require every user to hand-author JSON from scratch.

Behavectl therefore introduces a separate artifact:

> **Behavior Spec = a reviewable test hypothesis for a Behavior Patch.**

The flow is:

```text
Behavior Patch
      ↓
behavectl spec
      ↓
draft Behavior Spec
      ↓
human review/edit
      ↓
draft=false
      ↓
real A/B Behavior Diff
```

The spec generator does **not** grant truth to its own suggestion. It only creates a draft.

For explicit package-manager behavior, v0.1 can produce deterministic checks without another LLM:

```text
"Don't use npm. We always use pnpm."
        ↓
Uses pnpm
Avoids npm
No package-lock.json
```

The generated spec remains `draft: true`. `behavectl test` refuses it until the developer reviews it and marks it non-draft.

This gives a low-friction workflow without weakening the trust boundary.

Longer-term spec synthesis can use:
- repo metadata;
- observed prior actions;
- existing tests;
- model-assisted suggestions;
- reusable behavior-test templates.

But **Spec generation and Spec acceptance remain different operations**, just as Patch generation and Patch promotion are different operations.
