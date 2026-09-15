import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  ADAPTER_CONTRACT_VERSION,
  defineAgentAdapter,
  loadAdapterModule,
  validateAgentAdapter,
} from "../src/adapters/sdk.mjs";
import {
  agentDefinition,
  listAgentDefinitions,
  registerAgentAdapter,
} from "../src/adapters/registry.mjs";
import { compileAll } from "../src/core/compiler.mjs";

test("every built-in agent uses the public adapter contract", () => {
  for (const adapter of listAgentDefinitions()) {
    assert.equal(adapter.contractVersion, ADAPTER_CONTRACT_VERSION);
    assert.equal(validateAgentAdapter(adapter), adapter);
    assert.equal(typeof adapter.createRunner, "function");
    assert.equal(typeof adapter.compile, "function");
  }
});

for (const id of ["claude-code", "codebuddy"]) {
  test(`${id} compilation and rollback preserve unowned files`, async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "behavectl-owned-rules-"));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    const adapter = agentDefinition(id);
    const dir = path.join(root, adapter.surfaces[0]);
    await fs.mkdir(path.join(dir, "notes.md"), { recursive: true });
    await fs.writeFile(path.join(dir, "human.md"), "Keep my rule.\n");
    await fs.writeFile(path.join(dir, "notes.md", "draft.txt"), "Keep my notes.\n");
    const patch = { id: "bp_owned", status: "active", targets: [id], behavior: { statement: "Use the source." } };
    await adapter.compile({ repoRoot: root, patches: [patch] });
    assert.match(await fs.readFile(path.join(dir, "bp_owned.md"), "utf8"), /Use the source/);
    assert.equal(await fs.readFile(path.join(dir, "human.md"), "utf8"), "Keep my rule.\n");
    await adapter.compile({ repoRoot: root, patches: [] });
    await assert.rejects(fs.access(path.join(dir, "bp_owned.md")), { code: "ENOENT" });
    assert.equal(await fs.readFile(path.join(dir, "human.md"), "utf8"), "Keep my rule.\n");
    assert.equal(await fs.readFile(path.join(dir, "notes.md", "draft.txt"), "utf8"), "Keep my notes.\n");
    await adapter.compile({ repoRoot: root, patches: [] });
  });
}

test("external adapter modules can register without editing core", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "behavectl-external-adapter-"));
  const file = path.join(root, "adapter.mjs");
  await fs.writeFile(
    file,
    `export default {\n  id: "test-agent",\n  displayName: "Test Agent",\n  aliases: ["ta"],\n  binaries: ["test-agent"],\n  maturity: "experimental",\n  capabilities: ["evaluate"],\n  createRunner() { return { id: "test-agent", async available() { return true; }, async run() { return { commands: [], output: "ok", exitCode: 0, metadata: { runner: "test-agent" } }; } }; }\n};\n`,
    "utf8",
  );

  const adapter = await loadAdapterModule(file);
  registerAgentAdapter(adapter, { source: file });
  assert.equal(agentDefinition("ta")?.id, "test-agent");
  assert.equal(agentDefinition("test-agent")?.source, file);
});

test("core compiler delegates persistent behavior surfaces to registered adapters", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "behavectl-adapter-compile-"));
  const adapter = defineAgentAdapter({
    id: "compile-probe",
    displayName: "Compile Probe",
    aliases: [],
    binaries: ["compile-probe"],
    maturity: "experimental",
    capabilities: ["evaluate", "compile"],
    createRunner() {
      return { id: "compile-probe", async available() { return true; }, async run() { throw new Error("not used"); } };
    },
    async compile({ repoRoot, patches }) {
      const selected = patches.filter((patch) => patch.status === "active" && patch.targets.includes("compile-probe"));
      const file = path.join(repoRoot, "PROBE.md");
      if (selected.length) await fs.writeFile(file, selected[0].behavior.statement, "utf8");
      return { adapter: "compile-probe", path: "PROBE.md", count: selected.length };
    },
  });
  registerAgentAdapter(adapter);

  const artifacts = await compileAll(root, [{
    id: "bp_probe",
    status: "active",
    targets: ["compile-probe"],
    behavior: { statement: "Probe behavior." },
  }]);

  assert.ok(artifacts.some((item) => item.adapter === "compile-probe" && item.count === 1));
  assert.equal(await fs.readFile(path.join(root, "PROBE.md"), "utf8"), "Probe behavior.");
});
