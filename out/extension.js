"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const node_child_process_1 = require("node:child_process");
const GitCliClient_1 = require("./adapters/git/GitCliClient");
const WorkspaceStateStore_1 = require("./adapters/storage/WorkspaceStateStore");
const InitializeWorkspace_1 = require("./usecases/InitializeWorkspace");
const ChangelistTreeProvider_1 = require("./views/ChangelistTreeProvider");
const WorklistDecorationProvider_1 = require("./views/WorklistDecorationProvider");
const RefreshCoordinator_1 = require("./core/refresh/RefreshCoordinator");
const AutoRefreshController_1 = require("./core/refresh/AutoRefreshController");
const CommitViewProvider_1 = require("./views/CommitViewProvider");
function normalizeRepoRelPath(p) {
    return p.replace(/\\/g, "/");
}
async function runGit(repoRoot, args) {
    await new Promise((resolve, reject) => {
        const child = (0, node_child_process_1.spawn)("git", args, {
            cwd: repoRoot,
            stdio: ["ignore", "pipe", "pipe"],
        });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (d) => (stdout += d.toString()));
        child.stderr.on("data", (d) => (stderr += d.toString()));
        child.on("error", reject);
        child.on("close", (code) => {
            if (code === 0)
                return resolve();
            const msg = (stderr + "\n" + stdout).trim();
            reject(new Error(`git ${args.join(" ")} failed (code ${code}):\n${msg || "(no output)"}`));
        });
    });
}
async function runGitCapture(repoRoot, args) {
    return await new Promise((resolve, reject) => {
        const child = (0, node_child_process_1.spawn)("git", args, {
            cwd: repoRoot,
            stdio: ["ignore", "pipe", "pipe"],
        });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (d) => (stdout += d.toString()));
        child.stderr.on("data", (d) => (stderr += d.toString()));
        child.on("error", reject);
        child.on("close", (code) => {
            if (code === 0)
                return resolve(stdout);
            reject(new Error(`git ${args.join(" ")} failed (code ${code}):\n${stderr || stdout}`));
        });
    });
}
// Robust staged detection (porcelain v2 + -z)
async function getStatusV2(repoRoot) {
    const out = await runGitCapture(repoRoot, ["status", "--porcelain=v2", "-z"]);
    const staged = new Set();
    const parts = out.split("\0").filter(Boolean);
    for (let i = 0; i < parts.length; i++) {
        const rec = parts[i];
        if (rec.startsWith("1 ") || rec.startsWith("2 ")) {
            const x = rec[2]; // index status: '.' means nothing staged for this entry
            const lastSpace = rec.lastIndexOf(" ");
            const path = lastSpace >= 0 ? rec.slice(lastSpace + 1) : "";
            if (path && x !== ".")
                staged.add(path);
            // rename records have an extra NUL token (orig path); skip it
            if (rec.startsWith("2 "))
                i++;
        }
    }
    return { staged };
}
function toRepoRelPath(repoRoot, uri) {
    const root = repoRoot.replace(/\\/g, "/").replace(/\/+$/, "");
    const full = uri.fsPath.replace(/\\/g, "/");
    if (full === root)
        return "";
    if (!full.startsWith(root + "/"))
        return "";
    return full.slice(root.length + 1);
}
async function activate(context) {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder)
        return;
    const git = new GitCliClient_1.GitCliClient();
    const store = new WorkspaceStateStore_1.WorkspaceStateStore(context.workspaceState);
    let repoRoot;
    try {
        repoRoot = await git.getRepoRoot(workspaceFolder.uri.fsPath);
    }
    catch (e) {
        console.error("Git Worklists: not a git repo?", e);
        return;
    }
    const gitDir = await git.getGitDir(repoRoot);
    // ----------------------------
    // Tree view
    // ----------------------------
    const treeProvider = new ChangelistTreeProvider_1.ChangelistTreeProvider(store);
    treeProvider.setRepoRoot(repoRoot);
    const treeView = vscode.window.createTreeView("gitWorklists.changelists", {
        treeDataProvider: treeProvider,
    });
    context.subscriptions.push(treeView);
    // Decorations
    const deco = new WorklistDecorationProvider_1.WorklistDecorationProvider(store);
    deco.setRepoRoot(repoRoot);
    context.subscriptions.push(vscode.window.registerFileDecorationProvider(deco));
    // Commit Webview View
    const commitView = new CommitViewProvider_1.CommitViewProvider(context.extensionUri, async ({ message, amend, push }) => {
        const msg = message.trim();
        if (!msg)
            throw new Error("Commit message is empty.");
        const s = await getStatusV2(repoRoot);
        if (s.staged.size === 0) {
            throw new Error("No staged files. Stage files first.");
        }
        const commitArgs = ["commit", "-m", msg];
        if (amend)
            commitArgs.push("--amend");
        await runGit(repoRoot, commitArgs);
        if (!push)
            return;
        try {
            if (amend) {
                await runGit(repoRoot, ["push", "--force-with-lease"]);
            }
            else {
                await runGit(repoRoot, ["push"]);
            }
        }
        catch (e) {
            const text = String(e?.message ?? e);
            // Friendlier message for the common non-fast-forward case
            if (text.includes("non-fast-forward") || text.includes("fetch first")) {
                if (amend) {
                    throw new Error("Push rejected because the remote branch moved.\n" +
                        "Try again (force-with-lease will work only if nobody pushed new commits after your last fetch).\n" +
                        "If this keeps happening: run 'git pull --rebase' and retry.");
                }
                throw new Error("Push rejected (non-fast-forward). Your branch is behind the remote.\n" +
                    "Run 'git pull --rebase' and then push again.");
            }
            throw e;
        }
    });
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(CommitViewProvider_1.CommitViewProvider.viewId, commitView));
    // Initialize / refresh pipeline
    const init = new InitializeWorkspace_1.InitializeWorkspace(git, store);
    const doRefresh = async () => {
        await init.run(workspaceFolder.uri.fsPath);
        treeProvider.refresh();
        deco.refreshAll();
        const s = await getStatusV2(repoRoot);
        treeProvider.setStagedPaths(s.staged);
        treeProvider.refresh();
        commitView.updateState({
            stagedCount: s.staged.size,
            lastError: undefined,
        });
    };
    const coordinator = new RefreshCoordinator_1.RefreshCoordinator(doRefresh, 200);
    context.subscriptions.push(coordinator);
    await coordinator.requestNow();
    const auto = new AutoRefreshController_1.AutoRefreshController(repoRoot, gitDir, () => coordinator.trigger());
    auto.start();
    context.subscriptions.push(auto);
    // ----------------------------
    // Staging helpers
    // ----------------------------
    async function stagePaths(paths) {
        const normalized = paths.map(normalizeRepoRelPath).filter(Boolean);
        if (normalized.length === 0)
            return;
        await runGit(repoRoot, ["add", "--", ...normalized]);
    }
    async function unstagePaths(paths) {
        const normalized = paths.map(normalizeRepoRelPath).filter(Boolean);
        if (normalized.length === 0)
            return;
        await runGit(repoRoot, ["restore", "--staged", "--", ...normalized]);
    }
    treeView.onDidChangeCheckboxState(async (e) => {
        try {
            for (const item of e.items) {
                const kind = item?.kind;
                // File node: has repoRelativePath
                if (kind === "file" && typeof item?.repoRelativePath === "string") {
                    const p = normalizeRepoRelPath(item.repoRelativePath);
                    if (item.checkboxState === vscode.TreeItemCheckboxState.Checked) {
                        await stagePaths([p]);
                    }
                    else {
                        await unstagePaths([p]);
                    }
                    continue;
                }
                // Group node: has list.files
                if (kind === "group" && Array.isArray(item?.list?.files)) {
                    const files = item.list.files;
                    if (item.checkboxState === vscode.TreeItemCheckboxState.Checked) {
                        await stagePaths(files);
                    }
                    else {
                        await unstagePaths(files);
                    }
                }
            }
            await coordinator.requestNow();
        }
        catch (err) {
            console.error(err);
            vscode.window.showErrorMessage("Git Worklists: staging via checkbox failed (see console)");
        }
    });
    // ----------------------------
    // Commands (still useful for context menus)
    // ----------------------------
    context.subscriptions.push(vscode.commands.registerCommand("gitWorklists.selectFile", async (arg) => {
        try {
            const uri = arg?.resourceUri instanceof vscode.Uri
                ? arg.resourceUri
                : arg instanceof vscode.Uri
                    ? arg
                    : undefined;
            if (!uri)
                return;
            const rel = toRepoRelPath(repoRoot, uri);
            if (!rel)
                return;
            await stagePaths([rel]);
            await coordinator.requestNow();
        }
        catch (e) {
            console.error(e);
            vscode.window.showErrorMessage("Git Worklists: failed to stage file (see console)");
        }
    }), vscode.commands.registerCommand("gitWorklists.unselectFile", async (arg) => {
        try {
            const uri = arg?.resourceUri instanceof vscode.Uri
                ? arg.resourceUri
                : arg instanceof vscode.Uri
                    ? arg
                    : undefined;
            if (!uri)
                return;
            const rel = toRepoRelPath(repoRoot, uri);
            if (!rel)
                return;
            await unstagePaths([rel]);
            await coordinator.requestNow();
        }
        catch (e) {
            console.error(e);
            vscode.window.showErrorMessage("Git Worklists: failed to unstage file (see console)");
        }
    }), vscode.commands.registerCommand("gitWorklists.toggleGroupSelection", async (groupNode) => {
        try {
            const files = Array.isArray(groupNode?.list?.files)
                ? groupNode.list.files
                : [];
            if (files.length === 0)
                return;
            const normalized = files.map(normalizeRepoRelPath);
            const s = await getStatusV2(repoRoot);
            const allStaged = normalized.every((p) => s.staged.has(p));
            if (!allStaged)
                await stagePaths(normalized);
            else
                await unstagePaths(normalized);
            await coordinator.requestNow();
        }
        catch (e) {
            console.error(e);
            vscode.window.showErrorMessage("Git Worklists: failed to toggle group staging (see console)");
        }
    }), vscode.commands.registerCommand("gitWorklists.refresh", async () => {
        try {
            await coordinator.requestNow();
        }
        catch (e) {
            vscode.window.showErrorMessage("Git Worklists: refresh failed (see console)");
            console.error(e);
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand("gitWorklists.stagePath", async (uri) => {
        const rel = toRepoRelPath(repoRoot, uri);
        if (!rel)
            return;
        await runGit(repoRoot, ["add", "--", normalizeRepoRelPath(rel)]);
        await coordinator.requestNow();
    }), vscode.commands.registerCommand("gitWorklists.unstagePath", async (uri) => {
        const rel = toRepoRelPath(repoRoot, uri);
        if (!rel)
            return;
        await runGit(repoRoot, [
            "restore",
            "--staged",
            "--",
            normalizeRepoRelPath(rel),
        ]);
        await coordinator.requestNow();
    }));
}
function deactivate() { }
//# sourceMappingURL=extension.js.map