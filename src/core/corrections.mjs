const HIGH_SIGNAL = [
  /(?:这个|本)(?:项目|仓库|代码库)/,
  /(?:以后|始终|统一|永远)/,
  /(?:不要|禁止|不再|别再)/,
  /\b(always|never)\b/i,
  /\b(don't|do not|dont)\b/i,
  /\b(use|prefer)\b.{0,60}\binstead\b/i,
  /\b(for|in)\s+(this|the)\s+(repo|repository|project|codebase)\b/i,
  /\bwe\s+(always|never|use|prefer)\b/i,
  /\bi\s+(already|just)\s+(told|said|asked)\b/i,
];

const LOW_SIGNAL_TASK_PREFIXES = [
  /^\s*(please\s+)?(add|implement|fix|create|write|refactor|review|explain)\b/i,
];

function scorePrompt(prompt) {
  let score = 0;
  const matched = [];

  for (const pattern of HIGH_SIGNAL) {
    if (pattern.test(prompt)) {
      score += 0.22;
      matched.push(pattern.source);
    }
  }

  if (/\b(always|never)\b|(?:以后|始终|统一|永远)/i.test(prompt)) score += 0.1;
  if (/\b(repo|repository|project|codebase)\b/i.test(prompt)) score += 0.08;
  if (/\b(no,|wrong|again|instead)\b/i.test(prompt)) score += 0.08;

  if (
    LOW_SIGNAL_TASK_PREFIXES.some((p) => p.test(prompt)) &&
    matched.length === 0
  ) {
    score -= 0.25;
  }

  return Math.max(0, Math.min(1, score));
}

export function detectCorrection(event) {
  if (!["claude-code", "codex", "codebuddy"].includes(event?.source)) return null;
  if (event?.kind !== "UserPromptSubmit") return null;

  const prompt = event?.data?.prompt;
  if (typeof prompt !== "string" || prompt.trim().length < 5) return null;

  const confidence = scorePrompt(prompt);
  if (confidence < 0.55) return null;

  return {
    schema: "behavectl.correction.v1",
    id: `corr_${event.id.slice(4)}`,
    eventId: event.id,
    runSource: event.source,
    sessionId: event.sessionId,
    repoRoot: event.repoRoot,
    rawText: prompt.trim(),
    confidence: Number(confidence.toFixed(2)),
    kind: classify(prompt),
    createdAt: new Date().toISOString(),
  };
}

function classify(prompt) {
  if (/\b(always|never)\b/i.test(prompt)) return "explicit_rule";
  if (/\binstead\b/i.test(prompt)) return "replace_behavior";
  if (/\b(repo|repository|project|codebase)\b/i.test(prompt)) {
    return "repo_convention";
  }
  return "negative_feedback";
}
