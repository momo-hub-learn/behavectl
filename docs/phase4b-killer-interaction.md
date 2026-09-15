# Phase 4b — Killer Interaction

## Goal

A user should be able to go from "the agent may have learned something" to
"a tested behavior is now active" without mentally switching between five
commands.

The canonical interaction becomes:

```text
behavectl review
```

and one focused screen.

## Review state machine

```text
candidate
   ↓
review evidence
   ↓
Behavior Spec
   ↓
[T] Test
   ↓
baseline running
   ↓
candidate running
   ↓
Behavior Diff
   ↓
[P] Promote
   ↓
compiled to native harnesses
   ↓
rollback command shown
```

At any point before activation:

```text
[R] Reject
```

The interaction never silently promotes.

## UX rules

1. **One decision per screen.**
2. **No regexes in primary UI.** Machine predicates have human labels.
3. **No fake evaluation.** Fixture evaluation never satisfies promotion gates.
4. **No hidden writes.** Promotion lists every compiled target.
5. **Rollback is shown immediately after promotion.**
6. **Progress communicates isolation, not hype.**
7. **A missing agent binary is a clear readiness problem, not a silent fallback.**
8. **The user's working tree is never the evaluation workspace.**

## Why this matters

The product's emotional moment is not "AI learned."

Modern agents already learn.

The moment is:

> "I can see exactly what the agent wants to change, prove the change improves
> behavior, and make it persistent without losing control."

That is the interaction Behavectl should own.
