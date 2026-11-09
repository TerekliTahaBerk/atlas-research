# Repository preparation verification — 9 November 2026

Status: preparation complete. Phase 00 has not started.

## Verified repository state

- Default branch: main.
- Active working branch: feat/phase-00-foundation.
- Immutable legacy branch: archive/pre-restart-2026-11-09.
- All 25 original branch names removed after confirming every tip is a direct parent of archive checkpoint 25b9b583172dcfda60f701d7afefef7b00ab719e.
- Legacy PR #24 closed without merging.
- Active tree contains only restart documentation and repository configuration, not an application.
- Original Git history is retained and the SHA mapping is committed in repository/legacy-refs.json.

## GitHub settings

Verified in the saved GitHub settings and repository API:
- Squash merge only; merge-commit and rebase merging disabled.
- Suggest updating PR branches enabled.
- Automatically delete merged head branches enabled.
- main requires a PR and resolved conversations, enforces linear history, and applies rules to administrators.
- main disallows force pushes and branch deletion.
- No mandatory second-person review and no invented required status checks.
- archive/* is locked read-only, enforces rules for administrators, and disallows force pushes/deletion.
- No GitHub Actions workflow or paid-runner dependency added.

The GitHub connector can read general repository settings but not administrative branch-protection details; saved protection controls were therefore verified in the user's authenticated GitHub settings UI.

## Legacy deployment connection

The baseline commit received an old Vercel failure status because the pre-existing web project was paused. This was not an application build/test failure.

The web project's Git settings explicitly linked TerekliTahaBerk/atlas-research. That connection was removed and the UI now states the project is not connected to a Git repository. Existing Vercel project settings and deployments were preserved. No new deployment or database was created.

A historical failing status on the baseline commit may remain visible; it is not a required merge gate.

## Verification

PASS: all 25 archival parents match the original branch-tip manifest; original master tree matches the archive tree.
PASS: default branch and final branch inventory.
PASS: stored merge preferences and saved branch protections.
PASS: local Markdown links resolve and legacy JSON parses.
PASS: no application manifest, lockfile, Dockerfile or workflow introduced.

NOT RUN / not applicable: application install, lint, unit tests, build, browser product tests, migration and deployment. The repository contains no application yet.

## Next action

Execute docs/prompts/PHASE_00.md on feat/phase-00-foundation, open a PR, and stop at the end of Phase 00.
