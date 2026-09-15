import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { replayProtocol } from "./protocol-replay.mjs";
import { ensureDir, writeJsonAtomic } from "./fs.mjs";

export function createTraceRecorder(rootDir) {
  const counters = new Map();
  const records = [];

  return {
    async record({
      runner,
      arm,
      stdout,
      stderr,
    }) {
      const key = `${runner}:${arm}`;
      const trial = (counters.get(key) ?? 0) + 1;
      counters.set(key, trial);

      const agentDir = path.join(
        rootDir,
        runnerSlug(runner),
      );
      await ensureDir(agentDir);

      const stem =
        `trial-${String(trial).padStart(2, "0")}-${arm}`;

      const stdoutRel = path.join(
        runnerSlug(runner),
        `${stem}.jsonl`,
      );
      const stdoutFile = path.join(
        rootDir,
        stdoutRel,
      );

      await fs.writeFile(
        stdoutFile,
        stdout ?? "",
        "utf8",
      );

      let stderrRel = null;
      if (stderr) {
        stderrRel = path.join(
          runnerSlug(runner),
          `${stem}.stderr.txt`,
        );
        await fs.writeFile(
          path.join(rootDir, stderrRel),
          stderr,
          "utf8",
        );
      }

      const replay = replayProtocol({
        agent: runner,
        text: stdout ?? "",
        source: stdoutRel.split(path.sep).join("/"),
      });

      const record = {
        runner,
        arm,
        trial,
        stdout: normalize(stdoutRel),
        stdoutSha256: sha256(stdout ?? ""),
        stderr: stderrRel ? normalize(stderrRel) : null,
        stderrSha256:
          stderrRel && stderr
            ? sha256(stderr)
            : null,
        replay,
      };

      records.push(record);
      return record;
    },

    async finalize() {
      await ensureDir(rootDir);

      const manifest = {
        schema: "behavectl.trace-manifest.v1",
        createdAt: new Date().toISOString(),
        traces: [...records].sort(traceSort),
      };

      await writeJsonAtomic(
        path.join(rootDir, "trace-manifest.json"),
        manifest,
      );

      const protocolReport = {
        schema: "behavectl.protocol-report.v1",
        createdAt: manifest.createdAt,
        healthy: records.every(
          (record) => record.replay.protocolHealthy,
        ),
        traces: records.map((record) => ({
          runner: record.runner,
          arm: record.arm,
          trial: record.trial,
          source: record.stdout,
          eventCount: record.replay.eventCount,
          commands: record.replay.commands,
          eventTypes: record.replay.eventTypes,
          itemTypes: record.replay.itemTypes ?? {},
          terminalEventPresent:
            record.replay.terminalEventPresent,
          usagePresent: record.replay.usagePresent,
          protocolHealthy:
            record.replay.protocolHealthy,
          warnings: record.replay.warnings,
        })),
      };

      await writeJsonAtomic(
        path.join(rootDir, "protocol-report.json"),
        protocolReport,
      );

      return {
        manifest,
        protocolReport,
      };
    },

    records() {
      return [...records];
    },
  };
}

export async function verifyTraceManifest(rootDir) {
  const manifest = JSON.parse(
    await fs.readFile(
      path.join(rootDir, "trace-manifest.json"),
      "utf8",
    ),
  );

  const mismatched = [];
  const missing = [];

  for (const trace of manifest.traces ?? []) {
    for (const [fileKey, digestKey] of [
      ["stdout", "stdoutSha256"],
      ["stderr", "stderrSha256"],
    ]) {
      const rel = trace[fileKey];
      const expected = trace[digestKey];
      if (!rel || !expected) continue;

      try {
        const content = await fs.readFile(
          path.join(rootDir, rel),
          "utf8",
        );
        const actual = sha256(content);
        if (actual !== expected) {
          mismatched.push({
            file: rel,
            expected,
            actual,
          });
        }
      } catch (error) {
        if (error?.code === "ENOENT") {
          missing.push(rel);
          continue;
        }
        throw error;
      }
    }
  }

  return {
    schema: "behavectl.trace-integrity-result.v1",
    valid:
      missing.length === 0 &&
      mismatched.length === 0,
    missing,
    mismatched,
    checked:
      (manifest.traces ?? []).reduce(
        (sum, trace) =>
          sum +
          Number(Boolean(trace.stdout)) +
          Number(Boolean(trace.stderr)),
        0,
      ),
  };
}

function sha256(value) {
  return crypto
    .createHash("sha256")
    .update(value)
    .digest("hex");
}

function runnerSlug(id) {
  return String(id)
    .replace(/[^a-z0-9_-]+/gi, "-")
    .toLowerCase();
}

function normalize(value) {
  return value.split(path.sep).join("/");
}

function traceSort(a, b) {
  return (
    String(a.runner).localeCompare(String(b.runner)) ||
    a.trial - b.trial ||
    String(a.arm).localeCompare(String(b.arm))
  );
}
