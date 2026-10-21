# Reference analysis

The ten attached OpenNote screenshots were available in the conversation and inspected visually before implementation. They are inspiration, not source code, brand assets, or a pixel-copy requirement.

| Images | Observed pattern                                                   | Atlas interpretation                                                                         |
| ------ | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| 1      | Dark auth, serif welcome, simple large fields                      | One warm/charcoal auth family, serif headings, labeled fields, explicit unavailable identity |
| 2      | Nearly empty writing surface, compact actions, floating sage input | Spacious notebook, small marker toolbar, one contextual assistant entry point                |
| 3      | User prompt, cited response and expandable source bar              | Structured provenance states, fixed sample answer, disclosure that no source is verified     |
| 4–5    | Small expandable assistant and searching state                     | One stable nonmodal side column; manually selectable progress states, no fake search         |
| 6      | Large option cards and small step progress                         | Seven optional research-relevant onboarding steps with native radio cards                    |
| 7      | Inline generation progress in reading content                      | Future artifact/execution layout only; no video service or generation claim                  |
| 8      | Editorial welcome with large negative space                        | Calm Atlas onboarding with original compass mark                                             |
| 9      | Charcoal sidebar, grid/list and quiet workspace home               | Neutral compact navigation and content-first continuation desk                               |
| 10     | Assistant works near document, content stays primary               | Named document/selection context and a reserved assistant column                             |

Original Atlas decisions: forest actions, warm ivory/charcoal semantic tokens, compass mark, named organization/workspace/project hierarchy, explicit provenance validation, and local-state honesty. No OpenNote wordmark, paper-plane logo, exact layout, proprietary content, acquisition banner, or source code was copied. Fictional research content is authored for this repository and identified as synthetic.

## Current Phase 00 audit

Reused: Next App Router, strict TypeScript, existing Radix/shadcn primitives, theme provider, shell search/modal handling, static sample-ID guards, test harness, package boundaries, and public entry. Gaps: modules were uniform empty placeholders, sidebar had no Home/Inbox/future modules or compact preference, no contextual AI/picker contracts, no editing/task/discussion demonstration, no onboarding/auth preview, and no product-wide screen/interaction map.

## Concept direction and extraction

Built-in ImageGen produced `phase-00-5-concept.png`. Brief: full primary Atlas desktop screen at 1440-style proportions, 230px quiet sidebar, 60px breadcrumb header, warm #FAF9F6 canvas, #F3F2EC surfaces, forest #2B7745 actions, #E0EBD9 sage, Georgia editorial headings, system sans controls, continuation cards, project/task pair and connected-artifact footer. Required labels and all module destinations were included; no analytics metrics, gradients, marketing panels, decorative hero imagery or reference-product branding.

The image was inspected using `view_image` before implementation. It is the layout reference, not a screenshot of working code. The same motif family extends to modules: paper rows, note tree/editor, task columns, channel rail, source cards, optional context panel, and spacious onboarding choices. Code-native Lucide icons and local typography avoid image assets for controls.

Intentional implementation refinements: 230px sidebar rather than the concept image’s approximate 260px; smaller readable UI hierarchy to fit real controls; required search/sort/view controls; no fake avatar/current-user identity; explicit sample labels; actual note counts; visible AI mode; safe responsive stacking. Concept copy was retained where applicable. The generated “New” action becomes the concrete “New document” preview flow. No public AI service is implied.
