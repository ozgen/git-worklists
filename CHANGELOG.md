# Change Log

All notable changes to the "Git Worklists" extension are documented in this file.

This project follows the principles of [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
and adheres to Semantic Versioning.

---

## [Unreleased]

* No changes yet

---

## [0.0.4] - 2026-02-17

### Added
* Setting to enable/disable the “Add to Git?” prompt on new file creation
* New-file creation prompt workflow (Add / Keep Unversioned / Disable)

### Fixed
* Discard now confirms before deleting newly added staged files

---

## [0.0.3] - 2026-02-16

### Added

* Worklist file-count badge in the Changelists view
* Extended unit test coverage
* Internal refactoring to improve testability

### Changed

* Files now displayed in Source Control style (filename with folder as description)

### Fixed

* Unversioned files now detected via `git ls-files --others --exclude-standard`
* Untracked directories are no longer shown as placeholder entries
* Improved reconciliation logic for untracked vs tracked changes

---

## [0.0.2] - 2026-02-15

### Added

* Discard button in the changelist

### Fixed

* Correct staged count detection
* Push now sets upstream for new branches automatically

---

## [0.0.1] - 2026-02-13

### Added

* Changelists view
* Custom commit panel
* Git staging support (`git add`, `git restore --staged`)
* Commit and amend support
* Push and force-with-lease confirmation
* Per-changelist stash creation
* Dedicated Stashes view
* Apply / Pop / Delete stash actions
* Move files between changelists
* Move group to changelist
* Move selected files to changelist
* Improved reconciliation with Git status
* Clean stash label formatting
* Context menu + inline icon actions
* Error handling improvements

---
