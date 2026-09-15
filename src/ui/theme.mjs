import {
  ansi,
  plainAnsi,
  stripAnsi,
} from "./ansi.mjs";

export const palette = {
  cyan: [103, 232, 249],
  violet: [167, 139, 250],
  green: [134, 239, 172],
  amber: [251, 191, 36],
  rose: [251, 113, 133],
  slate: [148, 163, 184],
  white: [241, 245, 249],
};

export function ui({
  plain = false,
  width,
} = {}) {
  const a = plain ? plainAnsi : ansi;
  const w =
    width ??
    terminalWidth();

  return {
    a,
    width: w,
    brand: () => brand(a),
    header: (subtitle, meta) =>
      header(a, subtitle, meta, w),
    panel: (title, lines, opts) =>
      panel(a, title, lines, w, opts),
    badge: (text, tone = "neutral") =>
      badge(a, text, tone),
    key: (value) => key(a, value),
    command: (value) => command(a, value),
    statusDot: (tone) => statusDot(a, tone),
    rule: (label = "") => rule(a, label, w),
    progress: (state, size = 10, frame = 0) =>
      progress(a, state, size, frame),
    metric: (value, label, tone = "neutral") =>
      metric(a, value, label, tone),
  };
}

export function terminalWidth() {
  const columns =
    Number(process.stdout.columns) || 80;
  return Math.max(68, Math.min(96, columns - 2));
}

function brand(a) {
  const left = a.rgb(...palette.cyan, "BEHAVE");
  const right = a.rgb(...palette.violet, "CTL");
  return `${a.bold("◆")} ${a.bold(left + right)}`;
}

function header(a, subtitle, meta, width) {
  const title = brand(a);
  const metaText = meta ? a.dim(meta) : "";
  const left = `${title}  ${a.dim(subtitle)}`;
  const innerWidth = width - 4;
  const visibleLeft = stripAnsi(left).length;
  const visibleMeta = stripAnsi(metaText).length;
  const gap = Math.max(
    1,
    innerWidth - visibleLeft - visibleMeta,
  );

  return [
    `╭${"─".repeat(width - 2)}╮`,
    `│ ${left}${" ".repeat(gap)}${metaText} │`,
    `╰${"─".repeat(width - 2)}╯`,
  ].join("\n");
}

function panel(
  a,
  title,
  lines,
  width,
  {
    tone = "neutral",
    right = "",
    compact = false,
  } = {},
) {
  const color = toneFn(a, tone);
  const rawTitle = ` ${title} `;
  const rightText = right ? ` ${right} ` : "";
  const topFill =
    width -
    2 -
    rawTitle.length -
    rightText.length;

  const top = `╭${color(rawTitle)}${"─".repeat(
    Math.max(0, topFill),
  )}${rightText ? a.dim(rightText) : ""}╮`;

  const body = [];
  for (const line of lines) {
    const raw = String(line);
    const visible = stripAnsi(raw).length;
    const pad = Math.max(0, width - 4 - visible);
    body.push(
      `│ ${raw}${" ".repeat(pad)} │`,
    );
  }

  if (!compact && lines.length === 0) {
    body.push(
      `│${" ".repeat(width - 2)}│`,
    );
  }

  return [
    top,
    ...body,
    `╰${"─".repeat(width - 2)}╯`,
  ].join("\n");
}

function badge(a, text, tone) {
  const value = ` ${String(text).toUpperCase()} `;
  const fn = toneFn(a, tone);
  return a.bold(fn(value));
}

function key(a, value) {
  return a.inverse(` ${value} `);
}

function command(a, value) {
  return a.rgb(
    ...palette.cyan,
    `› ${value}`,
  );
}

function statusDot(a, tone) {
  const glyph =
    tone === "success"
      ? "●"
      : tone === "info" ||
          tone === "violet"
        ? "◆"
        : tone === "warning"
          ? "▲"
          : tone === "danger"
            ? "×"
            : "○";

  return toneFn(a, tone)(glyph);
}

function rule(a, label, width) {
  if (!label) {
    return a.gray("─".repeat(width));
  }

  const raw = ` ${label} `;
  const fill = Math.max(
    0,
    width - raw.length,
  );

  return `${a.gray("─".repeat(3))}${a.bold(
    raw,
  )}${a.gray("─".repeat(Math.max(0, fill - 3)))}`;
}

function progress(
  a,
  state,
  size,
  frame = 0,
) {
  if (state === "done") {
    return toneFn(
      a,
      "success",
    )("━".repeat(size));
  }

  if (state === "waiting") {
    return a.gray("╺".repeat(size));
  }

  const cells = Array(
    size,
  ).fill("·");

  const pos =
    Math.abs(Number(frame) || 0) %
    size;

  cells[pos] = "◆";

  if (pos > 0) {
    cells[pos - 1] = "━";
  }
  if (pos > 1) {
    cells[pos - 2] = "╺";
  }
  if (pos < size - 1) {
    cells[pos + 1] = "━";
  }
  if (pos < size - 2) {
    cells[pos + 2] = "╸";
  }

  return toneFn(
    a,
    "info",
  )(cells.join(""));
}

function metric(a, value, label, tone) {
  const fn = toneFn(a, tone);
  return `${a.bold(fn(String(value)))} ${a.dim(label)}`;
}

function toneFn(a, tone) {
  switch (tone) {
    case "success":
      return (v) =>
        a.rgb(...palette.green, v);
    case "warning":
      return (v) =>
        a.rgb(...palette.amber, v);
    case "danger":
      return (v) =>
        a.rgb(...palette.rose, v);
    case "violet":
      return (v) =>
        a.rgb(...palette.violet, v);
    case "info":
      return (v) =>
        a.rgb(...palette.cyan, v);
    case "muted":
      return a.gray;
    default:
      return (v) =>
        a.rgb(...palette.slate, v);
  }
}
