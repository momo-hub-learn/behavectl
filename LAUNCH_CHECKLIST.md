# Behavectl Alpha Launch Checklist

The GitHub alpha is public. Completed release gates and deferred follow-ups are tracked below.

## Product

- [x] Stable public references for known CLI failures
- [x] Typo-aware command recovery for near-match commands
- [x] Wrong-command recovery covered by first-minute gate
- [x] Long error messages remain inside visual panel budget

- [x] First-minute stranger-experience gate

- [x] Stack traces hidden unless BEHAVECTL_DEBUG=1

- [x] Failure states show safety + recovery instead of raw exceptions

- [x] Claude Code plugin package

- [x] Agent-native integration cannot silently promote or rollback

- [x] Read-only Behavectl MCP server

- [x] Codex / Agent Skills repository Skill

- [x] Claude Code project Skill

- [x] Launch-grade terminal visual system
- [x] Truecolor palette with no-color shape fallback
- [x] Animated real A/B scanner
- [x] Branded Home / Review / Tour / Doctor / Init / Help surfaces
- [x] Plain rendering has no process-global color side effects

- [x] Release Candidate Gate

- [x] Behavior Patch
- [x] Evidence + scope
- [x] Behavior Spec
- [x] Behavior Diff
- [x] Cross-Agent Verification
- [x] Stability Gate
- [x] Behavior Proof
- [x] SHA-256 proof integrity verification
- [x] Live proof self-verification
- [x] Human promotion
- [x] Rollback
- [x] Read-only Home Screen
- [x] Review flow
- [x] Deterministic killer demo
- [x] One-command Live Validation Kit
- [x] Behavior CI

## Trust

- [x] Claude / CodeBuddy rollback preserves unowned files in the managed rule directory
- [x] Agent discovery explicitly states that authentication and model access are unchecked

- [x] Protocol parse failure is not converted into a behavior verdict
- [x] Raw traces are persisted only by the synthetic live-validation flow

- [x] Product tour is explicitly simulated

- [x] Behavior Proof is bound to exact Patch digest

- [x] Promotion invalidates when Patch changes after verification

- [x] Promotion requires full declared-target coverage

- [x] No mock/fixture can unlock promotion
- [x] No fixture can create a promotable Behavior Proof
- [x] Infrastructure failure is not converted into a behavior verdict
- [x] User working tree is not the evaluation workspace
- [x] User-authored agent config is preserved
- [x] Uninstall removes only Behavectl-owned hooks
- [x] Repeated verification keeps every trial
- [x] Binary detection is not mislabeled as authentication readiness

## Engineering

- [x] Public Agent Adapter SDK v1
- [x] Core compiler delegates native behavior surfaces to adapters
- [x] Protocol replay delegates to registered replay-capable adapters
- [x] Release certification profiles are declared, not vendor-hardcoded
- [x] Packed-package Adapter scaffold + contract smoke
- [x] Zero runtime dependencies
- [x] Node 20 / 22 automated test target
- [x] Linux / macOS / Windows CI matrix defined
- [x] `npm run release:check`
- [x] npm publish shape validated
- [x] Release Candidate binds the exact npm artifact by SHA-256
- [x] Tampering with the publish artifact invalidates the RC gate
- [x] Issue forms
- [x] PR trust checklist
- [x] Security policy
- [x] Contributor guide

## Release gates and follow-ups

- [x] Public product name selected: `Behavectl`; exact-name collision search found no indexed AI/devtool conflict

- [x] Reserve/confirm the final GitHub repository name: `momo-hub-learn/behavectl` (public repository)
- [ ] Reserve/confirm the final npm package name (deferred; GitHub-first distribution, user decision 2026-09-17)
- [x] First public certification profile: `codex` (user decision, 2026-09-16); CodeBuddy certification follows later. Existing adapter support remains available.
- [x] Produce artifact-bound authenticated evidence for the full `codex` profile (native single-machine RC, 2026-09-16).
- [x] Complete profile / patch / spec / artifact-digest agreement verified. Distributed merge is not applicable to this single-machine Codex profile.
- [x] Retain the real `behavectl rc` GO bundle
- [x] Confirm Release Candidate verdict = GO
- [x] Archive the RC bundle containing raw traces, Protocol Replay report, Behavior Proof, exact npm tarball, and RELEASE_SEAL.md
- [x] Verify RELEASE_SEAL.md against the retained npm tarball
- [x] Publish 30-second retained-evidence replay and link it from README; three key frames visually checked (2026-09-17). This does not replace a terminal recording.
- [ ] Record hero terminal demo from the retained proof run (follow-up; not claimed as complete for the GitHub-first release)
- [x] Replace README illustrative output with real retained output (Codex generated-config challenge; 1/3 → 3/3).
- [x] Add real repository/homepage/bug-report metadata to `package.json`
- [x] Tag `v0.1.0-alpha.1` and GitHub pre-release created (2026-09-17)
- [ ] Publish npm alpha (follow-up; not a blocker for GitHub-first release)
- [x] Public GitHub launch (anonymous repository and release access verified; downloaded tarball SHA-256 matches RC)

Certified artifact (2026-09-16): `behavectl-0.1.0-alpha.1.tgz`, SHA-256
`d073d2c9f99b7e66c7f2163b77b8f38fa0fd4e8fa23795c0b41e598fa19fc30e`.
Run `live_mu47ciwe498dc7c515`, verification `verify_mu47ggq14a94976b87`:
baseline 1/3 passed, candidate 3/3 passed; all six tasks exited 0 without timeout.
The full GO bundle and archive remain local. The certified tarball is attached to
the GitHub pre-release at https://github.com/momo-hub-learn/behavectl/releases/tag/v0.1.0-alpha.1.
The repository and release are publicly accessible. The anonymously downloaded
release asset matches the certified SHA-256. npm distribution remains deferred.

## Launch rule

> **Do not launch because the code feels ready. Launch when the proof is
> retained.**
