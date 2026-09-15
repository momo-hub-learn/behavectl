import fs from "node:fs/promises";
import path from "node:path";

async function fileExists(root, rel) {
  try {
    await fs.access(path.join(root, rel));
    return true;
  } catch {
    return false;
  }
}

async function readTextFile(root, rel) {
  try {
    return await fs.readFile(path.join(root, rel), "utf8");
  } catch {
    return null;
  }
}

function legacyChecks(spec) {
  const out = [];
  const expect = spec.expect ?? {};

  for (const pattern of expect.commandMatches ?? []) {
    out.push({
      id: `command-match-${out.length + 1}`,
      label: `Matches command: ${pattern}`,
      kind: "command_matches",
      value: pattern,
    });
  }

  for (const pattern of expect.commandNotMatches ?? []) {
    out.push({
      id: `command-not-match-${out.length + 1}`,
      label: `Avoids command: ${pattern}`,
      kind: "command_not_matches",
      value: pattern,
    });
  }

  for (const rel of expect.fileExists ?? []) {
    out.push({
      id: `file-exists-${out.length + 1}`,
      label: `Creates ${rel}`,
      kind: "file_exists",
      value: rel,
    });
  }

  for (const rel of expect.fileNotExists ?? []) {
    out.push({
      id: `file-not-exists-${out.length + 1}`,
      label: `Does not create ${rel}`,
      kind: "file_not_exists",
      value: rel,
    });
  }

  for (const value of expect.outputContains ?? []) {
    out.push({
      id: `output-contains-${out.length + 1}`,
      label: `Output contains ${value}`,
      kind: "output_contains",
      value,
    });
  }

  for (const command of spec.regressionCommands ?? []) {
    out.push({
      id: `regression-${out.length + 1}`,
      label: `Regression: ${command}`,
      kind: "regression_command",
      value: command,
    });
  }

  return out;
}

export function normalizedChecks(spec) {
  if (Array.isArray(spec.checks) && spec.checks.length > 0) {
    return spec.checks;
  }
  return legacyChecks(spec);
}

export async function evaluateAssertions(spec, observation, workspace) {
  const checks = [];

  for (const check of normalizedChecks(spec)) {
    let passed = false;
    let detail = "";

    if (check.kind === "command_matches") {
      const found = observation.commands.find((cmd) =>
        new RegExp(check.value).test(cmd),
      );
      passed = Boolean(found);
      detail = found ?? "No matching command observed.";
    } else if (check.kind === "command_not_matches") {
      const found = observation.commands.find((cmd) =>
        new RegExp(check.value).test(cmd),
      );
      passed = !found;
      detail = found ?? "No forbidden command observed.";
    } else if (check.kind === "file_exists") {
      passed = await fileExists(workspace, check.value);
      detail = passed ? "File exists." : "File missing.";
    } else if (check.kind === "file_not_exists") {
      const exists = await fileExists(workspace, check.value);
      passed = !exists;
      detail = exists ? "Forbidden file exists." : "File absent.";
    } else if (check.kind === "output_contains") {
      passed = String(observation.output ?? "").includes(check.value);
      detail = passed ? "Expected output observed." : "Expected output absent.";
    } else if (check.kind === "file_contains") {
      const content = await readTextFile(workspace, check.path);
      passed = content !== null && content.includes(check.value);
      detail =
        content === null
          ? `File missing: ${check.path}`
          : passed
            ? `Found expected content in ${check.path}.`
            : `Expected content absent from ${check.path}.`;
    } else if (check.kind === "file_not_contains") {
      const content = await readTextFile(workspace, check.path);
      passed = content === null || !content.includes(check.value);
      detail =
        content === null
          ? `File absent: ${check.path}.`
          : passed
            ? `Forbidden content absent from ${check.path}.`
            : `Forbidden content found in ${check.path}.`;
    } else if (check.kind === "regression_command") {
      const result = observation.regressionResults?.find(
        (item) => item.command === check.value,
      );
      passed = result?.exitCode === 0;
      detail = result ? `exit ${result.exitCode}` : "Command was not executed.";
    } else {
      throw new Error(`Unsupported behavior check kind: ${check.kind}`);
    }

    checks.push({
      id: check.id,
      label: check.label,
      kind: check.kind,
      target: check.value,
      passed,
      detail,
    });
  }

  return {
    checks,
    passed: checks.length > 0 && checks.every((check) => check.passed),
  };
}

export function summarizeChecks(checks) {
  return checks.reduce(
    (acc, check) => {
      acc.total += 1;
      if (check.passed) acc.passed += 1;
      else acc.failed += 1;
      return acc;
    },
    { total: 0, passed: 0, failed: 0 },
  );
}
