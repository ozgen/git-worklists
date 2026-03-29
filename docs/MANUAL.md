# Git Worklists Manual

This document provides detailed behavior, workflows, and advanced usage.

---

## Workspace Support

Git Worklists supports workspaces that contain multiple Git repositories.

- Supports workspaces containing multiple Git repositories
- Active repository can be switched from the status bar
- Repository discovery is cached for faster switching
- Only one repository is active in the UI at a time

---

## Changelists View

A structured way to organize and stage changes.

- Displays **Changes** and **Unversioned** files clearly
- Shows **file count badges** per worklist and a total badge on the Activity Bar icon
- Unversioned files are detected via `git ls-files --others --exclude-standard`
- Untracked directories are not shown as placeholder entries

### File Presentation

- **File name** as primary label
- **Folder path** shown as description

### Changelist Operations

- Create, move, **rename**, and delete **custom changelists**
- Move files between changelists (per file or per group)
- **Drag and drop** files or entire changelist groups onto another changelist
- Move selected files to another changelist

### Staging

- File-level and group-level **checkboxes** for staging / unstaging

- State-aware inline action:
  - Shows **Stage** when file is unstaged
  - Shows **Unstage** when file is staged

- **Partial staging support**
  - Stage only selected lines directly from the editor or diff view
  - Files with partially staged changes are visually indicated

- Stage All / Unstage All per changelist

### Decorations

- Visual file decorations (badges)
- Decorations are automatically refreshed after commit or push

---

## File Context Menu

- **Open Diff** (HEAD <-> Working Tree)
- **Open Source File**
- **Discard**
- **Move to Changelist**

### Move Staged Files

- **Move Staged Files to Another Changelist**
  - From a changelist: only staged files in that changelist
  - From a staged file: all staged files

- **Move Staged Files into Stash**
  - From a changelist: only staged files in that changelist
  - From a staged file: all staged files
  - Aborts safely if the message dialog is cancelled

### Staged-only Behavior

- Only staged files are affected
- Unstaged files remain untouched

---

## Diff Integration

- Click a file row to open a **HEAD <-> Working Tree diff**
- Clicking a file does NOT change staging state

### Supported Cases

- Initial commit (no parent commit)
- Newly added files
- Renamed files
- Missing parent references

### Diff Controls

- Dedicated **Close Diff Tabs** button
- Optional automatic closing after:
  - Commit
  - Push

### Git Synchronization

- Automatic reconciliation with Git status

- Files move automatically between:
  - **Unversioned** when newly created
  - **Changes** when tracked / modified

### New File Handling

Optional prompt when new files are created:

- Add to Git
- Keep Unversioned
- Disable prompt

### Safety

- Safe behavior when staging / unstaging newly created files
- Newly added (staged) files require confirmation before permanent deletion

- Changelist-level **Discard All Changes**:
  - Categorized confirmation (unversioned / newly added / tracked)
  - Safe bulk restore using `git restore`
  - Permanent deletion confirmation for unversioned files

All staging state reflects the actual Git index.

---

## Partial Line Staging

Stage individual lines directly from the editor or diff view.

1. Open a file diff or source file
2. Select the lines you want to stage
3. Right-click -> Stage Selected Lines

Only the selected changes are staged.

Files with mixed state are marked as **Partially Staged**.

---

## Commit Panel

A focused commit experience separate from VS Code SCM.

### Core Behavior

- Custom **Commit Message** field
- Commit message draft is automatically preserved

### Conventional Commits Integration

- Generate structured commit messages
- Automatically syncs into commit panel
- Button hidden if extension is not installed
- Prevents Source Control view from stealing focus

### Commit Actions

- **Commit**
- **Commit & Push**
- **Push-only support**

### Amend

- Supports message-only amend (no staged files required)
- Handles empty-amend edge cases safely
- Automatically resets after successful operation

### Push Behavior

- Safe confirmation before force-with-lease push
- Automatic upstream setup for new branches

- Push preview panel:
  - Shows commit hashes and subjects
  - Requires explicit confirmation

### Feedback

- Live staged file counter
- Inline warning when committing with no staged files
- Clear and actionable error feedback

Commit behavior aligns with Git CLI.

---

## Stash Management

Integrated Git stash support.

### Create Stash (Per Changelist)

- Stash all tracked changes from a selected changelist
- Supports **Unversioned changelist**

Untracked files are stashed using:

```

git stash push --include-untracked

```

Note:
Git may include additional untracked files. A confirmation warning is shown.

- Automatically tags stashes with originating changelist
- Optional custom message
- Immediate UI refresh

---

### Stash List View

- Dedicated **Stashes view**
- Expandable stash entries
- Shows file list per stash

- Status-aware nodes (A / M / D / R / C)
- Clean labels (no raw `stash@{0}`)
- Displays originating changelist
- Shows branch context
- Hover tooltip includes full Git reference

---

### Stash File Preview

- Click a file to open diff preview
- Compares:
  - stash base commit (`stash^1`)
  - stash contents

- Newly added files open as single-file preview
- Safe handling of large files

---

### Stash Actions

- Apply (restore without removing stash)
- Pop (restore and remove)
- Delete (drop stash)
- Refresh

Files return to their originating changelist.

---

## Git Integration

Uses **Git CLI directly**.

Supported operations:

- `git add`
- `git apply --cached`
- `git restore --staged`
- `git restore --staged --worktree`
- `git commit`
- `git commit --amend`
- `git push`
- `git push --force-with-lease`
- `git stash push`
- `git stash push --include-untracked`
- `git stash list`
- `git stash apply`
- `git stash pop`
- `git stash drop`
- `git diff --name-status`
- `git ls-files --others --exclude-standard`

All operations use repo-relative paths.

---

## Bookmarks

Quick navigation across files using numbered bookmarks (1–9), similar to IntelliJ.

### Core Behavior

- Supports **9 bookmark slots (1–9)**

- Each slot holds **one location**

- A bookmark stores:
  - file (repo-relative)
  - line
  - column

- Bookmarks are **persisted per repository**

- Switching repository switches bookmark set automatically

---

### Setting Bookmarks

You can set bookmarks in multiple ways:

- **Keyboard**
  - `Ctrl + Shift + 1–9` -> Set bookmark

- **Editor right-click**
  - `GW: Set Bookmark…`
  - `GW: Clear Bookmark…`
  - `GW: Clear All Bookmark`
    If a slot is already used:

- A confirmation dialog is shown
- You can **replace or cancel**

---

### Jumping to Bookmarks

- `Ctrl + 1–9` -> Jump to bookmark

Behavior:

- Opens the file if not open
- Moves cursor to saved position
- Reveals location in editor

---

### Clearing Bookmarks

- Clear single bookmark:
  - Command: `Clear Bookmark`
  - Slot-specific commands available

- Clear all bookmarks:
  - View title action
  - Context menu
  - Confirmation required

---

### Visual Indicators

- Bookmarks are shown in the **editor gutter**

- Each slot has its own icon (1–9)

- Decorations include:
  - gutter icon
  - subtle line highlight

- Decorations update automatically when:
  - bookmark is set
  - bookmark is cleared
  - editor becomes visible

---

### Behavior Notes

- Works on **any file inside the repository**
  - not limited to changed files

- Bookmarks outside repo are ignored
- Line numbers are safely clamped if file changes
- Decorations are editor-only (not shown in tree view)

---

### Keybindings

Default:

- `Ctrl + Shift + 1–9` -> Set bookmark
- `Ctrl + 1–9` -> Jump to bookmark

Users can override keybindings via VS Code settings.

---

## Usage

### Changelists & Commits

1. Open a Git repository in VS Code
2. Open Git Worklists from the Activity Bar
3. Stage or unstage files
4. Organize files into changelists
5. Enter a commit message
6. (Optional) enable Amend
7. Commit or push

---

### Stashes

1. Right-click a changelist -> Stash changes
2. Enter optional message
3. Open Stashes view
4. Expand stash
5. Preview files
6. Apply, Pop, or Delete

---

## Settings

### gitWorklists.promptOnNewFile

- Type: boolean
- Default: true

Shows prompt when new files are created.

---

### gitWorklists.ui.closeDiffTabsAfterCommit

- Type: boolean
- Default: false

Auto-closes diff tabs after commit.

---

### gitWorklists.ui.closeDiffTabsAfterPush

- Type: boolean
- Default: false

Auto-closes diff tabs after push.

---

## Known Limitations

- Only one active repository in UI
- Must switch repositories via status bar
- Merge conflicts handled manually
- No PR integration

---

## Roadmap

- Improve refresh performance for large repositories
- UI/UX refinements

---

## Design Principles

- Explicit over implicit behavior
- No hidden Git state changes
- Alignment with Git CLI
- Predictable workflows

---
