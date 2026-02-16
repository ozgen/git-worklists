import * as vscode from "vscode";
import { normalizeRepoRelPath, toRepoRelPath } from "../utils/paths";
import { runGit } from "../utils/process";

import { SystemChangelist } from "../core/changelist/systemChangelist";

export type NewFileDecision = "add" | "keep" | "disable" | "dismiss";

export type MoveFilesPort = {
    run(repoRoot: string, paths: string[], targetListId: string): Promise<void>;
  };
  
  export type RefreshPort = {
    requestNow(): Promise<void>;
  };
  
  export type HandleNewFilesCreatedDeps = {
    repoRoot: string;
    moveFiles: MoveFilesPort;
    coordinator: RefreshPort;
  
    settings: {
      getPromptOnNewFile(): boolean;
      setPromptOnNewFile(enabled: boolean): Promise<void>;
    };
  
    prompt: {
      confirmAddNewFiles(
        count: number,
        sampleLabel?: string,
      ): Promise<NewFileDecision>;
    };
  };  

export class HandleNewFilesCreated {
  constructor(private readonly deps: HandleNewFilesCreatedDeps) {}

  async run(createdFileUris: vscode.Uri[]): Promise<void> {
    const { repoRoot, settings, prompt, coordinator } = this.deps;

    if (!settings.getPromptOnNewFile()) {
      return;
    }
    if (createdFileUris.length === 0) {
      return;
    }

    // Convert to repo-relative paths and normalize
    const relPaths: string[] = [];
    for (const uri of createdFileUris) {
      const rel = toRepoRelPath(repoRoot, uri);
      if (!rel) {
        continue;
      }

      const p = normalizeRepoRelPath(rel);
      if (!p) {
        continue;
      }

      // avoid weird cases
      if (p.split("/").includes(".git")) {
        continue;
      }

      relPaths.push(p);
    }

    if (relPaths.length === 0) {
      return;
    }

    // Skip ignored files
    const candidates: string[] = [];
    for (const p of relPaths) {
      if (!(await this.isIgnored(repoRoot, p))) {
        candidates.push(p);
      }
    }

    if (candidates.length === 0) {
      return;
    }

    const sample = candidates.length === 1 ? candidates[0] : undefined;
    const decision = await prompt.confirmAddNewFiles(candidates.length, sample);

    if (decision === "disable") {
      await settings.setPromptOnNewFile(false);
      await this.moveToUnversioned(candidates);
      await coordinator.requestNow();
      return;
    }

    if (decision === "add") {
      await this.stagePaths(candidates);
      await this.moveToDefault(candidates);
      await coordinator.requestNow();
      return;
    }

    // keep/dismiss
    await this.moveToUnversioned(candidates);
    await coordinator.requestNow();
  }

  private async stagePaths(paths: string[]): Promise<void> {
    if (paths.length === 0) {
      return;
    }
    await runGit(this.deps.repoRoot, ["add", "--", ...paths]);
  }

  private async moveToDefault(paths: string[]): Promise<void> {
    await this.deps.moveFiles.run(
      this.deps.repoRoot,
      paths,
      SystemChangelist.Default,
    );
  }

  private async moveToUnversioned(paths: string[]): Promise<void> {
    await this.deps.moveFiles.run(
      this.deps.repoRoot,
      paths,
      SystemChangelist.Unversioned,
    );
  }

  private async isIgnored(
    repoRoot: string,
    repoRelPath: string,
  ): Promise<boolean> {
    try {
      // exit 0 => ignored
      await runGit(repoRoot, ["check-ignore", "-q", "--", repoRelPath]);
      return true;
    } catch {
      // non-zero => not ignored
      return false;
    }
  }
}
