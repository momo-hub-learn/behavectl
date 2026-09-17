# Behavectl Quickstart

## 30 seconds: understand the product

The [GitHub alpha](https://github.com/momo-hub-learn/behavectl/releases/tag/v0.1.0-alpha.1)
is available. From a source checkout, try the tour without installation or a
coding-agent account:

```bash
node src/cli/behavectl.mjs demo
```

This is explicitly a simulation. It cannot unlock real promotion.

## Start from a GitHub checkout

Requirements: Node.js 20 or later and Git. The repository has zero runtime
dependencies. From the checkout, try the tour and inspect available agents:

```bash
node src/cli/behavectl.mjs demo
node src/cli/behavectl.mjs agents
```

To open Studio for another project without a global install, use the absolute
path to this checkout's `src/cli/behavectl.mjs`:

```bash
cd /path/to/your-project
node /path/to/behavectl/src/cli/behavectl.mjs studio
```

Open the local URL printed by the command. Opening Studio does not start model
jobs. Choose “记录一次纠正” to create a rule, review its task and checks, then
explicitly start real verification. Existing projects do not need captured
history to try this workflow.

The checkout can contain newer documentation or code than a certified package.
The certification below applies to the exact retained tarball.

## Install the certified alpha locally

Download `behavectl-0.1.0-alpha.1.tgz` from the
[GitHub release assets](https://github.com/momo-hub-learn/behavectl/releases/tag/v0.1.0-alpha.1).
This is the retained **Codex RC GO** package; npm registry distribution is deferred. This is different from the original Trial
Kit's older `candidate/` package.

From the directory containing the downloaded tarball, on macOS / Linux:

```bash
shasum -a 256 behavectl-0.1.0-alpha.1.tgz
npm install --prefix ./local-runtime --ignore-scripts --no-audit --no-fund ./behavectl-0.1.0-alpha.1.tgz
export PATH="$PWD/local-runtime/node_modules/.bin:$PATH"
behavectl --version
behavectl agents
```

Expected SHA-256 (stop if it differs):

```text
d073d2c9f99b7e66c7f2163b77b8f38fa0fd4e8fa23795c0b41e598fa19fc30e
```

On Windows PowerShell, from the directory containing the downloaded tarball:

```powershell
Get-FileHash ./behavectl-0.1.0-alpha.1.tgz -Algorithm SHA256
npm install --prefix ./local-runtime --ignore-scripts --no-audit --no-fund ./behavectl-0.1.0-alpha.1.tgz
$env:Path = "$((Get-Location).Path)\local-runtime\node_modules\.bin;$env:Path"
behavectl --version
behavectl agents
```

The PATH change lasts for the current terminal session. Installation and agent
detection make no model calls; detection does not verify login or model access.
First-alpha certification covers Codex. CodeBuddy is not required for this path.

## Try the same challenge on your machine

With the locally installed command available:

```bash
behavectl demo create --agents codex
cd behavectl-killer-demo
behavectl studio
```

Creating the challenge and opening Studio are local operations. Use Studio to
inspect the rule and explicitly start three paired trials (six Codex jobs).
Real verification requires an authenticated Codex CLI and can incur model cost.
Your result may differ from the retained certification result.

## 60 seconds: initialize a repository

```bash
cd my-project
behavectl init
```

Behavectl auto-detects supported coding agents and installs project-local
capture hooks plus Agent Skills where applicable.

For explicit Claude Code + Codex + Claude MCP setup:

```bash
behavectl init --all --mcp
```

Then inspect the project:

```bash
behavectl
behavectl doctor
behavectl agent status
```

## Use it inside Claude Code

After project initialization:

```text
/behavectl
```

or ask naturally:

```text
What behavior changes are waiting for review?
```

With `--mcp`, Claude Code also receives structured read-only Behavectl tools.

## Use it inside Codex

Invoke the repository Agent Skill:

```text
$behavectl
```

or select Behavectl through the skills UI.

## Review a proposed behavior change

```bash
behavectl inbox
behavectl review <patch-id>
```

The review shows:

```text
what changed
why Behavectl surfaced it
scope + targets
Behavior Spec
latest real Behavior Diff / Stability Matrix
promotion eligibility
```

## Run real verification

Single trial:

```bash
behavectl verify <patch-id> --require-all
```

Release-grade stability:

```bash
behavectl verify <patch-id> --require-all --repeat 3
```

Real verification launches isolated coding-agent sessions and can incur model
cost. It is never triggered implicitly by the read-only MCP server.

## Promote

Only after a current, fully-covered real Verification Run passes:

```bash
behavectl promote <patch-id>
```

Promotion compiles only the behavior that passed the trust gate.

## Roll back

```bash
behavectl rollback <patch-id>
```

Rollback is a first-class part of the lifecycle, not an emergency afterthought.

## Put behavior behind CI

```bash
behavectl ci init
```

Behavior-changing pull requests can then be blocked when managed outputs and
retained Behavior Proofs disagree.

## Diagnose repeated corrections before adding another rule

Run from your project:

```bash
behavectl diagnose
behavectl studio
```

Diagnosis reads root-level rules, package metadata and already captured
Behavectl events. Each finding includes source evidence. Repeated identical
corrections can become a draft through the Studio action or the printed
`behavectl diagnose --propose <finding-id>` command. The same evidence opens
an existing proposal instead of creating duplicates.

Review the task and deterministic checks before verifying. A diagnosis is not
proof of an Agent failure or proof that a proposed rule will improve behavior.
Conflicting human rules require a decision about the authoritative convention;
Behavectl does not silently overwrite those files.

## Start without captured history

Open `behavectl studio` from your project and choose “记录一次纠正”. Enter the
rule in your own words and select the Agent targets. The workbench retains your
input as a human-authored proposal, collects relevant project metadata and opens
an editable draft. Incomplete drafts can be saved. Only mark the specification
reviewed after the task and checks capture your intent. Draft creation never
runs a model or activates an Agent rule.

After real verification, select an Agent and trial in Studio. “实际文件变化”
shows the retained file contents before and after each run, alongside commands
and check results. Setup changes are excluded; regression-command changes are
part of the run. Content capture skips symbolic links, limits each UTF-8 text
file to 64 KiB and each snapshot to 2 MiB. Binary, oversized or otherwise omitted
content is explicitly listed, so missing evidence does not imply no change.
Older records without content snapshots are labeled accordingly.
