import * as assert from "assert";
import * as vscode from "vscode";

suite("Git Worklists (integration)", () => {
  test("Extension is present", async () => {
    const ext = vscode.extensions.getExtension("ozgen.git-worklists");
    assert.ok(ext, "Extension not found. Check publisher.name in package.json");
  });

  test("Extension activates", async () => {
    const ext = vscode.extensions.getExtension("ozgen.git-worklists");
    assert.ok(ext, "Extension not found.");

    await ext!.activate();
    assert.ok(ext!.isActive, "Extension did not activate");
  });

  test("Commands are registered after activation", async () => {
    const ext = vscode.extensions.getExtension("ozgen.git-worklists");
    assert.ok(ext);
    await ext!.activate();

    const cmds = await vscode.commands.getCommands(true);
    assert.ok(
      cmds.includes("gitWorklists.refresh"),
      "Missing gitWorklists.refresh",
    );
    assert.ok(
      cmds.includes("gitWorklists.createChangelist"),
      "Missing gitWorklists.createChangelist",
    );
  });
});
