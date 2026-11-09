# M1–M7 measurement protocol

There are no pilot participants yet. Live collection remains off. This is an aggregate validation/reporting tool and observation protocol, not automatic event instrumentation. Future content-free server event capture for M1/M4 requires a separate implementation and consent/retention review; current security audit data is not treated as consented analytics.

| Metric | Numerator / denominator | Collection and completion condition |
| --- | --- | --- |
| M1 activation | New users completing source + annotation + cited document within 7 days of first project / all consented first-project users | Private consented observation ledger; complete the full 7-day window, then aggregate. Target ≥60%. Existing users or a short smoke are not new-user activation. |
| M2 journey | Participants completing the defined source→writing→task→discussion links unaided / participants starting the moderated task | Record help and failed/abandoned starts. Target ≥80%. A shortened disabled-AI journey must be labelled partial and cannot establish full J1/G04 acceptance. |
| M3 links | Locators opening the correct source version and location / evaluated locators | Record exact source-version/page IDs privately or public fixture IDs. Target 100%; locator correctness is distinct from claim support. |
| M4 return | Activated pilots performing a research action in the following 7-day window / activated pilots | A login is not a research action. Wait for the complete subsequent window (at least day 14 for a day-7 activation cohort). Target ≥50%. |
| M5 saving | Lost server-acknowledged edits / server-acknowledged edits checked after reload | Include conflicts, interruptions and retries. Target zero lost acknowledged edits; unsent drafts are recorded separately. |
| M6 isolation | Negative access checks that disclose unauthorized content / all negative checks executed | Include teams, sessions, sources/files, exports, jobs and AI. Target zero. Local and live matrices remain separate evidence. |
| M7 grounded AI | Correct locators and supported claims / their separate judged samples; correct abstentions / insufficient or contradictory cases | ≥10 real permitted papers, ≥40 questions, ≥50 locators, all locators valid, ≥90% supported claims, ≥9/10 proper abstentions, zero leaks/actions. Paid calls remain prohibited: NOT RUN. |

`observed` means a real observation occurred, not that it passed. `evidence` must be `observed` or `synthetic`. The tool retains integer numerator/denominator values and derives rates; it rejects unknown fields and numerator > denominator. M1/M4 are NOT RUN until their window flags are true. Missing/zero samples do not become 0% or 100%. A short M7 sample does not meet its entry size. Synthetic measurements are always SYNTHETIC ONLY even when their rates match targets.

Store private rosters, dates, attribution and consent separately; the JSON accepts no free text, identities, prompts, quotes, URLs or responses. `participants` counts unique real participants for observed pilot reporting; local test sessions must use synthetic evidence. Record observed failures as well as successes. Raw test timings, VM/container limits and dataset sizes belong in the phase evidence, not in participant completion percentages.

Run the empty template to see all metrics as NOT RUN:

```sh
npm run pilot:metrics -- docs/pilot/measurements.empty.json
```

The tool always leaves the release decision with the owner. Meeting metric targets does not bypass G01–G05, support staffing, independent recovery or security acceptance. Do not publish a small cohort's identifiable raw observations.
