# Public landing and authentication entry

10 November 2026 owner-requested second visual increment. The first centered landing and terrain-backed authentication design was rejected. This revision follows a source-led editorial direction: a split hero, one interactive workspace example, sage and paper-yellow accents, compact explanatory sections and a split desktop sign-in page. It adapts the supplied references without claiming pixel parity or expanding the beta boundary.

## Plan and resulting design

1. Lead with the research task: “A clearer path from paper to insight.” A single Read / Write / Plan example shows the connection between a paper, source-linked writing and next steps.
2. Use native radio inputs, labels and checkboxes for a working, keyboard-accessible presentation. Example content is visibly labelled; preview changes do not persist or represent real user data.
3. Share the source-to-note illustration between the public page and authentication story. On narrow screens the story disappears and the actual form takes priority. Light and dark follow the existing app preference.
4. Publish a private Sites presentation and reuse the same React component/CSS in the existing Next.js Atlas deployment. Authentication stays in the existing Atlas service.

`/` is public; `/home` remains authenticated. Real sign-in, registration, verification and recovery APIs, return routing, email-verification requirements, visibility controls and disabled-delivery gates are preserved. No OAuth, new provider, payment, infrastructure migration or AI configuration is introduced. Unconfigured email services remain visibly unavailable.

## Sites source and delivery

Private preview: https://atlas-entry-redesign.tterekli9.chatgpt.site

Project: `appgprj_6af2de263bcc8191b71fc9355bf9bf11`. Native publication returned `succeeded` for source commit `dd12089591748b323ae25ff3a46c3d38b1a28bac`. Its normal ChatGPT owner-access gate remains enabled. The IAB visit reached that sign-in gate; remote authenticated rendering is not claimed.

`scripts/export-public-site.ts` renders the shared `PublicSite` component and copies its stylesheet to a buildless static source checkout. It takes explicit `--out` and `--app-origin` arguments. Sites entry links point to the existing HTTPS Atlas service; no credential form, secret or authentication proxy is exported. Source-helper credentials remain in session memory and hidden stdin. The nested Sites checkout is ignored in the Atlas repository.

## Observed validation

PASS: production build including TypeScript, lint, and all 10 unit tests. Production `node --import tsx scripts/test-integration.ts --public-browser` passed:

- Landing, FAQ, entry links, Read/Write/Plan switching, task checkbox and native radio keyboard navigation.
- Actual registration → local SMTP verification → authenticated Home; password visibility; recovery → changed-password sign-in; invalid-credential error.
- Landing, sign-in, registration and recovery at 320/390/768/1024/1440px in both themes; no horizontal overflow, development overlay or browser exception.
- Disabled registration, recovery and verification expose the unavailable state and no form.

IAB reviewed the recognizable static Sites preview and example interactions before publishing. Production-browser screenshot output was visually inspected for desktop sign-in and the complete landing page. All fixtures are synthetic; test PostgreSQL and SMTP are disposable and local. No live user record, external email or paid model call is used. Screenshots remain outside Git.

The older generic `--browser` suite has a pre-existing Home greeting mismatch (`Good morning/afternoon/evening` versus current `Welcome back`); its entire workspace flow is not claimed to pass. Safari, Firefox, OAuth and external email are not verified. Paid AI, mail, independent backup and broader beta gates retain their existing status. Exact merged/live release and fresh live screenshots are recorded in the delivery conversation.
