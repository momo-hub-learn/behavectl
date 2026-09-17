#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  fileURLToPath(new URL("..", import.meta.url)),
);

const requiredFiles = [
  "README.md",
  "LICENSE",
  "CHANGELOG.md",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "CODE_OF_CONDUCT.md",
  "ROADMAP.md",
  "docs/architecture.md",
  "docs/trust-model.md",
  "docs/quickstart.md",
  "docs/adapter-guide.md",
  "docs/phase6i-agent-native-mode.md",
  ".github/PULL_REQUEST_TEMPLATE.md",
  ".github/ISSUE_TEMPLATE/bug_report.yml",
  ".github/ISSUE_TEMPLATE/feature_request.yml",
  ".github/ISSUE_TEMPLATE/protocol_drift.yml",
  ".github/ISSUE_TEMPLATE/adapter_request.yml",
  ".github/workflows/ci.yml",
  "integrations/agent-skill/behavectl/SKILL.md",
  "integrations/agent-skill/behavectl/agents/openai.yaml",
  "integrations/claude-plugin/.claude-plugin/plugin.json",
  "integrations/claude-plugin/.mcp.json",
];

const missing = [];
for (const rel of requiredFiles) {
  if (!(await exists(path.join(repoRoot, rel)))) {
    missing.push(rel);
  }
}

if (missing.length) {
  fail(
    `Missing launch files:\n${missing
      .map((file) => `  - ${file}`)
      .join("\n")}`,
  );
}

const pkg = JSON.parse(
  await fs.readFile(
    path.join(repoRoot, "package.json"),
    "utf8",
  ),
);

const packageErrors = [];

if (pkg.name !== "behavectl") {
  packageErrors.push("package name must be behavectl");
}
if (pkg.license !== "Apache-2.0") {
  packageErrors.push("license must be Apache-2.0");
}
if (
  pkg.bin?.behavectl !==
  "src/cli/behavectl.mjs"
) {
  packageErrors.push(
    "bin.behavectl must point to src/cli/behavectl.mjs",
  );
}
if (
  pkg.dependencies &&
  Object.keys(pkg.dependencies).length > 0
) {
  packageErrors.push(
    "runtime dependencies must remain empty for the alpha",
  );
}
if (!pkg.scripts?.["release:check"]) {
  packageErrors.push("release:check script missing");
}
if (!pkg.scripts?.["oss:check"]) {
  packageErrors.push("oss:check script missing");
}

if (packageErrors.length) {
  fail(
    `Package contract failed:\n${packageErrors
      .map((item) => `  - ${item}`)
      .join("\n")}`,
  );
}

const readme = await fs.readFile(
  path.join(repoRoot, "README.md"),
  "utf8",
);

const readmeContracts = [
  "Git for AI behavior.",
  "node src/cli/behavectl.mjs demo",
  "docs/quickstart.md",
  "docs/trust-model.md",
  "docs/phase6i-agent-native-mode.md",
  "Behavior Proof",
  "docs/phase6c-behavior-ci.md",
];

for (const phrase of readmeContracts) {
  if (!readme.includes(phrase)) {
    fail(`README launch contract missing: ${phrase}`);
  }
}

const ci = await fs.readFile(
  path.join(repoRoot, ".github/workflows/ci.yml"),
  "utf8",
);

if (
  /ANTHROPIC_API_KEY|OPENAI_API_KEY|secrets\./.test(ci)
) {
  fail(
    "Public repository CI must not require model-provider secrets.",
  );
}

if (!ci.includes("npm run release:check")) {
  fail(
    "CI must run the full release gate on the canonical release job.",
  );
}

const brokenLinks = await findBrokenLocalMarkdownLinks();
if (brokenLinks.length) {
  fail(
    `Broken local Markdown links:\n${brokenLinks
      .map(
        (item) =>
          `  - ${item.source}: ${item.target}`,
      )
      .join("\n")}`,
  );
}

console.log("Behavectl OSS launch check passed.");
console.log(`  required files: ${requiredFiles.length}`);
console.log("  README contract: valid");
console.log("  CI secret boundary: valid");
console.log("  local Markdown links: valid");
console.log("  runtime dependencies: 0");

async function findBrokenLocalMarkdownLinks() {
  const markdown = await collectMarkdown(repoRoot);
  const broken = [];

  for (const file of markdown) {
    const content = await fs.readFile(file, "utf8");
    const regex = /\[[^\]]*\]\(([^)]+)\)/g;

    for (const match of content.matchAll(regex)) {
      let target = match[1].trim();

      if (
        !target ||
        target.startsWith("#") ||
        target.startsWith("http://") ||
        target.startsWith("https://") ||
        target.startsWith("mailto:") ||
        target.startsWith("sandbox:")
      ) {
        continue;
      }

      target = target.split("#")[0];
      if (!target) continue;

      const resolved = path.resolve(
        path.dirname(file),
        decodeURIComponent(target),
      );

      if (!(await exists(resolved))) {
        broken.push({
          source: path.relative(repoRoot, file),
          target,
        });
      }
    }
  }

  return broken;
}

async function collectMarkdown(dir) {
  const files = [];
  for (const entry of await fs.readdir(dir, {
    withFileTypes: true,
  })) {
    if (
      entry.name === "node_modules" ||
      entry.name === ".git" ||
      entry.name === ".behavectl"
    ) {
      continue;
    }

    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectMarkdown(full)));
    } else if (
      entry.isFile() &&
      entry.name.endsWith(".md")
    ) {
      files.push(full);
    }
  }
  return files;
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

function fail(message) {
  console.error("Behavectl OSS launch check failed.");
  console.error(message);
  process.exit(1);
}
