# Phase 6o — Universal Agent Adapter Architecture

## Principle

> Behavectl governs behavior. Adapters translate that behavior into each agent's native runtime.

A supported Agent is not a global requirement. Every Behavior Patch declares its own targets.

```text
Behavior Patch
     │
     ▼
Universal Behavior Spec
     │
     ▼
Agent Registry
     │
 ┌───┼────────────┐
 ▼   ▼            ▼
Codex CodeBuddy Claude Code
 │     │            │
 ▼     ▼            ▼
native runtime surfaces
     │
     ▼
Normalized evaluation
     │
     ▼
Behavior Proof
```

## Target semantics

```yaml
targets:
  - codex
  - codebuddy
```

means exactly that. Claude Code can be absent and verification is still complete.

A patch targeting only Codex:

```yaml
targets:
  - codex
```

must never be blocked because CodeBuddy or Claude Code are missing.

## Registry

Current built-in adapters:

| id | runtime | maturity | real A/B | promotion surface |
|---|---|---|---:|---|
| `codex` | Codex CLI | stable | yes | managed block in `AGENTS.md` |
| `codebuddy` | CodeBuddy Code CLI | beta | yes | `.codebuddy/rules/behavectl/*.md` |
| `claude-code` | Claude Code CLI | stable | yes | `.claude/rules/behavectl/*.md` |

Aliases are normalized at the registry boundary (`claude` → `claude-code`, `cbc` → `codebuddy`).

## CodeBuddy adapter

Detection accepts either `codebuddy` or its `cbc` alias.

Real evaluation runs CodeBuddy in non-interactive stream mode. Candidate behavior is appended as a system-level instruction rather than concatenated into the user's task. Evaluation work runs only inside Behavectl's isolated A/B workspace.

Background tasks are disabled during single-shot evaluation so the runner cannot finish before asynchronous work is observable.

## Killer demo

```bash
behavectl agents
behavectl demo create --agents codex,codebuddy
cd behavectl-killer-demo
behavectl verify bp_demo_generated_config --repeat 3
```

The deterministic challenge asks the agent to change a generated file. The correct behavior is to edit the canonical source and run the generator.

A useful real result should look like:

```text
Check                        Codex              CodeBuddy Code
───────────────────────────  ─────────────────  ─────────────────
Updates canonical source     0/3 → 3/3          0/3 → 3/3
Updates generated config     3/3 → 3/3          3/3 → 3/3
Runs generator               0/3 → 3/3          0/3 → 3/3
Generated config consistent  0/3 → 3/3          0/3 → 3/3

Coverage: 2/2 agents stable
Trials: 6/6 passed
Verdict: STABLE ENOUGH TO PROMOTE
```

The exact baseline numbers are deliberately not assumed for real agents. What matters is that the candidate satisfies every deterministic check on every declared target across every required trial.

## Adapter contract

An adapter has four responsibilities:

1. detect its native runtime;
2. run an isolated task with or without candidate behavior;
3. normalize structured traces into Behavectl observations;
4. compile promoted behavior into the runtime's native persistent surface.

No adapter is allowed to silently weaken the shared trust model.

## Law

> **Supported does not mean required. Declared targets must be proved.**
