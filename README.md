# Git Worklists

**Git Worklists** is a Visual Studio Code extension that provides a lightweight, Git-focused workflow for organizing changes, staging files, committing them, and **reviewing pull requests** through a custom UI.

It is designed for developers who want **explicit control over staging, committing, and PR reviews**, without relying on VS Code’s built-in Source Control or PR extensions.

---

## Features

## Changelists View

* Displays **Changes** and **Unversioned** files grouped clearly
* User-defined **changelists** (create, move, delete)
* File-level and group-level **checkboxes** for staging / unstaging
* Visual decorations for file status
* Click files to open them directly
* Automatic reconciliation with Git status

---

## Commit Panel

* Custom **Commit Message** text area
* **Amend** checkbox
* **Commit** and **Commit & Push** buttons
* Live indicator showing how many files are staged
* Clear error messages when commit or push fails

---

## Pull Request Reviews (GitHub)

Git Worklists includes **native Pull Request review support** powered by the GitHub CLI (`gh`).

### Pull Requests View

* Lists **open pull requests**
* Draft PRs are clearly indicated
* Lazy-loaded and collapsed by default

### PR Details View

* View PR metadata, description, comments, and reviews
* Browse changed files
* Open file diffs directly in VS Code
* Open PR in browser

### Review Actions (inside VS Code)

* **Approve pull requests**
* **Request changes**
* **Add review comments**
* **Add inline comments on specific lines**

  * Inline comments can be added from diff views
* Clear success and error notifications

---

## Git Integration

* Uses **Git CLI** directly (no VS Code SCM provider)
* Supports:

  * `git add`
  * `git restore --staged`
  * `git commit`
  * `git commit --amend`
  * `git push`
  * `git fetch` (for PR diffs)

---

## Requirements

* Git must be installed and available in your PATH
* A workspace opened inside a Git repository
* VS Code **v1.108.0** or newer
* **For Pull Request features:**

  * GitHub CLI (`gh`) installed
  * `gh auth login` completed

---

## Usage

### Changelists & Commits

1. Open a Git repository in VS Code
2. Open **Git Worklists** from the Activity Bar
3. Use checkboxes to stage or unstage files
4. Organize files into changelists if desired
5. Enter a commit message in the **Commit** panel
6. (Optional) Enable **Amend**
7. Click **Commit** or **Commit & Push**

### Pull Request Reviews

1. Open **Pull Requests** in Git Worklists
2. Select a PR to load its details
3. Review files and comments
4. Approve, request changes, or add comments
5. Add inline comments by right-clicking a line in a diff file

---

## Extension Settings

This extension does **not** add any VS Code settings yet.

---

## Known Limitations

* Inline PR comments must be added from **workspace files**, not diff editors
* No partial staging (hunks / lines)
* No multi-repository support
* Merge conflicts must be resolved manually
* GitLab is not supported yet (GitHub only)

---

## Roadmap

Planned improvements:

* Inline review comments shown in PR Details view
* GitLab support
* Reviewer assignment
* Better push / rebase guidance
* Multi-repo support
* Additional unit test coverage
* Further visual polish

---

## Release Notes

### 0.0.1

* Initial release
* Changelists view
* Custom commit panel
* Git staging, commit, amend, and push support
* GitHub Pull Request review support
* Approve / request changes from VS Code
* Inline PR comments
* PR details and file diff navigation
* Improved UI and feedback

---

## Development Notes

This extension intentionally avoids VS Code’s built-in SCM and PR providers and implements its own workflow using:

* Tree views
* Webview commit panel
* Git CLI
* GitHub CLI (`gh`)

This design prioritizes **clarity, explicit control, and predictable behavior**.

---

**Git Worklists - focused Git workflows without hidden magic. 🚀**

---
