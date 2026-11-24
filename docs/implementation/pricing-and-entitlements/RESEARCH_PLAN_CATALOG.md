# Research plan catalog

The versioned, dependency-free catalog lives in `src/server/billing/catalog.ts`. Server-side entitlements and the public pricing screen import the same catalog. Subscription events persist the catalog version. Add a new explicit version when prices or quotas change, and retain the resolver for every version still in use before publishing it.

## Prices and capacities

Amounts are USD. The catalog stores integer cents. Institution has contractual pricing and requires an explicit resource allocation. The application does not expose live checkout or collect taxes in this release. A configured live provider must calculate and disclose applicable taxes before collection.

| Plan         |      Monthly |        Annual |  Active projects |   File storage | Per file | Uploads per month | AI credits per month | AI operations per member per day |
| ------------ | -----------: | ------------: | ---------------: | -------------: | -------: | ----------------: | -------------------: | -------------------------------: |
| Free         |           $0 |            $0 |                3 |           1 GB |    10 MB |                20 |                   20 |                                5 |
| Plus         |           $9 |           $90 |               25 |          10 GB |    25 MB |               150 |                  150 |                               25 |
| Pro          |          $19 |          $190 |              100 |          50 GB |   100 MB |               500 |                  400 |                               60 |
| Team         | $15 per seat | $150 per seat | 50 + 20 per seat | 15 GB per seat |   100 MB |      300 per seat |         250 per seat |                               30 |
| Plus Student |        $4.50 |             — |               25 |          10 GB |    25 MB |               150 |                  100 |                               25 |
| Pro Student  |        $9.50 |             — |              100 |          50 GB |   100 MB |               500 |                  250 |                               60 |

| Plan                | Indexed source data | Python per month | Python per run | LaTeX per month | Custom automations |
| ------------------- | ------------------: | ---------------: | -------------: | --------------: | -----------------: |
| Free                |               25 MB |           20 min |          1 min |              20 |                  0 |
| Plus / Plus Student |              500 MB |          120 min |          5 min |             150 |                  3 |
| Pro / Pro Student   |                2 GB |          600 min |         15 min |             500 |                 20 |
| Team                |       1 GB per seat | 300 min per seat |         15 min |    250 per seat |        15 per seat |

Team requires at least three editor seats. Its per-file ceiling uses the Pro ceiling, because the request specified only the Team storage allocation. Viewers have a separate role. Institution SSO and other contract-dependent integrations are not marketed as working features. Both student plans require a current verified grant, and annual academic prices remain unconfigured.

## Units and boundaries

- 1 MB is 1,000,000 bytes and 1 GB is 1,000,000,000 bytes. File storage and indexed source data are independent.
- Active project counts exclude archived and deleted project records. An archived project's saved PDFs occupy storage until deleted through the authorized file lifecycle.
- Monthly subscriptions use their billing period. Annual subscriptions receive monthly quota windows anchored to their subscription date. Free uses UTC calendar months. Founding Access uses 30-day windows from activation, bounded by its grant expiry.
- Python quotas use elapsed milliseconds. Compute, compilation and automation allowances in the catalog describe plan capacity. Python execution, native LaTeX compilation and automation require separately enabled implementations.
- Shared workspace usage belongs to that workspace. Personal allowances do not pool into Team. Team's per-member monthly AI share starts at 40%.
- A valid plan allocation does not bypass the global provider switch, existing resource authorization, evidence policy or infrastructure limits.

## Extra resources

| Package              |           USD | Term                                   |
| -------------------- | ------------: | -------------------------------------- |
| 100 AI credits       |            $3 | One-time, valid for 12 months          |
| 500 AI credits       |           $12 | One-time, valid for 12 months          |
| 10 GB file storage   |  $2 per month | Recurring, compatible with a paid plan |
| 100 Python minutes   |            $2 | One-time, valid for 12 months          |
| Additional Team seat | $15 per month | Recurring Team allocation              |

The catalog limits add-ons to compatible paid plans. Free users are shown the catalog prices on the public page. The workspace Subscription page shows applicable options and states the current checkout availability.
