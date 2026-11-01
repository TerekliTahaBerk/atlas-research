# ADR 0018: Neutral greys, indigo accent and all-Geist type

Status: accepted · 2026-11-01

## Context

A new Claude Design handoff (`Atlas.dc.html` and _Atlas Handoff_ notes) replaces the Phase 00.5A visual language: neutral greys instead of warm green-tinted ones, an indigo accent instead of green, and Geist for titles and reading text instead of Cormorant Garamond and Lora. Layout, dimensions, components, AI modes and motion are unchanged from the 00.5A handoff, so this is a token and typography change, not a structural one.

The two handoff files conflict with each other and with repository rules:

| Conflict            | Handoff notes                                             | Prototype CSS                                           | Resolution                              |
| ------------------- | --------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------- |
| Light palette       | Warm ivory (`--sb #F2F1EB`, `--bg #FAF9F6`, …)            | Neutral (`--sb #F7F7F5`, `--bg #FFFFFF`, …)             | Prototype                               |
| AI composer         | Green fill/border (`#24382A`/`#2F5B3C`)                   | Neutral (`#2A2A2A`/`#3A3A3A`)                           | Prototype                               |
| Accent wording      | "Use green for primary actions…", "Green text"            | `--ac #6C79E0`, `--actx #A9B1F4` (indigo)               | Indigo; "green" read as "accent"        |
| `--tx3` dark        | `#767676`                                                 | `#858585`                                               | Prototype, then AA-adjusted             |
| Title weight        | Geist 500                                                 | Geist 600, `letter-spacing: -0.02em`                    | Prototype                               |
| Typography spec     | Prototype's own type table still says Cormorant/Lora      | `--serif`/`--read` are Geist; Lora only as `--pdfserif` | CSS variables                           |
| Writing-font label  | Prototype menu says "Lora (serif)"; settings says "Geist" | —                                                       | "Geist"                                 |
| Small-text contrast | Several values fail WCAG 2.1 AA                           | —                                                       | AGENTS.md requires AA; adjust minimally |

## Decision

The prototype's CSS custom properties are the source of truth; the notes' token table and prose are treated as stale where they disagree. Values that fail AA for small text on surfaces they are used on are adjusted by the smallest step that passes, and every adjustment is listed in `features/system/tokens.ts` (rendered at `/app/design-system`, asserted by unit test). The filled-button colour `--acb` remains separate from `--ac` because white on the dark-theme indigo is 3.9:1.

`--font-serif` and `--font-read` resolve to Geist; a new `--font-pdf` (Lora) is used only for rendered PDF pages (`.pdf-page`). Every `font-serif` title uses weight 600 and −0.02em tracking. Cormorant Garamond is removed as a dependency.

Hardcoded green literals (reader citation ring, PDF source highlight, settings theme previews, highlight swatch, `theme-color`) follow the prototype's 1:1 indigo replacements.

## Consequences

The token _names_ are unchanged, so no component API or shadcn alias changed. The composer's `tone` value was renamed from `'green'` to `'accent'`. Linux visual baselines were regenerated; macOS baselines were not and need regeneration on a Mac.

## Revisit conditions

A newer handoff that resolves the notes/prototype disagreements, or a design review that rejects any AA adjustment.
