# Change Log

All notable changes to the "Git Worklists" extension are documented in this file.

This project follows the principles of [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
and adheres to Semantic Versioning.

---

## [Unreleased]

- No changes yet

---

## [0.3.3] - 2026-02-21

### Changed

* Refactored commit and push webview implementation for improved structure and maintainability

### Fixed

* Fixed an issue where committing after modifying already staged files could result in outdated or empty content being pushed

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
