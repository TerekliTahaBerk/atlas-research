# Component inventory · Phase 00.5

## Shared UI package

Existing `@atlas/ui/components/*` remain the base: Button, Input, Textarea, Select, Dialog, DropdownMenu, Tooltip, Badge, Avatar, Card, Tabs, Skeleton, Empty, Alert and Separator. No library or runtime dependency was added. Tabs now use semantic muted foreground for inactive labels so the light theme meets contrast requirements. EmptyState exposes its title as a level-two heading. The original `cn` remains the only class utility.

## Application composition

| Component / contract                  | Owner              | Responsibility                                                             |
| ------------------------------------- | ------------------ | -------------------------------------------------------------------------- |
| AppShell / ShellFrame                 | shell              | Shared contextual header, shortcuts, mobile dialog and preference handling |
| Sidebar                               | shell              | Workspace/project sections from central navigation; compact named links    |
| SearchDialog                          | shell              | Accessible navigation-only search, no artifact data access                 |
| ThemeControl / Providers              | components         | Existing next-themes persistence and Radix tooltip scope                   |
| PageHeader / state components         | components         | Consistent title/description, empty/loading/retry                          |
| AtlasProvider / useAtlas              | atlas-ai           | Single roaming assistant request and invoking-control focus                |
| AssistantExperience                   | atlas-ai           | Shared state presentation for panel and full AI workspace                  |
| AtlasComposer                         | atlas-ai           | Sage input, mode, attachment entry point, draft submission                 |
| ContextReference / AssistantContext   | atlas-ai/contracts | Typed presentation references and explicit scope                           |
| useEntityPicker / EntityPicker        | atlas-ai           | Reusable trailing-token search, keyboard selection, active descendant      |
| ContextChip                           | atlas-ai           | Entity icon, named link, full-title tooltip and accessible removal         |
| CitationReference / SourceCard        | atlas-ai           | Structured source state; incomplete verification downgraded                |
| AIResponse                            | atlas-ai           | Safe authored rich sample, source expansion, copy and proposed actions     |
| PreviewNotice                         | preview            | Local fixture/service boundary disclosure                                  |
| CapabilityButton                      | preview            | Accessible explanation for an unavailable action                           |
| CreatePreview                         | preview            | Bounded name, local draft review, no persistence claim                     |
| ViewToggle                            | preview            | Native radio-driven layout switch                                          |
| SectionHeading                        | preview            | Repeated section/link rhythm                                               |
| PreviewPaper / PreviewTask / fixtures | preview            | Synthetic authored content; no Prisma/domain dependency                    |
| ProjectOverview                       | projects           | Home continuation desk and project compatibility route                     |
| ResearchScreen / PaperCard            | research           | Local discovery/library composition and reusable paper anatomy             |
| ReaderPreview                         | research           | Outline, reflowing sample pages, zoom/search/highlight and context         |
| DocumentScreen                        | documents          | Note tree, local draft state, marker toolbar, selection actions and focus  |
| TaskStatusLabel / TaskPriority        | tasks              | Text-plus-icon status/priority shared across board/detail                  |
| TasksScreen                           | tasks              | Local board/list and task detail state                                     |
| ChannelsScreen                        | channels           | Local research conversation, entity cards, reactions and thread            |
| InboxScreen                           | preview            | Local activity and unread state                                            |
| ManuscriptsScreen / ExperimentsScreen | preview            | Lightweight future module contracts without runtimes                       |
| AuthPreview                           | onboarding         | One coherent auth family; no network submission                            |
| OnboardingPreview                     | onboarding         | Optional, short multi-step sketch; never creates resources                 |

## Boundaries and extension points

Feature state stays local to its screen. Shell/AI composition can wrap server-rendered route children. `ModulePreview` remains a server dispatcher, so unused modules do not require a universal client screen switch. Feature components do not import database, server environment or provider packages. Core/AI packages retain their original dependency constraints.

These presentation types are intentionally separate from production domain IDs. A later service adapter validates unknown DTOs with Zod and resolves actor/tenant/resource/capability on the server. The picker can accept a future authorized source without coupling to a particular rich editor; its current exported fixture search is explicitly preview-only. Rich text parsing, cursor-range insertion, CRDT editing and arbitrary Markdown rendering are not included. Context chips link to module views rather than claim a future entity detail route.
