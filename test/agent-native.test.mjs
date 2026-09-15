import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  agentNativeStatus,
  installAgentNative,
  uninstallAgentNative,
} from "../src/agent/install.mjs";

test("agent-native install gives Claude Code and Codex the same Behavectl skill", async () => {
  const repo = await fs.mkdtemp(
    path.join(
      os.tmpdir(),
      "behavectl-agent-native-",
    ),
  );

  await fs.writeFile(
    path.join(repo, ".mcp.json"),
    JSON.stringify({
      mcpServers: {
        existing: {
          type: "stdio",
          command: "existing-server",
          args: [],
        },
      },
    }, null, 2) + "\n",
  );

  const result =
    await installAgentNative({
      repoRoot: repo,
      version: "0.1.0-alpha.1",
      claude: true,
      codex: true,
      mcp: true,
    });

  assert.equal(
    result.results.some(
      (item) =>
        item.id === "claude-skill",
    ),
    true,
  );

  const claudeSkill =
    await fs.readFile(
      path.join(
        repo,
        ".claude",
        "skills",
        "behavectl",
        "SKILL.md",
      ),
      "utf8",
    );

  const codexSkill =
    await fs.readFile(
      path.join(
        repo,
        ".agents",
        "skills",
        "behavectl",
        "SKILL.md",
      ),
      "utf8",
    );

  assert.equal(
    claudeSkill,
    codexSkill,
  );
  assert.match(
    claudeSkill,
    /Never silently promote or roll back behavior/,
  );

  const metadata =
    await fs.readFile(
      path.join(
        repo,
        ".agents",
        "skills",
        "behavectl",
        "agents",
        "openai.yaml",
      ),
      "utf8",
    );

  assert.match(
    metadata,
    /display_name: "Behavectl"/,
  );
  assert.match(
    metadata,
    /allow_implicit_invocation: true/,
  );

  const mcp = JSON.parse(
    await fs.readFile(
      path.join(repo, ".mcp.json"),
      "utf8",
    ),
  );

  assert.equal(
    mcp.mcpServers.existing.command,
    "existing-server",
  );
  assert.deepEqual(
    mcp.mcpServers.behavectl.args,
    [
      "--yes",
      "behavectl@0.1.0-alpha.1",
      "mcp",
    ],
  );

  const status =
    await agentNativeStatus({
      repoRoot: repo,
    });

  assert.equal(
    status.claudeSkill,
    true,
  );
  assert.equal(
    status.codexSkill,
    true,
  );
  assert.equal(
    status.claudeProjectMcp,
    true,
  );
});

test("agent-native uninstall removes only Behavectl-owned integration", async () => {
  const repo = await fs.mkdtemp(
    path.join(
      os.tmpdir(),
      "behavectl-agent-uninstall-",
    ),
  );

  await fs.writeFile(
    path.join(repo, ".mcp.json"),
    JSON.stringify({
      mcpServers: {
        existing: {
          type: "stdio",
          command: "keep-me",
          args: [],
        },
      },
    }, null, 2) + "\n",
  );

  await installAgentNative({
    repoRoot: repo,
    version: "0.1.0-alpha.1",
    claude: true,
    codex: true,
    mcp: true,
  });

  await uninstallAgentNative({
    repoRoot: repo,
    claude: true,
    codex: true,
    mcp: true,
  });

  await assert.rejects(
    fs.access(
      path.join(
        repo,
        ".claude",
        "skills",
        "behavectl",
      ),
    ),
  );

  await assert.rejects(
    fs.access(
      path.join(
        repo,
        ".agents",
        "skills",
        "behavectl",
      ),
    ),
  );

  const mcp = JSON.parse(
    await fs.readFile(
      path.join(repo, ".mcp.json"),
      "utf8",
    ),
  );

  assert.equal(
    mcp.mcpServers.existing.command,
    "keep-me",
  );
  assert.equal(
    mcp.mcpServers.behavectl,
    undefined,
  );
});

test("Claude plugin package exposes the Behavectl skill and stdio MCP server", async () => {
  const pluginRoot = new URL(
    "../integrations/claude-plugin/",
    import.meta.url,
  );

  const manifest = JSON.parse(
    await fs.readFile(
      new URL(
        ".claude-plugin/plugin.json",
        pluginRoot,
      ),
      "utf8",
    ),
  );

  assert.equal(
    manifest.name,
    "behavectl",
  );
  assert.equal(
    manifest.version,
    "0.1.0-alpha.1",
  );

  const skill =
    await fs.readFile(
      new URL(
        "skills/behavectl/SKILL.md",
        pluginRoot,
      ),
      "utf8",
    );

  assert.match(
    skill,
    /^---\nname: behavectl/m,
  );

  const mcp = JSON.parse(
    await fs.readFile(
      new URL(
        ".mcp.json",
        pluginRoot,
      ),
      "utf8",
    ),
  );

  assert.equal(
    mcp.mcpServers.behavectl.type,
    "stdio",
  );
  assert.deepEqual(
    mcp.mcpServers.behavectl.args,
    [
      "--yes",
      "behavectl@0.1.0-alpha.1",
      "mcp",
    ],
  );
});
