import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runProcess } from "./process.mjs";

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function isGitRepo(repoRoot) {
  if (await exists(path.join(repoRoot, ".git"))) return true;
  const result = await runProcess(
    "git",
    ["-C", repoRoot, "rev-parse", "--is-inside-work-tree"],
    { timeoutMs: 5_000, allowFailure: true },
  );
  return result.exitCode === 0 && result.stdout.trim() === "true";
}

async function copyProject(source, target) {
  await fs.cp(source, target, {
    recursive: true,
    filter(src) {
      const rel = path.relative(source, src);
      if (!rel) return true;
      const first = rel.split(path.sep)[0];
      return ![".behavectl", "node_modules", ".git"].includes(first);
    },
  });
}

export async function createEvalWorkspace(repoRoot, label) {
  const tempRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), `behavectl-${label}-`),
  );
  const workspace = path.join(tempRoot, "workspace");

  if (await isGitRepo(repoRoot)) {
    const result = await runProcess(
      "git",
      ["-C", repoRoot, "worktree", "add", "--detach", workspace, "HEAD"],
      { timeoutMs: 30_000, allowFailure: true },
    );

    if (result.exitCode === 0) {
      return {
        path: workspace,
        mode: "git-worktree",
        async cleanup() {
          await runProcess(
            "git",
            ["-C", repoRoot, "worktree", "remove", "--force", workspace],
            { timeoutMs: 30_000, allowFailure: true },
          );
          await fs.rm(tempRoot, { recursive: true, force: true });
        },
      };
    }
  }

  await fs.mkdir(workspace, { recursive: true });
  await copyProject(repoRoot, workspace);

  return {
    path: workspace,
    mode: "copy",
    async cleanup() {
      await fs.rm(tempRoot, { recursive: true, force: true });
    },
  };
}
