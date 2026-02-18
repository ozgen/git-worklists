# Git Worklists

[![CI](https://github.com/ozgen/git-worklists/actions/workflows/ci.yml/badge.svg)](https://github.com/ozgen/git-worklists/actions/workflows/ci.yml)
[![Release](https://github.com/ozgen/git-worklists/actions/workflows/release.yml/badge.svg)](https://github.com/ozgen/git-worklists/actions/workflows/release.yml)
[![codecov](https://codecov.io/gh/ozgen/git-worklists/branch/main/graph/badge.svg)](https://codecov.io/gh/ozgen/git-worklists)
[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/ozgen.git-worklists)](https://marketplace.visualstudio.com/items?itemName=ozgen.git-worklists)

---

**Git Worklists** is a Visual Studio Code extension that provides a lightweight, Git-focused workflow for organizing changes, staging files, committing, pushing, and managing stashes, all through a dedicated, predictable UI.

It is designed for developers who want **explicit control over staging, commits, amend, push, and stash workflows**, without relying on VS Code’s built-in Source Control view.

---

## Demo

![Git Worklists demo](media/demo.gif)

---

# Features

---

## Changelists View

A structured way to organize and stage changes.

- Displays **Changes** and **Unversioned** files clearly

- Shows **file count badges** per worklist

- Unversioned files are detected via `git ls-files --others --exclude-standard`

- Untracked directories are not shown as placeholder entries

- Files are displayed in Source Control style:
  - **File name** as primary label
  - **Folder path** shown as description

- Create, move, and delete **custom changelists**

- Move files between changelists (per file or per group)

- Move selected files to another changelist

- File-level and group-level **checkboxes** for staging / unstaging
- State-aware inline action:
  - Shows **Stage** when file is unstaged
  - Shows **Unstage** when file is staged
- Stage All / Unstage All per changelist
- Visual file decorations (badges)

- Visual file decorations (badges)

### Diff Integration

- Click a file row to open a **HEAD <-> Working Tree diff**

- Clicking a file does NOT change staging state

- Diff view works correctly even when HEAD does not yet exist (initial commit case)

- Dedicated **Close Diff Tabs** button in the view title

- Optional automatic closing of diff tabs after:
  - Commit
  - Push

- Automatic reconciliation with Git status

- Files move automatically between:
  - **Unversioned** when newly created
  - **Changes** when tracked / modified

- Optional prompt when new files are created:
  - **Add to Git**
  - **Keep Unversioned**
  - **Disable prompt**

- Safe behavior when staging / unstaging newly created files

- Newly added (staged) files require confirmation before permanent deletion

All staging state reflects the actual Git index.

---

## Commit Panel

A focused commit experience separate from VS Code SCM.

- Custom **Commit Message** field
- Commit message draft is automatically preserved
- Live staged file counter
- Inline warning when attempting to commit with no staged files
- **Amend support**
  - Supports message-only amend (no staged files required)
  - Handles empty-amend edge cases safely

- **Commit**
- **Commit & Push**
- **Push-only support** (push existing local commits even if nothing is staged)
- Safe confirmation before force-with-lease push
- Automatic upstream setup for new local branches
- Clear and actionable error feedback

Commit behavior is predictable and aligned with Git CLI behavior.

---

## Stash Management

Integrated Git stash support directly inside Git Worklists.

### Create Stash (Per Changelist)

- Stash all tracked changes from a selected changelist
- Automatically tags stashes with their originating changelist
- Optional custom stash message
- Safe handling of untracked files (skipped unless explicitly supported)
- Immediate UI refresh after stash

### Stash List View

- Dedicated **Stashes** view
- Clean, readable labels (no raw `stash@{0}` noise)
- Displays originating changelist (e.g. `[CL:changes]`)
- Shows branch context
- Hover tooltip includes full Git reference

### Stash Actions

Per-stash context actions:

- **Apply Stash** – restore changes without removing stash
- **Pop Stash** – restore changes and remove stash
- **Delete Stash** – drop stash with confirmation
- Refresh support

---

## Git Integration

Uses **Git CLI directly** (no VS Code SCM provider).

Supported operations:

- `git add`
- `git restore --staged`
- `git commit`
- `git commit --amend`
- `git push`
- `git stash push`
- `git stash list`
- `git stash apply`
- `git stash pop`
- `git stash drop`
- `git ls-files --others --exclude-standard`

All operations are executed per repository using repo-relative paths.

---

# Requirements

- Git installed and available in PATH
- Workspace opened inside a Git repository
- VS Code **v1.108.0** or newer

---

# Usage

---

## Changelists & Commits

1. Open a Git repository in VS Code
2. Open **Git Worklists** from the Activity Bar
3. Stage or unstage files using checkboxes
4. Organize files into custom changelists
5. Enter a commit message
6. (Optional) enable **Amend**
7. Click:
   - **Commit**
   - **Commit & Push**
   - Or push existing commits without staging new changes

---

## Stashes

1. Right-click a changelist -> **Stash changes…**
2. Enter an optional stash message
3. Open the **Stashes** view
4. Apply, Pop, or Delete stashes as needed

---

# Extension Settings

This extension contributes the following settings:

### `gitWorklists.promptOnNewFile`

- **Type:** boolean
- **Default:** `true`
- Shows a prompt when new files are created:
  - Add to Git
  - Keep Unversioned
  - Disable prompt

---

### `gitWorklists.ui.closeDiffTabsAfterCommit`

- **Type:** boolean
- **Default:** `false`
- Automatically closes diff tabs opened by Git Worklists after a successful commit.

---

### `gitWorklists.ui.closeDiffTabsAfterPush`

- **Type:** boolean
- **Default:** `false`
- Automatically closes diff tabs opened by Git Worklists after a successful push.

---

# Known Limitations

- No partial staging (no hunk / line staging)
- No multi-repository support
- Merge conflicts must be resolved manually
- Untracked files are not included in per-changelist stash by default
- GitHub / GitLab PR features are not included

---

# Roadmap

Planned improvements:

- Include-untracked option for stash
- Multi-repository support
- Partial staging (hunk-based)
- Improved visual polish
- Extended test coverage
- Performance optimizations

---

# Release Notes

## 0.2.0

### Added

- Stage All / Unstage All per changelist
- State-aware inline Stage / Unstage actions

### Changed

- File row click now opens diff only
- Staging is handled exclusively via checkbox or inline action
- Group rows no longer toggle staging on click

### Fixed

- Removed accidental staging when clicking file rows
- Correct inline icon visibility based on staged state

## 0.1.0

### Added

- Close Diff Tabs button in Changelists view
- Settings to automatically close diff tabs after commit or push
- Push-only support when no staged files exist
- Support for message-only amend

### Changed

- Refactored diff handling logic (removed redundant code and imports)
- Improved commit / amend / push flow consistency

### Fixed

- Amend + push flow now correctly handles message-only amend
- Push works correctly when local commits exist but nothing is staged
- Diff view works correctly when HEAD does not exist
- Multiple edge cases in commit and push handling

---

## 0.0.5

### Added

- Diff view when clicking files in the Changelists view (HEAD ↔ Working Tree)
- Commit message draft persistence (message and amend flag)

### Changed

- Inline error message when committing with no staged files

---

## 0.0.4

### Added

- Optional “Add to Git?” prompt on new file creation
- Setting to enable/disable new-file prompt

### Fixed

- Discard now confirms before deleting newly added staged files

---

## 0.0.3

### Added

- Worklist file-count badge in Changelists view
- Extended unit test coverage
- Improved internal testability through refactoring

### Fixed

- Unversioned files now detected via `git ls-files --others --exclude-standard`
- Untracked directories are no longer displayed as placeholder entries
- Files now display in Source Control style (filename + folder description)
- Improved reconciliation behavior for untracked vs tracked changes

---

## 0.0.2

### Added

- Discard action for files directly from the Changelists view

### Fixed

- Correct staged file detection (UI now accurately reflects Git index state)
- Automatic upstream setup when pushing new local branches
- Improved amend behavior when commit would otherwise be empty

---

## 0.0.1

### Added

- Changelists view
- Custom commit panel
- Git staging, commit, amend, push support
- Per-changelist stash creation
- Dedicated Stashes view
- Apply / Pop / Delete stash actions
- Move files between changelists
- Move group to changelist
- Move selected files to changelist
- Improved reconciliation with Git status
- Clean stash label formatting
- Context menu + icon actions
- Error handling improvements

---

# Development Philosophy

Git Worklists intentionally avoids VS Code’s built-in SCM provider.

Instead, it builds a focused, predictable workflow using:

- Tree Views
- Commit UI
- Git CLI

The goal is **clarity, explicit control, and zero hidden magic**.

---

**Git Worklists - focused Git workflows without surprises. 🚀**

---
