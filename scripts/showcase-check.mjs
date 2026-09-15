#!/usr/bin/env node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  fileURLToPath(new URL("..", import.meta.url)),
);
const cli = path.join(repoRoot, "src", "cli", "behavectl.mjs");
const readme = await fs.readFile(path.join(repoRoot, "README.md"), "utf8");
const lines = readme.split(/\r?\n/);
const failures = [];

const hero = lines.slice(0, 80).join("\n");
for (const phrase of [
  "Git for AI behavior.",
  "Agents learn. Behavectl decides what gets to stick.",
  "node src/cli/behavectl.mjs demo",
  "No cloud. No daemon. No silent promotion.",
]) {
  if (!hero.includes(phrase)) {
    failures.push(`README hero is missing: ${phrase}`);
  }
}

const firstSection = readme.indexOf("\n## ");
const demoIndex = readme.indexOf("node src/cli/behavectl.mjs demo");
if (firstSection !== -1 && demoIndex > firstSection) {
  failures.push("README makes the reader scroll before the first runnable demo.");
}

if (lines.length > 550) {
  failures.push(`README is too long for the launch surface (${lines.length} lines > 550).`);
}

for (const stale of [
  new RegExp(["Second", "Writer"].join(""), "i"),
  /\bpre-alpha\b/i,
  /\bsw\s+(?:init|demo|review|verify|proof|rc|live|rollback)\b/i,
]) {
  if (stale.test(readme)) {
    failures.push(`README contains stale launch language matching ${stale}.`);
  }
}

if (!readme.includes("That difference is the product.")) {
  failures.push("README is missing the category-differentiation thesis.");
}
if (!readme.includes("Learning can be automatic. Shipping behavior should not be.")) {
  failures.push("README is missing the signature trust line.");
}
if (!readme.includes("No retained real proof for the declared profile, no public claim for that")) {
  failures.push("README is missing the profile-scoped evidence-gated release rule.");
}

const temp = await fs.mkdtemp(path.join(os.tmpdir(), "behavectl-showcase-"));
await fs.writeFile(path.join(temp, ".git"), "");

for (const [label, args] of [
  ["help", ["help"]],
  ["demo", ["demo"]],
  ["home", []],
]) {
  const result = await run(args, temp);
  if (result.exitCode !== 0) {
    failures.push(`${label} failed during showcase check.`);
    continue;
  }

  if (/\x1b\[/.test(result.stdout)) {
    failures.push(`${label} leaked ANSI control codes into captured output.`);
  }

  const publicLines = result.stdout.split(/\r?\n/);
  const widest = publicLines.reduce(
    (max, line) => Math.max(max, [...line].length),
    0,
  );
  if (widest > 80) {
    failures.push(`${label} breaks the 80-column capture surface (${widest} cols).`);
  }
}

const demo = await run(["demo"], temp);
for (const phrase of [
  "THE CONTROL LOOP",
  "CAPTURE",
  "PATCH",
  "PROVE",
  "PROMOTE",
  "FAIL → PASS",
  "Behavior Proof",
  "Learning can be automatic. Shipping behavior should not be.",
  "SIMULATION",
]) {
  if (!demo.stdout.includes(phrase)) {
    failures.push(`Demo signature surface is missing: ${phrase}`);
  }
}

if (failures.length) {
  console.error("Behavectl showcase check failed.");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log("Behavectl showcase check passed.");
console.log(`  README: ${lines.length} lines, runnable demo above the fold`);
console.log("  stale brand/status language: none");
console.log("  help/demo/home captures: <= 80 columns");
console.log("  signature control-loop narrative: intact");

function run(args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], {
      cwd,
      shell: false,
      env: {
        ...process.env,
        NO_COLOR: "1",
      },
    });

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
