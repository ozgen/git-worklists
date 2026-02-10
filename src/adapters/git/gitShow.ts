import * as cp from "child_process";

export function gitCapture(repoRoot: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    cp.execFile(
      "git",
      args,
      { cwd: repoRoot, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          reject(
            new Error(
              `git ${args.join(" ")} failed: ${(stderr || err.message).trim()}`,
            ),
          );
          return;
        }
        resolve(stdout);
      },
    );
  });
}
