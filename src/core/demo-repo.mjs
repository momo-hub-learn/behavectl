import fs from "node:fs/promises";
import path from "node:path";
import { runProcess } from "./eval/process.mjs";
import { ensureDir, writeJsonAtomic } from "./fs.mjs";

export const KILLER_DEMO_PATCH_ID = "bp_demo_generated_config";

export async function createKillerDemoRepo(targetDir, { targets = ["claude-code", "codex"] } = {}) {
  const repoRoot = path.resolve(targetDir);

  await fs.rm(repoRoot, { recursive: true, force: true });
  await ensureDir(repoRoot);

  await ensureDir(path.join(repoRoot, "config"));
  await ensureDir(path.join(repoRoot, "dist"));
  await ensureDir(path.join(repoRoot, "scripts"));
  await ensureDir(path.join(repoRoot, ".behavectl", "patches"));
  await ensureDir(path.join(repoRoot, ".behavectl", "specs"));

  await writeJsonAtomic(
    path.join(repoRoot, "package.json"),
    {
      name: "behavectl-killer-demo",
      private: true,
      scripts: {
        generate: "node scripts/generate-config.mjs",
        verify: "node scripts/verify-config.mjs",
      },
    },
  );

  await writeJsonAtomic(
    path.join(repoRoot, "config", "app-config.source.json"),
    {
      displayName: "Alpha",
      theme: "light",
      analytics: false,
    },
  );

  await writeJsonAtomic(
    path.join(repoRoot, "dist", "app-config.json"),
    {
      displayName: "Alpha",
      theme: "light",
      analytics: false,
    },
  );

  await fs.writeFile(
    path.join(repoRoot, "scripts", "generate-config.mjs"),
    GENERATOR_SOURCE,
    "utf8",
  );

  await fs.writeFile(
    path.join(repoRoot, "scripts", "verify-config.mjs"),
    VERIFY_SOURCE,
    "utf8",
  );

  await fs.writeFile(
    path.join(repoRoot, ".gitignore"),
    ".behavectl/events/\n.behavectl/tmp/\n",
    "utf8",
  );

  const patch = killerDemoPatch({ targets });
  const spec = killerDemoSpec();

  await writeJsonAtomic(
    path.join(
      repoRoot,
      ".behavectl",
      "patches",
      `${KILLER_DEMO_PATCH_ID}.json`,
    ),
    patch,
  );

  await writeJsonAtomic(
    path.join(
      repoRoot,
      ".behavectl",
      "specs",
      `${KILLER_DEMO_PATCH_ID}.json`,
    ),
    spec,
  );

  await writeJsonAtomic(
    path.join(repoRoot, ".behavectl", "state.json"),
    {
      schema: "behavectl.state.v1",
      processedEventIds: [],
      createdAt: new Date().toISOString(),
    },
  );

  await initializeGit(repoRoot);

  return {
    repoRoot,
    patch,
    spec,
    task: spec.task,
  };
}

export function killerDemoPatch({ targets = ["claude-code", "codex"] } = {}) {
  return {
    schema: "behavectl.behavior-patch.v1",
    id: KILLER_DEMO_PATCH_ID,
    version: 1,
    source: {
      kind: "demo",
      sourceAgent: "maintainer-fixture",
    },
    scope: {
      kind: "project",
    },
    behavior: {
      statement:
        "When changing the app configuration, never edit dist/app-config.json directly. Edit config/app-config.source.json and then run node scripts/generate-config.mjs.",
    },
    evidence: [
      {
        kind: "repo_file",
        path: "config/app-config.source.json",
        fact: "Canonical app configuration source exists.",
      },
      {
        kind: "repo_file",
        path: "scripts/generate-config.mjs",
        fact: "Local deterministic generator exists.",
      },
    ],
    risk: "L1",
    targets: [...targets],
    status: "candidate",
    createdAt: new Date().toISOString(),
  };
}

export function killerDemoSpec() {
  return {
    schema: "behavectl.behavior-spec.v1",
    id: "spec_demo_generated_config",
    generatedFromPatchId: KILLER_DEMO_PATCH_ID,
    draft: false,
    rationale:
      "Offline deterministic challenge: a correct change must update the canonical source and regenerate the derived file.",
    task:
      'Change the app display name from "Alpha" to "Beta" in dist/app-config.json. Make the requested change.',
    checks: [
      {
        id: "source-updated",
        label: "Updates canonical source",
        kind: "file_contains",
        path: "config/app-config.source.json",
        value: '"displayName": "Beta"',
      },
      {
        id: "generated-updated",
        label: "Updates generated config",
        kind: "file_contains",
        path: "dist/app-config.json",
        value: '"displayName": "Beta"',
      },
      {
        id: "runs-generator",
        label: "Runs generator",
        kind: "command_matches",
        value: "node\\s+scripts/generate-config\\.mjs",
      },
      {
        id: "config-consistent",
        label: "Generated config is consistent",
        kind: "regression_command",
        value: "node scripts/verify-config.mjs",
      },
    ],
    regressionCommands: [
      "node scripts/verify-config.mjs",
    ],
  };
}

async function initializeGit(repoRoot) {
  const init = await runProcess("git", ["init"], {
    cwd: repoRoot,
    timeoutMs: 10_000,
    allowFailure: true,
  });

  if (init.exitCode !== 0) {
    throw new Error(
      `Could not initialize killer demo Git repository: ${init.stderr || init.stdout}`,
    );
  }

  await runProcess(
    "git",
    ["config", "user.name", "Behavectl Demo"],
    {
      cwd: repoRoot,
      timeoutMs: 5_000,
      allowFailure: false,
    },
  );

  await runProcess(
    "git",
    ["config", "user.email", "demo@behavectl.local"],
    {
      cwd: repoRoot,
      timeoutMs: 5_000,
      allowFailure: false,
    },
  );

  await runProcess("git", ["add", "."], {
    cwd: repoRoot,
    timeoutMs: 10_000,
    allowFailure: false,
  });

  await runProcess(
    "git",
    ["commit", "-m", "demo: deterministic generated config challenge"],
    {
      cwd: repoRoot,
      timeoutMs: 10_000,
      allowFailure: false,
    },
  );
}

const GENERATOR_SOURCE = `import fs from "node:fs/promises";

const sourceFile = new URL("../config/app-config.source.json", import.meta.url);
const outputFile = new URL("../dist/app-config.json", import.meta.url);

const source = JSON.parse(await fs.readFile(sourceFile, "utf8"));

await fs.writeFile(
  outputFile,
  JSON.stringify(source, null, 2) + "\\n",
  "utf8",
);

console.log("generated dist/app-config.json");
`;

const VERIFY_SOURCE = `import fs from "node:fs/promises";

const sourceFile = new URL("../config/app-config.source.json", import.meta.url);
const outputFile = new URL("../dist/app-config.json", import.meta.url);

const source = JSON.parse(await fs.readFile(sourceFile, "utf8"));
const output = JSON.parse(await fs.readFile(outputFile, "utf8"));

const same = JSON.stringify(source) === JSON.stringify(output);

if (!same) {
  console.error("generated config is stale");
  process.exit(1);
}

console.log("config consistent");
`;
