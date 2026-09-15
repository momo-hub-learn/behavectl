#!/usr/bin/env node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  fileURLToPath(new URL("..", import.meta.url)),
);

const temp = await fs.mkdtemp(
  path.join(os.tmpdir(), "behavectl-package-smoke-"),
);
const packDir = path.join(temp, "pack");
const consumer = path.join(temp, "consumer");

await fs.mkdir(packDir, { recursive: true });
await fs.mkdir(consumer, { recursive: true });

try {
  let result = await run(
    npmCommand(),
    [
      "pack",
      "--json",
      "--pack-destination",
      packDir,
    ],
    repoRoot,
  );

  assertSuccess(result, "npm pack");

  const pack = JSON.parse(result.stdout)[0];
  const tarball = path.join(
    packDir,
    pack.filename,
  );

  await fs.writeFile(
    path.join(consumer, "package.json"),
    JSON.stringify({
      name: "behavectl-package-smoke",
      private: true,
    }, null, 2) + "\n",
  );

  result = await run(
    npmCommand(),
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      tarball,
    ],
    consumer,
  );

  assertSuccess(result, "npm install local tarball");

  const bin = process.platform === "win32"
    ? path.join(
        consumer,
        "node_modules",
        ".bin",
        "behavectl.cmd",
      )
    : path.join(
        consumer,
        "node_modules",
        ".bin",
        "behavectl",
      );

  result = await run(
    bin,
    ["demo"],
    consumer,
  );
  assertSuccess(result, "installed behavectl demo");

  if (
    !result.stdout.includes("Git for AI behavior.") ||
    !result.stdout.includes("SIMULATION")
  ) {
    throw new Error(
      "Installed package demo output does not match the public product contract.",
    );
  }

  result = await run(
    bin,
    ["version"],
    consumer,
  );
  assertSuccess(result, "installed behavectl version");

  if (
    result.stdout.trim() !==
    "0.1.0-alpha.1"
  ) {
    throw new Error(
      `Unexpected installed version: ${result.stdout.trim()}`,
    );
  }

  const scaffoldDir = path.join(consumer, "behavectl-adapter-smoke-agent");
  result = await run(
    bin,
    ["adapter", "scaffold", "smoke-agent", "--out", scaffoldDir],
    consumer,
  );
  assertSuccess(result, "installed behavectl adapter scaffold");

  result = await run(
    bin,
    ["adapter", "check", path.join(scaffoldDir, "adapter.mjs")],
    consumer,
  );
  assertSuccess(result, "installed behavectl adapter check");
  if (!result.stdout.includes("ADAPTER: VALID")) {
    throw new Error("Packed Adapter SDK scaffold did not validate through the installed package.");
  }

  result = await run(
    bin,
    [
      "agent",
      "install",
      "--all",
    ],
    consumer,
  );
  assertSuccess(
    result,
    "installed behavectl agent install",
  );

  for (const file of [
    ".claude/skills/behavectl/SKILL.md",
    ".agents/skills/behavectl/SKILL.md",
  ]) {
    await fs.access(
      path.join(
        consumer,
        file,
      ),
    );
  }

  console.log(
    `Package smoke passed: ${pack.filename}`,
  );
} finally {
  await fs.rm(temp, {
    recursive: true,
    force: true,
  });
}

function npmCommand() {
  return process.platform === "win32"
    ? "npm.cmd"
    : "npm";
}

function assertSuccess(result, label) {
  if (result.exitCode === 0) return;

  throw new Error(
    `${label} failed\n${result.stdout}\n${result.stderr}`,
  );
}

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      command,
      args,
      {
        cwd,
        shell: false,
        env: {
          ...process.env,
          npm_config_cache:
            process.env.npm_config_cache ??
            path.join(
              os.tmpdir(),
              "behavectl-npm-cache",
            ),
        },
      },
    );

    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on(
      "data",
      (chunk) => (stdout += chunk),
    );
    child.stderr.on(
      "data",
      (chunk) => (stderr += chunk),
    );
    child.on("error", reject);
    child.on(
      "close",
      (code) =>
        resolve({
          exitCode: code ?? -1,
          stdout,
          stderr,
        }),
    );
  });
}
