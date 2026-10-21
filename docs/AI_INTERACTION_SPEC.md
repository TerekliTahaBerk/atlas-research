# Atlas AI interaction specification

Status: working presentation foundation, no AI service. Contracts live in `apps/web/src/features/atlas-ai/contracts.ts`; they are UI DTOs, not database entities or access grants.

## Lifecycle and placement

`AtlasProvider` owns one optional roaming panel. `openAssistant` accepts prompt, context kind, and named references. The topbar is the stable launcher. Inline composers, task details, paper reading, document selection, and channel actions use the same provider. The full Atlas AI module reuses `AssistantExperience` and `AtlasComposer`. The panel is nonmodal: the user can continue working. Desktop reserves a right column; narrow screens stack the panel above the content with a bounded scrolling area. Closing restores the invoking control where it still exists; a route change must never create hidden authorization context.

| State             | UI behavior                                           | Actual operation         |
| ----------------- | ----------------------------------------------------- | ------------------------ |
| Collapsed         | Topbar launcher, inline composer available            | None                     |
| Focused           | Visible composer focus ring                           | Local input              |
| Expanded          | Context, mode, composer and introduction              | None                     |
| Context attached  | Named removable chips                                 | In-memory references     |
| Search pending    | Explicitly labeled progress preview                   | None                     |
| Searching sources | Manually selectable progress preview                  | No search                |
| Reading documents | Manually selectable progress preview                  | No retrieval             |
| Generating        | Manually selectable illustrative progress             | No model                 |
| Answer            | Prewritten rich sample, source disclosure and actions | Fixed sample             |
| Approval          | Target and proposed action; dismiss only              | No executable approval   |
| Error             | Safe example error and retry composer                 | No actual provider error |
| Cancelled         | Explicit no-action status                             | No cancellation request  |

Submitting arbitrary prompts always shows the same disclosed answer. It must never be described as generated, personalized, searched, or source-verified. Retry opens a sample pending state; the user explicitly chooses a sample answer or cancellation. Model selection is represented as Grounded/Explore preview modes; no actual model availability is claimed.

## Context and pickers

`ContextReference` has a synthetic identifier, entity kind, display title, optional module link, and optional future flag. Supported categories: document, paper, task, person, project, channel, manuscript, dataset, figure, experiment, selected text, workspace. Datasets, figures and experiments appear as unavailable future entries. Chips have an icon, truncation, full-title tooltip, navigation where available, and a named remove button. Only UI preferences are stored; prompt and artifact content remain in React state.

`useEntityPicker` and `EntityPicker` are independent of any editor. A trailing @ or / token opens a compact filtered list. The active descendant is announced by the labeled combobox; arrow keys change the active option, Enter selects, Escape dismisses while keeping the draft. No results is explicit. Disabled future entries cannot attach. Mouse selection preserves the invoking input focus. Search currently considers the trailing token at the end of the value; arbitrary cursor-position insertion is a later rich-editor adapter responsibility.

Mentions attach structured references. Slash commands insert a visible command token; they do not execute. `getPickerItems` filters commands by context. Document/manuscript commands include rewrite, improve, cite and outline; tasks includes subtasks; research includes compare and gaps. Channel `@Atlas` visibly names the sample channel context. Cross-project/private-channel access cannot be inferred from a chip or mention.

## Responses and citations

`AIResponse` presents safe authored JSX: paragraphs, headings, list, inline citation anchor, source cards, a mathematical expression with an accessible verbal label, and an inert code block. It does not parse untrusted HTML or arbitrary model Markdown. A later Markdown adapter must sanitize and constrain links and render structured citations separately. Code is never executed.

`CitationReference` distinguishes verified, suggested, generated and unavailable. Verification needs source ID, source location, and evidence text. Missing fields downgrade the visible status. All current sample sources are synthetic or unavailable and none is verified. Counts, authors and venues in sample papers are illustrative. DOI is explicitly unavailable. A source link must be reauthorized in future services and a verified passage does not by itself prove scientific entailment.

Copy uses the clipboard and reports success or a recoverable failure. Add-to-document and Create-task show an unexecutable proposal. Save-finding and Insert-citation explain the required later service. Related paper/context chips navigate to the relevant sample module. A future action ledger must bind approval to an authenticated actor, tenant, resource version, capability, exact content, and idempotency key; this UI state cannot stand in for authorization.

## Focus and errors

The assistant moves focus to its named close control when opened; it does not trap focus. Escape closes it only after nested listboxes or dialogs have dismissed. Modal details use Radix focus trapping/restoration. Unique IDs prevent the full AI page and roaming assistant from colliding. Provider errors never print raw details, credentials, prompts, or private source content into logs. A later streaming transport must include safe request IDs, resumable/cancel semantics, stale-source handling, bounded retries, and usage reconciliation.
