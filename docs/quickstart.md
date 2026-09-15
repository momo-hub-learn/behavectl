# Behavectl Quickstart

## 30 seconds: understand the product

This is an unpublished alpha candidate. From the source directory, no install
or coding-agent account is required:

```bash
node src/cli/behavectl.mjs demo
```

This is explicitly a simulation. It cannot unlock real promotion.

## Install the Trial Kit candidate locally

From the Trial Kit directory containing `candidate/` and `scripts/`:

```bash
./scripts/CHECK_THIS_MACHINE.sh
```

The script checks the candidate SHA-256 and installs into `.trial-runtime/`.
It makes no model calls. A missing CodeBuddy CLI blocks the two-agent profile,
but the local Behavectl installation still works.

On macOS / Linux, add that installation to the current terminal session:

```bash
export PATH="$PWD/.trial-runtime/node_modules/.bin:$PATH"
behavectl --version
behavectl demo
behavectl agents
```

On Windows, use `scripts/CHECK_THIS_MACHINE.ps1`, then:

```powershell
$env:Path = "$((Get-Location).Path)\.trial-runtime\node_modules\.bin;$env:Path"
behavectl demo
```

Agent detection checks local binaries. It does not verify login or model access.

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
