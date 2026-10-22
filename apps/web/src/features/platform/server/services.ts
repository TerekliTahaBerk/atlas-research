import 'server-only';
import {
  createHmac,
  randomBytes,
  createHash,
  timingSafeEqual,
} from 'node:crypto';
import { z } from 'zod';
import { Prisma } from '@atlas/database';
import {
  platformCommand,
  platformState,
  projectDto,
  organizationDto,
  workspaceDto,
  memberDto,
  invitationDto,
  mutationResult,
  scopeType,
  type Scope,
  type PlatformCommand,
} from '@atlas/core';
import { withActor, type VerifiedActor } from './database';
import { PlatformError } from './errors';
const hash = (token: string) =>
  createHash('sha256').update(token).digest('hex');
const cursorPayload = z.object({
  id: z.uuid(),
  scope: z.string().max(160),
  actorId: z.uuid(),
});
function cursorKey() {
  const key = process.env.ATLAS_CURSOR_SECRET;
  if (!key || key.length < 32)
    throw new PlatformError('INTERNAL_ERROR', 'Pagination is not configured.');
  return key;
}
function encodeCursor(value: z.infer<typeof cursorPayload>) {
  const body = Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${body}.${createHmac('sha256', cursorKey()).update(body).digest('hex')}`;
}
function decodeCursor(value: string, actorId: string, scope: string) {
  const [body, signature] = value.split('.');
  if (!body || !signature || !/^[a-f0-9]{64}$/.test(signature))
    throw new PlatformError('VALIDATION_ERROR', 'Invalid cursor.');
  const expected = createHmac('sha256', cursorKey()).update(body).digest();
  if (!timingSafeEqual(Buffer.from(signature, 'hex'), expected))
    throw new PlatformError('VALIDATION_ERROR', 'Invalid cursor.');
  let raw: unknown;
  try {
    raw = JSON.parse(Buffer.from(body, 'base64url').toString());
  } catch {
    throw new PlatformError('VALIDATION_ERROR', 'Invalid cursor.');
  }
  const result = cursorPayload.safeParse(raw);
  if (
    !result.success ||
    result.data.actorId !== actorId ||
    result.data.scope !== scope
  )
    throw new PlatformError('VALIDATION_ERROR', 'Invalid cursor.');
  return result.data.id;
}
export async function loadState(
  actor: VerifiedActor,
  workspaceId?: string,
  cursor?: string,
  organizationId?: string,
) {
  return withActor(actor, async (tx) => {
    const profile = await tx.profile.findUnique({
      where: { id: actor.id },
      select: {
        id: true,
        displayName: true,
        researchRole: true,
        researchInterests: true,
        onboardingCompletedAt: true,
        onboardingDraft: true,
      },
    });
    const organizations = z
      .array(organizationDto)
      .parse(
        await tx.$queryRaw`SELECT id,name,personal,version,atlas_private.capabilities('organization',id) AS capabilities FROM organizations ORDER BY id LIMIT 101`,
      );
    const rawWorkspaces =
      await tx.$queryRaw`SELECT id,name,organization_id AS "organizationId",version,atlas_private.capabilities('workspace',id) AS capabilities FROM workspaces ORDER BY id LIMIT 101`;
    const workspaces = platformState.shape.workspaces.parse(rawWorkspaces);
    const organizationsCursor = trimPage(
      organizations,
      actor.id,
      'organizations',
      (o) => o.id,
    ).nextCursor;
    const workspacesCursor = trimPage(
      workspaces,
      actor.id,
      'workspaces',
      (w) => w.id,
    ).nextCursor;
    // Requested contexts may lie beyond the first navigation page. RLS still
    // authorizes these fixed-ID lookups before adding their minimal DTOs.
    if (workspaceId && !workspaces.some((w) => w.id === workspaceId)) {
      const extra = z
        .array(workspaceDto)
        .parse(
          await tx.$queryRaw`SELECT id,name,organization_id AS "organizationId",version,atlas_private.capabilities('workspace',id) AS capabilities FROM workspaces WHERE id=${workspaceId}::uuid`,
        );
      workspaces.push(...extra);
    }
    const requestedOrg =
      organizationId ??
      workspaces.find((w) => w.id === workspaceId)?.organizationId;
    if (requestedOrg && !organizations.some((o) => o.id === requestedOrg)) {
      const extra = z
        .array(organizationDto)
        .parse(
          await tx.$queryRaw`SELECT id,name,personal,version,atlas_private.capabilities('organization',id) AS capabilities FROM organizations WHERE id=${requestedOrg}::uuid`,
        );
      organizations.push(...extra);
    }
    if (organizationId && !organizations.some((o) => o.id === organizationId))
      throw new PlatformError('NOT_FOUND', 'Organization unavailable.');
    const selected = workspaceId
      ? workspaces.find((w) => w.id === workspaceId)
      : workspaces.find(
          (w) => !organizationId || w.organizationId === organizationId,
        );
    if (workspaceId && !selected)
      throw new PlatformError('NOT_FOUND', 'Workspace unavailable.');
    let projects: z.infer<typeof projectDto>[] = [];
    let nextCursor: string | null = null;
    if (selected) {
      const after = cursor
        ? decodeCursor(cursor, actor.id, `projects:${selected.id}`)
        : null;
      projects = z
        .array(projectDto)
        .parse(
          await tx.$queryRaw`SELECT id,name,organization_id AS "organizationId",workspace_id AS "workspaceId",visibility::text,version,deleted_at IS NOT NULL AS archived,updated_at::text AS "updatedAt",atlas_private.capabilities('project',id) AS capabilities FROM projects WHERE workspace_id=${selected.id}::uuid AND (${after}::uuid IS NULL OR id>${after}::uuid) ORDER BY id LIMIT 31`,
        );
      if (projects.length > 30) {
        projects.pop();
        const last = projects.at(-1);
        if (last)
          nextCursor = encodeCursor({
            id: last.id,
            scope: `projects:${selected.id}`,
            actorId: actor.id,
          });
      }
    }
    return platformState.parse({
      profile: profile
        ? { ...profile, onboardingCompleted: !!profile.onboardingCompletedAt }
        : null,
      email: actor.email,
      organizations,
      workspaces,
      projects,
      workspaceId: selected?.id ?? null,
      organizationId:
        selected?.organizationId ??
        organizationId ??
        organizations[0]?.id ??
        null,
      nextCursor,
      organizationsCursor,
      workspacesCursor,
    });
  });
}
export async function getProject(actor: VerifiedActor, id: string) {
  z.uuid().parse(id);
  return withActor(actor, async (tx) => {
    const projects = z
      .array(projectDto)
      .parse(
        await tx.$queryRaw`SELECT id,name,organization_id AS "organizationId",workspace_id AS "workspaceId",visibility::text,version,deleted_at IS NOT NULL AS archived,updated_at::text AS "updatedAt",atlas_private.capabilities('project',id) AS capabilities FROM projects WHERE id=${id}::uuid`,
      );
    const project = projects[0];
    if (!project) throw new PlatformError('NOT_FOUND', 'Project unavailable.');
    return project;
  });
}
function trimPage<T>(
  items: T[],
  actorId: string,
  scope: string,
  getId: (item: T) => string,
) {
  let nextCursor: string | null = null;
  if (items.length > 100) {
    items.pop();
    const last = items.at(-1);
    if (last) nextCursor = encodeCursor({ id: getId(last), actorId, scope });
  }
  return { items, nextCursor };
}
export async function directory(
  actor: VerifiedActor,
  kind: 'organizations' | 'workspaces',
  cursor?: string,
) {
  const after = cursor ? decodeCursor(cursor, actor.id, kind) : null;
  return withActor(actor, async (tx) => {
    if (kind === 'organizations')
      return trimPage(
        z
          .array(organizationDto)
          .parse(
            await tx.$queryRaw`SELECT id,name,personal,version,atlas_private.capabilities('organization',id) AS capabilities FROM organizations WHERE (${after}::uuid IS NULL OR id>${after}::uuid) ORDER BY id LIMIT 101`,
          ),
        actor.id,
        kind,
        (item) => item.id,
      );
    return trimPage(
      z
        .array(workspaceDto)
        .parse(
          await tx.$queryRaw`SELECT id,name,organization_id AS "organizationId",version,atlas_private.capabilities('workspace',id) AS capabilities FROM workspaces WHERE (${after}::uuid IS NULL OR id>${after}::uuid) ORDER BY id LIMIT 101`,
        ),
      actor.id,
      kind,
      (item) => item.id,
    );
  });
}
export async function members(
  actor: VerifiedActor,
  scope: Scope,
  id: string,
  cursor?: string,
) {
  scopeType.parse(scope);
  z.uuid().parse(id);
  const cursorScope = `members:${scope}:${id}`;
  const after = cursor ? decodeCursor(cursor, actor.id, cursorScope) : null;
  return withActor(actor, async (tx) => {
    const [check] = z
      .array(z.object({ allowed: z.boolean() }))
      .parse(
        await tx.$queryRaw`SELECT atlas_private.can(${scope},${id}::uuid,${`${scope}.read`}) AS allowed`,
      );
    if (!check?.allowed)
      throw new PlatformError('NOT_FOUND', 'Resource unavailable.');
    const table =
      scope === 'organization'
        ? Prisma.sql`organization_memberships`
        : scope === 'workspace'
          ? Prisma.sql`workspace_memberships`
          : Prisma.sql`project_memberships`;
    const field =
      scope === 'organization'
        ? Prisma.sql`organization_id`
        : scope === 'workspace'
          ? Prisma.sql`workspace_id`
          : Prisma.sql`project_id`;
    return trimPage(
      z
        .array(memberDto)
        .parse(
          await tx.$queryRaw(
            Prisma.sql`SELECT profile_id AS "profileId",role::text,version FROM ${table} WHERE ${field}=${id}::uuid AND (${after}::uuid IS NULL OR profile_id>${after}::uuid) ORDER BY profile_id LIMIT 101`,
          ),
        ),
      actor.id,
      cursorScope,
      (item) => item.profileId,
    );
  });
}
export async function invitations(actor: VerifiedActor, cursor?: string) {
  const after = cursor ? decodeCursor(cursor, actor.id, 'invitations') : null;
  return withActor(actor, async (tx) =>
    trimPage(
      z
        .array(invitationDto)
        .parse(
          await tx.$queryRaw`SELECT id,email,scope,role,expires_at::text AS "expiresAt",accepted_at IS NOT NULL AS accepted,revoked_at IS NOT NULL AS revoked FROM invitations WHERE (${after}::uuid IS NULL OR id>${after}::uuid) ORDER BY id LIMIT 101`,
        ),
      actor.id,
      'invitations',
      (item) => item.id,
    ),
  );
}
export async function executeCommand(
  actor: VerifiedActor,
  raw: PlatformCommand,
  requestId: string,
) {
  const parsed = platformCommand.parse(raw);
  const { command, ...fields } = parsed;
  let token: string | undefined;
  let input: Record<string, unknown> = fields;
  if (command === 'invitation.create') {
    if (
      !['localhost', '127.0.0.1'].includes(
        new URL(process.env.ATLAS_ORIGIN ?? 'http://invalid').hostname,
      ) ||
      process.env.NODE_ENV === 'production' ||
      process.env.ATLAS_DEV_INVITATION_LINKS !== 'true'
    )
      throw new PlatformError(
        'FORBIDDEN',
        'Invitation delivery is not configured. Development links are available only on a local development server.',
      );
    token = randomBytes(32).toString('base64url');
    input = { ...fields, tokenHash: hash(token) };
  }
  if (command === 'invitation.accept')
    input = { tokenHash: hash(parsed.token) };
  const result = await withActor(actor, async (tx) => {
    const [row] = z
      .array(z.object({ result: z.unknown() }))
      .parse(
        await tx.$queryRaw`SELECT atlas_private.mutate(${command},${JSON.stringify(input)}::jsonb,${requestId}::uuid) AS result`,
      );
    return mutationResult.parse(row?.result);
  });
  if (token)
    return {
      ...result,
      invitationLink: `${process.env.ATLAS_ORIGIN}/invite#token=${token}`,
    };
  return result;
}
