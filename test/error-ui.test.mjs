import test from "node:test";
import assert from "node:assert/strict";

import {
  errorDescriptor,
  renderCliError,
} from "../src/ui/error.mjs";

test("protocol failure is rendered as infrastructure failure, not behavior rejection", () => {
  const error = Object.assign(
    new Error(
      "Claude Code exited successfully but its stream-json contract was incomplete.",
    ),
    {
      code:
        "BCTL_PROTOCOL_PARSE_FAILED",
    },
  );

  const output = renderCliError(
    error,
    {
      plain: true,
    },
  );

  assert.match(
    output,
    /AGENT PROTOCOL CHANGED/,
  );
  assert.match(
    output,
    /No behavior verdict was produced/,
  );
  assert.match(
    output,
    /behavectl replay/,
  );
  assert.doesNotMatch(
    output,
    /REJECTED/,
  );
  assert.doesNotMatch(
    output,
    /\n\s+at\s+/,
  );
});

test("stale verification failure explains that durable behavior remains unchanged", () => {
  const error = new Error(
    "Patch bp_test changed after its latest verification. Re-run `behavectl verify bp_test` before promotion.",
  );

  const output = renderCliError(
    error,
    {
      plain: true,
    },
  );

  assert.match(
    output,
    /VERIFICATION IS STALE/,
  );
  assert.match(
    output,
    /cannot be promoted with old evidence/,
  );
  assert.match(
    output,
    /behavectl verify <patch-id>/,
  );
});

test("release candidate preflight failure gives one obvious recovery path", () => {
  const error = Object.assign(
    new Error(
      "Release Candidate blocked. Missing: claude, codex.",
    ),
    {
      code:
        "BCTL_RC_PREFLIGHT_FAILED",
    },
  );

  const output = renderCliError(
    error,
    {
      plain: true,
    },
  );

  assert.match(
    output,
    /RELEASE EVIDENCE RUN BLOCKED/,
  );
  assert.match(
    output,
    /No release evidence run was started/,
  );
  assert.match(
    output,
    /behavectl doctor/,
  );
  assert.match(
    output,
    /behavectl rc --agent codex/,
  );
});

test("unknown failures stop safely and hide stack traces by default", () => {
  const error = new Error(
    "Unexpected subsystem failure.",
  );
  error.stack =
    "Error: Unexpected subsystem failure.\n    at secret/file.mjs:12:3";

  const output = renderCliError(
    error,
    {
      plain: true,
    },
  );

  assert.match(
    output,
    /UNEXPECTED FAILURE/,
  );
  assert.match(
    output,
    /Behavectl stopped instead of guessing/,
  );
  assert.doesNotMatch(
    output,
    /secret\/file\.mjs/,
  );

  const descriptor =
    errorDescriptor(error);

  assert.equal(
    descriptor.reference,
    "ERR-UNEXPECTED",
  );
});

test("failure renderer preserves its panel width for long messages", () => {
  const error = new Error(
    "This is an intentionally very long failure message that should wrap cleanly instead of punching through the right edge of the Behavectl terminal panel and making the interface look unfinished.",
  );

  const output = renderCliError(
    error,
    {
      plain: true,
    },
  );

  const lines =
    output.split("\n");

  for (const line of lines) {
    assert.ok(
      line.length <= 96,
      `line overflowed visual budget: ${line.length} ${line}`,
    );
  }
});

test("missing patch failure points to the behavior queue instead of generic doctor", () => {
  const error = new Error(
    "Patch not found: bp_missing",
  );

  const output = renderCliError(
    error,
    {
      plain: true,
    },
  );

  assert.match(
    output,
    /BEHAVIOR PATCH NOT FOUND/,
  );
  assert.match(
    output,
    /No persistent behavior was changed/,
  );
  assert.match(
    output,
    /behavectl inbox/,
  );
  assert.match(
    output,
    /behavectl patches/,
  );
  assert.doesNotMatch(
    output,
    /Unexpected failure/i,
  );
});

test("known failures get stable public error references", () => {
  const missing = errorDescriptor(
    new Error("Patch not found: bp_missing"),
  );
  const stale = errorDescriptor(
    new Error(
      "Patch bp_test changed after its latest verification. Re-run verification before promotion.",
    ),
  );
  const usage = errorDescriptor(
    new Error("Usage: behavectl proof <patch-id>"),
  );

  assert.equal(
    missing.reference,
    "ERR-PATCH-NOT-FOUND",
  );
  assert.equal(
    stale.reference,
    "ERR-VERIFICATION-STALE",
  );
  assert.equal(
    usage.reference,
    "ERR-USAGE",
  );
});

test("mistyped commands recover with a nearest-command suggestion", () => {
  const error = new Error(
    "Unknown command: verfy",
  );

  const output = renderCliError(
    error,
    {
      plain: true,
    },
  );

  assert.match(
    output,
    /COMMAND NOT FOUND/,
  );
  assert.match(
    output,
    /ERR-COMMAND-NOT-FOUND/,
  );
  assert.match(
    output,
    /behavectl verify/,
  );
  assert.match(
    output,
    /behavectl help/,
  );
  assert.doesNotMatch(
    output,
    /behavectl doctor/,
  );
});
