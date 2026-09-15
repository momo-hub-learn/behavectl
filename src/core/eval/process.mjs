import { spawn } from "node:child_process";

export function runProcess(
  command,
  args,
  {
    cwd,
    env = {},
    timeoutMs = 120_000,
    input,
    allowFailure = true,
    shell = false,
  } = {},
) {
  return new Promise((resolve, reject) => {
    const startedAt = performance.now();
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
      shell,
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 2_000).unref();
    }, timeoutMs);

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on("close", (code, signal) => {
      clearTimeout(timer);
      const result = {
        command,
        args,
        exitCode: code ?? -1,
        signal,
        stdout,
        stderr,
        timedOut,
        durationMs: Math.round(performance.now() - startedAt),
      };

      if (!allowFailure && result.exitCode !== 0) {
        const error = new Error(
          `${command} exited ${result.exitCode}: ${stderr || stdout}`,
        );
        error.result = result;
        reject(error);
      } else {
        resolve(result);
      }
    });

    if (input !== undefined) child.stdin.write(input);
    child.stdin.end();
  });
}

export async function commandExists(name) {
  const checker = process.platform === "win32" ? "where" : "which";
  const result = await runProcess(checker, [name], {
    timeoutMs: 5_000,
    allowFailure: true,
  });
  return result.exitCode === 0;
}
