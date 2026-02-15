export type DisposableLike = {
  dispose(): void;
};

export type Disposable = DisposableLike;

export type UriLike = { fsPath: string };

export type RelativePatternLike = unknown;

export type FileSystemWatcherLike = DisposableLike & {
  onDidChange(cb: () => void): void;
  onDidCreate(cb: () => void): void;
  onDidDelete(cb: () => void): void;
};

export type WorkspaceLike = {
  createFileSystemWatcher(pattern: RelativePatternLike): FileSystemWatcherLike;

  onDidCreateFiles(cb: (e: { files: UriLike[] }) => void): DisposableLike;
  onDidDeleteFiles(cb: (e: { files: UriLike[] }) => void): DisposableLike;
  onDidRenameFiles(
    cb: (e: { files: { oldUri: UriLike; newUri: UriLike }[] }) => void,
  ): DisposableLike;
  onDidSaveTextDocument(cb: (d: { uri: UriLike }) => void): DisposableLike;
};

export type VscodeFacade = {
  workspace: WorkspaceLike;
  RelativePattern: new (base: string, pattern: string) => RelativePatternLike;
};
