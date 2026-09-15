import path from "node:path";
import fs from "node:fs/promises";
import { readJson, writeJsonAtomic } from "../../core/fs.mjs";

const EVENTS = [
  "UserPromptSubmit",
  "PostToolUse",
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

function isBehavectl(group) {
  return (
    Array.isArray(group?.hooks) &&
    group.hooks.some(
      (h) =>
        h?.type === "command" &&
        typeof h?.command === "string" &&
        h.command.includes(".behavectl") && h.command.includes("capture.mjs") && h.command.endsWith(" codex"),
    )
  );
}

export async function installCodexHooks(repoRoot, hookBridgeFile) {
  const hooksFile = path.join(repoRoot, ".codex", "hooks.json");
  await fs.mkdir(path.dirname(hooksFile), { recursive: true });

  const doc = await readJson(hooksFile, {});
  doc.description ??= "Project hooks. Behavectl entries are additive.";
  doc.hooks ??= {};

  const command = `node ${shellQuote(path.resolve(hookBridgeFile))} codex`;
  let changed = false;

  for (const event of EVENTS) {
    const groups = Array.isArray(doc.hooks[event]) ? doc.hooks[event] : [];
    if (!groups.some(isBehavectl)) {
      groups.push(hookEntry(command));
      doc.hooks[event] = groups;
      changed = true;
    }
  }

  if (changed) await writeJsonAtomic(hooksFile, doc);

  return {
    changed,
    file: hooksFile,
    events: EVENTS,
    command,
    trustRequired: true,
  };
}

function shellQuote(value) {
  if (/^[A-Za-z0-9_./:@+-]+$/.test(value)) return value;
  return `'${value.replaceAll("'", `'\\''`)}'`;
}


export async function uninstallCodexHooks(repoRoot) {
  const hooksFile = path.join(repoRoot, ".codex", "hooks.json");
  const doc = await readJson(hooksFile, null);
  if (!doc?.hooks) return { changed: false, file: hooksFile };

  let changed = false;

  for (const [event, groups] of Object.entries(doc.hooks)) {
    if (!Array.isArray(groups)) continue;
    const filtered = groups.filter((group) => !isBehavectl(group));
    if (filtered.length !== groups.length) changed = true;

    if (filtered.length) doc.hooks[event] = filtered;
    else delete doc.hooks[event];
  }

  if (changed) await writeJsonAtomic(hooksFile, doc);
  return { changed, file: hooksFile };
}
