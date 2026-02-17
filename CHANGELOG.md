# Change Log

All notable changes to the "Git Worklists" extension are documented in this file.

This project follows the principles of [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
and adheres to Semantic Versioning.

---

## [Unreleased]

- No changes yet

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
