# Build a Behavectl Agent Adapter

Behavectl is designed around one boundary:

> **Core governs behavior. Adapters absorb vendor differences.**

Adding a coding agent should not require editing verification, promotion, proof,
release, or compiler logic. It should add one adapter that satisfies
`behavectl.agent-adapter.v1`.

## Start in 20 seconds

From an installed Behavectl package:

```bash
behavectl adapter scaffold my-agent
cd behavectl-adapter-my-agent
node --test adapter.test.mjs
behavectl adapter check ./adapter.mjs
behavectl agents --adapter ./adapter.mjs
```

The generated adapter imports the public package surface:

```js
import { defineAgentAdapter } from "behavectl/adapter-sdk";
```

No `src/` imports are required.

## Contract v1

An adapter declares identity, maturity, capabilities, runtime binaries, and the
functions for the capabilities it claims.

```js
export default defineAgentAdapter({
  id: "my-agent",
  displayName: "My Agent",
  aliases: ["ma"],
  binaries: ["my-agent"],
  maturity: "experimental",
  capabilities: ["evaluate"],

  createRunner(options = {}) {
    return new MyAgentRunner(options);
  },
});
```

Capabilities are explicit:

| Capability | Adapter responsibility |
|---|---|
| `evaluate` | create a real isolated-run runner |
| `compile` | write only Behavectl-managed native behavior |
| `replay` | parse retained native protocol traces offline |
| `hooks` | native correction/event capture |
| `skill` | agent-native Behavectl workflow |
| `mcp` | agent-native structured Behavectl access |

Claim only what is implemented. A new adapter can start with `evaluate` and add
other capabilities later.

## Evaluation contract

A real runner must:

- execute the same user task in baseline and candidate isolated workspaces;
- inject candidate behavior through the cleanest supported native channel;
- return normalized commands/output/exit metadata;
- classify authentication, network, quota, timeout, and protocol failures as
  infrastructure errors rather than behavior verdicts;
- never use the user's working tree as the evaluation sandbox.

## Compilation contract

If the adapter claims `compile`, it owns the native persistent behavior surface.
Core must not know its path.

```js
async compile({ repoRoot, patches }) {
  // select ACTIVE patches targeting this adapter
  // write only Behavectl-owned content
  return {
    adapter: "my-agent",
    path: ".my-agent/rules/behavectl/",
    count: selected.length,
  };
}
```

Human-authored agent configuration must survive promotion, rollback, and
uninstall.

## Replay contract

A replay-capable adapter turns a retained native trace into a normalized protocol
report without calling the model again. This is what lets Behavectl distinguish
provider CLI drift from behavior regression.

Adapters entering a **Release Candidate certification profile** must support both
`evaluate` and `replay`.

## Explicit loading

Community adapters are explicit by design:

```bash
behavectl agents --adapter ./adapter.mjs
behavectl verify bp_x --adapter ./adapter.mjs --agent my-agent
behavectl live --adapter ./adapter.mjs --agents my-agent --yes
```

Behavectl does not silently execute arbitrary adapter code discovered from a
project directory. Loading an adapter is an explicit trust decision.

## Certification profiles

Supported does not mean required. A Release Candidate declares exactly what it
certifies:

```bash
behavectl rc --agents codex,codebuddy --yes
```

Or produce independent shards when adapters live in different native
environments:

```bash
behavectl rc --agent my-agent \
  --profile codex,my-agent \
  --artifact ./behavectl-0.1.0-alpha.1.tgz --yes
```

The merge accepts the profile only when every shard agrees on the exact profile,
patch, spec, repetition count, package identity, and artifact SHA-256.

## Production evidence for a community adapter

A production-quality adapter contribution should include:

```text
official vendor protocol / extension evidence
parser fixtures
contract tests
real-run instructions
protocol replay coverage
native compilation tests, if compile is claimed
install / uninstall idempotency, if hooks or skills are claimed
```

Do not claim live compatibility until a real authenticated run has been retained.
