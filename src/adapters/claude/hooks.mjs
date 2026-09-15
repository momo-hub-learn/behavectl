import path from "node:path";
import fs from "node:fs/promises";
import { readJson, writeJsonAtomic } from "../../core/fs.mjs";

const EVENTS = [
  "UserPromptSubmit",
  "PostToolUse",
  "PostToolUseFailure",
  "Stop",
  "SessionEnd",
];

function hookEntry(command) {
  return {
    hooks: [
      {
        type: "command",
        command,
        timeout: 3,
      },
    ],
  };
}

function sameBehavectlHook(group) {
  return (
    Array.isArray(group?.hooks) &&
    group.hooks.some(
      (h) =>
        h?.type === "command" &&
        typeof h?.command === "string" &&
        h.command.includes(".behavectl") && h.command.includes("capture.mjs") && h.command.endsWith(" claude"),
    )
  );
}

export async function installClaudeHooks(repoRoot, hookBridgeFile) {
  const settingsFile = path.join(
    repoRoot,
    ".claude",
    "settings.local.json",
  );

  await fs.mkdir(path.dirname(settingsFile), { recursive: true });

  const settings = await readJson(settingsFile, {});
  settings.hooks ??= {};

  const command =
    `node ${shellQuote(path.resolve(hookBridgeFile))} claude`;

  let changed = false;

  for (const event of EVENTS) {
    const groups = Array.isArray(settings.hooks[event])
      ? settings.hooks[event]
      : [];

    if (!groups.some(sameBehavectlHook)) {
      groups.push(hookEntry(command));
      settings.hooks[event] = groups;
      changed = true;
    }
  }

  if (changed) await writeJsonAtomic(settingsFile, settings);

  return {
    changed,
    file: settingsFile,
    events: EVENTS,
    command,
  };
}

function shellQuote(value) {
  if (/^[A-Za-z0-9_./:@+-]+$/.test(value)) return value;
  return `'${value.replaceAll("'", `'\\''`)}'`;
}


export async function uninstallClaudeHooks(repoRoot) {
  const settingsFile = path.join(repoRoot, ".claude", "settings.local.json");
  const settings = await readJson(settingsFile, null);
  if (!settings?.hooks) return { changed: false, file: settingsFile };

  let changed = false;

  for (const [event, groups] of Object.entries(settings.hooks)) {
    if (!Array.isArray(groups)) continue;
    const filtered = groups.filter((group) => !sameBehavectlHook(group));
    if (filtered.length !== groups.length) changed = true;

    if (filtered.length) settings.hooks[event] = filtered;
    else delete settings.hooks[event];
  }

  if (settings.hooks && Object.keys(settings.hooks).length === 0) {
    delete settings.hooks;
  }

  if (changed) await writeJsonAtomic(settingsFile, settings);
  return { changed, file: settingsFile };
}
