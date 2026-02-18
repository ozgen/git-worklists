import { PersistedState } from "../adapters/storage/workspaceStateStore";
import { RefreshCoordinator } from "../core/refresh/refreshCoordinator";
import { Deps } from "../app/types";
import { getStagedPaths } from "../git/staged";

function computeTotalWorklistCount(state: PersistedState | undefined): number {
  if (!state || state.version !== 1) {
    return 0;
  }

  const all = new Set<string>();
  for (const l of state.lists) {
    for (const f of l.files ?? []) {
      all.add(f.replace(/\\/g, "/"));
    }
  }
  return all.size;
}

export function registerRefresh(deps: Deps) {
  const doRefresh = async () => {
    await deps.reconcile.run(deps.repoRoot);

    const staged = await getStagedPaths(deps.repoRoot);
    deps.treeProvider.setStagedPaths(staged);

    deps.treeProvider.refresh();
    deps.deco.refreshAll();

    deps.commitView.updateState({
      stagedCount: staged.size,
      lastError: undefined,
    });

    const state = await deps.store.load(deps.repoRoot);
    const count = computeTotalWorklistCount(
      state as PersistedState | undefined,
    );

    deps.treeView.badge =
      count > 0
        ? { value: count, tooltip: "Files in Git Worklists" }
        : undefined;
  };

  // replace the placeholder coordinator created in createDeps
  const coordinator = new RefreshCoordinator(doRefresh, 200);
  deps.context.subscriptions.push(coordinator);
  deps.coordinator = coordinator;

  return { doRefresh };
}
