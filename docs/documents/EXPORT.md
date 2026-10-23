# Document export

`GET /api/v1/documents/:id/export?format=markdown|text|html` returns a private (`no-store`, `nosniff`) attachment rendered from the current revision by `renderDocument`.

- Authorization is checked at export time; archived documents and revoked users get 404.
- References are re-resolved now: available targets render their current title/short citation; anything else renders `[unavailable reference]`. People render only while they are participants.
- Markdown escapes Markdown metacharacters; HTML is generated from escaped text and a fixed tag allowlist (`p h1–h3 strong em s u code pre ul ol li blockquote hr br a`), links only for validated http/https/mailto with `rel="noopener noreferrer nofollow"`. No scripts, styles, event handlers or arbitrary attributes can be produced. The application's global CSP also applies.
- PDF and LaTeX are shown as unavailable in the menu; they are not implemented (Phase 07 manuscripts).
