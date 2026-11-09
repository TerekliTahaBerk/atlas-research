# Contributing

## Branches

Use main as the PR base. Create short-lived feat/*, fix/*, chore/* or docs/* branches. The prepared Phase 00 branch is feat/phase-00-foundation. No permanent develop branch is required.

Use descriptive commits and focused pull requests. Squash merge when the scoped work and its verification are complete; merged working branches may be deleted automatically.

archive/pre-restart-2026-11-09 is immutable historical evidence. To inspect an old branch, create a new recovery branch at the SHA in docs/repository/legacy-refs.json. Do not merge the archive wholesale into the new implementation.

## Reviews and checks

A solo maintainer must be able to merge their own PR: no mandatory second-person approval is assumed. Require resolved discussions, protect main from force pushes/deletion, and introduce named required checks only after those checks exist and have run successfully.

GitHub Actions billing has previously blocked this account. The baseline intentionally contains no Actions workflow. Phase 00 must define a reproducible local verification entry point and the later Coolify build gate without requiring paid Actions or placing a GitHub runner on the production host.

## Scope

Phase 00 covers product/design/architecture documents and validation of the supplied prototype. Application implementation starts in Phase 01. See docs/ROADMAP.md.

Do not commit credentials, real research datasets, build output, node_modules or local environment files. Do not select a license or change repository visibility without a user decision.

## Pull request evidence

Describe the problem and resulting behavior, phase scope, actual verification, and deployment/database impact. Use PASS / FAIL / NOT RUN accurately. Documentation-only changes do not require invented application tests.
