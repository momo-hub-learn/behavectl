# Phase 6h — Launch Visual System

## Goal

Behavectl's first public alpha should feel like a finished developer tool, not
a correct backend with console output attached.

The terminal is a primary product surface.

## Design language

```text
calm
precise
electric
reversible
```

The interface should feel closer to a high-end debugger / deploy tool than a
marketing CLI.

## Palette

Interactive TTYs use truecolor ANSI:

| Role | Color |
|---|---|
| live work / command | electric cyan |
| behavior / control | violet |
| verified / active | neon green |
| warning | amber |
| failure | rose |
| secondary metadata | slate |

The palette is implemented with Node built-ins only. Behavectl still has zero
runtime dependencies.

## Shape semantics

Color is supplemental, never required:

```text
● success / ready
◆ active work / information
▲ attention
× failure
○ waiting / unavailable
```

This keeps redirected output, screenshots, CI logs, and `NO_COLOR` terminals
legible.

## Core surfaces

### Home

The home screen is a dashboard, not a command wall:

```text
brand
behavior counts
agent readiness
one next action
trust footer
```

### Review

Review is the signature surface:

```text
Behavior Patch
evidence
scope + targets
Behavior Spec
Cross-Agent Stability
human actions
```

Promotion appears only when persisted verification makes it eligible.

### Real A/B progress

While a real runner executes, a cyan scanner moves across the active arm.
Completed arms become a solid green track.

The animation reflects actual execution state. It is not a fake progress
percentage.

### Promotion

Promotion gets a compact success moment, then immediately foregrounds
rollback:

```text
PROMOTED
compiled targets
one-command rollback
```

### Product tour

`behavectl demo` uses the same visual grammar as the real product while
remaining visibly marked:

```text
SIMULATION
fixture only
cannot unlock promotion
```

### Setup / doctor / help

The first-minute journey is visually continuous:

```text
behavectl demo
→ behavectl init
→ behavectl doctor
→ behavectl
→ behavectl review
```

There is no drop back to raw script output between primary surfaces.

## Rendering architecture

`src/ui/theme.mjs` owns:

- terminal width;
- brand wordmark;
- panels;
- semantic badges;
- keycaps;
- commands;
- shape-coded status;
- animated progress tracks;
- metrics.

`src/ui/ansi.mjs` owns pure ANSI primitives.

`--plain` uses an explicit no-color renderer. It does not mutate `NO_COLOR` or
other process-global state.

## UX rules

1. Read operations never mutate state.
2. Color never carries meaning alone.
3. No fake progress percentages.
4. One next action is visually dominant.
5. Destructive actions stay visually secondary to verification.
6. Rollback is visible immediately after promotion.
7. Fixture/demo output cannot masquerade as real proof.
8. TTY color degrades to structured monochrome, not unformatted text.
9. 80 columns is the design center.
10. Animation is reserved for real work in progress.

## Launch recording

The hero recording should show:

```text
behavectl demo
↓
captured correction
↓
Behavior Patch review
↓
real A/B scanner
↓
3×3 Claude + Codex Stability Matrix
↓
PROMOTED
↓
one-command rollback
↓
Behavior CI: SAFE TO MERGE
```

Do not record a fake real-agent run. Use the retained Release Candidate GO
bundle.
