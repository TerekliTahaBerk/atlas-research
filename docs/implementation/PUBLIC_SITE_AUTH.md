# Public landing and authentication entry

10 November 2026 owner-requested visual increment, based on the supplied screenshots (11:08:03 landing, 11:08:13–11:09:24 downstream sections, 11:09:35 account form). These references guide the public surfaces; the research workspace and beta scope stay intact. No screenshot, personal identity, testimonial portrait or private reference asset is shipped.

`/` is now a public landing page instead of an unconditional `/home` redirect. `/home` remains the authenticated research home. Landing actions lead to the existing sign-in route. Native anchor navigation and FAQ disclosure work without a separate public-site service. The source-linked writing/reading previews are code-native, explicitly illustrative examples, with no simulated account/session/model state.

Sign-in, registration, verification and recovery share an open 384px form, compass mark, subdued terrain and restrained black/white controls. Existing APIs, safe return routing, verification requirements, disabled-delivery gate and recovery behavior remain in use. Password visibility is an explicit button outside its input label; fields keep autocomplete and meaningful names. There is no new OAuth provider, identity bypass, SMTP provisioning, payment or new module.

## Visual contract and comparison

The supplied references and a generated concept were inspected with `view_image`, then compared with production-browser renders at 1440px and narrow widths. IAB was used first for navigation, desktop/390px layout and theme controls; the repeatable release test uses production Playwright and disposable PostgreSQL/local SMTP. The installed Browser plugin is unavailable. This is a reference adaptation, not pixel-parity with the third-party site.

| Point | Reference / intentional adaptation | Render verification |
| --- | --- | --- |
| Background | True-white public canvas with faint pastel terrain; dark follows the existing preference | Removed the white-image rectangle in dark mode using an inverted contour blend; inspected both themes |
| Typography | System sans body, large two-line heading, serif Atlas wordmark | 64px desktop / responsive 33–46px hero; 25px auth heading; 13–14px form labels/controls, 16px mobile inputs |
| Container model | Open hero/auth layout; thin borders only on preview, fields and section panels | Auth card border/padding removed; centered 384px form; no boxed landing hero |
| Navigation / actions | Compact logo, About / Workflow / FAQ and Log in / Start researching | All destinations exist; anchor and FAQ interaction passed; mobile retains entry actions and footer navigation |
| Illustration / icons | Compass and lightweight icons; pastel product frames | Shared SVG mark and existing icon family; actual UI text stays HTML; generated terrain is a 43KiB WebP |
| Responsive flow | Full reading/writing preview on desktop; readable single-column continuation | 320/390/768/1024/1440px × light/dark passed overflow and overlay checks |
| Above-fold copy | `Atlas`, `About`, `Workflow`, `FAQ`, `Log in`, `Start researching`, `Your research, connected to its sources.`, and the agreed reading/evidence subtitle | No invented proof badge, price, user count or institution endorsement; preview is visibly labelled as example content |

The original reference's advanced maps, Google login, paid plans, university logos, 10,000-user statement, testimonials and compliance badges are not claims or configured features of this Atlas installation. The page describes the implemented PDF/notes/documents/tasks/discussions flow. The generated concept's fictional river-restoration findings were replaced with clearly illustrative paper/note content; no generated scientific result is presented as evidence. Existing recovery/verification links and the theme control are retained usability adaptations.

Built-in ImageGen produced the concept and a separate production background. Background prompt: “Create a standalone decorative background asset for the Atlas landing and login website: an extremely faint pastel topographic contour map on pure white. Meandering irregular islands of pale mint, baby blue, blush pink, pale butter yellow and lavender surround a large white empty central oval. Thin organic concentric elevation contour lines, softened almost to white; no text, logos, UI, symbols, people, perspective, 3D or shadow. Flat overhead paper map; pure-white edges fade seamlessly.” Asset: `public/images/atlas-terrain.webp`; the source PNG and concept remain outside Git.

## Observed validation and limits

PASS: typecheck, lint, 10 unit tests and production build. `node --import tsx scripts/test-integration.ts --public-browser` verifies landing → FAQ → login, keyboard field order, real registration → local SMTP verification → authenticated Home, password visibility, recovery → changed-password sign-in, invalid-credential error, five widths/two themes and disabled registration/recovery/verification with no form. No external email, paid model request or live user record is used by this test. Screenshots are outside Git.

The older generic `--browser` script reached authenticated Home but stopped on its pre-existing `Good morning/afternoon/evening` greeting expectation, while the current Home says `Welcome back`. Its full workspace suite is not claimed to pass here; this increment adds a focused auth/public release gate rather than rewriting unrelated workspace expectations. Safari/Firefox, OAuth and actual external email delivery are not verified. Email, paid AI, independent backup and the broader beta gates retain their existing status. Live release SHA, readiness and fresh live screenshots are recorded in the delivery conversation.
