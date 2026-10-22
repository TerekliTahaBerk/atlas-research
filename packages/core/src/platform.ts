import { z } from 'zod';
const id = z.uuid();
const name = z.string().trim().min(1).max(120);
const version = z.number().int().positive();
export const scopeType = z.enum(['organization', 'workspace', 'project']);
export const role = z.enum(['OWNER', 'ADMIN', 'MEMBER', 'EDITOR', 'VIEWER']);
const interests = z.array(z.string().trim().min(1).max(80)).max(20).default([]);
const profile = {
  displayName: name,
  researchRole: name.optional(),
  researchInterests: interests,
};
const change = { id, expectedVersion: version };
const membership = {
  scope: scopeType,
  scopeId: id,
  profileId: id,
  expectedVersion: version,
};
export const onboardingDraft = z.object({
  displayName: name.default('Researcher'),
  researchRole: name.optional(),
  researchInterests: interests,
  workspaceName: name.default('My Research'),
  projectName: z.string().trim().max(120).default(''),
  step: z.number().int().min(0).max(6).default(0),
});
const platformCommandBase = z.discriminatedUnion('command', [
  z
    .object({ command: z.literal('onboarding.save'), draft: onboardingDraft })
    .strict(),
  z
    .object({
      command: z.literal('bootstrap'),
      ...profile,
      workspaceName: name.default('My Research'),
      projectName: name.optional(),
    })
    .strict(),
  z.object({ command: z.literal('profile.update'), ...profile }).strict(),
  z.object({ command: z.literal('organization.create'), name }).strict(),
  z
    .object({ command: z.literal('organization.update'), ...change, name })
    .strict(),
  z.object({ command: z.literal('organization.archive'), ...change }).strict(),
  z
    .object({
      command: z.literal('workspace.create'),
      organizationId: id,
      name,
    })
    .strict(),
  z
    .object({ command: z.literal('workspace.update'), ...change, name })
    .strict(),
  z.object({ command: z.literal('workspace.archive'), ...change }).strict(),
  z
    .object({
      command: z.literal('project.create'),
      workspaceId: id,
      name,
      visibility: z.enum(['PRIVATE', 'WORKSPACE']).default('PRIVATE'),
      idempotencyKey: id,
    })
    .strict(),
  z
    .object({
      command: z.literal('project.update'),
      ...change,
      name,
      visibility: z.enum(['PRIVATE', 'WORKSPACE']),
    })
    .strict(),
  z.object({ command: z.literal('project.archive'), ...change }).strict(),
  z.object({ command: z.literal('project.restore'), ...change }).strict(),
  z
    .object({
      command: z.literal('invitation.create'),
      scope: scopeType,
      scopeId: id,
      email: z
        .email()
        .max(254)
        .transform((v) => v.trim().toLowerCase()),
      role,
    })
    .strict(),
  z.object({ command: z.literal('invitation.revoke'), id }).strict(),
  z
    .object({
      command: z.literal('invitation.accept'),
      token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    })
    .strict(),
  z
    .object({ command: z.literal('membership.set'), ...membership, role })
    .strict(),
  z.object({ command: z.literal('membership.remove'), ...membership }).strict(),
]);
export const platformCommand = platformCommandBase.superRefine((input, ctx) => {
  if (!('scope' in input) || !('role' in input)) return;
  const allowed =
    input.scope === 'project'
      ? ['OWNER', 'EDITOR', 'VIEWER']
      : input.scope === 'workspace'
        ? ['ADMIN', 'MEMBER', 'VIEWER']
        : input.command === 'invitation.create'
          ? ['ADMIN', 'MEMBER']
          : ['OWNER', 'ADMIN', 'MEMBER'];
  if (!allowed.includes(input.role))
    ctx.addIssue({
      code: 'custom',
      path: ['role'],
      message: 'Role is not valid for this scope.',
    });
});
export type PlatformCommand = z.infer<typeof platformCommand>;
export const capabilities = [
  'organization.read',
  'organization.update',
  'organization.members.manage',
  'organization.archive',
  'workspace.create',
  'workspace.read',
  'workspace.update',
  'workspace.members.manage',
  'workspace.archive',
  'project.create',
  'project.read',
  'project.write',
  'project.update',
  'project.members.manage',
  'project.archive',
  'project.restore',
] as const;
export const capability = z.enum(capabilities);
export type Capability = z.infer<typeof capability>;
export const containerDto = z.object({
  id,
  name,
  version,
  capabilities: z.array(capability),
});
export const organizationDto = containerDto.extend({ personal: z.boolean() });
export const workspaceDto = containerDto.extend({ organizationId: id });
export const projectDto = containerDto.extend({
  organizationId: id,
  workspaceId: id,
  visibility: z.enum(['PRIVATE', 'WORKSPACE']),
  archived: z.boolean(),
  updatedAt: z.string(),
});
export const profileDto = z.object({
  id,
  displayName: name,
  researchRole: z.string().nullable(),
  researchInterests: z.array(z.string()),
  onboardingCompleted: z.boolean(),
  onboardingDraft: onboardingDraft,
});
export const platformState = z.object({
  profile: profileDto.nullable(),
  email: z.string(),
  organizations: z.array(organizationDto),
  workspaces: z.array(workspaceDto),
  projects: z.array(projectDto),
  workspaceId: id.nullable(),
  organizationId: id.nullable(),
  nextCursor: z.string().nullable(),
});
export type PlatformState = z.infer<typeof platformState>;
export type ProjectDto = z.infer<typeof projectDto>;
export type Scope = z.infer<typeof scopeType>;
export const memberDto = z.object({ profileId: id, role, version });
export const invitationDto = z.object({
  id,
  email: z.string(),
  scope: scopeType,
  role,
  expiresAt: z.string(),
  accepted: z.boolean(),
  revoked: z.boolean(),
});
export const mutationResult = z.object({
  id: id.optional(),
  workspaceId: id.nullable().optional(),
  organizationId: id.optional(),
  projectId: id.nullable().optional(),
  expiresAt: z.string().optional(),
  invitationLink: z.string().optional(),
});
export type MutationResult = z.infer<typeof mutationResult>;
