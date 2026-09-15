import crypto from "node:crypto";

export function makeId(prefix) {
  const t = Date.now().toString(36);
  const r = crypto.randomBytes(5).toString("hex");
  return `${prefix}_${t}${r}`;
}
