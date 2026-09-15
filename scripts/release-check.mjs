#!/usr/bin/env node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

const steps = [
  {
    name: "Automated tests",
    command: process.execPath,
    args: ["--test"],
  },
  {
    name: "CLI help",
    command: process.execPath,
    args: ["src/cli/behavectl.mjs", "--help"],
  },
  {
    name: "CLI home",
    command: process.execPath,
    args: ["src/cli/behavectl.mjs"],
  },
  {
    name: "30-second product tour",
    command: process.execPath,
    args: ["src/cli/behavectl.mjs", "demo"],
  },
  {
    name: "First-minute UX contract",
    command: process.execPath,
    args: ["scripts/first-minute-check.mjs"],
  },
  {
    name: "Showcase quality contract",
    command: process.execPath,
    args: ["scripts/showcase-check.mjs"],
  },
  {
    name: "Protocol replay",
    command: process.execPath,
    args: [
      "src/cli/behavectl.mjs",
      "replay",
      "claude",
      "test/fixtures/protocol/claude-stream-json.jsonl",
    ],
  },
  {
    name: "Adapter-routed protocol replay",
    command: process.execPath,
    args: [
      "src/cli/behavectl.mjs",
      "replay",
      "codebuddy",
      "test/fixtures/protocol/codebuddy-stream-json.jsonl",
    ],
  },
  {
    name: "Brand hygiene",
    command: process.execPath,
    args: ["scripts/brand-check.mjs"],
  },
  {
    name: "OSS launch surface",
    command: process.execPath,
    args: ["scripts/oss-launch-check.mjs"],
  },
  {
    name: "Publish shape",
    command: npmCommand(),
    args: ["pack", "--dry-run"],
  },
  {
    name: "Installed package smoke",
    command: process.execPath,
    args: ["scripts/package-smoke.mjs"],
  },
  {
    name: "Agent-native Skills + MCP",
    command: process.execPath,
    args: ["scripts/agent-native-smoke.mjs"],
  },
  {
    name: "Universal Agent Adapter contract",
    command: process.execPath,
    args: ["scripts/adapter-contract-check.mjs"],
  },
  {
    name: "Codex + CodeBuddy Adapter contract",
    command: process.execPath,
    args: ["scripts/codex-codebuddy-smoke.mjs"],
  },
];

console.log("Behavectl release check");
console.log("");

for (const step of steps) {
  process.stdout.write(`→ ${step.name} ... `);
  const result = await run(step.command, step.args, repoRoot);
  if (result.exitCode !== 0) {
    console.log("FAIL");
    if (result.stdout.trim()) console.error(result.stdout.trim());
    if (result.stderr.trim()) console.error(result.stderr.trim());
    process.exit(1);
  }
  console.log("PASS");
}

process.stdout.write("→ Killer demo semantics ... ");
const temp = await fs.mkdtemp(
  path.join(os.tmpdir(), "behavectl-release-"),
);
const demo = path.join(temp, "demo");

let result = await run(
  process.execPath,
  ["src/cli/behavectl.mjs", "demo", "create", demo],
  repoRoot,
);

if (result.exitCode !== 0) {
  console.log("FAIL");
  console.error(result.stderr || result.stdout);
  process.exit(1);
}

result = await run(
  process.execPath,
  ["scripts/verify-config.mjs"],
  demo,
);

if (result.exitCode !== 0) {
  console.log("FAIL");
  console.error(result.stderr || result.stdout);
  process.exit(1);
}

console.log("PASS");

process.stdout.write("→ Behavior CI install ... ");

result = await run(
  process.execPath,
  [path.join(repoRoot, "src/cli/behavectl.mjs"), "ci", "init"],
  demo,
);

if (result.exitCode !== 0) {
  console.log("FAIL");
  console.error(result.stderr || result.stdout);
  process.exit(1);
}

const ciWorkflow = path.join(
  demo,
  ".github",
  "workflows",
  "behavectl-behavior-ci.yml",
);

let ciText;
try {
  ciText = await fs.readFile(ciWorkflow, "utf8");
} catch (error) {
  console.log("FAIL");
  console.error(`Missing Behavior CI workflow: ${error.message}`);
  process.exit(1);
}

if (
  !ciText.includes("Behavectl Behavior CI") ||
  /ANTHROPIC_API_KEY|OPENAI_API_KEY|secrets\./.test(ciText)
) {
  console.log("FAIL");
  console.error("Behavior CI workflow is missing or requests model secrets.");
  process.exit(1);
}

console.log("PASS");

console.log("");
console.log("✓ release gate passed");
console.log("");
console.log("Not checked here:");
console.log("  • authenticated real-agent runs for the adapters declared by the release proof");
console.log("  • retained artifact-bound Behavior Proof from that declared target set");
console.log("  • Release Candidate verdict = GO for the chosen certification profile");
console.log("");
console.log("Those remain explicit public-release blockers.");

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      shell: false,
      env: {
        ...process.env,
        // Keep release checks hermetic even on machines with a broken global
        // npm cache ownership state.
        npm_config_cache:
          process.env.npm_config_cache ??
          path.join(os.tmpdir(), "behavectl-npm-cache"),
      },
    });

    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) =>
      resolve({
        exitCode: code ?? -1,
        stdout,
        stderr,
      }),
    );
  });
}
