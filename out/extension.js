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
const GitCliClient_1 = require("./adapters/git/GitCliClient");
const WorkspaceStateStore_1 = require("./adapters/storage/WorkspaceStateStore");
const InitializeWorkspace_1 = require("./usecases/InitializeWorkspace");
const ChangelistTreeProvider_1 = require("./views/ChangelistTreeProvider");
const WorklistDecorationProvider_1 = require("./views/WorklistDecorationProvider");
const RefreshCoordinator_1 = require("./core/refresh/RefreshCoordinator");
const AutoRefreshController_1 = require("./core/refresh/AutoRefreshController");
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
    const treeProvider = new ChangelistTreeProvider_1.ChangelistTreeProvider(store);
    treeProvider.setRepoRoot(repoRoot);
    context.subscriptions.push(vscode.window.createTreeView("gitWorklists.changelists", {
        treeDataProvider: treeProvider,
    }));
    const deco = new WorklistDecorationProvider_1.WorklistDecorationProvider(store);
    deco.setRepoRoot(repoRoot);
    context.subscriptions.push(vscode.window.registerFileDecorationProvider(deco));
    const init = new InitializeWorkspace_1.InitializeWorkspace(git, store);
    const doRefresh = async () => {
        await init.run(workspaceFolder.uri.fsPath);
        treeProvider.refresh();
        deco.refreshAll();
    };
    const coordinator = new RefreshCoordinator_1.RefreshCoordinator(doRefresh, 200);
    context.subscriptions.push(coordinator);
    // Initial refresh
    await coordinator.requestNow();
    // Auto refresh signals
    const auto = new AutoRefreshController_1.AutoRefreshController(repoRoot, gitDir, () => coordinator.trigger());
    auto.start();
    context.subscriptions.push(auto);
    // Manual refresh fallback
    context.subscriptions.push(vscode.commands.registerCommand("gitWorklists.refresh", async () => {
        try {
            await coordinator.requestNow();
        }
        catch (e) {
            vscode.window.showErrorMessage("Git Worklists: refresh failed (see console)");
            console.error(e);
        }
    }));
}
function deactivate() { }
//# sourceMappingURL=extension.js.map