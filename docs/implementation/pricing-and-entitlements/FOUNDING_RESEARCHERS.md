# Founding Researchers

The four cohorts are Founding Student (20 individual accounts), Researcher (15), Team (10 workspaces with five editors each) and Lab (5 workspaces with ten editors each). Their combined capacity is 50 active/reserved places, 135 editing seats and 13,550 included AI credits per period. Their shared AI provider budget is USD 180 per UTC month. The provider ledger tracks actual, outstanding and uncertain amounts separately.

1. Enable intake explicitly through `ATLAS_FOUNDING_INTAKE_ENABLED=1`. The form stores application fields and no payment credentials. Duplicate submissions return the same acknowledgment.
2. An operator opens `/admin/resources`, reviews an application and selects a profile. Approval takes a 72-hour reservation. Concurrent approvals near the limit use one database lock. Active grants and unexpired reservations count.
3. Issue a link after review. A fresh 256-bit token is stored only as a hash, is bound to the applicant's verified email and expires after 72 hours. Revocation or resending invalidates the previous token. The link puts the token in the URL fragment to keep it out of intermediary URL logs.
4. The applicant signs in and selects their own eligible workspace. The active grant starts at redemption and lasts exactly 90 days. Workspace grants and application redemption are unique. Payment credentials are never requested.
5. The authenticated usage screen surfaces day-60 feedback and the day-75 first-year 30% offer. The offer is informational until a real provider and contract terms are configured. Expiration falls back to Free, with existing work retained.
6. Operators can revoke or extend an active grant. Extensions are cumulative to 30 days and require a reason in the audit. Approval can lower specific resource limits without increasing the profile ceiling.

Delivery is off by default. A reviewed operator action can queue email only with both SMTP configured and `ATLAS_FOUNDING_MAIL_ENABLED=1`. The existing encrypted outbox checks the operator session and token again before dispatch. Synthetic local tests use a loopback SMTP mailbox. No current applicants or recipients were contacted.
