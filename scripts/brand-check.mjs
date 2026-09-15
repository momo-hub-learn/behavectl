#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  fileURLToPath(new URL("..", import.meta.url)),
);

const forbidden = [
  ["Second", "Writer"].join(""),
  ["second", "writer"].join(""),
  ["SECOND", "WRITER"].join(""),
];

const ignored = new Set([
  ".git",
  "node_modules",
]);

const findings = [];

await walk(root);

if (findings.length) {
  console.error("Behavectl brand check failed:");
  for (const finding of findings) {
    console.error(
      `  ${finding.file}:${finding.line} contains ${JSON.stringify(finding.term)}`,
    );
  }
  process.exit(1);
}

console.log("Behavectl brand check passed.");

async function walk(dir) {
  for (const entry of await fs.readdir(dir, {
    withFileTypes: true,
  })) {
    if (ignored.has(entry.name)) continue;

    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      await walk(full);
      continue;
    }

    if (!entry.isFile()) continue;

    let text;
    try {
      text = await fs.readFile(full, "utf8");
    } catch {
      continue;
    }

    const lines = text.split(/\r?\n/);

    for (let index = 0; index < lines.length; index++) {
      for (const term of forbidden) {
        if (lines[index].includes(term)) {
          findings.push({
            file: path.relative(root, full),
            line: index + 1,
            term,
          });
        }
      }
    }
  }
}
