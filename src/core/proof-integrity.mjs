import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { writeJsonAtomic } from "./fs.mjs";

export const PROOF_INTEGRITY_FILE = "checksums.json";
export const PROOF_INTEGRITY_ALGORITHM = "sha256";

export async function writeProofIntegrity(proofDir) {
  const files = await listProofFiles(proofDir, {
    exclude: new Set([PROOF_INTEGRITY_FILE]),
  });

  const entries = {};
  for (const rel of files) {
    entries[rel] = await sha256File(path.join(proofDir, rel));
  }

  const document = {
    schema: "behavectl.proof-integrity.v1",
    algorithm: PROOF_INTEGRITY_ALGORITHM,
    createdAt: new Date().toISOString(),
    files: entries,
  };

  await writeJsonAtomic(
    path.join(proofDir, PROOF_INTEGRITY_FILE),
    document,
  );

  return document;
}

export async function verifyProofIntegrity(proofDir) {
  const root = path.resolve(proofDir);
  const integrityFile = path.join(root, PROOF_INTEGRITY_FILE);

  let document;
  try {
    document = JSON.parse(await fs.readFile(integrityFile, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {
        schema: "behavectl.proof-integrity-result.v1",
        valid: false,
        proofDir: root,
        algorithm: null,
        checked: 0,
        missingIntegrityFile: true,
        missing: [],
        mismatched: [],
        unexpected: [],
        symlinks: [],
      };
    }
    throw error;
  }

  if (
    document?.schema !== "behavectl.proof-integrity.v1" ||
    document?.algorithm !== PROOF_INTEGRITY_ALGORITHM ||
    !document?.files ||
    typeof document.files !== "object" ||
    Array.isArray(document.files)
  ) {
    return {
      schema: "behavectl.proof-integrity-result.v1",
      valid: false,
      proofDir: root,
      algorithm: document?.algorithm ?? null,
      checked: 0,
      invalidManifest: true,
      missing: [],
      mismatched: [],
      unexpected: [],
      symlinks: [],
    };
  }

  const symlinks = await findSymlinks(root);
  const actualFiles = await listProofFiles(root, {
    exclude: new Set([PROOF_INTEGRITY_FILE]),
  });
  const expectedFiles = Object.keys(document.files).sort();
  const actualSet = new Set(actualFiles);
  const expectedSet = new Set(expectedFiles);

  const missing = expectedFiles.filter((rel) => !actualSet.has(rel));
  const unexpected = actualFiles.filter((rel) => !expectedSet.has(rel));
  const mismatched = [];
  let checked = 0;

  for (const rel of expectedFiles) {
    if (!actualSet.has(rel)) continue;

    const expected = document.files[rel];
    if (!/^[a-f0-9]{64}$/.test(String(expected))) {
      mismatched.push({
        path: rel,
        expected: String(expected),
        actual: null,
        reason: "invalid expected digest",
      });
      continue;
    }

    const actual = await sha256File(path.join(root, rel));
    checked += 1;

    if (!safeEqualHex(String(expected), actual)) {
      mismatched.push({
        path: rel,
        expected,
        actual,
        reason: "digest mismatch",
      });
    }
  }

  const valid =
    missing.length === 0 &&
    unexpected.length === 0 &&
    mismatched.length === 0 &&
    symlinks.length === 0;

  return {
    schema: "behavectl.proof-integrity-result.v1",
    valid,
    proofDir: root,
    algorithm: document.algorithm,
    checked,
    missingIntegrityFile: false,
    invalidManifest: false,
    missing,
    mismatched,
    unexpected,
    symlinks,
  };
}

export function formatProofIntegrity(result) {
  const lines = [
    "BEHAVECTL",
    "Behavior Proof integrity",
    "",
  ];

  if (result.valid) {
    lines.push("✓ VALID");
    lines.push("");
    lines.push(`Algorithm  ${String(result.algorithm).toUpperCase()}`);
    lines.push(`Files      ${result.checked}`);
    lines.push(`Proof      ${result.proofDir}`);
    lines.push("");
    lines.push("Every tracked proof artifact matches its recorded digest.");
    lines.push("Integrity does not prove author identity; signed attestation is a separate layer.");
    return lines.join("\n");
  }

  lines.push("✗ INVALID");
  lines.push("");

  if (result.missingIntegrityFile) {
    lines.push(`Missing    ${PROOF_INTEGRITY_FILE}`);
  }

  if (result.invalidManifest) {
    lines.push("Manifest   invalid integrity schema or algorithm");
  }

  for (const rel of result.missing ?? []) {
    lines.push(`Missing    ${rel}`);
  }
  for (const rel of result.unexpected ?? []) {
    lines.push(`Unexpected ${rel}`);
  }
  for (const rel of result.symlinks ?? []) {
    lines.push(`Symlink    ${rel}`);
  }
  for (const item of result.mismatched ?? []) {
    lines.push(`Changed    ${item.path}`);
  }

  lines.push("");
  lines.push("Do not treat this directory as an intact Behavior Proof.");
  return lines.join("\n");
}

async function sha256File(file) {
  const content = await fs.readFile(file);
  return crypto.createHash("sha256").update(content).digest("hex");
}

async function listProofFiles(root, { exclude = new Set() } = {}) {
  const files = [];

  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      const rel = normalizePath(path.relative(root, abs));

      if (exclude.has(rel)) continue;
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) await walk(abs);
      else if (entry.isFile()) files.push(rel);
    }
  }

  await walk(root);
  return files.sort();
}

async function findSymlinks(root) {
  const links = [];

  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      const rel = normalizePath(path.relative(root, abs));

      if (entry.isSymbolicLink()) {
        links.push(rel);
      } else if (entry.isDirectory()) {
        await walk(abs);
      }
    }
  }

  await walk(root);
  return links.sort();
}

function normalizePath(value) {
  return value.split(path.sep).join("/");
}

function safeEqualHex(a, b) {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}
