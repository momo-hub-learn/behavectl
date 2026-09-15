import { commandExists, runProcess } from "./eval/process.mjs";
import { detectAgents } from "../adapters/registry.mjs";

async function version(command, args = ["--version"]) {
  if (!(await commandExists(command))) {
    return { installed: false };
  }

  const result = await runProcess(command, args, {
    timeoutMs: 8_000,
    allowFailure: true,
  });

  return {
    installed: true,
    version:
      (result.stdout || result.stderr)
        .trim()
        .split("\n")[0]
        .slice(0, 160) || "unknown",
    exitCode: result.exitCode,
  };
}

export async function doctor() {
  const [node, git, agents] = await Promise.all([
    version("node"),
    version("git"),
    detectAgents(),
  ]);

  const byId = Object.fromEntries(agents.map((agent) => [agent.id, agent]));
  const ready = Object.fromEntries(
    agents.map((agent) => [agent.id, Boolean(git.installed && agent.installed)]),
  );

  // Keep the two legacy keys during the alpha so existing UI/tests and old
  // integrations do not break while the public surface moves to Agent Registry.
  const claude = byId["claude-code"] ?? { installed: false };
  const codex = byId.codex ?? { installed: false };
  const codebuddy = byId.codebuddy ?? { installed: false };

  return {
    node,
    git,
    agents,
    ready,
    claude,
    codex,
    codebuddy,
    realBehaviorDiffReady: {
      claude: Boolean(ready["claude-code"]),
      codex: Boolean(ready.codex),
      codebuddy: Boolean(ready.codebuddy),
    },
  };
}

export function formatDoctor(report) {
  const lines = ["Behavectl doctor", ""];
  lines.push(`${report.node.installed ? "✓" : "○"} Node          ${report.node.installed ? report.node.version : "not found"}`);
  lines.push(`${report.git.installed ? "✓" : "○"} Git           ${report.git.installed ? report.git.version : "not found"}`);
  lines.push("");
  lines.push("Agent Registry");

  const agents = report.agents ?? [
    { id: "claude-code", displayName: "Claude Code", ...(report.claude ?? {}) },
    { id: "codex", displayName: "Codex", ...(report.codex ?? {}) },
    { id: "codebuddy", displayName: "CodeBuddy Code", ...(report.codebuddy ?? {}) },
  ];

  for (const agent of agents) {
    const ready = report.ready?.[agent.id] ?? (
      agent.id === "claude-code"
        ? report.realBehaviorDiffReady?.claude
        : report.realBehaviorDiffReady?.[agent.id]
    );
    const detail = agent.installed
      ? ready
        ? `available · ${agent.version ?? "installed"} · authentication not checked`
        : `${agent.version ?? "installed"}`
      : "binary not found";
    lines.push(`${agent.installed ? "✓" : "○"} ${String(agent.displayName ?? agent.id).padEnd(14)} ${detail}`);
  }

  lines.push("");
  lines.push("Only declared Behavior Patch targets are required for verification.");
  lines.push("Detection checks local binaries only; model access is not checked.");
  return lines.join("\n");
}
