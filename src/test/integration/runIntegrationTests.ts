import * as path from "path";
import { runTests } from "@vscode/test-electron";

async function main() {
  try {
    const extensionDevelopmentPath = path.resolve(__dirname, "../../../");
    const extensionTestsPath = path.resolve(__dirname, "./suite/index");

    const workspacePath = path.resolve(
      extensionDevelopmentPath,
      "src/test/fixtures/repo",
    );

    await runTests({
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
