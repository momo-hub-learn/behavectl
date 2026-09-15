const stdoutColor =
  process.stdout.isTTY &&
  !process.env.NO_COLOR &&
  process.env.TERM !== "dumb";

function wrap(open, close, value, enabled) {
  return enabled
    ? `\x1b[${open}m${value}\x1b[${close}m`
    : String(value);
}

function rgbWrap(r, g, b, value, enabled) {
  return enabled
    ? `\x1b[38;2;${r};${g};${b}m${value}\x1b[39m`
    : String(value);
}

function bgRgbWrap(r, g, b, value, enabled) {
  return enabled
    ? `\x1b[48;2;${r};${g};${b}m${value}\x1b[49m`
    : String(value);
}

export function createAnsi({ color = stdoutColor } = {}) {
  return {
    color,
    bold: (v) => wrap(1, 22, v, color),
    dim: (v) => wrap(2, 22, v, color),
    italic: (v) => wrap(3, 23, v, color),
    underline: (v) => wrap(4, 24, v, color),
    inverse: (v) => wrap(7, 27, v, color),
    black: (v) => wrap(30, 39, v, color),
    red: (v) => wrap(31, 39, v, color),
    green: (v) => wrap(32, 39, v, color),
    yellow: (v) => wrap(33, 39, v, color),
    blue: (v) => wrap(34, 39, v, color),
    magenta: (v) => wrap(35, 39, v, color),
    cyan: (v) => wrap(36, 39, v, color),
    white: (v) => wrap(37, 39, v, color),
    gray: (v) => wrap(90, 39, v, color),
    brightRed: (v) => wrap(91, 39, v, color),
    brightGreen: (v) => wrap(92, 39, v, color),
    brightYellow: (v) => wrap(93, 39, v, color),
    brightBlue: (v) => wrap(94, 39, v, color),
    brightMagenta: (v) => wrap(95, 39, v, color),
    brightCyan: (v) => wrap(96, 39, v, color),
    rgb: (r, g, b, v) => rgbWrap(r, g, b, v, color),
    bgRgb: (r, g, b, v) => bgRgbWrap(r, g, b, v, color),
  };
}

export const ansi = createAnsi();
export const plainAnsi = createAnsi({ color: false });

export function stripAnsi(text) {
  return String(text).replace(
    /\x1B\[[0-?]*[ -\/]*[@-~]/g,
    "",
  );
}
