# Changelog

All notable public changes to Behavectl will be documented here.

## 0.1.0-alpha.2 — Studio first-use fixes

- Fix an empty-project startup error so the correction form opens on first use.
- Return empty projects to correction entry when selecting the project tab.
- Explain incomplete verification drafts and missing Agent CLI/Git before starting real tasks.
- Add regression coverage for empty projects, draft review, and execution readiness.
- GitHub-only maintenance pre-release. Deterministic tests and package checks cover this build; it has not received a new artifact-bound real-agent RC certification. The retained Codex RC GO and 1/3 → 3/3 result apply only to alpha.1.

## Unreleased — Evidence-based project diagnosis

- added bounded local rule/metadata conflict and repeated-correction diagnosis with file/line evidence;
- fixed reversed npm/pnpm preference checks and unrelated substring matches;
- capture common explicit Chinese corrections and target only the source Agent by default;
- normalized CodeBuddy events are accepted; native CodeBuddy capture installation is still pending.

## Unreleased — Studio

- added a local visual workbench with separate simulation and live project views;
- connected rule/spec editing, three-trial verification, evidence, promotion and rollback;
- local-origin and session-token checks protect workspace operations.

## Unreleased — Local alpha onboarding

- show binary detection separately from unchecked authentication and model access;
- use a runnable source demo before npm publication and document isolated Trial Kit installation;
- label the README behavior matrix as illustrative, pending retained real-model evidence.
- preserve unowned files and subdirectories when Claude / CodeBuddy rules are recompiled or rolled back.

## Unreleased — Universal Agent Adapter Architecture

- published `behavectl/adapter-sdk` with the `behavectl.agent-adapter.v1` contract;
- `behavectl adapter scaffold|check|inspect|list` gives community integrations a first-class workflow;
- moved persistent behavior compilation and protocol replay behind adapter-owned capabilities;
- external adapters can be explicitly loaded with `--adapter` without editing Behavectl Core;
- Live Validation and Release Candidate gates now use declared adapter sets / certification profiles;
- same-machine RC can bind the exact supplied npm tarball instead of repacking it;
- packed-package smoke proves a generated community adapter can import and validate the public SDK;
- introduced an Agent Registry so supported adapters are discovered rather than hard-coded into verification;
- added a real CodeBuddy Code adapter using headless `stream-json` mode;
- CodeBuddy candidate behavior is injected with `--append-system-prompt`, separate from the user task;
- CodeBuddy promotion compiles to `.codebuddy/rules/behavectl/*.md`;
- `behavectl agents` shows local adapter readiness and maturity;
- Behavior Patch targets are now opt-in: only declared targets are required for verification;
- killer demo accepts `--agents codex,codebuddy` and proves the same behavior across both runtimes;
- added a hermetic Codex + CodeBuddy end-to-end adapter smoke to the release gate;
- cross-agent does not mean all-agent: unsupported or undeclared runtimes are irrelevant to a patch verdict.

## Unreleased — Distributed RC correction

- removed the false requirement that Claude Code and Codex must be installed on the same machine;
- added single-agent RC shards for native Codex and Claude Code environments;
- added offline `behavectl rc merge` with patch/spec/repeat/artifact agreement gates;
- each shard binds the exact npm candidate SHA-256 before any cross-agent merge;
- added regression coverage for single-agent preflight and cross-machine merge semantics.

## 0.1.0-alpha.1 — initial public alpha candidate

### Proof of Release

- `behavectl rc` now creates the exact npm tarball inside the retained RC bundle.
- RC assessment verifies the tarball SHA-256 and package identity.
- Tampered or replaced publish artifacts force `RELEASE CANDIDATE: NO-GO`.
- Successful RC runs generate `RELEASE_SEAL.md` and `release-artifact.json`.


### Core

- Behavior Patch capture from explicit user corrections
- evidence, scope, risk, and target metadata
- deterministic Behavior Specs
- isolated baseline/candidate Behavior Diff
- Claude Code and Codex adapters
- cross-agent verification
- repeated-trial Stability Gate
- human promotion and rollback

### Trust

- exact Behavior Patch SHA-256 binding
- Behavior Proof v4
- proof byte-integrity verification
- proof semantic binding
- raw protocol trace integrity
- Protocol Replay Lab
- infrastructure/protocol failure separated from behavior verdicts
- Release Candidate GO / NO-GO gate

### Team workflow

- Behavior CI for pull requests
- unmanaged behavior-change blocking
- proof-to-managed-output binding
- multi-patch proof coverage

### UX

- read-only home screen
- review TUI
- behavior history log
- 30-second explicitly simulated product tour
- deterministic offline killer demo
- one-command live validation

### Visual system

- Launch-grade terminal visual system
- truecolor cyan/violet/green semantic palette
- shape-coded status semantics for no-color terminals
- animated real A/B scanner bars
- branded Home / Review / Tour / Doctor / Init / Help surfaces
- plain renderer no longer mutates global `NO_COLOR`

### Agent-native mode

- Claude Code project Skill with `/behavectl`
- Codex repository Agent Skill with `$behavectl`
- optional Claude project MCP integration
- dependency-free read-only stdio MCP server
- structured status, inbox, patch, history, proof, and next-action tools
- distributable Claude Code plugin package
- explicit safety boundary: MCP cannot promote, rollback, or launch real evals

### Craftsmanship

- stable public error references for known user-facing failures
- typo-aware command recovery with conservative nearest-command suggestions
- first-minute gate covers wrong-command recovery and semantic failure references
- Failure UX with explicit reason, safety boundary, and recovery action
- no raw stack traces in normal CLI operation
- bounded debug surface via `BEHAVECTL_DEBUG=1`
- first-minute stranger-experience release gate
- narrow-terminal wrapping for failure diagnostics
