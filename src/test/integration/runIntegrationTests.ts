import * as fs from "fs";
import * as path from "path";
import { downloadAndUnzipVSCode, runTests } from "@vscode/test-electron";

async function main() {
  try {
    const extensionDevelopmentPath = path.resolve(__dirname, "../../../");
    const extensionTestsPath = path.resolve(__dirname, "./suite/index");

    const workspacePath = path.resolve(
      extensionDevelopmentPath,
      "src/test/fixtures/repo",
    );

    let vscodeExecutablePath = await downloadAndUnzipVSCode();

    if (process.platform === "darwin" && !fs.existsSync(vscodeExecutablePath)) {
      const codeExecutablePath = vscodeExecutablePath.replace(
        /\/Electron$/,
        "/Code",
      );

      if (fs.existsSync(codeExecutablePath)) {
        vscodeExecutablePath = codeExecutablePath;
      }
    }

    await runTests({
      vscodeExecutablePath,
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [workspacePath, "--disable-extensions"],
    });
  } catch (err) {
    console.error("Failed to run integration tests");
    console.error(err);
    process.exit(1);
  }
}

main();
