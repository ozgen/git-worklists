import { normalizeRepoRelPath } from "../../utils/paths";
import type { BookmarkEntry, BookmarkSlot } from "../../core/bookmark/bookmark";
import type { BookmarkRepository } from "../../core/bookmark/bookmarkRepository";
import type { MementoLike } from "../vscode/mementoFacade";

export type PersistedChangelist = {
  id: string;
  name: string;
  files: string[];
};

export type PersistedState = {
  version: 1;
  lists: PersistedChangelist[];
};

type PersistedSelectionState = {
  version: 1;
  selectedFiles: string[];
};

type PersistedBookmarkTarget = {
  repoRelativePath: string;
  line: number;
  column: number;
};

type PersistedBookmarkEntry = {
  slot: BookmarkSlot;
  target: PersistedBookmarkTarget;
};

type PersistedBookmarksState = {
  version: 1;
  entries: PersistedBookmarkEntry[];
};

export class WorkspaceStateStore implements BookmarkRepository {
  constructor(private readonly memento: MementoLike) {}

  private keyForRepo(repoRootFsPath: string): string {
    return `git-worklists.state.v1:${repoRootFsPath}`;
  }

  private selectionKeyForRepo(repoRootFsPath: string): string {
    return `git-worklists.selection.v1:${repoRootFsPath}`;
  }

  private bookmarksKeyForRepo(repoRootFsPath: string): string {
    return `git-worklists.bookmarks.v1:${repoRootFsPath}`;
  }

  async load(repoRootFsPath: string): Promise<PersistedState | undefined> {
    return this.memento.get<PersistedState>(this.keyForRepo(repoRootFsPath));
  }

  async save(repoRootFsPath: string, state: PersistedState): Promise<void> {
    await this.memento.update(this.keyForRepo(repoRootFsPath), state);
  }

  getSelectedFiles(repoRootFsPath: string): Set<string> {
    const raw = this.memento.get<PersistedSelectionState>(
      this.selectionKeyForRepo(repoRootFsPath),
    );
    const arr = raw?.version === 1 ? raw.selectedFiles : [];
    return new Set(arr.map(normalizeRepoRelPath));
  }

  async setSelectedFiles(
    repoRootFsPath: string,
    selected: Set<string>,
  ): Promise<void> {
    const payload: PersistedSelectionState = {
      version: 1,
      selectedFiles: Array.from(selected).map(normalizeRepoRelPath).sort(),
    };
    await this.memento.update(
      this.selectionKeyForRepo(repoRootFsPath),
      payload,
    );
  }

  async toggleSelectedFile(
    repoRootFsPath: string,
    repoRelPath: string,
  ): Promise<boolean> {
    const current = this.getSelectedFiles(repoRootFsPath);
    const p = normalizeRepoRelPath(repoRelPath);

    if (current.has(p)) {
      current.delete(p);
      await this.setSelectedFiles(repoRootFsPath, current);
      return false;
    }

    current.add(p);
    await this.setSelectedFiles(repoRootFsPath, current);
    return true;
  }

  async clearSelectedFiles(repoRootFsPath: string): Promise<void> {
    await this.setSelectedFiles(repoRootFsPath, new Set());
  }

  async getAll(repoRootFsPath: string): Promise<BookmarkEntry[]> {
    const raw = this.memento.get<PersistedBookmarksState>(
      this.bookmarksKeyForRepo(repoRootFsPath),
    );

    if (raw?.version !== 1) {
      return [];
    }

    return raw.entries
      .map((entry) => ({
        slot: entry.slot,
        target: {
          repoRelativePath: normalizeRepoRelPath(entry.target.repoRelativePath),
          line: entry.target.line,
          column: entry.target.column,
        },
      }))
      .sort((a, b) => a.slot - b.slot);
  }

  async getBySlot(
    repoRootFsPath: string,
    slot: BookmarkSlot,
  ): Promise<BookmarkEntry | undefined> {
    const all = await this.getAll(repoRootFsPath);
    return all.find((entry) => entry.slot === slot);
  }

  async set(repoRootFsPath: string, entry: BookmarkEntry): Promise<void> {
    const all = await this.getAll(repoRootFsPath);

    const normalizedEntry: BookmarkEntry = {
      slot: entry.slot,
      target: {
        repoRelativePath: normalizeRepoRelPath(entry.target.repoRelativePath),
        line: entry.target.line,
        column: entry.target.column,
      },
    };

    const next = all.filter((item) => item.slot !== normalizedEntry.slot);
    next.push(normalizedEntry);
    next.sort((a, b) => a.slot - b.slot);

    const payload: PersistedBookmarksState = {
      version: 1,
      entries: next.map((item) => ({
        slot: item.slot,
        target: {
          repoRelativePath: normalizeRepoRelPath(item.target.repoRelativePath),
          line: item.target.line,
          column: item.target.column,
        },
      })),
    };

    await this.memento.update(
      this.bookmarksKeyForRepo(repoRootFsPath),
      payload,
    );
  }

  async clear(repoRootFsPath: string, slot: BookmarkSlot): Promise<void> {
    const all = await this.getAll(repoRootFsPath);
    const next = all.filter((entry) => entry.slot !== slot);

    const payload: PersistedBookmarksState = {
      version: 1,
      entries: next.map((item) => ({
        slot: item.slot,
        target: {
          repoRelativePath: normalizeRepoRelPath(item.target.repoRelativePath),
          line: item.target.line,
          column: item.target.column,
        },
      })),
    };

    await this.memento.update(
      this.bookmarksKeyForRepo(repoRootFsPath),
      payload,
    );
  }

  async clearAll(repoRootFsPath: string): Promise<void> {
    const payload: PersistedBookmarksState = {
      version: 1,
      entries: [],
    };

    await this.memento.update(
      this.bookmarksKeyForRepo(repoRootFsPath),
      payload,
    );
  }
}
