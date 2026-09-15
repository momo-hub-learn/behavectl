import fs from "node:fs/promises";
import path from "node:path";

import { verifyProofIntegrity } from "./proof-integrity.mjs";

export async function buildBehaviorHistory(
  store,
  { limit = 20 } = {},
) {
  const patches = await store.patches();
  const proofIndex = await indexProofs(store);

  const entries = [];

  for (const patch of patches) {
    const verifications =
      await store.verificationsForPatch(patch.id);

    const latestVerification = verifications
      .sort((a, b) =>
        String(b.createdAt).localeCompare(String(a.createdAt)),
      )[0] ?? null;

    const proof = proofIndex.get(patch.id) ?? null;

    entries.push({
      patchId: patch.id,
      version: patch.version ?? null,
      status: patch.status,
      statement: patch.behavior?.statement ?? "",
      source:
        patch.source?.sourceAgent ??
        patch.source?.kind ??
        "unknown",
      scope: patch.scope?.kind ?? "unknown",
      targets: patch.targets ?? [],
      risk: patch.risk ?? "unknown",
      evidenceCount: patch.evidence?.length ?? 0,
      createdAt: patch.createdAt ?? null,
      activatedAt: patch.activatedAt ?? null,
      rejectedAt: patch.rejectedAt ?? null,
      retiredAt: patch.retiredAt ?? null,
      latestVerification: latestVerification
        ? {
            id: latestVerification.id,
            verdict: latestVerification.verdict,
            repeat: latestVerification.repeat ?? 1,
            passedTrials:
              latestVerification.coverage?.passedTrials ?? null,
            totalTrials:
              latestVerification.coverage?.totalTrials ?? null,
            passing:
              latestVerification.coverage?.passing ?? [],
            missingTargets:
              latestVerification.coverage?.missingTargets ?? [],
            createdAt: latestVerification.createdAt,
          }
        : null,
      proof,
      sortAt:
        patch.retiredAt ??
        patch.activatedAt ??
        patch.rejectedAt ??
        latestVerification?.createdAt ??
        patch.createdAt ??
        "",
    });
  }

  return entries
    .sort((a, b) =>
      String(b.sortAt).localeCompare(String(a.sortAt)),
    )
    .slice(0, limit);
}

export function formatBehaviorHistory(entries) {
  const lines = [
    "BEHAVECTL",
    "Behavior log",
    "",
  ];

  if (!entries.length) {
    lines.push("No Behavior Patches yet.");
    lines.push("");
    lines.push("Keep working normally, then run `behavectl inbox`.");
    return lines.join("\n");
  }

  for (const entry of entries) {
    const status = String(entry.status ?? "unknown").toUpperCase();
    const trial =
      entry.latestVerification?.totalTrials != null
        ? `${entry.latestVerification.passedTrials}/${entry.latestVerification.totalTrials}`
        : "—";

    const proof =
      entry.proof
        ? entry.proof.integrityValid
          ? "proof VALID"
          : "proof INVALID"
        : "no proof";

    lines.push(
      `${status.padEnd(9)} ${entry.patchId}  ${trial.padStart(5)}  ${proof}`,
    );
    lines.push(`  ${truncate(entry.statement, 76)}`);
    lines.push(
      `  ${entry.source} · ${entry.scope} · ${entry.targets.map(displayAgent).join(" + ") || "no target"} · ${shortDate(entry.sortAt)}`,
    );

    if (entry.latestVerification?.missingTargets?.length) {
      lines.push(
        `  missing: ${entry.latestVerification.missingTargets.map(displayAgent).join(", ")}`,
      );
    }

    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

async function indexProofs(store) {
  const result = new Map();

  let entries;
  try {
    entries = await fs.readdir(
      store.proofDir,
      { withFileTypes: true },
    );
  } catch (error) {
    if (error?.code === "ENOENT") return result;
    throw error;
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;

    const dir = path.join(store.proofDir, entry.name);
    const manifest = await readJsonOptional(
      path.join(dir, "manifest.json"),
    );
    if (!manifest?.patchId) continue;

    const previous = result.get(manifest.patchId);
    if (
      previous &&
      String(previous.createdAt).localeCompare(
        String(manifest.createdAt ?? ""),
      ) >= 0
    ) {
      continue;
    }

    const integrity = await verifyProofIntegrity(dir);

    result.set(manifest.patchId, {
      proofId: manifest.proofId ?? entry.name,
      dir,
      verdict: manifest.verdict ?? "unknown",
      repeat: manifest.repeat ?? 1,
      integrityValid: integrity.valid,
      createdAt: manifest.createdAt ?? null,
    });
  }

  return result;
}

async function readJsonOptional(file) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    return null;
  }
}

function displayAgent(id) {
  if (id === "claude-code") return "Claude";
  if (id === "codex") return "Codex";
  if (id === "codebuddy") return "CodeBuddy Code";
  return id;
}

function shortDate(value) {
  if (!value) return "unknown time";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString().replace("T", " ").slice(0, 16) + "Z";
}

function truncate(value, width) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length <= width
    ? text
    : `${text.slice(0, Math.max(0, width - 1))}…`;
}
