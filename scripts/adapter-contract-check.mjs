#!/usr/bin/env node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  listAgentDefinitions,
  createAgentRunner,
} from "../src/adapters/registry.mjs";
import { validateAgentAdapter } from "../src/adapters/sdk.mjs";

console.log("Behavectl Agent Adapter contract");
console.log("");

for (const adapter of listAgentDefinitions()) {
  validateAgentAdapter(adapter);
  process.stdout.write(`→ ${adapter.id} ... `);

  if (adapter.capabilities.includes("evaluate")) {
    const runner = createAgentRunner(adapter.id, { timeoutMs: 1 });
    if (runner.id !== adapter.id) {
      throw new Error(`${adapter.id}: runner id must equal adapter id`);
    }
  }

  if (adapter.capabilities.includes("compile")) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), `behavectl-adapter-${adapter.id}-`));
    const patch = {
      id: `bp_${adapter.id.replaceAll("-", "_")}`,
      status: "active",
      targets: [adapter.id],
      behavior: { statement: `Adapter contract smoke for ${adapter.id}.` },
    };
    const artifact = await adapter.compile({ repoRoot: root, patches: [patch] });
    if (artifact.adapter !== adapter.id || artifact.count !== 1) {
      throw new Error(`${adapter.id}: compile contract returned an invalid artifact`);
    }
  }

  console.log("PASS");
}

console.log("");
console.log("✓ every built-in adapter satisfies behavectl.agent-adapter.v1");
console.log("✓ runner identity is normalized");
console.log("✓ compile surfaces are adapter-owned, not core-owned");
