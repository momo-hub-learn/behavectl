#!/usr/bin/env node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const cli = path.join(repoRoot, "src", "cli", "behavectl.mjs");
const temp = await fs.mkdtemp(path.join(os.tmpdir(), "behavectl-codex-codebuddy-smoke-"));
const bin = path.join(temp, "bin");
const demo = path.join(temp, "demo");
await fs.mkdir(bin, { recursive: true });

const fakeAgent = `#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

const name = path.basename(process.argv[1]);
const args = process.argv.slice(2);
if (args.includes("--version")) {
  console.log(name + " fake-1.0");
  process.exit(0);
}

const isCodex = name === "codex";
const candidate = isCodex
  ? args.includes("-c")
  : args.includes("--append-system-prompt");
const cwd = process.cwd();
const source = path.join(cwd, "config", "app-config.source.json");
const generated = path.join(cwd, "dist", "app-config.json");

if (candidate) {
  const value = JSON.parse(await fs.readFile(source, "utf8"));
  value.displayName = "Beta";
  await fs.writeFile(source, JSON.stringify(value, null, 2) + "\\n");
  const result = spawnSync(process.execPath, ["scripts/generate-config.mjs"], { cwd, encoding: "utf8" });
  if (result.status !== 0) process.exit(result.status ?? 1);
} else {
  const value = JSON.parse(await fs.readFile(generated, "utf8"));
  value.displayName = "Beta";
  await fs.writeFile(generated, JSON.stringify(value, null, 2) + "\\n");
}

if (isCodex) {
  if (candidate) {
    console.log(JSON.stringify({ type: "item.completed", item: { type: "command_execution", command: "node scripts/generate-config.mjs" } }));
  }
  console.log(JSON.stringify({ type: "turn.completed", usage: { input_tokens: 10, output_tokens: 4 } }));
} else {
  console.log(JSON.stringify({ type: "system", subtype: "init" }));
  if (candidate) {
    console.log(JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", id: "tool-1", name: "Bash", input: { command: "node scripts/generate-config.mjs" } }] } }));
  }
  console.log(JSON.stringify({ type: "result", result: candidate ? "updated source and regenerated" : "edited generated file", usage: { input_tokens: 10, output_tokens: 4 } }));
}
`;

for (const name of ["codex", "codebuddy"]) {
  const file = path.join(bin, name);
  await fs.writeFile(file, fakeAgent, { mode: 0o755 });
  await fs.chmod(file, 0o755);
}

const env = {
  ...process.env,
  PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
  NO_COLOR: "1",
};

let result = await run(process.execPath, [cli, "agents"], repoRoot, env);
assertOk(result, "agent discovery");
assertIncludes(result.stdout, "Codex", "agent discovery");
assertIncludes(result.stdout, "CodeBuddy Code", "agent discovery");
assertIncludes(result.stdout, "DETECTED", "agent discovery");
assertIncludes(result.stdout, "Authentication and model access are not checked", "agent discovery scope");

result = await run(
  process.execPath,
  [cli, "demo", "create", demo, "--agents", "codex,codebuddy"],
  repoRoot,
  env,
);
assertOk(result, "demo create");
assertIncludes(result.stdout, "Codex + CodeBuddy Code", "demo targets");

result = await run(
  process.execPath,
  [cli, "verify", "bp_demo_generated_config", "--repeat", "3"],
  demo,
  env,
);
assertOk(result, "cross-agent verify");
assertIncludes(result.stdout, "Codex", "verify matrix");
assertIncludes(result.stdout, "CodeBuddy Code", "verify matrix");
assertIncludes(result.stdout, "0/3 → 3/3", "verify improvement");
assertIncludes(result.stdout, "Trials: 6/6 passed", "verify stability");
assertIncludes(result.stdout, "STABLE ENOUGH TO PROMOTE", "verify verdict");

result = await run(
  process.execPath,
  [cli, "promote", "bp_demo_generated_config"],
  demo,
  env,
);
assertOk(result, "promotion");
assertIncludes(result.stdout, "codex", "promotion surface");
assertIncludes(result.stdout, "codebuddy", "promotion surface");
if (result.stdout.includes("claude-code")) {
  throw new Error(`promotion surface leaked undeclared Claude target\n${result.stdout}`);
}

await fs.access(path.join(demo, "AGENTS.md"));
await fs.access(
  path.join(
    demo,
    ".codebuddy",
    "rules",
    "behavectl",
    "bp_demo_generated_config.md",
  ),
);

console.log("Codex + CodeBuddy adapter smoke");
console.log("");
console.log("✓ detects Codex without requiring Claude Code");
console.log("✓ detects CodeBuddy Code without requiring Claude Code");
console.log("✓ one Behavior Patch targets exactly Codex + CodeBuddy");
console.log("✓ repeated isolated A/B: 6/6 candidate trials pass");
console.log("✓ cross-agent Behavior Proof emitted");
console.log("✓ promotion compiles to AGENTS.md + .codebuddy/rules/behavectl/");

function assertOk(result, label) {
  if (result.exitCode !== 0) {
    throw new Error(`${label} failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  }
}
function assertIncludes(text, fragment, label) {
  if (!text.includes(fragment)) {
    throw new Error(`${label}: expected ${JSON.stringify(fragment)}\n${text}`);
  }
}
function run(command, args, cwd, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, shell: false });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => resolve({ exitCode: code ?? -1, stdout, stderr }));
  });
}
