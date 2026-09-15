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

const temp = await fs.mkdtemp(
  path.join(
    os.tmpdir(),
    "behavectl-agent-native-smoke-",
  ),
);

try {
  await fs.writeFile(
    path.join(temp, ".git"),
    "",
  );

  let result = await run(
    process.execPath,
    [
      path.join(
        repoRoot,
        "src",
        "cli",
        "behavectl.mjs",
      ),
      "agent",
      "install",
      "--all",
      "--mcp",
    ],
    temp,
  );

  assertSuccess(
    result,
    "agent install",
  );

  for (const file of [
    ".claude/skills/behavectl/SKILL.md",
    ".agents/skills/behavectl/SKILL.md",
    ".agents/skills/behavectl/agents/openai.yaml",
    ".mcp.json",
  ]) {
    await fs.access(
      path.join(temp, file),
    );
  }

  const mcp = JSON.parse(
    await fs.readFile(
      path.join(temp, ".mcp.json"),
      "utf8",
    ),
  );

  if (
    mcp?.mcpServers?.behavectl
      ?.command !== "npx"
  ) {
    throw new Error(
      "Behavectl MCP project config is missing.",
    );
  }

  const child = spawn(
    process.execPath,
    [
      path.join(
        repoRoot,
        "src",
        "cli",
        "behavectl.mjs",
      ),
      "mcp",
    ],
    {
      cwd: temp,
      shell: false,
      stdio: [
        "pipe",
        "pipe",
        "pipe",
      ],
      env: process.env,
    },
  );

  let stdout = "";
  let stderr = "";

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on(
    "data",
    (chunk) => {
      stdout += chunk;
    },
  );
  child.stderr.on(
    "data",
    (chunk) => {
      stderr += chunk;
    },
  );

  child.stdin.write(
    JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion:
          "2025-11-25",
        capabilities: {},
        clientInfo: {
          name: "release-smoke",
          version: "1",
        },
      },
    }) + "\n",
  );

  child.stdin.write(
    JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {},
    }) + "\n",
  );

  child.stdin.end();

  const exitCode =
    await new Promise(
      (resolve, reject) => {
        child.on("error", reject);
        child.on(
          "close",
          (code) =>
            resolve(code ?? -1),
        );
      },
    );

  if (exitCode !== 0) {
    throw new Error(
      `MCP smoke exited ${exitCode}\n${stderr}`,
    );
  }

  const messages = stdout
    .split("\n")
    .filter(Boolean)
    .map((line) =>
      JSON.parse(line),
    );

  const initialize =
    messages.find(
      (message) =>
        message.id === 1,
    );

  const tools =
    messages.find(
      (message) =>
        message.id === 2,
    );

  if (
    initialize?.result?.serverInfo
      ?.name !== "behavectl"
  ) {
    throw new Error(
      "MCP initialize handshake failed.",
    );
  }

  const names =
    tools?.result?.tools?.map(
      (tool) => tool.name,
    ) ?? [];

  if (
    !names.includes(
      "behavectl_inbox",
    ) ||
    names.some((name) =>
      name.includes("promote"),
    )
  ) {
    throw new Error(
      `Unexpected MCP tool surface: ${names.join(", ")}`,
    );
  }

  console.log(
    "Agent-native smoke passed: Skills + Claude project MCP + read-only MCP handshake.",
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

function assertSuccess(
  result,
  label,
) {
  if (
    result.exitCode === 0
  ) {
    return;
  }

  throw new Error(
    `${label} failed\n${result.stdout}\n${result.stderr}`,
  );
}

function run(
  command,
  args,
  cwd,
) {
  return new Promise(
    (resolve, reject) => {
      const child = spawn(
        command,
        args,
        {
          cwd,
          shell: false,
          env: process.env,
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
