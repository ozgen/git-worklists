import * as vscode from "vscode";
import { GitStashEntry } from "../../adapters/git/gitClient";

export type StashNode =
  | { kind: "root" }
  | { kind: "stash"; stash: GitStashEntry }
  | {
      kind: "stashFile";
      stash: GitStashEntry;
      path: string;
      status?: "A" | "M" | "D" | "R" | "C" | "T" | "U" | "?";
    };

function stripWorklistTag(msg: string): { changelistName?: string; msg: string } {
  const s = (msg ?? "").trim();

  const m = s.match(/\b(?:GW|CL):([^\s]+)\b/);
  const changelistName = m?.[1] ? decodeURIComponent(m[1]) : undefined;

  const cleaned = s.replace(/\b(?:GW|CL):[^\s]+\b\s*/g, "").trim();

  return { changelistName, msg: cleaned };
}

function normalizeMsgForLabel(rawMsg: string): {
  branch?: string;
  msg: string;
} {
  const s = (rawMsg ?? "").trim();

  const m = s.match(/^(?:WIP on|On)\s+([^:]+):\s*(.*)$/);
  if (!m) {
    return { msg: s };
  }

  const branch = (m[1] ?? "").trim();
  const msg = (m[2] ?? "").trim();

  return { branch, msg };
}

function shortId(id: string, n = 8): string {
  const s = (id ?? "").trim();
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

function formatLabel(stash: GitStashEntry): {
  label: string;
  desc?: string;
  tooltip: string;
} {
  const { changelistName, msg: noTag } = stripWorklistTag(stash.message);

  const { branch, msg } = normalizeMsgForLabel(noTag);

  const tag = changelistName ? `[CL:${shortId(changelistName)}] ` : "";
  const label = `${tag}${msg || "Stash"}`;

  const tooltip = `${stash.ref}\n${stash.raw || stash.message}`;

  return { label, desc: branch, tooltip };
}

export function toTreeItem(node: StashNode): vscode.TreeItem {
  if (node.kind === "root") {
    const item = new vscode.TreeItem(
      "Stashes",
      vscode.TreeItemCollapsibleState.Expanded,
    );
    item.contextValue = "gitWorklists.stashesRoot";
    item.iconPath = new vscode.ThemeIcon("archive");
    return item;
  }

  if (node.kind === "stash") {
    const s = node.stash;

    const { label, desc, tooltip } = formatLabel(s);

    const item = new vscode.TreeItem(
      label,
      vscode.TreeItemCollapsibleState.Collapsed,
    );
    item.contextValue = "gitWorklists.stashItem";
    item.description = desc;
    item.tooltip = tooltip;
    item.iconPath = new vscode.ThemeIcon("archive");
    return item;
  }

  // stash file leaf
  const item = new vscode.TreeItem(
    node.path,
    vscode.TreeItemCollapsibleState.None,
  );
  item.contextValue = "gitWorklists.stashFile";
  item.iconPath = new vscode.ThemeIcon("diff");

  // Clicking open diff
  item.command = {
    command: "gitWorklists.stash.openFileDiff",
    title: "Open Stash Diff",
    arguments: [node],
  };

  if (node.status) {
    item.description = node.status;
  }

  item.tooltip = `${node.stash.ref}\n${node.path}`;
  return item;
}
