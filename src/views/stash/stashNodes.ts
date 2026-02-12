import * as vscode from "vscode";
import { GitStashEntry } from "../../adapters/git/gitClient";

export type StashNode =
  | { kind: "root" }
  | { kind: "stash"; stash: GitStashEntry };

function normalizeMsgForLabel(rawMsg: string): {
  branch?: string;
  msg: string;
} {
  const s = (rawMsg ?? "").trim();

  const m = s.match(/^(?:WIP on|On)\s+([^:]+):\s*(.*)$/);
  if (m) {
    const branch = (m[1] ?? "").trim();
    const msg = (m[2] ?? "").trim();
    return { branch, msg: msg || s };
  }

  return { msg: s };
}

function stripGwTag(msg: string): { changelistId?: string; msg: string } {
  const m = msg.match(/\bGW:([^\s]+)\b/);
  const changelistId = m?.[1];

  const cleaned = msg.replace(/\bGW:[^\s]+\s*/g, "").trim();
  return { changelistId, msg: cleaned || msg };
}

function formatLabel(stash: GitStashEntry): {
  label: string;
  desc?: string;
  tooltip: string;
} {
  const { branch, msg: m1 } = normalizeMsgForLabel(stash.message);
  const { changelistId, msg: m2 } = stripGwTag(m1);

  const tag = changelistId ? `[CL:${changelistId}] ` : "";
  const label = `${tag}${m2 || "Stash"}`;

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

  const s = node.stash;
  const { label, desc, tooltip } = formatLabel(s);

  const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);

  item.contextValue = "gitWorklists.stashItem";

  item.description = desc;

  item.tooltip = tooltip;

  item.iconPath = new vscode.ThemeIcon("archive");
  return item;
}
