# Change Log

All notable changes to the "Git Worklists" extension are documented in this file.

This project follows the principles of [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
and adheres to Semantic Versioning.

---

## [Unreleased]

No changes yet.

---

## [1.2.2] - 2026-04-18

### Changed

- Updated development dependencies (TypeScript, ESLint, VS Code test tooling, and typings)

### Security

- Reduced vulnerabilities in dev dependencies (test-only)

## [1.2.1] - 2026-03-29

### Changed

- Updated macOS bookmark keyboard shortcuts in Git Worklists

---

## [1.2.0] - 2026-03-26

### Added

- **Improved Changelist Indicators**
  - Clear staged and partially staged status shown in changelist tree view
  - Consistent badge display for files across all changelists
  - Enhanced tooltips including staging information

### Changed

- **Stable File Decorations**
  - Explorer file decorations are now stable and no longer change color during updates
  - Changelist membership is now visually separated from Git staging state
  - Simplified decoration logic to avoid conflicts with built-in Git visuals

- **Refresh & State Handling**
  - Introduced snapshot-based updates for decoration provider
  - Reduced redundant refresh cycles for smoother UI behavior
  - Improved synchronization between Git state and changelist state

### Fixed

- **Explorer Flickering**
  - Fixed blinking file colors (e.g. red/blue/green transitions) when staging files
  - Eliminated inconsistent decoration updates during rapid state changes

- **Decoration Consistency**
  - Fixed stale or incorrect file colors after staging and untracking operations
  - Fixed race conditions caused by async state loading in decoration provider

- **Commit View Accuracy**
  - Fixed incorrect staged file count calculation

---

## [1.1.0] - 2026-03-25

### Added

- **Editor Bookmarks (1–9)**
  - Set bookmarks using `Ctrl + Shift + 1–9`
  - Jump to bookmarks using `Ctrl + 1–9`
  - Bookmarks store file, line, and column position
  - Per-repository persistence (switching repo switches bookmark set)

- **Bookmark UI Integration**
  - Gutter decorations with numbered icons (1–9)
  - Subtle line highlight for bookmarked locations
  - Hover tooltip indicating bookmark slot

- **Bookmark Commands & Actions**
  - Set bookmark from editor and changelist context menu
  - Clear single bookmark
  - Clear all bookmarks with confirmation
  - Slot-specific commands for set / jump / clear

- **Context Menu Support**
  - Right-click -> Set Bookmark
  - Right-click -> Clear Bookmark
  - View title -> Clear All Bookmarks

- **Overwrite Confirmation**
  - Confirmation dialog when replacing an existing bookmark slot

### Changed

- Bookmark decorations now refresh automatically when:
  - setting a bookmark
  - clearing a bookmark
  - switching editors

### Fixed

- Bookmark positioning now correctly respects cursor location when set via context menu
- Bookmark decorations now refresh immediately without requiring window reload
- Fixed stale changelist file decorations after bulk operations by ensuring stage-state refresh stays synchronized with the decoration provider.

---

## [1.0.2] - 2026-03-22

### Changed

- README restructured as a concise overview with demos and key highlights; detailed feature specifications moved to a new `docs/MANUAL.md` reference document.
- Updated marketplace keywords and description for better discoverability.

---

## [1.0.1] - 2026-03-15

### Fixed

- The **Select File** inline action now also appears for partially staged files, not just fully unstaged ones.

---

## [1.0.0] - 2026-03-08

### Added

- **Partial line staging** support. Selected lines can now be staged directly from the editor or diff view using **GW: Stage Selected Lines**.
- Confirmation warning when stashing the **Unversioned** changelist to explain that Git may include additional untracked files in the repository when using `git stash push --include-untracked`.

### Changed

- Progress indicators now appear in the status bar during long-running operations: repository switching, Git status reconciliation, stash creation, and discard all changes.
- Improved handling of stashing the **Unversioned** changelist. Only files currently reported as untracked by Git are considered before creating the stash.
- Renamed `changelistId` to `changelistName` in `GitStashEntry` and related parsing/view code to accurately reflect that the value embedded in the stash message tag (`GW:<encodedName>`) is the changelist name, not an ID.
- File nodes now track a tri-state stage state (`"none"` | `"partial"` | `"all"`) instead of a boolean, enabling correct representation of files with both staged and unstaged changes.
  - Fully staged files show a **check icon**
  - Partially staged files show a **dash icon**
  - Unstaged files show a **square icon**
- Commit preparation now preserves partial staging by avoiding blanket restaging of tracked files. Newly added files modified after staging are refreshed automatically before commit.

## [0.9.0] - 2026-03-06

### Added

- Support for workspaces containing multiple Git repositories by allowing users to switch the active repository from the status bar

### Changed

- Initial repository selection now discovers Git repositories inside the opened workspace folder and selects the first discovered repository by default
- Repository discovery results are cached in memory to make active-repository switching faster
- Status bar now shows the active Git Worklists repository using a dedicated worklists-oriented icon

### Fixed

- Extension activation no longer fails when the opened workspace folder is a parent folder that contains Git repositories but is not itself a Git repository
- `loadOrInit` now initializes against the active repository root instead of the workspace folder path

---

## [0.8.2] - 2026-03-04

### Fixed

- `stageChangelistAll` / `unstageChangelistAll` commands now correctly use the active repo root instead of always reading from `workspaceFolders[0]`
- Stash restore round-trip now works correctly for changelist names containing spaces, names are URL-encoded in the stash message and decoded on apply/pop

### Changed

- Refactored all components to read `repoRoot` at call-time via getter functions instead of capturing it once at startup, groundwork for multi-repo switching
- `StashesTreeProvider` now exposes `setRepoRoot()` to allow switching repos without recreating the provider

---

## [0.8.1] - 2026-03-02

- Version number bumped unintentionally; no functional changes vs 0.7.0.

---

## [0.8.0] - 2026-03-02

- Version number bumped unintentionally; no functional changes vs 0.7.0.

---

## [0.7.0] - 2026-03-02

### Added

- **Rename Changelist** right-click any custom changelist to rename it inline; reserved system names (Changes, Unversioned) and duplicates are rejected
- **Drag and drop between changelists** drag files or entire changelist groups onto another changelist to move them
- **Activity bar badge** the Git Worklists icon now shows the total number of tracked changed files
- **Stash for Unversioned files** the Unversioned changelist can now be stashed directly; uses `git stash push --include-untracked` so new (untracked) files are included
- **Stash restore round-trip** applying or popping a Git Worklists stash now restores files back to their originating changelist instead of always landing in Changes

### Fixed

- Renamed or moved files on disk are now recognized and kept in their original changelist (resolved via `git status` R/C entries)
- Apply, Pop, and Delete stash actions now show the stash message in notifications and confirmation dialogs instead of the raw `stash@{N}` reference

---

## [0.6.1] - 2026-03-01

### Changed

- Consolidated all git operations into `GitCliClient` / `GitClient` interface and eliminated the parallel `src/git/` module (head, push, refs, staged) and `runGit`/`runGitCapture` helpers from `utils/process.ts`
- All registration modules and use cases now invoke git via `deps.git.*` instead of calling free functions directly
- Removed `utils/process.ts` entirely (`runCmdCapture`, `runCmd`, `runGhCapture` were no longer referenced)
- Updated and extended unit tests for `GitCliClient`, `process`, and `reconcileWithGitStatus` to reflect the new structure

---

## [0.6.0] - 2026-02-28

### Added

- **Accordion-style Stashes view**
  - Stashes are now expandable nodes instead of a flat list.
  - Expanding a stash reveals the files contained within it.
- **Per-file diff preview in Stashes view**
  - Clicking a stashed file opens a diff against the stash base commit.
  - Newly added files in a stash open as single-file preview.
- Status-aware stash file nodes (A/M/D/R/C).

### Changed

- Stash nodes are now collapsible instead of non-expandable items.
- Refactored Stashes tree provider to support hierarchical rendering.
- Extended Git adapter with `git diff --name-status` integration for stash file enumeration.

### Improved

- Safer handling of very large stashed files to prevent preview crashes.
- Increased unit test coverage for stash tree rendering and Git stash parsing logic.

---

## [0.5.0] - 2026-02-27

### Added

- Group-level action: **Move Staged Files to Another Changelist**
- Group-level action: **Move Staged Files into Stash**
- File-level actions on staged files:
  - Move all staged files to another changelist
  - Stash all staged files

### Changed

- Staged-only actions now operate based on the Git index
  - From a changelist: affects only staged files in that changelist
  - From a staged file: affects all currently staged files

### Fixed

- Cancelling the stash message dialog no longer executes `git stash push`
- Prevented unintended stash execution when the input box is dismissed

---

## [0.4.1] - 2026-02-25

### Changed

- Per-changelist stash names now use the **changelist name** instead of the internal changelist ID (improves readability in `git stash list`).

---

## [0.4.0] - 2026-02-24

### Added

- Integration with the **Conventional Commits** extension (vivaxy.vscode-conventional-commits)
- ◯ button in the Commit Panel (next to Amend) to generate commit messages
- Automatic synchronization of generated commit message into the custom commit panel
- Automatic detection of extension availability (button hidden if not installed or disabled)

### Changed

- Prevented Source Control view from stealing focus when generating Conventional Commit messages
- Temporarily disable `autoCommit` and enable `silentAutoCommit` while generating message

---

## [0.3.4] - 2026-02-22

### Fixed

- Auto-refresh worklists on external file changes (terminal formatting, git CLI)
- Prevent stale changelist state that required manual refresh

---

## [0.3.3] - 2026-02-21

### Changed

- Refactored commit and push webview implementation for improved structure and maintainability

### Fixed

- Fixed an issue where committing after modifying already staged files could result in outdated or empty content being pushed

---

## [0.3.2] - 2026-02-20

### Changed

- Improved unit test coverage for upstream/no-upstream push preview logic

### Fixed

- Push preview panel now works on branches without an upstream (shows local-only commits)

---

## [0.3.1] - 2026-02-19

### Changed

- Updated demo to reflect latest workflow
- Improved Marketplace keywords and search discoverability

---

## [0.3.0] - 2026-02-19

### Added

- Push preview panel when multiple outgoing commits are detected (explicit confirmation before push)
- Changelist-level **Discard All Changes** action with categorized confirmation
- Safe diff preview for:
  - Newly added files
  - Initial commits (no parent)
  - Missing parent references
- Open Source File action in file context menu (jump directly to working tree file from changelist)

### Changed

- Commit panel now automatically unchecks Amend after a successful commit or commit & push
- Improved refresh coordination to ensure UI state and decorations stay fully in sync with Git

### Fixed

- “Add to Git?” prompt now correctly stages files and moves them to the appropriate changelist
- File decorations are properly invalidated after reconcile (no stale indicators after commit or push)
- Diff preview no longer throws when parent commit does not exist
- File decorations are properly invalidated after reconcile (no more stale green/blue indicators after commit or push)

---

## [0.2.0]

### Added

- Stage All / Unstage All per changelist
- State-aware inline Stage / Unstage actions

### Changed

- File click no longer toggles staging
- Staging is now handled exclusively via checkbox or inline action
- Group rows no longer toggle staging on click
- Refactored extension activation into smaller registration modules for improved maintainability

### Fixed

- Removed accidental staging when clicking file rows
- Correct inline icon visibility based on staged state
- Fixed Commit panel sometimes showing an outdated staged count after staging files via the new-file prompt.
- Fixed stale worklist decorations after commit or push (files no longer remain blue when clean)

---

## [0.1.0] - 2026-02-18

### Added

- Close Diff Tabs button in the Changelists view title
- New settings:
  - `gitWorklists.ui.closeDiffTabsAfterCommit`
  - `gitWorklists.ui.closeDiffTabsAfterPush`

- Support for push-only when no staged files are present
- Message-only amend support (amend commit message without staged changes)

### Changed

- Refactored diff open logic (removed redundant code and imports)
- Improved commit/amend/push flow clarity and error handling
- Commit & Push now behaves correctly in all edge cases

### Fixed

- Amend + push flow now correctly handles message-only amend
- Push now works when local commits exist but no files are staged
- Diff view now works correctly when HEAD does not exist (initial commit case)
- Removed redundant diff handling logic
- Improved diff tab tracking stability
- Multiple minor logic bugs in commit/push handling

---

## [0.0.5] - 2026-02-17

### Added

- Diff view when clicking a file in the Changelists view (HEAD <-> Working Tree)
- Commit message draft persistence (message and amend flag are preserved)

### Fixed

- Inline error message when attempting to commit with no staged files (displayed in commit panel instead of popup)

---

## [0.0.4] - 2026-02-17

### Added

- Setting to enable/disable the “Add to Git?” prompt on new file creation
- New-file creation prompt workflow (Add / Keep Unversioned / Disable)

### Fixed

- Discard now confirms before deleting newly added staged files

---

## [0.0.3] - 2026-02-16

### Added

- Worklist file-count badge in the Changelists view
- Extended unit test coverage
- Internal refactoring to improve testability

### Changed

- Files now displayed in Source Control style (filename with folder as description)

### Fixed

- Unversioned files now detected via `git ls-files --others --exclude-standard`
- Untracked directories are no longer shown as placeholder entries
- Improved reconciliation logic for untracked vs tracked changes

---

## [0.0.2] - 2026-02-15

### Added

- Discard button in the changelist

### Fixed

- Correct staged count detection
- Push now sets upstream for new branches automatically

---

## [0.0.1] - 2026-02-13

### Added

- Changelists view
- Custom commit panel
- Git staging support (`git add`, `git restore --staged`)
- Commit and amend support
- Push and force-with-lease confirmation
- Per-changelist stash creation
- Dedicated Stashes view
- Apply / Pop / Delete stash actions
- Move files between changelists
- Move group to changelist
- Move selected files to changelist
- Improved reconciliation with Git status
- Clean stash label formatting
- Context menu + inline icon actions
- Error handling improvements

---
