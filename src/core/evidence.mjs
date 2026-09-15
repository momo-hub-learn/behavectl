import fs from "node:fs/promises";
import path from "node:path";

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

export async function collectRepoEvidence(repoRoot, statement) {
  const evidence = [];
  const lower = statement.toLowerCase();

  if (lower.includes("pnpm") || lower.includes("npm") || lower.includes("yarn")) {
    for (const lock of ["pnpm-lock.yaml", "package-lock.json", "yarn.lock"]) {
      if (await exists(path.join(repoRoot, lock))) {
        evidence.push({
          kind: "repo_file",
          path: lock,
          fact: `${lock} exists in the project root.`,
        });
      }
    }

    const packageFile = path.join(repoRoot, "package.json");
    if (await exists(packageFile)) {
      try {
        const pkg = JSON.parse(await fs.readFile(packageFile, "utf8"));
        if (typeof pkg.packageManager === "string") {
          evidence.push({
            kind: "package_metadata",
            key: "packageManager",
            value: pkg.packageManager,
          });
        }
      } catch {
        // Repository evidence is opportunistic; malformed metadata must not block learning.
      }
    }
  }

  return evidence;
}

export async function enrichPatchFromRepo(patch, repoRoot) {
  const evidence = await collectRepoEvidence(
    repoRoot,
    patch.behavior.statement ?? "",
  );

  const seen = new Set(
    patch.evidence.map((item) => JSON.stringify(item)),
  );
  for (const item of evidence) {
    const key = JSON.stringify(item);
    if (!seen.has(key)) patch.evidence.push(item);
  }

  return patch;
}
