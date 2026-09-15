import path from "node:path";

import claudeCodeAdapter from "./claude/adapter.mjs";
import codexAdapter from "./codex/adapter.mjs";
import codeBuddyAdapter from "./codebuddy/adapter.mjs";
import {
  detectAdapter,
  loadAdapterModule,
  validateAgentAdapter,
} from "./sdk.mjs";

const REGISTRY = new Map();
const ALIASES = new Map();

for (const adapter of [codexAdapter, codeBuddyAdapter, claudeCodeAdapter]) {
  registerAgentAdapter(adapter);
}

export function registerAgentAdapter(adapter, { replace = false, source = "builtin" } = {}) {
  validateAgentAdapter(adapter);

  if (REGISTRY.has(adapter.id) && !replace) {
    throw new Error(`Agent adapter already registered: ${adapter.id}`);
  }

  if (replace && REGISTRY.has(adapter.id)) {
    unregisterAliases(REGISTRY.get(adapter.id));
  }

  const entry = Object.freeze({ ...adapter, source });
  REGISTRY.set(adapter.id, entry);
  ALIASES.set(adapter.id, adapter.id);
  for (const alias of adapter.aliases ?? []) {
    const existing = ALIASES.get(alias);
    if (existing && existing !== adapter.id && !replace) {
      throw new Error(`Agent adapter alias collision: ${alias} (${existing} vs ${adapter.id})`);
    }
    ALIASES.set(alias, adapter.id);
  }

  return entry;
}

export async function registerExternalAdapter(file, { replace = false } = {}) {
  const adapter = await loadAdapterModule(file);
  return registerAgentAdapter(adapter, {
    replace,
    source: path.resolve(file),
  });
}

export function listAgentDefinitions() {
  return [...REGISTRY.values()];
}

export function canonicalAgentId(value) {
  if (!value) return null;
  return ALIASES.get(String(value).trim().toLowerCase()) ?? null;
}

export function agentDefinition(value) {
  const id = canonicalAgentId(value);
  return id ? REGISTRY.get(id) ?? null : null;
}

export function displayAgentName(value) {
  return agentDefinition(value)?.displayName ?? String(value);
}

export function createAgentRunner(value, options = {}) {
  const adapter = agentDefinition(value);
  if (!adapter) {
    throw new Error(
      `Unsupported agent: ${value}. Registered adapters: ${listAgentDefinitions().map((item) => item.id).join(", ")}.`,
    );
  }
  if (!adapter.capabilities.includes("evaluate") || typeof adapter.createRunner !== "function") {
    throw new Error(`Agent adapter ${adapter.id} does not support real evaluation.`);
  }
  return adapter.createRunner(options);
}

export async function detectAgent(value) {
  const adapter = agentDefinition(value);
  return adapter ? detectAdapter(adapter) : null;
}

export async function detectAgents() {
  return Promise.all(listAgentDefinitions().map((adapter) => detectAdapter(adapter)));
}

export function canonicalizeAgentList(values) {
  const agents = [];
  const unknown = [];
  for (const value of values ?? []) {
    const id = canonicalAgentId(value);
    if (!id) unknown.push(value);
    else if (!agents.includes(id)) agents.push(id);
  }
  return { agents, unknown };
}

export async function compileRegisteredAdapters(repoRoot, patches) {
  const artifacts = [];
  for (const adapter of listAgentDefinitions()) {
    if (!adapter.capabilities.includes("compile") || typeof adapter.compile !== "function") continue;
    artifacts.push(await adapter.compile({ repoRoot, patches }));
  }
  return artifacts;
}

function unregisterAliases(adapter) {
  if (!adapter) return;
  for (const alias of [adapter.id, ...(adapter.aliases ?? [])]) {
    if (ALIASES.get(alias) === adapter.id) ALIASES.delete(alias);
  }
}
