import { describe, it, expect, vi, beforeEach } from "vitest";

const vscodeMocks = vi.hoisted(() => {
  return {
    openTextDocument: vi.fn(),
    executeCommand: vi.fn(),
    Uri: {
      file: (fsPath: string) => ({ fsPath, toString: () => fsPath }),
    },
  };
});

vi.mock("vscode", () => {
  return {
    workspace: {
      openTextDocument: vscodeMocks.openTextDocument,
    },
    commands: {
      executeCommand: vscodeMocks.executeCommand,
    },
    Uri: vscodeMocks.Uri,
  };
});

import * as vscode from "vscode";
import { VsCodeDiffOpener } from "../../../../adapters/vscode/diffOpener";

beforeEach(() => {
  vscodeMocks.openTextDocument.mockReset();
  vscodeMocks.executeCommand.mockReset();
});

describe("VsCodeDiffOpener", () => {
  it("opens diff with mapped language (e.g. .ts -> typescript)", async () => {
    const opener = new VsCodeDiffOpener();

    const rightUri = vscode.Uri.file("/repo/src/a.ts") as any;

    const leftDoc = { uri: { fsPath: "untitled:left" } };
    vscodeMocks.openTextDocument.mockResolvedValue(leftDoc);

    await opener.openContentVsFileDiff({
      title: "a.ts (HEAD ↔ Working Tree)",
      leftContent: "console.log('hi')",
      leftLabelPath: "src/a.ts",
      rightUri,
    });

    expect(vscodeMocks.openTextDocument).toHaveBeenCalledTimes(1);
    expect(vscodeMocks.openTextDocument).toHaveBeenCalledWith({
      content: "console.log('hi')",
      language: "typescript",
    });

    expect(vscodeMocks.executeCommand).toHaveBeenCalledTimes(1);
    expect(vscodeMocks.executeCommand).toHaveBeenCalledWith(
      "vscode.diff",
      leftDoc.uri,
      rightUri,
      "a.ts (HEAD ↔ Working Tree)",
    );
  });

  it("uses yaml for .yml and .yaml", async () => {
    const opener = new VsCodeDiffOpener();

    const rightUri = vscode.Uri.file("/repo/a.yml") as any;
    const leftDoc = { uri: { fsPath: "untitled:left" } };
    vscodeMocks.openTextDocument.mockResolvedValue(leftDoc);

    await opener.openContentVsFileDiff({
      title: "a.yml diff",
      leftContent: "x: 1",
      leftLabelPath: "a.yml",
      rightUri,
    });

    expect(vscodeMocks.openTextDocument).toHaveBeenCalledWith({
      content: "x: 1",
      language: "yaml",
    });

    vscodeMocks.openTextDocument.mockClear();
    vscodeMocks.executeCommand.mockClear();

    await opener.openContentVsFileDiff({
      title: "a.yaml diff",
      leftContent: "x: 1",
      leftLabelPath: "a.yaml",
      rightUri,
    });

    expect(vscodeMocks.openTextDocument).toHaveBeenCalledWith({
      content: "x: 1",
      language: "yaml",
    });
  });

  it("passes undefined language for unknown extension", async () => {
    const opener = new VsCodeDiffOpener();

    const rightUri = vscode.Uri.file("/repo/file.unknown") as any;
    const leftDoc = { uri: { fsPath: "untitled:left" } };
    vscodeMocks.openTextDocument.mockResolvedValue(leftDoc);

    await opener.openContentVsFileDiff({
      title: "unknown diff",
      leftContent: "data",
      leftLabelPath: "file.unknown",
      rightUri,
    });

    expect(vscodeMocks.openTextDocument).toHaveBeenCalledWith({
      content: "data",
      language: undefined,
    });

    expect(vscodeMocks.executeCommand).toHaveBeenCalledWith(
      "vscode.diff",
      leftDoc.uri,
      rightUri,
      "unknown diff",
    );
  });

  it("lowercases extension before mapping (e.g. .TS -> typescript)", async () => {
    const opener = new VsCodeDiffOpener();

    const rightUri = vscode.Uri.file("/repo/src/A.TS") as any;
    const leftDoc = { uri: { fsPath: "untitled:left" } };
    vscodeMocks.openTextDocument.mockResolvedValue(leftDoc);

    await opener.openContentVsFileDiff({
      title: "A.TS diff",
      leftContent: "let x = 1;",
      leftLabelPath: "src/A.TS",
      rightUri,
    });

    expect(vscodeMocks.openTextDocument).toHaveBeenCalledWith({
      content: "let x = 1;",
      language: "typescript",
    });
  });

  it("propagates errors from openTextDocument", async () => {
    const opener = new VsCodeDiffOpener();

    const rightUri = vscode.Uri.file("/repo/src/a.ts") as any;
    vscodeMocks.openTextDocument.mockRejectedValue(new Error("boom"));

    await expect(
      opener.openContentVsFileDiff({
        title: "diff",
        leftContent: "x",
        leftLabelPath: "src/a.ts",
        rightUri,
      }),
    ).rejects.toThrow("boom");

    expect(vscodeMocks.executeCommand).not.toHaveBeenCalled();
  });

  it("propagates errors from executeCommand", async () => {
    const opener = new VsCodeDiffOpener();

    const rightUri = vscode.Uri.file("/repo/src/a.ts") as any;
    const leftDoc = { uri: { fsPath: "untitled:left" } };
    vscodeMocks.openTextDocument.mockResolvedValue(leftDoc);
    vscodeMocks.executeCommand.mockRejectedValue(new Error("diff failed"));

    await expect(
      opener.openContentVsFileDiff({
        title: "diff",
        leftContent: "x",
        leftLabelPath: "src/a.ts",
        rightUri,
      }),
    ).rejects.toThrow("diff failed");
  });
});
