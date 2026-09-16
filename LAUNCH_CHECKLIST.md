# Behavectl Alpha Launch Checklist

The first public release is blocked until every **required** item is complete.

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

## Release blockers

- [x] Public product name selected: `Behavectl`; exact-name collision search found no indexed AI/devtool conflict

- [x] Reserve/confirm the final GitHub repository name: `momo-hub-learn/behavectl` (private preparation repository)
- [ ] Reserve/confirm the final npm package name
- [x] First public certification profile: `codex` (user decision, 2026-09-16); CodeBuddy certification follows later. Existing adapter support remains available.
- [ ] Produce a VALID artifact-bound RC shard for every adapter in that profile, in each adapter's native authenticated environment
- [ ] Merge the complete profile with `behavectl rc merge` and require profile / patch / spec / artifact-digest agreement
- [ ] Retain the real `behavectl rc` GO bundle
- [ ] Confirm Release Candidate verdict = GO
- [ ] Archive the RC bundle containing raw traces, Protocol Replay report, Behavior Proof, exact npm tarball, and RELEASE_SEAL.md
- [ ] Verify RELEASE_SEAL.md against the retained npm tarball
- [ ] Record hero terminal demo from the retained proof run
- [ ] Replace README illustrative output with real retained output
- [x] Add real repository/homepage/bug-report metadata to `package.json`
- [ ] Tag `v0.1.0-alpha.1`
- [ ] Publish npm alpha
- [ ] Public GitHub launch

## Launch rule

> **Do not launch because the code feels ready. Launch when the proof is
> retained.**
