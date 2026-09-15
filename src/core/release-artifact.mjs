import crypto from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { gunzipSync } from "node:zlib";

import { writeJsonAtomic } from "./fs.mjs";

const execFileAsync = promisify(execFile);

export async function buildReleaseArtifact({
  bundleDir,
  packageRoot = defaultPackageRoot(),
  packRunner = npmPack,
} = {}) {
  if (!bundleDir) {
    throw new Error("Release artifact requires a bundle directory.");
  }

  const root = path.resolve(bundleDir);
  const pkgRoot = path.resolve(packageRoot);
  const pkg = JSON.parse(
    await fs.readFile(path.join(pkgRoot, "package.json"), "utf8"),
  );

  const packed = await packRunner({
    packageRoot: pkgRoot,
    destination: root,
  });

  const filename = packed.filename;
  if (!filename) {
    throw new Error("npm pack did not return an artifact filename.");
  }

  const artifactPath = path.join(root, filename);
  const bytes = await fs.readFile(artifactPath);
  const sha256 = crypto
    .createHash("sha256")
    .update(bytes)
    .digest("hex");

  const record = {
    schema: "behavectl.release-artifact.v1",
    createdAt: new Date().toISOString(),
    package: {
      name: pkg.name ?? null,
      version: pkg.version ?? null,
    },
    artifact: {
      filename,
      bytes: bytes.byteLength,
      sha256,
      npmShasum: packed.shasum ?? null,
      npmIntegrity: packed.integrity ?? null,
      unpackedSize: packed.unpackedSize ?? null,
      fileCount: Array.isArray(packed.files)
        ? packed.files.length
        : null,
    },
  };

  await writeJsonAtomic(
    path.join(root, "release-artifact.json"),
    record,
  );

  return record;
}


export async function bindExistingReleaseArtifact({
  bundleDir,
  artifactPath,
  expectedPackage = null,
} = {}) {
  if (!bundleDir || !artifactPath) {
    throw new Error("Binding an existing release artifact requires bundleDir and artifactPath.");
  }

  const root = path.resolve(bundleDir);
  const source = path.resolve(artifactPath);
  const filename = path.basename(source);
  const target = path.join(root, filename);

  const bytes = await fs.readFile(source);
  const packageJson = readPackageJsonFromNpmTgz(bytes);

  if (expectedPackage?.name && packageJson?.name !== expectedPackage.name) {
    throw new Error(`Release artifact package mismatch. Expected ${expectedPackage.name}; got ${packageJson?.name ?? "missing"}.`);
  }
  if (expectedPackage?.version && packageJson?.version !== expectedPackage.version) {
    throw new Error(`Release artifact version mismatch. Expected ${expectedPackage.version}; got ${packageJson?.version ?? "missing"}.`);
  }

  await fs.mkdir(root, { recursive: true });
  if (source !== target) await fs.copyFile(source, target);

  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  const record = {
    schema: "behavectl.release-artifact.v1",
    createdAt: new Date().toISOString(),
    package: {
      name: packageJson?.name ?? null,
      version: packageJson?.version ?? null,
    },
    artifact: {
      filename,
      bytes: bytes.byteLength,
      sha256,
      npmShasum: null,
      npmIntegrity: null,
      unpackedSize: null,
      fileCount: null,
      source: "bound-existing-artifact",
    },
  };

  await writeJsonAtomic(path.join(root, "release-artifact.json"), record);
  return record;
}

function readPackageJsonFromNpmTgz(gzipBytes) {
  const tar = gunzipSync(gzipBytes);
  let offset = 0;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const name = readTarString(header.subarray(0, 100));
    const prefix = readTarString(header.subarray(345, 500));
    const fullName = prefix ? `${prefix}/${name}` : name;
    const sizeText = readTarString(header.subarray(124, 136)).trim();
    const size = sizeText ? parseInt(sizeText, 8) : 0;
    const dataStart = offset + 512;
    const dataEnd = dataStart + size;
    if (fullName === "package/package.json" || fullName === "package.json") {
      return JSON.parse(tar.subarray(dataStart, dataEnd).toString("utf8"));
    }
    offset = dataStart + Math.ceil(size / 512) * 512;
  }
  throw new Error("npm artifact does not contain package/package.json.");
}

function readTarString(bytes) {
  const zero = bytes.indexOf(0);
  const end = zero === -1 ? bytes.length : zero;
  return bytes.subarray(0, end).toString("utf8").trim();
}
export async function verifyReleaseArtifact(bundleDir) {
  const root = path.resolve(bundleDir);
  const recordFile = path.join(root, "release-artifact.json");

  let record;
  try {
    record = JSON.parse(await fs.readFile(recordFile, "utf8"));
  } catch (error) {
    return {
      valid: false,
      reason:
        error?.code === "ENOENT"
          ? "release-artifact.json missing"
          : `release-artifact.json unreadable: ${String(error?.message ?? error)}`,
      record: null,
    };
  }

  const filename = record?.artifact?.filename;
  const expected = record?.artifact?.sha256;
  if (!filename || !expected) {
    return {
      valid: false,
      reason: "release artifact record is incomplete",
      record,
    };
  }

  const artifactPath = path.join(root, filename);
  let bytes;
  try {
    bytes = await fs.readFile(artifactPath);
  } catch (error) {
    return {
      valid: false,
      reason:
        error?.code === "ENOENT"
          ? `release artifact missing: ${filename}`
          : `release artifact unreadable: ${String(error?.message ?? error)}`,
      record,
    };
  }

  const actual = crypto
    .createHash("sha256")
    .update(bytes)
    .digest("hex");

  const sizeMatches =
    Number(record?.artifact?.bytes) === bytes.byteLength;
  const digestMatches = actual === expected;
  const identityPresent = Boolean(
    record?.package?.name && record?.package?.version,
  );

  return {
    valid: digestMatches && sizeMatches && identityPresent,
    reason:
      !identityPresent
        ? "package identity missing"
        : !digestMatches
          ? "SHA-256 mismatch"
          : !sizeMatches
            ? "artifact size mismatch"
            : "verified",
    filename,
    sha256: actual,
    bytes: bytes.byteLength,
    package: record.package,
    record,
  };
}

export function defaultPackageRoot() {
  return fileURLToPath(new URL("../../", import.meta.url));
}

async function npmPack({ packageRoot, destination }) {
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const { stdout } = await execFileAsync(
    npm,
    [
      "pack",
      "--json",
      "--pack-destination",
      destination,
    ],
    {
      cwd: packageRoot,
      maxBuffer: 10 * 1024 * 1024,
    },
  );

  const parsed = JSON.parse(stdout);
  const result = Array.isArray(parsed) ? parsed[0] : parsed;

  return {
    filename: result?.filename,
    shasum: result?.shasum,
    integrity: result?.integrity,
    unpackedSize: result?.unpackedSize,
    files: result?.files,
  };
}
