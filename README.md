# Git Worklists

**Git Worklists** is a Visual Studio Code extension that provides a lightweight, Git-focused workflow for organizing changes, staging files, committing them, and reviewing pull requests — all through a custom UI.

It is designed for developers who want **explicit control over staging, committing, and PR reviews**, without relying on VS Code’s built-in Source Control or PR extensions.

---

# Features

---

## Changelists View

A structured way to organize and stage changes.

* Displays **Changes** and **Unversioned** files clearly
* Create, move, and delete **custom changelists**
* File-level and group-level **checkboxes** for staging / unstaging
* Visual file decorations
* Click files to open instantly
* Automatic reconciliation with Git status
* Files move automatically between:

  * **Unversioned**  when newly created
  * **Changes**  when tracked / modified
* Safe behavior when staging / unstaging newly created files

---

## Commit Panel

A focused commit experience separate from VS Code SCM.

* Custom **Commit Message** field
* **Amend** support (with safe handling)
* **Commit** and **Commit & Push**
* Live staged file counter
* Clear error feedback
* Confirmation for force-with-lease when amending

---

## Pull Request Reviews (GitHub)

Native Pull Request review support powered by the GitHub CLI (`gh`).

---

### Pull Requests View

* Lists open pull requests
* Draft PRs clearly indicated
* Lazy loaded
* Clean navigation experience

---

### PR Details View

* View metadata and description
* Browse changed files
* View comments and reviews
* Open diffs directly in VS Code
* Open PR in browser

---

### Inline Review Support

* Add **inline comments** directly from diff view
* Supports:

  * Commenting on added (`+`) lines
  * Commenting on context lines inside diff hunks
* Reply to threads
* Resolve / unresolve threads
* Clear validation when a line is not commentable
* Accurate diff position handling (GitHub compatible)

---

## Git Integration

Uses **Git CLI directly** (no VS Code SCM provider).

Supported operations:

* `git add`
* `git restore --staged`
* `git commit`
* `git commit --amend`
* `git push`
* `git fetch` (for PR diffs)
* `git diff` (for accurate inline comment positioning)

---

# Requirements

* Git installed and available in PATH
* Workspace opened inside a Git repository
* VS Code **v1.108.0** or newer
* For Pull Request features:

  * GitHub CLI (`gh`) installed
  * `gh auth login` completed

---

# Usage

---

## Changelists & Commits

1. Open a Git repository in VS Code
2. Open **Git Worklists** from the Activity Bar
3. Stage or unstage files using checkboxes
4. Organize files into custom changelists if desired
5. Enter a commit message
6. (Optional) enable **Amend**
7. Click **Commit** or **Commit & Push**

---

## Pull Request Reviews

1. Open **Pull Requests** in Git Worklists
2. Select a PR to load details
3. Open a file to view its diff
4. Right-click a line in the diff to add an inline comment
5. Approve or request changes directly from VS Code
6. Reply to or resolve review threads

---

# Extension Settings

This extension does not contribute any VS Code settings yet.

---

# Known Limitations

* No partial staging (no hunk / line staging)
* No multi-repository support
* Merge conflicts must be resolved manually
* GitHub only (no GitLab support yet)
* Large or binary diffs cannot receive inline comments (GitHub limitation)

---

# Roadmap

Planned improvements:

* Reviewer assignment support
* PR review summary improvements
* GitLab support
* Multi-repository support
* Improved visual polish
* Extended test coverage
* Additional workflow optimizations

---

# Release Notes

## 0.0.1

* Initial release
* Changelists view
* Custom commit panel
* Git staging, commit, amend, push
* GitHub Pull Request review support
* Approve / request changes from VS Code
* Inline PR comments with diff-aware positioning
* Thread replies and resolution
* PR details and file diff navigation
* Improved error handling and validation

---

# Development Philosophy

Git Worklists intentionally avoids VS Code’s built-in SCM and PR providers.

Instead, it builds a focused, predictable workflow using:

* Tree Views
* Webview Commit Panel
* Git CLI
* GitHub CLI (`gh`)

The goal is **clarity, explicit control, and zero hidden magic**.

---

**Git Worklists - focused Git workflows without surprises. 🚀**

---
