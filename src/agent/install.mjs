import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ensureDir, readJson, writeJsonAtomic } from "../core/fs.mjs";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(moduleDir, "../..");
const canonicalSkillRoot = path.join(
  packageRoot,
  "integrations",
  "agent-skill",
  "behavectl",
);

const canonicalSkill = path.join(
  canonicalSkillRoot,
  "SKILL.md",
);

export async function installAgentNative({
  repoRoot,
  version,
  claude = true,
  codex = true,
  mcp = false,
}) {
  const results = [];

  const skillText = await fs.readFile(
    canonicalSkill,
    "utf8",
  );

  if (claude) {
    const target = path.join(
      repoRoot,
      ".claude",
      "skills",
      "behavectl",
      "SKILL.md",
    );

    results.push(
      await writeManagedFile({
        id: "claude-skill",
        label: "Claude Code skill",
        file: target,
        content: skillText,
      }),
    );
  }

  if (codex) {
    const target = path.join(
      repoRoot,
      ".agents",
      "skills",
      "behavectl",
      "SKILL.md",
    );

    results.push(
      await writeManagedFile({
        id: "codex-skill",
        label: "Codex / Agent Skills",
        file: target,
        content: skillText,
      }),
    );

    const openaiMetadata =
      path.join(
        canonicalSkillRoot,
        "agents",
        "openai.yaml",
      );

    if (await exists(openaiMetadata)) {
      const metadataTarget =
        path.join(
          path.dirname(target),
          "agents",
          "openai.yaml",
        );

      const metadata =
        await fs.readFile(
          openaiMetadata,
          "utf8",
        );

      await writeManagedFile({
        id: "codex-skill-metadata",
        label: "Codex skill metadata",
        file: metadataTarget,
        content: metadata,
      });
    }
  }

  if (mcp && claude) {
    results.push(
      await installClaudeProjectMcp({
        repoRoot,
        version,
      }),
    );
  }

  return {
    schema: "behavectl.agent-install.v1",
    repoRoot: path.resolve(repoRoot),
    results,
    claude,
    codex,
    mcp,
  };
}

export async function uninstallAgentNative({
  repoRoot,
  claude = true,
  codex = true,
  mcp = false,
}) {
  const results = [];

  if (claude) {
    const dir = path.join(
      repoRoot,
      ".claude",
      "skills",
      "behavectl",
    );
    results.push({
      id: "claude-skill",
      label: "Claude Code skill",
      changed: await removeDirIfExists(dir),
      path: dir,
    });
  }

  if (codex) {
    const dir = path.join(
      repoRoot,
      ".agents",
      "skills",
      "behavectl",
    );
    results.push({
      id: "codex-skill",
      label: "Codex / Agent Skills",
      changed: await removeDirIfExists(dir),
      path: dir,
    });
  }

  if (mcp && claude) {
    results.push(
      await uninstallClaudeProjectMcp({
        repoRoot,
      }),
    );
  }

  return {
    schema: "behavectl.agent-uninstall.v1",
    repoRoot: path.resolve(repoRoot),
    results,
  };
}

export async function agentNativeStatus({
  repoRoot,
}) {
  const claudeSkill = path.join(
    repoRoot,
    ".claude",
    "skills",
    "behavectl",
    "SKILL.md",
  );

  const codexSkill = path.join(
    repoRoot,
    ".agents",
    "skills",
    "behavectl",
    "SKILL.md",
  );

  const mcpFile = path.join(
    repoRoot,
    ".mcp.json",
  );

  const mcp = await readJson(
    mcpFile,
    {},
  );

  return {
    schema: "behavectl.agent-status.v1",
    repoRoot: path.resolve(repoRoot),
    claudeSkill: await exists(claudeSkill),
    claudeSkillPath: claudeSkill,
    codexSkill: await exists(codexSkill),
    codexSkillPath: codexSkill,
    claudeProjectMcp:
      mcp?.mcpServers?.behavectl?.type === "stdio",
    claudeProjectMcpPath: mcpFile,
  };
}

export function formatAgentNativeStatus(
  status,
) {
  const lines = [
    "BEHAVECTL",
    "Agent-native integration",
    "",
    `${status.claudeSkill ? "✓" : "○"} Claude Code skill`,
    `  ${relative(status.repoRoot, status.claudeSkillPath)}`,
    "",
    `${status.codexSkill ? "✓" : "○"} Codex / Agent Skills`,
    `  ${relative(status.repoRoot, status.codexSkillPath)}`,
    "",
    `${status.claudeProjectMcp ? "✓" : "○"} Claude Code MCP`,
    `  ${relative(status.repoRoot, status.claudeProjectMcpPath)}`,
  ];

  return lines.join("\n");
}

export function formatAgentInstall(
  result,
) {
  const lines = [
    "BEHAVECTL",
    "Agent-native install",
    "",
  ];

  for (const item of result.results) {
    lines.push(
      `${item.changed ? "✓" : "·"} ${item.label}`,
    );
    lines.push(
      `  ${relative(result.repoRoot, item.path)}`,
    );
  }

  lines.push("");
  lines.push("Inside Claude Code:");
  lines.push("  /behavectl");
  lines.push("");
  lines.push("Inside Codex:");
  lines.push("  $behavectl");
  lines.push("  or use /skills and select Behavectl.");
  lines.push("");
  lines.push("Natural language also works when the skill is relevant:");
  lines.push('  "What behavior changes are waiting for review?"');

  return lines.join("\n");
}

async function writeManagedFile({
  id,
  label,
  file,
  content,
}) {
  const previous = await readOptional(file);

  await ensureDir(
    path.dirname(file),
  );
  await fs.writeFile(
    file,
    content,
    "utf8",
  );

  return {
    id,
    label,
    path: file,
    changed: previous !== content,
  };
}

async function installClaudeProjectMcp({
  repoRoot,
  version,
}) {
  const file = path.join(
    repoRoot,
    ".mcp.json",
  );

  const value = await readJson(
    file,
    {},
  );

  const existing = value.mcpServers ?? {};

  const config = {
    type: "stdio",
    command: "npx",
    args: [
      "--yes",
      `behavectl@${version}`,
      "mcp",
    ],
  };

  const changed =
    JSON.stringify(existing.behavectl) !==
    JSON.stringify(config);

  await writeJsonAtomic(
    file,
    {
      ...value,
      mcpServers: {
        ...existing,
        behavectl: config,
      },
    },
  );

  return {
    id: "claude-mcp",
    label: "Claude Code MCP",
    path: file,
    changed,
  };
}

async function uninstallClaudeProjectMcp({
  repoRoot,
}) {
  const file = path.join(
    repoRoot,
    ".mcp.json",
  );

  const value = await readJson(
    file,
    null,
  );

  if (!value?.mcpServers?.behavectl) {
    return {
      id: "claude-mcp",
      label: "Claude Code MCP",
      path: file,
      changed: false,
    };
  }

  const nextServers = {
    ...value.mcpServers,
  };
  delete nextServers.behavectl;

  await writeJsonAtomic(
    file,
    {
      ...value,
      mcpServers: nextServers,
    },
  );

  return {
    id: "claude-mcp",
    label: "Claude Code MCP",
    path: file,
    changed: true,
  };
}

async function removeDirIfExists(dir) {
  try {
    await fs.rm(dir, {
      recursive: true,
      force: false,
    });
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function readOptional(file) {
  try {
    return await fs.readFile(
      file,
      "utf8",
    );
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function relative(root, file) {
  return path.relative(root, file) || ".";
}
