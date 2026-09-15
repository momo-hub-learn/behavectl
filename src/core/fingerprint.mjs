import crypto from "node:crypto";

export function behaviorPatchDigest(patch) {
  const canonical = {
    schema: patch?.schema ?? null,
    id: patch?.id ?? null,
    version: patch?.version ?? null,
    scope: patch?.scope ?? null,
    behavior: patch?.behavior ?? null,
    risk: patch?.risk ?? null,
    targets: [...(patch?.targets ?? [])].sort(),
  };

  return sha256Stable(canonical);
}

export function behaviorSpecDigest(spec) {
  const canonical = {
    schema: spec?.schema ?? null,
    id: spec?.id ?? null,
    task: spec?.task ?? null,
    checks: spec?.checks ?? null,
    expect: spec?.expect ?? null,
    setupCommands: spec?.setupCommands ?? [],
    regressionCommands: spec?.regressionCommands ?? [],
  };

  return sha256Stable(canonical);
}

export function sha256Stable(value) {
  return crypto
    .createHash("sha256")
    .update(stableStringify(value))
    .digest("hex");
}

export function stableStringify(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  const keys = Object.keys(value).sort();
  return `{${keys
    .map(
      (key) =>
        `${JSON.stringify(key)}:${stableStringify(value[key])}`,
    )
    .join(",")}}`;
}
