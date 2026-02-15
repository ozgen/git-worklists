export type DisposableLike = { dispose(): void };

export type UriLike = { fsPath: string };

export type EventLike<T> = (listener: (e: T) => unknown) => DisposableLike;

export interface RelativePatternLike {
  // marker interface (no members needed)
}
export type FileSystemWatcherLike = DisposableLike & {
  onDidChange: EventLike<unknown>;
  onDidCreate: EventLike<unknown>;
  onDidDelete: EventLike<unknown>;
};

export type WorkspaceLike = {
  createFileSystemWatcher(pattern: RelativePatternLike): FileSystemWatcherLike;

  onDidCreateFiles: EventLike<{ readonly files: readonly UriLike[] }>;
  onDidDeleteFiles: EventLike<{ readonly files: readonly UriLike[] }>;
  onDidRenameFiles: EventLike<{
    readonly files: readonly {
      readonly oldUri: UriLike;
      readonly newUri: UriLike;
    }[];
  }>;
  onDidSaveTextDocument: EventLike<{ readonly uri: UriLike }>;
};

export type VscodeFacade = {
  workspace: WorkspaceLike;
  RelativePattern: new (base: string, pattern: string) => RelativePatternLike;
};
