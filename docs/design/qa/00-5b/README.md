# Phase 00.5B evidence

The original reference is independent of the application. Do not replace it with screenshots from the implementation.

## Reproduce

Use the repository's pinned dependencies and build the app first. Run these in separate terminals from the repository root:

```sh
ATLAS_REFERENCE_ZIP='/path/to/Handoff specification.zip' pnpm qa:reference
pnpm --filter @atlas/web start --port 3100
pnpm qa:visual
```

The first command extracts the original archive into ignored `.qa-artifacts/reference-runtime` and serves it only on `127.0.0.1:3200`. Its one QA bridge exposes the prototype's existing instance for state selection; the original HTML is also retained unchanged. The third command captures both servers with Playwright Chromium, saves `.qa-artifacts/phase-00-5b/manifest.json` and `comparison.json`, and fails on application overflow or browser errors. The prototype needs its upstream UMD/font/icon resources available. Do not publish the reference runtime.

Capture filenames:

- `reference-{theme}-1440-{screen}.png`: 15 screens plus Open/Focus/Panel/history/share, both themes (40).
- `implementation-{theme}-{width}-{screen}.png`: 15 screens × six viewports × two themes (180).
- Additional implementation overlay/picker/drawer captures: 26.
- `before-*`: original failing docked manuscript, picker and dialog-shortcut reproductions, retained locally from the initial audit.

The committed `artifact-manifest.json` records screenshot hashes, dimensions, fonts, browser and tested source identity. `comparison.json` records raw RGB differences by sidebar/header/canvas for the 30 corresponding 1440px screen/theme pairs. These values are diagnostic and do not constitute a visual fidelity percentage. Original uploaded PNGs were also inspected; their archive is identified by SHA-256 in the QA report.

Six reviewed implementation baselines are committed under `tests/e2e/phase-00-5b.spec.ts-snapshots/`. `pnpm test:e2e` checks them automatically; only use `--update-snapshots` after comparing the change with the original handoff. The baseline was rendered on macOS; platform-independent filenames allow CI to compare it, but Linux font rasterization has not been validated in this session.

The generated runtime and large screenshot matrix are intentionally ignored by Git, ESLint and Prettier. Test/capture source, reports, manifests and six approved baselines remain reviewable in Git.
