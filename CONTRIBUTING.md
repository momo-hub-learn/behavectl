# Contributing to Behavectl

Thanks for helping build **Git for AI behavior**.

Behavectl deliberately keeps a small product surface. A strong contribution
usually makes persistent agent behavior more **explainable, testable, portable,
or reversible** without adding unnecessary concepts.

## Start here

```bash
git clone <your-fork>
cd behavectl
npm test
npm run release:check
node src/cli/behavectl.mjs demo
```

Requirements:

```text
Node >= 20
Git
```

Real Claude Code / Codex credentials are **not** required for the unit suite or
release gate. They are required only for real-agent validation.

Behavectl currently has **zero runtime dependencies**.

## Read these before a substantial change

- [`docs/architecture.md`](docs/architecture.md)
- [`docs/trust-model.md`](docs/trust-model.md)
- [`docs/adapter-guide.md`](docs/adapter-guide.md)
- [`docs/phase6i-agent-native-mode.md`](docs/phase6i-agent-native-mode.md)

## Product questions to ask before adding a feature

1. Does it help decide what deserves to become persistent future behavior?
2. Can the same outcome be achieved without a new public primitive?
3. Does capture remain separate from proposal, evaluation, proof, and promotion?
4. Is rollback explicit?
5. Does it preserve user-authored configuration?
6. Is vendor-specific logic isolated behind an adapter?
7. Could the feature accidentally let an agent silently govern itself?

If the answer to #7 is yes, redesign the boundary first.

## Development commands

```bash
npm test
npm run showcase:check
npm run release:check
npm pack --dry-run
```

Useful focused commands:

```bash
node src/cli/behavectl.mjs demo
node src/cli/behavectl.mjs help --all
node scripts/agent-native-smoke.mjs
node scripts/package-smoke.mjs
```

## Test taxonomy

### Unit / deterministic integration tests

These may use fixture runners to test Behavectl itself.

Fixture results must never:

- unlock promotion;
- be presented as real Claude/Codex evidence;
- enter a public Release Candidate bundle as real evidence.

### Real-agent validation

Use real Claude Code / Codex only when validating vendor integration or release
behavior.

The canonical release path is:

```bash
behavectl rc --yes
```

Do not hand-edit a more flattering result than the retained bundle.

## Adapter rule

Vendor-specific formats stay behind adapters.

Core objects remain harness-neutral:

```text
Event
Behavior Patch
Evidence
Behavior Spec
Evaluation
Verification Run
Behavior Proof
```

Before adding a new vendor adapter, prefer portable surfaces in this order:

```text
Agent Skill
→ MCP
→ hooks / plugin
→ vendor-specific evaluator / compiler only when necessary
```

Open an **Agent adapter request** issue with official documentation before a
large adapter PR.

## Protocol changes

If a Claude Code / Codex CLI update breaks structured parsing:

1. classify it as protocol/infrastructure failure, not behavior regression;
2. retain or create a sanitized synthetic trace;
3. reproduce with `behavectl replay`;
4. add the trace shape to the regression corpus;
5. update the parser behind the adapter.

Use the **Protocol drift** issue template.

## UI contributions

Behavectl's terminal UI is a product surface.

Keep these rules:

- color is never the only semantic signal;
- no fake progress percentages;
- animation only represents real work in progress;
- 80 columns is the design center;
- `NO_COLOR` / plain mode remains structured and readable;
- fixture/demo UI cannot masquerade as real proof.

## Pull requests

Keep PRs focused. The PR template asks for the relevant trust boundary.

Before opening a PR:

```bash
npm test
npm run release:check
```

If the PR changes persistent agent behavior, attach or describe the relevant
Behavior Proof. Do not attach private agent traces.

## Security and privacy

Never put these in public issues or PRs:

```text
credentials
private prompts
proprietary source
private raw agent transcripts
private release traces
```

See [`SECURITY.md`](SECURITY.md).
