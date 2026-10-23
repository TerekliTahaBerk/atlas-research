# Scholarly provider fixtures

Synthetic records shaped like the documented OpenAlex Works and Semantic
Scholar Graph API responses. They were **not** recorded from the live APIs:
this development session had no network route to either provider. Titles
start with "Fixture", DOIs use the reserved example prefix `10.5555`, and the
IDs are deliberately out of the providers' assigned ranges, so no record can be
mistaken for a real publication.

They include a shared DOI across providers (identity merge), missing optional
fields, an inverted-index abstract, open-access PDF locations and invalid
records that must be dropped. Live contract checks are opt-in:
`ATLAS_LIVE_PROVIDER_SMOKE=true pnpm vitest run tests/hosted/providers.live.test.ts`.
