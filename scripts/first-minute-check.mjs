#!/usr/bin/env node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  fileURLToPath(
    new URL("..", import.meta.url),
  ),
);

const cli = path.join(
  repoRoot,
  "src",
  "cli",
  "behavectl.mjs",
);

const temp = await fs.mkdtemp(
  path.join(
    os.tmpdir(),
    "behavectl-first-minute-",
  ),
);

const checks = [];

try {
  await fs.writeFile(
    path.join(temp, ".git"),
    "",
  );

  const help = await run(
    ["help"],
    temp,
  );

  check(
    "Help explains the category immediately",
    help.exitCode === 0 &&
      help.stdout.includes(
        "Git for AI behavior.",
      ) &&
      help.stdout.includes(
        "START HERE",
      ) &&
      help.stdout.includes(
        "behavectl demo",
      ),
  );

  const demo = await run(
    ["demo"],
    temp,
  );

  check(
    "30-second tour is unmistakably simulated",
    demo.exitCode === 0 &&
      demo.stdout.includes(
        "SIMULATION",
      ) &&
      demo.stdout.includes(
        "cannot unlock promotion",
      ) &&
      demo.stdout.includes(
        "BEHAVIOR DIFF",
      ),
  );

  check(
    "Demo does not initialize the current project",
    !(await exists(
      path.join(
        temp,
        ".behavectl",
      ),
    )),
  );

  const home = await run(
    [],
    temp,
  );

  check(
    "Fresh-project home has one obvious next action",
    home.exitCode === 0 &&
      home.stdout.includes(
        "READ ONLY",
      ) &&
      home.stdout.includes(
        "behavectl init",
      ) &&
      home.stdout.includes(
        "No cloud. No daemon. No silent promotion.",
      ),
  );

  check(
    "Inspecting home remains read-only",
    !(await exists(
      path.join(
        temp,
        ".behavectl",
      ),
    )),
  );

  const agentInstall =
    await run(
      [
        "agent",
        "install",
        "--all",
        "--mcp",
      ],
      temp,
    );

  check(
    "Agent-native install exposes Claude + Codex directly",
    agentInstall.exitCode === 0 &&
      agentInstall.stdout.includes(
        "/behavectl",
      ) &&
      agentInstall.stdout.includes(
        "$behavectl",
      ) &&
      agentInstall.stdout.includes(
        "DIRECT AGENT ACCESS",
      ),
  );

  const agentStatus =
    await run(
      [
        "agent",
        "status",
      ],
      temp,
    );

  check(
    "Agent-native status explains the safety boundary",
    agentStatus.exitCode === 0 &&
      agentStatus.stdout.includes(
        "SAFETY MODEL",
      ) &&
      agentStatus.stdout.includes(
        "MCP tools are read-only",
      ) &&
      agentStatus.stdout.includes(
        "Promote / rollback remain human-gated",
      ),
  );

  const blocked =
    await run(
      [
        "promote",
        "bp_missing",
      ],
      temp,
    );

  check(
    "A failed operation renders recovery UI instead of a raw stack",
    blocked.exitCode !== 0 &&
      blocked.stderr.includes(
        "BLOCKED",
      ) &&
      blocked.stderr.includes(
        "SAFETY",
      ) &&
      blocked.stderr.includes(
        "RECOVER",
      ) &&
      !blocked.stderr.includes(
        "\n    at ",
      ),
  );

  const typo =
    await run(
      [
        "verfy",
      ],
      temp,
    );

  check(
    "A typo recovers toward the intended command",
    typo.exitCode !== 0 &&
      typo.stderr.includes(
        "ERR-COMMAND-NOT-FOUND",
      ) &&
      typo.stderr.includes(
        "behavectl verify",
      ) &&
      !typo.stderr.includes(
        "behavectl doctor",
      ),
  );

  check(
    "Known failures expose stable public references",
    blocked.stderr.includes(
      "ERR-PATCH-NOT-FOUND",
    ),
  );

  const failed =
    checks.filter(
      (item) =>
        !item.passed,
    );

  console.log(
    "Behavectl first-minute check",
  );
  console.log("");

  for (const item of checks) {
    console.log(
      `${item.passed ? "✓" : "✗"} ${item.label}`,
    );
  }

  console.log("");

  if (failed.length) {
    console.error(
      `${failed.length} first-minute contract${failed.length === 1 ? "" : "s"} failed.`,
    );
    process.exit(1);
  }

  console.log(
    "✓ first-minute experience passed",
  );
} finally {
  await fs.rm(
    temp,
    {
      recursive: true,
      force: true,
    },
  );
}

function check(
  label,
  passed,
) {
  checks.push({
    label,
    passed: Boolean(passed),
  });
}

async function run(
  args,
  cwd,
) {
  return new Promise(
    (resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          cli,
          ...args,
        ],
        {
          cwd,
          shell: false,
          env: {
            ...process.env,
            FORCE_COLOR: "0",
          },
        },
      );

      let stdout = "";
      let stderr = "";

      child.stdout.setEncoding(
        "utf8",
      );
      child.stderr.setEncoding(
        "utf8",
      );

      child.stdout.on(
        "data",
        (chunk) =>
          (stdout += chunk),
      );
      child.stderr.on(
        "data",
        (chunk) =>
          (stderr += chunk),
      );

      child.on(
        "error",
        reject,
      );
      child.on(
        "close",
        (code) =>
          resolve({
            exitCode:
              code ?? -1,
            stdout,
            stderr,
          }),
      );
    },
  );
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}
