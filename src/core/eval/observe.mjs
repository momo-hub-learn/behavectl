import fs from "node:fs/promises";
import path from "node:path";
import { runProcess } from "./process.mjs";

export async function snapshotFiles(root) {
  const files = [];
  const contents = new Map();
  let remainingBytes = 2 * 1024 * 1024;

  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if ([".git", ".behavectl", "node_modules"].includes(entry.name)) continue;
      const abs = path.join(dir, entry.name);
      const rel = path.relative(root, abs);
      if (entry.isDirectory()) await walk(abs);
      else if (entry.isFile()) {
        files.push(rel);
        // Bounded evidence capture; omitted content is never treated as unchanged.
        const handle = await fs.open(abs, 'r');
        try {
          const { size } = await handle.stat();
          if (size > 65536 || size > remainingBytes) {
            contents.set(rel, { omitted: size > 65536 ? 'file-size-limit' : 'snapshot-budget' });
            continue;
          }
          const buffer = Buffer.alloc(size + 1);
          const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
          remainingBytes -= bytesRead;
          const bytes = buffer.subarray(0, bytesRead);
          if (bytesRead > size) contents.set(rel, { omitted: 'file-changed-during-read' });
          else if (bytes.includes(0)) contents.set(rel, { omitted: 'binary' });
          else {
            try { contents.set(rel, { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes) }); }
            catch { contents.set(rel, { omitted: 'non-utf8' }); }
          }
        } finally { await handle.close(); }
      }
    }
  }

  await walk(root);
  const snapshot = new Set(files);
  snapshot.contents = contents;
  return snapshot;
}

export function diffFiles(before, after) {
  const changes = [];
  const omitted = [];
  for (const file of [...new Set([...before, ...after])].sort()) {
    const b = before.contents?.get(file), a = after.contents?.get(file);
    if (b?.omitted || a?.omitted) {
      omitted.push({ path: file, before: b?.omitted, after: a?.omitted });
      continue;
    }
    if (b?.text !== a?.text) changes.push({
      path: file,
      kind: !before.has(file) ? 'created' : !after.has(file) ? 'deleted' : 'modified',
      before: b?.text ?? null,
      after: a?.text ?? null,
    });
  }
  return {
    changes,
    omitted,
    created: [...after].filter((file) => !before.has(file)).sort(),
    deleted: [...before].filter((file) => !after.has(file)).sort(),
  };
}

export async function runRegressionCommands(workspace, commands = []) {
  const results = [];
  for (const command of commands) {
    const shell =
      process.platform === "win32"
        ? ["cmd.exe", ["/d", "/s", "/c", command]]
        : ["/bin/sh", ["-lc", command]];

    const result = await runProcess(shell[0], shell[1], {
      cwd: workspace,
      timeoutMs: 120_000,
      allowFailure: true,
    });

    results.push({
      command,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
    });
  }
  return results;
}
