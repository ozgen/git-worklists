import { spawn } from "node:child_process";

export async function runCmdCapture(
  cwd: string,
  bin: string,
  args: string[],
): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const child = spawn(bin, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });

    let out = "";
    let err = "";

    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (err += d.toString()));

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        return resolve(out);
      }

      reject(
        new Error(
          `${bin} ${args.join(" ")} failed (code ${code}):\n${(err + "\n" + out).trim()}`,
        ),
      );
    });
  });
}

export async function runCmd(
  cwd: string,
  bin: string,
  args: string[],
): Promise<void> {
  await runCmdCapture(cwd, bin, args).then(() => undefined);
}

export async function runGit(repoRoot: string, args: string[]): Promise<void> {
  await runCmd(repoRoot, "git", args);
}

export async function runGitCapture(
  repoRoot: string,
  args: string[],
): Promise<string> {
  return await runCmdCapture(repoRoot, "git", args);
}

export async function runGhCapture(
  repoRoot: string,
  args: string[],
): Promise<string> {
  return await runCmdCapture(repoRoot, "gh", args);
}
