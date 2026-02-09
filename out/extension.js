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
async function activate(context) {
    console.log("git-worklists extension activated");
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        console.log("No workspace folder open; skipping init");
        return;
    }
    const git = new GitCliClient_1.GitCliClient();
    const store = new WorkspaceStateStore_1.WorkspaceStateStore(context.workspaceState);
    const init = new InitializeWorkspace_1.InitializeWorkspace(git, store);
    try {
        await init.run(workspaceFolder.uri.fsPath);
        console.log("Initialized git-worklists state");
    }
    catch (err) {
        console.error("Failed to initialize git-worklists:", err);
    }
}
function deactivate() { }
//# sourceMappingURL=extension.js.map