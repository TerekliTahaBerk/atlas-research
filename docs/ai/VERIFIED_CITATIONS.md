# Verified source locations

The model proposes only evidence IDs, exact quotes and absolute UTF-16 offsets. Server-supplied evidence determines project, paper, immutable version, page and document checksum. The model cannot supply a different page/version through the strict output schema.

`verifyCitations` reconciles each proposal with supplied evidence and requires an exact substring at valid offsets. Fabricated IDs, altered quotes and invalid offsets are withheld. Stable `[[evidenceId]]` or numbered markers are reconciled against the verified list; invalid/orphaned markers become visibly unverified. A relational `ai_citations` record preserves composite project/run/paper/version/chunk foreign keys for completed answers. Metadata citations have no fabricated page or version.

The UI says **location verified** and **scientific claim support not evaluated**. Exact provenance proves a source location; it does not prove entailment, study quality, scientific truth or model interpretation. Unsupported statements remain model output, not certified findings. The scientific support evaluation is a separate release gate.

Clicking a citation reauthorizes its run and evidence, compares canonical version/page/checksum/quote/offset, and then opens the exact quote. Reader links preserve `paper`, `source` and `page`; metadata opens Library. The user can copy the reference. All cited papers are already saved, so another “save to Library” write is unnecessary. Source revocation, deletion, archive or changed annotation/abstract content makes stale citation access fail closed. Provisional deltas never display verified chips.
