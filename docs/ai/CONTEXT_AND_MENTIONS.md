# Context, mentions and commands

One `AtlasProvider` owns context chips and the live conversation across Compact, Open, Focus, Panel and inline research entry points. Project navigation clears research context, prompt, consent and conversation state. Only appearance/navigation preferences go into browser storage. A saved conversation is recovered from the authenticated server list after reload.

The `@` picker searches actual authorized project papers, accepted source versions and visible annotations, plus the current project. It preserves typed IDs; every attachment is re-resolved by the server. IDs and displayed titles grant no access. Unknown projects, archived papers, unaccepted versions, private notes belonging to another author and fabricated passages are rejected without source-existence disclosure. Unsaved search-result chips prompt the researcher to save the paper first; they do not become pretend stored evidence.

Live commands: `/ask`, `/search-library`, `/summarize`, `/compare`, `/explain`, `/identify-gaps`, `/cite`, plus `/limitations` and `/outline`. These direct grounded read-only inference over retrieved evidence, not external scholarly search or domain writes. The research instructions require comparisons to attribute themes, methods, limitations and unknowns; gaps must be labelled hypotheses unless established by evidence. Real scientific quality for these commands needs approved provider evaluation.

Future document/task/person/channel/manuscript/experiment presentation kinds remain separate from executable live research references. Live mode never loads preview entities or enables unavailable domain services. Search-result inference currently requires a saved paper; arbitrary unsaved provider results are not fetched by the AI service.
