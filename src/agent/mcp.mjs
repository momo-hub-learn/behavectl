import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";

import { LocalStore } from "../core/store.mjs";
import { buildBehaviorHistory } from "../core/history.mjs";
import { validateBehaviorProof } from "../core/proof-validation.mjs";

const SUPPORTED_PROTOCOLS = new Set([
  "2025-11-25",
  "2025-06-18",
  "2025-03-26",
  "2024-11-05",
]);

export async function startBehavectlMcp({
  input = process.stdin,
  output = process.stdout,
  repoRoot,
  version = "0.1.0-alpha.1",
} = {}) {
  const root = await resolveProjectRoot(
    repoRoot,
  );
  const store = new LocalStore(root);

  const rl = readline.createInterface({
    input,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;

    let message;
    try {
      message = JSON.parse(line);
    } catch {
      writeMessage(output, {
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32700,
          message: "Parse error",
        },
      });
      continue;
    }

    // Notifications intentionally receive no response.
    if (
      message.id === undefined ||
      message.id === null
    ) {
      continue;
    }

    try {
      const result = await handleRequest({
        message,
        repoRoot: root,
        store,
        version,
      });

      writeMessage(output, {
        jsonrpc: "2.0",
        id: message.id,
        result,
      });
    } catch (error) {
      writeMessage(output, {
        jsonrpc: "2.0",
        id: message.id,
        error: {
          code:
            error?.code === "METHOD_NOT_FOUND"
              ? -32601
              : -32000,
          message:
            String(
              error?.message ?? error,
            ),
        },
      });
    }
  }
}

export async function handleMcpRequest({
  message,
  repoRoot,
  version = "0.1.0-alpha.1",
}) {
  const root = await resolveProjectRoot(
    repoRoot,
  );
  return handleRequest({
    message,
    repoRoot: root,
    store: new LocalStore(root),
    version,
  });
}

async function handleRequest({
  message,
  repoRoot,
  store,
  version,
}) {
  switch (message.method) {
    case "initialize": {
      const requested =
        message.params?.protocolVersion;

      const protocolVersion =
        SUPPORTED_PROTOCOLS.has(requested)
          ? requested
          : "2025-11-25";

      return {
        protocolVersion,
        capabilities: {
          tools: {
            listChanged: false,
          },
        },
        serverInfo: {
          name: "behavectl",
          title: "Behavectl",
          version,
          description:
            "Read-only access to Behavectl behavior-change state.",
        },
        instructions:
          "Use Behavectl tools to inspect persistent AI-agent behavior changes. Tools are read-only. Never claim a behavior was promoted, rolled back, or verified unless the corresponding retained Behavectl evidence says so.",
      };
    }

    case "ping":
      return {};

    case "tools/list":
      return {
        tools: toolDefinitions(),
      };

    case "tools/call":
      return callTool({
        name: message.params?.name,
        args:
          message.params?.arguments ?? {},
        repoRoot,
        store,
      });

    default: {
      const error = new Error(
        `Method not found: ${message.method}`,
      );
      error.code = "METHOD_NOT_FOUND";
      throw error;
    }
  }
}

export function toolDefinitions() {
  return [
    {
      name: "behavectl_status",
      description:
        "Read the repository's Behavectl state: behavior patch counts, pending review count, and active behavior count.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
    {
      name: "behavectl_inbox",
      description:
        "List Behavior Patches waiting for human review. Read-only.",
      inputSchema: {
        type: "object",
        properties: {
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 100,
            default: 20,
          },
        },
        additionalProperties: false,
      },
    },
    {
      name: "behavectl_patch",
      description:
        "Read one Behavior Patch by id, including evidence, scope, risk, targets, and status.",
      inputSchema: {
        type: "object",
        properties: {
          patch_id: {
            type: "string",
            minLength: 1,
          },
        },
        required: [
          "patch_id",
        ],
        additionalProperties: false,
      },
    },
    {
      name: "behavectl_history",
      description:
        "Read persistent behavior history with latest verification and proof state.",
      inputSchema: {
        type: "object",
        properties: {
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 100,
            default: 20,
          },
        },
        additionalProperties: false,
      },
    },
    {
      name: "behavectl_proof_verify",
      description:
        "Verify byte integrity and semantic binding of a Behavior Proof inside this repository. Read-only.",
      inputSchema: {
        type: "object",
        properties: {
          proof: {
            type: "string",
            description:
              "Proof directory path relative to the repository, or a proof id under .behavectl/proofs/.",
            minLength: 1,
          },
        },
        required: [
          "proof",
        ],
        additionalProperties: false,
      },
    },
    {
      name: "behavectl_next_action",
      description:
        "Return the safest next Behavectl action for this repository without mutating anything.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  ];
}

async function callTool({
  name,
  args,
  repoRoot,
  store,
}) {
  switch (name) {
    case "behavectl_status": {
      const patches =
        await store.patches();

      const counts = countStatuses(
        patches,
      );

      return toolResult({
        repo: path.basename(repoRoot),
        initialized:
          await exists(store.root),
        total: patches.length,
        pendingReview:
          counts.candidate +
          counts.tested,
        active: counts.active,
        rejected: counts.rejected,
        retired: counts.retired,
        byStatus: counts,
      });
    }

    case "behavectl_inbox": {
      const limit = clampLimit(
        args.limit,
      );
      const patches =
        await store.patches();

      const pending = patches
        .filter((patch) =>
          [
            "candidate",
            "tested",
          ].includes(
            patch.status,
          ),
        )
        .sort((a, b) =>
          String(b.createdAt).localeCompare(
            String(a.createdAt),
          ),
        )
        .slice(0, limit)
        .map(compactPatch);

      return toolResult({
        count: pending.length,
        patches: pending,
      });
    }

    case "behavectl_patch": {
      const id = requireString(
        args.patch_id,
        "patch_id",
      );
      const patch =
        await store.patch(id);

      if (!patch) {
        return toolResult(
          {
            found: false,
            patchId: id,
          },
          {
            isError: true,
            text:
              `Behavior Patch not found: ${id}`,
          },
        );
      }

      return toolResult({
        found: true,
        patch,
      });
    }

    case "behavectl_history": {
      const limit = clampLimit(
        args.limit,
      );

      const entries =
        await buildBehaviorHistory(
          store,
          { limit },
        );

      return toolResult({
        count: entries.length,
        entries,
      });
    }

    case "behavectl_proof_verify": {
      const raw = requireString(
        args.proof,
        "proof",
      );

      const proofDir =
        await resolveProofPath({
          repoRoot,
          store,
          raw,
        });

      const result =
        await validateBehaviorProof(
          proofDir,
        );

      return toolResult(
        result,
        {
          isError: !result.valid,
          text:
            result.valid
              ? `Behavior Proof VALID: ${path.relative(repoRoot, proofDir)}`
              : `Behavior Proof INVALID: ${path.relative(repoRoot, proofDir)}`,
        },
      );
    }

    case "behavectl_next_action": {
      const patches =
        await store.patches();

      const pending = patches
        .filter((patch) =>
          [
            "candidate",
            "tested",
          ].includes(
            patch.status,
          ),
        )
        .sort((a, b) =>
          String(b.createdAt).localeCompare(
            String(a.createdAt),
          ),
        );

      if (pending.length) {
        const patch = pending[0];

        return toolResult({
          kind: "review",
          patchId: patch.id,
          reason:
            `${pending.length} behavior change${pending.length === 1 ? "" : "s"} waiting for human review.`,
          command:
            `behavectl review ${patch.id}`,
          mutates: false,
        });
      }

      return toolResult({
        kind: "none",
        reason:
          "No Behavior Patches are waiting for review.",
        command:
          "behavectl inbox",
        mutates: false,
      });
    }

    default:
      throw new Error(
        `Unknown Behavectl tool: ${name}`,
      );
  }
}

function toolResult(
  value,
  {
    isError = false,
    text,
  } = {},
) {
  const body =
    text ??
    JSON.stringify(
      value,
      null,
      2,
    );

  return {
    content: [
      {
        type: "text",
        text: body,
      },
    ],
    structuredContent: value,
    isError,
  };
}

function compactPatch(patch) {
  return {
    id: patch.id,
    status: patch.status,
    statement:
      patch.behavior?.statement ?? "",
    scope:
      patch.scope?.kind ?? null,
    risk:
      patch.risk ?? null,
    targets:
      patch.targets ?? [],
    evidenceCount:
      patch.evidence?.length ?? 0,
    createdAt:
      patch.createdAt ?? null,
  };
}

function countStatuses(patches) {
  const counts = {
    candidate: 0,
    tested: 0,
    active: 0,
    rejected: 0,
    retired: 0,
    other: 0,
  };

  for (const patch of patches) {
    if (
      Object.hasOwn(
        counts,
        patch.status,
      )
    ) {
      counts[patch.status] += 1;
    } else {
      counts.other += 1;
    }
  }

  return counts;
}

async function resolveProofPath({
  repoRoot,
  store,
  raw,
}) {
  const direct =
    path.resolve(repoRoot, raw);

  if (
    await exists(direct)
  ) {
    assertInsideRepo(
      repoRoot,
      direct,
    );
    return direct;
  }

  const byId = path.join(
    store.proofDir,
    raw,
  );

  assertInsideRepo(
    repoRoot,
    byId,
  );

  if (
    await exists(byId)
  ) {
    return byId;
  }

  throw new Error(
    `Behavior Proof not found: ${raw}`,
  );
}

function assertInsideRepo(
  repoRoot,
  candidate,
) {
  const root =
    path.resolve(repoRoot);
  const file =
    path.resolve(candidate);

  if (
    file !== root &&
    !file.startsWith(
      root + path.sep,
    )
  ) {
    throw new Error(
      "Behavectl MCP refuses to read outside the project root.",
    );
  }
}

function clampLimit(raw) {
  if (raw === undefined) {
    return 20;
  }

  const value = Number(raw);

  if (
    !Number.isInteger(value) ||
    value < 1 ||
    value > 100
  ) {
    throw new Error(
      "limit must be an integer between 1 and 100.",
    );
  }

  return value;
}

function requireString(
  value,
  name,
) {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    throw new Error(
      `${name} is required.`,
    );
  }

  return value.trim();
}

function writeMessage(
  output,
  value,
) {
  output.write(
    JSON.stringify(value) +
      "\n",
  );
}

async function resolveProjectRoot(
  explicit,
) {
  const start =
    explicit ??
    process.env.CLAUDE_PROJECT_DIR ??
    process.env.BEHAVECTL_PROJECT_DIR ??
    process.cwd();

  return findRepoRoot(
    path.resolve(start),
  );
}

async function findRepoRoot(start) {
  let current = start;

  while (true) {
    if (
      await exists(
        path.join(
          current,
          ".git",
        ),
      )
    ) {
      return current;
    }

    const parent =
      path.dirname(current);

    if (parent === current) {
      return start;
    }

    current = parent;
  }
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}
