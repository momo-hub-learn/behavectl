import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { LocalStore } from "../src/core/store.mjs";
import {
  handleMcpRequest,
  toolDefinitions,
} from "../src/agent/mcp.mjs";

async function repoFixture() {
  const repo = await fs.mkdtemp(
    path.join(
      os.tmpdir(),
      "behavectl-mcp-",
    ),
  );

  await fs.writeFile(
    path.join(repo, ".git"),
    "",
  );

  return repo;
}

async function request(
  repoRoot,
  method,
  params,
) {
  return handleMcpRequest({
    repoRoot,
    version: "0.1.0-alpha.1",
    message: {
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    },
  });
}

test("MCP initialize advertises a read-only Behavectl tool server", async () => {
  const repo = await repoFixture();

  const result =
    await request(
      repo,
      "initialize",
      {
        protocolVersion:
          "2025-11-25",
        capabilities: {},
        clientInfo: {
          name: "test",
          version: "1",
        },
      },
    );

  assert.equal(
    result.protocolVersion,
    "2025-11-25",
  );
  assert.equal(
    result.serverInfo.name,
    "behavectl",
  );
  assert.deepEqual(
    result.capabilities,
    {
      tools: {
        listChanged: false,
      },
    },
  );
  assert.match(
    result.instructions,
    /read-only/i,
  );
});

test("MCP tool surface is intentionally read-only", () => {
  const names =
    toolDefinitions().map(
      (tool) => tool.name,
    );

  assert.ok(
    names.includes(
      "behavectl_status",
    ),
  );
  assert.ok(
    names.includes(
      "behavectl_inbox",
    ),
  );
  assert.ok(
    names.includes(
      "behavectl_proof_verify",
    ),
  );

  for (const forbidden of [
    "promote",
    "rollback",
    "verify_patch",
    "test_patch",
  ]) {
    assert.equal(
      names.some(
        (name) =>
          name.includes(forbidden),
      ),
      false,
    );
  }
});

test("MCP status and inbox inspect behavior without mutating an untouched repo", async () => {
  const repo = await repoFixture();

  const status =
    await request(
      repo,
      "tools/call",
      {
        name: "behavectl_status",
        arguments: {},
      },
    );

  assert.equal(
    status.structuredContent.total,
    0,
  );
  assert.equal(
    status.structuredContent.initialized,
    false,
  );

  await assert.rejects(
    fs.access(
      path.join(
        repo,
        ".behavectl",
      ),
    ),
  );

  const store =
    new LocalStore(repo);

  await store.putPatch({
    schema:
      "behavectl.behavior-patch.v1",
    id: "bp_mcp",
    version: 1,
    status: "candidate",
    behavior: {
      statement:
        "Always use pnpm.",
    },
    scope: {
      kind: "project",
    },
    risk: "L1",
    targets: [
      "claude-code",
      "codex",
    ],
    evidence: [
      {
        kind:
          "user_correction",
      },
    ],
    createdAt:
      "2026-09-11T10:00:00.000Z",
  });

  const inbox =
    await request(
      repo,
      "tools/call",
      {
        name: "behavectl_inbox",
        arguments: {},
      },
    );

  assert.equal(
    inbox.structuredContent.count,
    1,
  );
  assert.equal(
    inbox.structuredContent
      .patches[0].id,
    "bp_mcp",
  );

  const next =
    await request(
      repo,
      "tools/call",
      {
        name:
          "behavectl_next_action",
        arguments: {},
      },
    );

  assert.equal(
    next.structuredContent.kind,
    "review",
  );
  assert.equal(
    next.structuredContent
      .mutates,
    false,
  );
});

test("MCP patch tool returns structured Behavior Patch data", async () => {
  const repo = await repoFixture();
  const store =
    new LocalStore(repo);

  await store.putPatch({
    schema:
      "behavectl.behavior-patch.v1",
    id: "bp_read",
    version: 1,
    status: "tested",
    behavior: {
      statement:
        "Never edit generated files directly.",
    },
    scope: {
      kind: "project",
    },
    risk: "L1",
    targets: [
      "claude-code",
    ],
    evidence: [],
    createdAt:
      "2026-09-11T10:00:00.000Z",
  });

  const result =
    await request(
      repo,
      "tools/call",
      {
        name:
          "behavectl_patch",
        arguments: {
          patch_id:
            "bp_read",
        },
      },
    );

  assert.equal(
    result.isError,
    false,
  );
  assert.equal(
    result.structuredContent
      .patch.id,
    "bp_read",
  );
  assert.match(
    result.structuredContent
      .patch.behavior.statement,
    /generated files/,
  );
});
