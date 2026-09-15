import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  buildReleaseArtifact,
  verifyReleaseArtifact,
} from "../src/core/release-artifact.mjs";

test("release artifact builder binds the exact packed bytes", async () => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "behavectl-release-artifact-"),
  );
  const pkgRoot = path.join(root, "pkg");
  const bundle = path.join(root, "bundle");
  await fs.mkdir(pkgRoot, { recursive: true });
  await fs.mkdir(bundle, { recursive: true });
  await fs.writeFile(
    path.join(pkgRoot, "package.json"),
    JSON.stringify({ name: "behavectl", version: "0.1.0-test" }),
  );

  const record = await buildReleaseArtifact({
    bundleDir: bundle,
    packageRoot: pkgRoot,
    packRunner: async ({ destination }) => {
      const filename = "behavectl-0.1.0-test.tgz";
      await fs.writeFile(
        path.join(destination, filename),
        "exact release bytes\n",
      );
      return {
        filename,
        shasum: "npm-sha1",
        integrity: "sha512-test",
        unpackedSize: 123,
        files: [{ path: "package.json" }],
      };
    },
  });

  assert.equal(record.package.name, "behavectl");
  assert.equal(record.artifact.filename, "behavectl-0.1.0-test.tgz");

  const verified = await verifyReleaseArtifact(bundle);
  assert.equal(verified.valid, true);
  assert.equal(verified.sha256, record.artifact.sha256);
});

test("release artifact verification fails closed when its record is missing", async () => {
  const bundle = await fs.mkdtemp(
    path.join(os.tmpdir(), "behavectl-release-artifact-missing-"),
  );

  const verified = await verifyReleaseArtifact(bundle);
  assert.equal(verified.valid, false);
  assert.match(verified.reason, /release-artifact\.json missing/);
});
