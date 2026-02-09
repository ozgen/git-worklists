# Git Worklists

**Git Worklists** is a Visual Studio Code extension that provides a lightweight, Git-focused workflow for organizing changes, staging files, and committing them through a custom UI.

It is designed for developers who want **explicit control over staging and committing**, without relying on VS Code’s built-in Source Control view.

---

## Features

### Changelists View

* Displays **Changed** and **Unversioned** files grouped clearly
* File-level and group-level **checkboxes** for staging / unstaging
* Visual decorations for file status
* Click files to open them directly

### Commit Panel

* Custom **Commit Message** text area
* **Amend** checkbox
* **Commit** and **Commit & Push** buttons
* Live indicator showing how many files are staged
* Clear error messages when commit or push fails

### Git Integration

* Uses Git CLI directly
* Supports:

  * `git add`
  * `git restore --staged`
  * `git commit`
  * `git commit --amend`
  * `git push`

---

## Requirements

* Git must be installed and available in your PATH
* A workspace opened inside a Git repository
* VS Code **v1.108.0** or newer

---

## Usage

1. Open a Git repository in VS Code
2. Open **Git Worklists** from the Activity Bar
3. Use checkboxes to stage or unstage files
4. Enter a commit message in the **Commit** panel
5. (Optional) Enable **Amend**
6. Click **Commit** or **Commit & Push**

---

## Extension Settings

This extension does **not** add any VS Code settings yet.

---

## Known Issues

* Push may fail if the remote branch is ahead
  → Resolve with `git pull --rebase` before pushing
* Merge conflicts must be resolved manually in the editor
* No support yet for:

  * Multiple repositories
  * Partial staging (hunks / lines)
  * Commit templates

---

## Roadmap

Planned improvements:

* Better amend + push handling
* Push error recovery guidance
* Optional auto-pull before push
* Improved icons and visual polish
* Multi-repo support

---

## Release Notes

### 0.0.1

* Initial release
* Changelists view
* Custom commit panel
* Git staging, commit, amend, and push support

---

## Development Notes

This extension intentionally avoids VS Code’s built-in SCM provider and implements its own workflow using:

* Tree views
* Webview commit panel
* Git CLI commands

---

**Enjoy using Git Worklists 🚀**

---
