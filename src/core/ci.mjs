import fs from "node:fs/promises";
import path from "node:path";

import { runProcess } from "./eval/process.mjs";
import { verifyProofIntegrity } from "./proof-integrity.mjs";
import { verifyProofBinding } from "./proof-binding.mjs";

const BEHAVECTL_START = "<!-- behavectl:start -->";
const BEHAVECTL_END = "<!-- behavectl:end -->";

export async function evaluateBehaviorCI({
  repoRoot,
  baseRef,
  headRef = "HEAD",
  proofDir,
}) {
  if (!baseRef) {
    throw new Error(
      "Behavior CI requires a base ref. Pass `--base <git-sha-or-ref>`.",
    );
  }

  const changes = await changedFiles(repoRoot, baseRef, headRef);
  const behaviorChanges = [];

  for (const change of changes) {
    const classified = await classifyBehaviorChange({
      repoRoot,
      baseRef,
      headRef,
      change,
    });
    if (classified) behaviorChanges.push(classified);
  }

  if (behaviorChanges.length === 0) {
    return {
      schema: "behavectl.behavior-ci.v1",
      status: "pass",
      verdict: "no_behavior_change",
      baseRef,
      headRef,
      changes,
      behaviorChanges: [],
      requiredTargets: [],
      patchIds: [],
      proofs: [],
      checks: [],
    };
  }

  const requiredTargets = [
    ...new Set(
      behaviorChanges.flatMap((change) => change.targets),
    ),
  ].sort();

  const patchIds = await discoverChangedPatchIds(
    repoRoot,
    behaviorChanges,
  );

  const globalChecks = [];

  const unmanaged = behaviorChanges.filter(
    (change) => change.managed === false,
  );
  globalChecks.push({
    id: "managed-change-control",
    label: "Behavior changes use Behavectl-managed surfaces",
    passed: unmanaged.length === 0,
    detail:
      unmanaged.length === 0
        ? "All changed behavior surfaces are managed"
        : `Unmanaged: ${unmanaged.map((change) => change.path).join(", ")}`,
  });

  const proofCandidates = proofDir
    ? [path.resolve(repoRoot, proofDir)]
    : await discoverProofDirs(repoRoot);

  const inspected = [];
  for (const candidate of proofCandidates) {
    inspected.push(
      await inspectProof({
        repoRoot,
        proofDir: candidate,
        requiredTargets,
        behaviorChanges,
      }),
    );
  }

  const selected = [];
  const missingPatchIds = [];

  if (patchIds.length > 0) {
    for (const patchId of patchIds) {
      const candidates = inspected
        .filter(
          (item) =>
            item.manifest?.patchId === patchId,
        )
        .sort(compareProofQuality);

      const winner =
        candidates.find((item) => item.acceptable) ??
        candidates[0] ??
        null;

      if (winner) selected.push(winner);
      else missingPatchIds.push(patchId);
    }
  } else {
    const winner =
      inspected
        .sort(compareProofQuality)
        .find((item) => item.acceptable) ??
      inspected.sort(compareProofQuality)[0] ??
      null;

    if (winner) selected.push(winner);
  }

  const uniqueSelected = dedupeProofs(selected);

  const proofCoveragePassed =
    patchIds.length > 0
      ? missingPatchIds.length === 0 &&
        patchIds.every((patchId) =>
          uniqueSelected.some(
            (item) =>
              item.manifest?.patchId === patchId &&
              item.acceptable,
          ),
        )
      : uniqueSelected.some((item) => item.acceptable);

  globalChecks.push({
    id: "proof-coverage",
    label:
      patchIds.length > 1
        ? "Every changed Behavior Patch has a passing proof"
        : "Behavior Proof present",
    passed: proofCoveragePassed,
    detail:
      patchIds.length > 0
        ? proofCoveragePassed
          ? `${patchIds.length} patch${patchIds.length === 1 ? "" : "es"} covered`
          : `Missing acceptable proof for: ${
              missingPatchIds.length
                ? missingPatchIds.join(", ")
                : patchIds
                    .filter(
                      (patchId) =>
                        !uniqueSelected.some(
                          (item) =>
                            item.manifest?.patchId === patchId &&
                            item.acceptable,
                        ),
                    )
                    .join(", ")
            }`
        : proofCoveragePassed
          ? "Acceptable proof found"
          : "No acceptable Behavior Proof found",
  });

  const proofChecks = uniqueSelected.flatMap(
    (item) =>
      item.checks.map((check) => ({
        ...check,
        proofPatchId:
          item.manifest?.patchId ?? null,
      })),
  );

  const checks = [
    ...globalChecks,
    ...proofChecks,
  ];

  const status =
    checks.every((check) => check.passed)
      ? "pass"
      : "fail";

  return {
    schema: "behavectl.behavior-ci.v1",
    status,
    verdict:
      status === "pass"
        ? "safe_to_merge"
        : "blocked",
    baseRef,
    headRef,
    changes,
    behaviorChanges,
    requiredTargets,
    patchIds,
    proofs: uniqueSelected.map(toProofResult),
    inspectedProofs: inspected.map((item) => ({
      dir: item.proofDir,
      acceptable: item.acceptable,
      patchId: item.manifest?.patchId ?? null,
      verdict: item.manifest?.verdict ?? null,
      integrityValid: item.integrity?.valid ?? false,
    })),
    checks,
  };
}

export function formatBehaviorCI(result) {
  const lines = [
    "BEHAVECTL",
    "Behavior CI",
    "",
  ];

  if (result.verdict === "no_behavior_change") {
    lines.push("✓ NO BEHAVIOR CHANGE");
    lines.push("");
    lines.push(
      "No supported agent behavior surface changed in this diff.",
    );
    return lines.join("\n");
  }

  lines.push(
    result.status === "pass"
      ? "✓ SAFE TO MERGE"
      : "✗ BLOCKED",
  );
  lines.push("");

  lines.push("Behavior changes");
  for (const change of result.behaviorChanges) {
    lines.push(
      `  ${change.status.padEnd(2)} ${change.path}  [${change.surface}]${
        change.managed === false ? "  UNMANAGED" : ""
      }`,
    );
  }

  lines.push("");
  lines.push("Trust checks");
  for (const check of result.checks) {
    lines.push(
      `  ${check.passed ? "✓" : "✗"} ${check.label}${
        check.proofPatchId
          ? ` [${check.proofPatchId}]`
          : ""
      }${
        check.detail ? ` · ${check.detail}` : ""
      }`,
    );
  }

  if (result.proofs?.length) {
    lines.push("");
    lines.push("Proofs");

    for (const proof of result.proofs) {
      lines.push(
        `  ${proof.manifest.patchId ?? "unknown"}  ${
          proof.integrity?.valid ? "VALID" : "INVALID"
        }  ${formatCoverage(proof.manifest)}`,
      );
    }
  }

  return lines.join("\n");
}

export function renderBehaviorCIMarkdown(result) {
  if (result.verdict === "no_behavior_change") {
    return `# Behavectl Behavior CI

## ✅ No agent behavior change

No supported behavior surface changed between \`${result.baseRef}\` and
\`${result.headRef}\`.

No Behavior Proof is required.
`;
  }

  const icon = result.status === "pass" ? "✅" : "❌";
  const title =
    result.status === "pass"
      ? "SAFE TO MERGE"
      : "BLOCKED";

  const changed = result.behaviorChanges
    .map(
      (change) =>
        `| \`${escapePipe(change.path)}\` | ${change.surface} | ${change.managed === false ? "❌ unmanaged" : "✅ managed"} | ${change.targets.join(", ") || "canonical"} |`,
    )
    .join("\n");

  const checks = result.checks
    .map(
      (check) =>
        `| ${check.passed ? "✅" : "❌"} | ${escapePipe(check.label)} | ${escapePipe(check.proofPatchId ?? "—")} | ${escapePipe(check.detail ?? "")} |`,
    )
    .join("\n");

  const proofs =
    result.proofs?.length
      ? result.proofs
          .map(
            (proof) =>
              `| \`${proof.manifest.patchId ?? "unknown"}\` | **${proof.integrity?.valid ? "VALID" : "INVALID"}** | ${formatCoverage(proof.manifest)} | **${String(proof.manifest.verdict ?? "unknown").toUpperCase()}** |`,
          )
          .join("\n")
      : "| — | — | — | No acceptable proof |";

  return `# Behavectl Behavior CI

## ${icon} ${title}

Persistent agent behavior changed in this PR. Behavectl requires the change
to remain connected to intact, passing Behavior Proofs.

### Changed behavior surfaces

| File | Surface | Control | Target |
|---|---|---|---|
${changed}

### Trust checks

| | Check | Patch | Detail |
|---|---|---|---|
${checks}

### Behavior Proofs

| Patch | Integrity | Coverage | Verdict |
|---|---|---|---|
${proofs}

> **Change control for AI behavior:** patch → diff → stability → proof → merge.
`;
}

export async function installBehaviorCI({
  repoRoot,
  version,
}) {
  const workflowFile = path.join(
    repoRoot,
    ".github",
    "workflows",
    "behavectl-behavior-ci.yml",
  );

  await fs.mkdir(path.dirname(workflowFile), {
    recursive: true,
  });

  const workflow = renderWorkflow(version);
  const previousWorkflow = await readOptional(workflowFile);

  await fs.writeFile(workflowFile, workflow, "utf8");

  return {
    changed: previousWorkflow !== workflow,
    workflowFile,
  };
}

export function renderWorkflow(version) {
  return `name: Behavectl Behavior CI

on:
  pull_request:

permissions:
  contents: read

jobs:
  behavior:
    name: Agent behavior change control
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Verify agent behavior changes
        env:
          BEHAVECTL_BASE_SHA: \${{ github.event.pull_request.base.sha }}
        run: |
          npx --yes behavectl@${version} ci \\
            --base "$BEHAVECTL_BASE_SHA"
`;
}

async function inspectProof({
  repoRoot,
  proofDir,
  requiredTargets,
  behaviorChanges,
}) {
  const checks = [];

  const integrity = await verifyProofIntegrity(proofDir);
  checks.push({
    id: "proof-integrity",
    label: "Proof integrity",
    passed: integrity.valid,
    detail: integrity.valid
      ? `${integrity.checked} artifacts match SHA-256`
      : summarizeIntegrityFailure(integrity),
  });

  const manifest = await readJsonOptional(
    path.join(proofDir, "manifest.json"),
  );
  const patch = await readJsonOptional(
    path.join(proofDir, "patch.json"),
  );
  const verification = await readJsonOptional(
    path.join(proofDir, "verification.json"),
  );

  const proofPresent = Boolean(manifest && patch && verification);
  checks.push({
    id: "proof-structure",
    label: "Proof structure",
    passed: proofPresent,
    detail: proofPresent
      ? "manifest.json + patch.json + verification.json"
      : "Missing manifest.json, patch.json, or verification.json",
  });

  const semanticBinding = await verifyProofBinding(proofDir);

  checks.push({
    id: "proof-semantic-binding",
    label: "Proof is bound to the exact Behavior Patch",
    passed: semanticBinding.valid,
    detail: semanticBinding.valid
      ? `sha256:${semanticBinding.patchDigest.slice(0, 12)}…`
      : `Patch / verification / evaluation digests disagree: ${
          semanticBinding.checks
            .filter((check) => !check.passed)
            .map((check) => check.label)
            .slice(0, 2)
            .join("; ")
        }`,
  });

  const verdictOk =
    manifest?.verdict === "promote";
  checks.push({
    id: "proof-verdict",
    label: "Passing proof verdict",
    passed: verdictOk,
    detail: manifest?.verdict
      ? String(manifest.verdict).toUpperCase()
      : "No proof verdict",
  });

  const runners = new Set(
    manifest?.runners ?? [],
  );

  const patchTargets = new Set(
    patch?.targets ?? [],
  );

  const proofRequiredTargets = requiredTargets.filter(
    (target) =>
      patchTargets.size === 0 ||
      patchTargets.has(target),
  );

  const targetCoverage =
    proofRequiredTargets.every(
      (target) => runners.has(target),
    );

  checks.push({
    id: "target-coverage",
    label: "Proof covers changed agent targets",
    passed: targetCoverage,
    detail:
      proofRequiredTargets.length === 0
        ? "No agent target required for this patch"
        : `${[...runners].join(", ") || "none"} covers ${proofRequiredTargets.join(", ")}`,
  });

  const binding = await validateManagedOutputBinding({
    repoRoot,
    patch,
    behaviorChanges,
  });

  checks.push({
    id: "managed-output-binding",
    label: "Managed outputs match proved behavior",
    passed: binding.valid,
    detail: binding.detail,
  });

  const acceptable =
    checks.every((check) => check.passed);

  return {
    proofDir,
    integrity,
    manifest,
    patch,
    checks,
    acceptable,
  };
}

async function validateManagedOutputBinding({
  repoRoot,
  patch,
  behaviorChanges,
}) {
  if (!patch) {
    return {
      valid: false,
      detail: "patch.json unavailable",
    };
  }

  const relevant = behaviorChanges.filter(
    (change) =>
      change.managed !== false &&
      (
        change.surface === "claude-managed-rule" ||
        change.surface === "codex-managed-rule"
      ),
  );

  if (relevant.length === 0) {
    return {
      valid: true,
      detail: "No compiled managed output changed",
    };
  }

  const failures = [];

  for (const change of relevant) {
    if (change.surface === "claude-managed-rule") {
      const content = await readOptional(
        path.join(repoRoot, change.path),
      );

      const expectedPatch =
        `<!-- patch: ${patch.id} -->`;
      const expectedRule =
        `- ${patch.behavior?.statement ?? ""}`;

      if (
        content === null ||
        !content.includes(expectedPatch) ||
        !content.includes(expectedRule)
      ) {
        failures.push(change.path);
      }
    }

    if (change.surface === "codex-managed-rule") {
      const content = await readOptional(
        path.join(repoRoot, change.path),
      );

      const expectedRule =
        `- ${patch.behavior?.statement ?? ""}  <!-- ${patch.id} -->`;

      const managed = extractManagedCodexBlock(
        content ?? "",
      );

      if (!managed.includes(expectedRule)) {
        failures.push(change.path);
      }
    }
  }

  return failures.length
    ? {
        valid: false,
        detail: `Proofed behavior does not match: ${failures.join(", ")}`,
      }
    : {
        valid: true,
        detail: "Changed managed outputs contain the proved patch",
      };
}

async function changedFiles(repoRoot, baseRef, headRef) {
  const result = await runProcess(
    "git",
    [
      "-C",
      repoRoot,
      "diff",
      "--name-status",
      "--find-renames",
      `${baseRef}...${headRef}`,
    ],
    {
      timeoutMs: 20_000,
      allowFailure: true,
    },
  );

  if (result.exitCode !== 0) {
    throw new Error(
      `Could not compute Behavior CI diff from ${baseRef} to ${headRef}: ${
        result.stderr || result.stdout
      }`,
    );
  }

  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseNameStatus);
}

function parseNameStatus(line) {
  const parts = line.split("\t");
  const rawStatus = parts[0];
  const status = rawStatus[0];

  if (
    status === "R" ||
    status === "C"
  ) {
    return {
      status,
      oldPath: normalizePath(parts[1] ?? ""),
      path: normalizePath(parts[2] ?? ""),
    };
  }

  return {
    status,
    path: normalizePath(parts[1] ?? ""),
  };
}

async function classifyBehaviorChange({
  repoRoot,
  baseRef,
  headRef,
  change,
}) {
  const file = change.path;
  if (!file) return null;

  const base = path.posix.basename(file);

  if (
    /^\.behavectl\/patches\/[^/]+\.json$/.test(file)
  ) {
    return {
      ...change,
      surface: "behavior-patch",
      targets: [],
      managed: true,
    };
  }

  if (
    /^\.claude\/rules\/behavectl\/[^/]+\.md$/.test(file)
  ) {
    return {
      ...change,
      surface: "claude-managed-rule",
      targets: ["claude-code"],
      managed: true,
    };
  }

  if (
    base === "CLAUDE.md" ||
    file.startsWith(".claude/rules/")
  ) {
    return {
      ...change,
      surface: "claude-human-instructions",
      targets: ["claude-code"],
      managed: false,
    };
  }

  if (base === "AGENTS.md") {
    const managed =
      file === "AGENTS.md"
        ? await onlyManagedCodexBlockChanged({
            repoRoot,
            baseRef,
            headRef,
            file,
          })
        : false;

    return {
      ...change,
      surface: managed
        ? "codex-managed-rule"
        : "codex-human-instructions",
      targets: ["codex"],
      managed,
    };
  }

  return null;
}

async function onlyManagedCodexBlockChanged({
  repoRoot,
  baseRef,
  headRef,
  file,
}) {
  const before = await gitFile(
    repoRoot,
    baseRef,
    file,
  );
  const after = await gitFile(
    repoRoot,
    headRef,
    file,
  );

  const beforeHuman = stripManagedCodexBlock(
    before ?? "",
  );
  const afterHuman = stripManagedCodexBlock(
    after ?? "",
  );

  const managedChanged =
    extractManagedCodexBlock(before ?? "") !==
    extractManagedCodexBlock(after ?? "");

  return (
    managedChanged &&
    normalizeHumanText(beforeHuman) ===
      normalizeHumanText(afterHuman)
  );
}

async function gitFile(repoRoot, ref, file) {
  const result = await runProcess(
    "git",
    [
      "-C",
      repoRoot,
      "show",
      `${ref}:${file}`,
    ],
    {
      timeoutMs: 10_000,
      allowFailure: true,
    },
  );

  if (result.exitCode !== 0) return null;
  return result.stdout;
}

async function discoverChangedPatchIds(
  repoRoot,
  behaviorChanges,
) {
  const ids = new Set();

  for (const change of behaviorChanges) {
    if (change.surface === "behavior-patch") {
      ids.add(
        path.posix.basename(
          change.path,
          ".json",
        ),
      );
    }

    if (change.surface === "claude-managed-rule") {
      ids.add(
        path.posix.basename(
          change.path,
          ".md",
        ),
      );
    }
  }

  for (const change of behaviorChanges) {
    if (change.surface !== "codex-managed-rule") continue;

    const content = await readOptional(
      path.join(repoRoot, change.path),
    );
    if (!content) continue;

    const managed = extractManagedCodexBlock(content);
    for (const match of managed.matchAll(
      /<!--\s*(bp_[A-Za-z0-9_-]+)\s*-->/g,
    )) {
      ids.add(match[1]);
    }
  }

  return [...ids].sort();
}

async function discoverProofDirs(repoRoot) {
  const root = path.join(
    repoRoot,
    ".behavectl",
    "proofs",
  );

  let entries;
  try {
    entries = await fs.readdir(root, {
      withFileTypes: true,
    });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }

  return entries
    .filter(
      (entry) =>
        entry.isDirectory() &&
        !entry.isSymbolicLink(),
    )
    .map((entry) => path.join(root, entry.name));
}

function extractManagedCodexBlock(content) {
  const start = content.indexOf(BEHAVECTL_START);
  const end = content.indexOf(BEHAVECTL_END);

  if (start < 0 || end <= start) return "";
  return content.slice(
    start,
    end + BEHAVECTL_END.length,
  );
}

function stripManagedCodexBlock(content) {
  const start = content.indexOf(BEHAVECTL_START);
  const end = content.indexOf(BEHAVECTL_END);

  if (start < 0 || end <= start) return content;

  return (
    content.slice(0, start) +
    content.slice(end + BEHAVECTL_END.length)
  );
}

function normalizeHumanText(value) {
  return String(value)
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function compareProofQuality(a, b) {
  const acceptable =
    Number(b.acceptable) - Number(a.acceptable);
  if (acceptable !== 0) return acceptable;

  const score =
    proofScore(b) - proofScore(a);
  if (score !== 0) return score;

  return String(b.manifest?.createdAt ?? "").localeCompare(
    String(a.manifest?.createdAt ?? ""),
  );
}

function proofScore(item) {
  return item.checks?.filter((check) => check.passed).length ?? 0;
}

function dedupeProofs(items) {
  const seen = new Set();
  const out = [];

  for (const item of items) {
    const key =
      item.proofDir ??
      item.manifest?.proofId ??
      item.manifest?.patchId;

    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }

  return out;
}

function toProofResult(item) {
  return {
    dir: item.proofDir,
    manifest: item.manifest,
    integrity: item.integrity,
  };
}

function formatCoverage(manifest) {
  const runners = manifest?.runners ?? [];
  const coverage = manifest?.coverage;

  if (!runners.length) return "none";

  if (
    coverage?.passedTrials !== undefined &&
    coverage?.totalTrials !== undefined
  ) {
    return `${runners.map(displayAgent).join(" · ")} · ${coverage.passedTrials}/${coverage.totalTrials} trials`;
  }

  return runners.map(displayAgent).join(" · ");
}

function displayAgent(id) {
  if (id === "claude-code") return "Claude Code";
  if (id === "codex") return "Codex";
  if (id === "codebuddy") return "CodeBuddy Code";
  return id;
}

function summarizeIntegrityFailure(result) {
  if (result.missingIntegrityFile) return "checksums.json missing";
  if (result.invalidManifest) return "invalid integrity manifest";

  const issues = [
    ...(result.missing ?? []).map((x) => `missing ${x}`),
    ...(result.unexpected ?? []).map((x) => `unexpected ${x}`),
    ...(result.symlinks ?? []).map((x) => `symlink ${x}`),
    ...(result.mismatched ?? []).map((x) => `changed ${x.path}`),
  ];

  return issues.slice(0, 3).join("; ") || "integrity verification failed";
}

async function readJsonOptional(file) {
  const text = await readOptional(file);
  if (text === null) return null;

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function readOptional(file) {
  try {
    return await fs.readFile(file, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function normalizePath(value) {
  return value.split(path.sep).join("/");
}

function escapePipe(value) {
  return String(value).replaceAll("|", "\\|");
}
