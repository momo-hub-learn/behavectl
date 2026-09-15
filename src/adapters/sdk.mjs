import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { commandExists, runProcess } from "../core/eval/process.mjs";

export const ADAPTER_CONTRACT_VERSION = "behavectl.agent-adapter.v1";

const VALID_MATURITY = new Set(["stable", "beta", "experimental"]);
const VALID_CAPABILITIES = new Set([
  "evaluate",
  "compile",
  "replay",
  "hooks",
  "skill",
  "mcp",
]);

export function defineAgentAdapter(input) {
  const adapter = normalizeAdapter(input);
  validateAgentAdapter(adapter);
  return Object.freeze(adapter);
}

export function validateAgentAdapter(adapter) {
  const problems = [];

  if (!adapter || typeof adapter !== "object") {
    problems.push("adapter must be an object");
  } else {
    if (adapter.contractVersion !== ADAPTER_CONTRACT_VERSION) {
      problems.push(`contractVersion must be ${ADAPTER_CONTRACT_VERSION}`);
    }
    if (!/^[a-z0-9][a-z0-9-]*$/.test(adapter.id ?? "")) {
      problems.push("id must be lowercase kebab-case");
    }
    if (!String(adapter.displayName ?? "").trim()) {
      problems.push("displayName is required");
    }
    if (!Array.isArray(adapter.aliases)) {
      problems.push("aliases must be an array");
    }
    if (!Array.isArray(adapter.binaries) || adapter.binaries.length === 0) {
      problems.push("binaries must contain at least one command");
    }
    if (!VALID_MATURITY.has(adapter.maturity)) {
      problems.push("maturity must be stable, beta, or experimental");
    }
    if (!Array.isArray(adapter.capabilities)) {
      problems.push("capabilities must be an array");
    } else {
      const unknown = adapter.capabilities.filter(
        (value) => !VALID_CAPABILITIES.has(value),
      );
      if (unknown.length) {
        problems.push(`unknown capabilities: ${unknown.join(", ")}`);
      }
    }
    if (adapter.capabilities?.includes("evaluate") && typeof adapter.createRunner !== "function") {
      problems.push("evaluate capability requires createRunner(options)");
    }
    if (adapter.capabilities?.includes("compile") && typeof adapter.compile !== "function") {
      problems.push("compile capability requires compile({ repoRoot, patches })");
    }
    if (adapter.capabilities?.includes("replay") && typeof adapter.replayProtocol !== "function") {
      problems.push("replay capability requires replayProtocol({ text, source })");
    }
  }

  if (problems.length) {
    const error = new Error(`Invalid Behavectl Agent Adapter:\n- ${problems.join("\n- ")}`);
    error.code = "BCTL_ADAPTER_INVALID";
    error.problems = problems;
    throw error;
  }

  return adapter;
}

export async function detectAdapter(adapter) {
  validateAgentAdapter(adapter);

  if (typeof adapter.detect === "function") {
    const custom = await adapter.detect();
    return {
      id: adapter.id,
      displayName: adapter.displayName,
      maturity: adapter.maturity,
      capabilities: [...adapter.capabilities],
      protocol: adapter.protocol ?? null,
      surfaces: [...(adapter.surfaces ?? [])],
      ...custom,
    };
  }

  for (const command of adapter.binaries) {
    if (!(await commandExists(command))) continue;
    const result = await runProcess(command, adapter.versionArgs ?? ["--version"], {
      timeoutMs: 8_000,
      allowFailure: true,
    });
    return {
      id: adapter.id,
      displayName: adapter.displayName,
      maturity: adapter.maturity,
      capabilities: [...adapter.capabilities],
      protocol: adapter.protocol ?? null,
      surfaces: [...(adapter.surfaces ?? [])],
      command,
      installed: true,
      version:
        (result.stdout || result.stderr)
          .trim()
          .split("\n")[0]
          .slice(0, 160) || "unknown",
      exitCode: result.exitCode,
    };
  }

  return {
    id: adapter.id,
    displayName: adapter.displayName,
    maturity: adapter.maturity,
    capabilities: [...adapter.capabilities],
    protocol: adapter.protocol ?? null,
    surfaces: [...(adapter.surfaces ?? [])],
    installed: false,
    command: adapter.binaries[0],
  };
}

export function patchTargetsAdapter(patch, adapter) {
  const accepted = new Set([adapter.id, ...(adapter.aliases ?? [])]);
  return (patch.targets ?? []).some((target) => accepted.has(String(target).toLowerCase()));
}

export function activePatchesForAdapter(patches, adapter) {
  return (patches ?? []).filter(
    (patch) => patch.status === "active" && patchTargetsAdapter(patch, adapter),
  );
}

export async function loadAdapterModule(file) {
  const absolute = path.resolve(file);
  await fs.access(absolute);
  const imported = await import(`${pathToFileURL(absolute).href}?bctl=${Date.now()}`);
  const candidate = imported.default ?? imported.adapter ?? imported;
  return defineAgentAdapter(candidate);
}

function normalizeAdapter(input) {
  return {
    contractVersion: input?.contractVersion ?? ADAPTER_CONTRACT_VERSION,
    id: String(input?.id ?? "").trim().toLowerCase(),
    displayName: String(input?.displayName ?? "").trim(),
    aliases: [...new Set((input?.aliases ?? []).map((value) => String(value).trim().toLowerCase()).filter(Boolean))],
    binaries: [...new Set((input?.binaries ?? []).map((value) => String(value).trim()).filter(Boolean))],
    versionArgs: input?.versionArgs ?? ["--version"],
    maturity: input?.maturity ?? "experimental",
    capabilities: [...new Set(input?.capabilities ?? [])],
    protocol: input?.protocol ?? null,
    surfaces: [...new Set(input?.surfaces ?? [])],
    createRunner: input?.createRunner,
    compile: input?.compile,
    replayProtocol: input?.replayProtocol,
    detect: input?.detect,
    metadata: input?.metadata ?? {},
  };
}
