import * as vscode from "vscode";
import { GitClient } from "../adapters/git/gitClient";
import { normalizeRepoRelPath, toRepoRelPath } from "../utils/paths";

export class OpenDiffForFile {
  constructor(private readonly git: GitClient) {}

  async run(opts: {
    repoRoot: string;
    uri: vscode.Uri;      
    ref?: string;         
  }): Promise<
    | { kind: "open-file"; uri: vscode.Uri }
    | {
        kind: "diff";
        title: string;
        leftContent: string;
        leftLabelPath: string;
        rightUri: vscode.Uri;
      }
  > {
    const ref = opts.ref ?? "HEAD";

    const rel = toRepoRelPath(opts.repoRoot, opts.uri);
    if (!rel) {
      return { kind: "open-file", uri: opts.uri };
    }

    const repoRel = normalizeRepoRelPath(rel);

    let leftContent: string;
    try {
      leftContent = await this.git.showFileAtRef(opts.repoRoot, ref, repoRel);
    } catch {
      return { kind: "open-file", uri: opts.uri };
    }

    return {
      kind: "diff",
      title: `${repoRel} (${ref} <-> Working Tree)`,
      leftContent,
      leftLabelPath: repoRel,
      rightUri: opts.uri,
    };
  }
}
