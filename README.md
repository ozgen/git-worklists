# Git Worklists

**Git Worklists** is a Visual Studio Code extension that provides a lightweight, Git-focused workflow for organizing changes, staging files, and committing all through a custom UI.

It is designed for developers who want **explicit control over staging and commits**, without relying on VS Code’s built-in Source Control view.

---

# Features

---

## Changelists View

A structured way to organize and stage changes.

* Displays **Changes** and **Unversioned** files clearly
* Create, move, and delete **custom changelists**
* File-level and group-level **checkboxes** for staging / unstaging
* Visual file decorations (badges)
* Click files to open instantly
* Automatic reconciliation with Git status
* Files move automatically between:

  * **Unversioned** when newly created
  * **Changes** when tracked / modified
* Safe behavior when staging / unstaging newly created files

---

## Commit Panel

A focused commit experience separate from VS Code SCM.

* Custom **Commit Message** field
* **Amend** support (with safe handling)
* **Commit** and **Commit & Push**
* Live staged file counter
* Clear error feedback

---

## Git Integration

Uses **Git CLI directly** (no VS Code SCM provider).

Supported operations:

* `git add`
* `git restore --staged`
* `git commit`
* `git commit --amend`
* `git push`

---

# Requirements

* Git installed and available in PATH
* Workspace opened inside a Git repository
* VS Code **v1.108.0** or newer

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

# Extension Settings

This extension does not contribute any VS Code settings yet.

---

# Known Limitations

* No partial staging (no hunk / line staging)
* No multi-repository support
* Merge conflicts must be resolved manually
* GitHub / GitLab PR features are not included

---

# Roadmap

Planned improvements:

* Git stash management (create / apply / pop / drop)
* Multi-repository support
* Partial staging (hunk-based)
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

---

# Development Philosophy

Git Worklists intentionally avoids VS Code’s built-in SCM provider.

Instead, it builds a focused, predictable workflow using:

* Tree Views
* Commit UI
* Git CLI

The goal is **clarity, explicit control, and zero hidden magic**.

---

**Git Worklists - focused Git workflows without surprises. 🚀**

---
