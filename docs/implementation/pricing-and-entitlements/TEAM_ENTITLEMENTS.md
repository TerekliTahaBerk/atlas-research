# Team entitlements

Every entitlement is resolved for the existing workspace ID through `app.billing_descriptor`. A paid subscription takes precedence over a Founding grant. An expired or revoked grant falls back to Free automatically. The personal workspace belongs to a single identity. A shared workspace has its own pool and never draws from a member's personal wallet.

A seat is one active workspace member with owner or admin privileges, or one who holds an active non-viewer role on any non-deleted project in that workspace. The same person is counted once across projects. The RLS write gate uses workspace owners, admins and then members in stable admission order after a capacity reduction. It preserves permission to read and export existing work. Existing shared workspaces retain their pre-migration editing population as a Free seat floor. A viewer takes no seat and cannot promote themselves.

Team starts at three seats. Its projects scale as 50 + 20 × seats. The member AI ceiling defaults to 40% of the shared allowance, including eligible top-ups. Workspace owners and admins can change it from Usage during a Team entitlement. The workspace audit records changes. A canceled hold releases capacity. A failed attempt still counts toward the UTC daily operations ceiling.

Free meters reset on UTC month boundaries. Paid monthly plans follow the paid period. Annual and contractual plans use monthly boundaries relative to the paid term start. Founding uses three consecutive 30-day windows in the 90-day base term. Top-ups retain their own expiration and are consumed after the included allowance.

`ATLAS_RESOURCE_LIMITS_ENABLED=1` turns on runtime enforcement across web and the file worker. A disabled flag leaves legacy rollout behavior in place. Real provider AI also requires the resource switch and the existing consent, pricing and provider gates.
