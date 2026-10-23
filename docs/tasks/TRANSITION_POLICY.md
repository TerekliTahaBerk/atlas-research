# Task transition policy

Enforced by `atlas_private.task_transition_allowed` (the UI mirrors it from `@atlas/core` only to hide invalid options):

| From        | Allowed to                       |
| ----------- | -------------------------------- |
| TODO        | IN_PROGRESS, CANCELLED           |
| IN_PROGRESS | TODO, IN_REVIEW, DONE, CANCELLED |
| IN_REVIEW   | IN_PROGRESS, DONE, CANCELLED     |
| DONE        | IN_PROGRESS                      |
| CANCELLED   | TODO                             |

Any other move returns `CONFLICT`. Every transition requires the current task `version`; a stale version returns `CONFLICT` and the board reloads. Moving into DONE sets `completed_at`; leaving DONE clears it.
