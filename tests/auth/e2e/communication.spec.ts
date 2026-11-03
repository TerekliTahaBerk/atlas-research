import { randomUUID } from 'node:crypto';
import {
  expect,
  test,
  type APIRequestContext,
  type Browser,
  type Page,
} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { z } from 'zod';
import { origin, register } from './helpers';

/*
 * A04 research communication in real browsers: real GoTrue sessions, the
 * non-owner runtime with RLS, private Supabase Realtime through the gateway
 * and the deterministic loopback AI fixture (no paid model calls). Two
 * independent browser contexts observe each other's messages live.
 */
const data = z.object({
  data: z.object({
    id: z.uuid(),
    invitationLink: z.string().optional(),
  }),
});
async function ok(request: APIRequestContext, body: unknown) {
  const response = await request.post(`${origin}/api/v1/commands`, {
    headers: { Origin: origin },
    data: body,
  });
  expect(response.ok(), JSON.stringify(body).slice(0, 120)).toBe(true);
  return data.parse(await response.json()).data;
}
const me = async (request: APIRequestContext) =>
  z
    .object({
      data: z.object({
        profile: z.object({ id: z.uuid() }),
        workspaceId: z.uuid(),
      }),
    })
    .parse(await (await request.get(`${origin}/api/v1/me`)).json()).data;
async function collaborator(
  browser: Browser,
  owner: Page,
  projectId: string,
  name: string,
) {
  const context = await browser.newContext({ baseURL: origin });
  const page = await context.newPage();
  const email = await register(page);
  await ok(page.request, {
    command: 'profile.update',
    displayName: name,
    researchInterests: [],
  });
  const invite = await ok(owner.request, {
    command: 'invitation.create',
    scope: 'project',
    scopeId: projectId,
    email,
    role: 'EDITOR',
  });
  await page.goto(invite.invitationLink!);
  await page.getByRole('button', { name: 'Accept invitation' }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/overview$`));
  return { context, page, profileId: (await me(page.request)).profile.id };
}
const timeline = (page: Page, channel: string) =>
  page.getByRole('list', { name: `Messages in #${channel}` });
const composer = (page: Page, channel: string) =>
  page.getByRole('combobox', { name: `Message #${channel}` });
async function axe(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(result.violations).toEqual([]);
}

test('channels: live collaboration, threads, mentions, sharing, inbox, Atlas and revocation', async ({
  page,
  browser,
}) => {
  test.setTimeout(300000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // Compile the API route before timed UI assertions (dev server).
  await expect
    .poll(
      async () => (await page.request.get(`${origin}/api/v1/me`)).status(),
      {
        timeout: 120000,
      },
    )
    .toBe(401);
  await register(page);
  await ok(page.request, {
    command: 'profile.update',
    displayName: 'Owner Researcher',
    researchInterests: [],
  });
  const { workspaceId } = await me(page.request);
  const projectId = (
    await ok(page.request, {
      command: 'project.create',
      workspaceId,
      name: 'Communication study',
      visibility: 'PRIVATE',
      idempotencyKey: randomUUID(),
    })
  ).id;
  const paper = await ok(page.request, {
    command: 'paper.create',
    projectId,
    title: 'Synthetic attention study',
    idempotencyKey: randomUUID(),
  });

  // 1. Owner creates the default channel through the real UI.
  await page.goto(`/app/projects/${projectId}/channels`);
  await expect(
    page.getByRole('heading', { name: 'No channels yet' }),
  ).toBeVisible({
    timeout: 30000,
  });
  await axe(page);
  await page.getByRole('button', { name: 'Create channel' }).click();
  const dialog = page.getByRole('dialog', { name: 'New channel' });
  await expect(dialog.getByLabel('Name')).toHaveValue('general');
  await dialog.getByRole('button', { name: 'Create channel' }).click();
  await expect(
    page.getByRole('heading', { name: 'This is the start of #general' }),
  ).toBeVisible({
    timeout: 30000,
  });
  await expect(
    page.getByRole('status').filter({ hasText: /^Live$/ }),
  ).toBeAttached({
    timeout: 30000,
  });

  // 2. Editor joins and sends; the owner receives it live (no reload).
  const editor = await collaborator(
    browser,
    page,
    projectId,
    'Editor Researcher',
  );
  const ep = editor.page;
  await ep.setViewportSize({ width: 1440, height: 1000 });
  await ep.goto(`/app/projects/${projectId}/channels`);
  await ep.getByRole('button', { name: 'Join channel' }).click();
  await expect(ep.getByRole('button', { name: 'Join channel' })).toBeHidden();
  await expect(
    ep.getByRole('status').filter({ hasText: /^Live$/ }),
  ).toBeAttached({
    timeout: 30000,
  });
  await composer(ep, 'general').fill('Draft ablation results are ready');
  await composer(ep, 'general').press('Enter');
  await expect(timeline(ep, 'general')).toContainText(
    'Draft ablation results are ready',
  );
  await expect(timeline(page, 'general')).toContainText(
    'Draft ablation results are ready',
    {
      timeout: 20000,
    },
  );

  // 3. Owner replies in a thread; the editor sees the reply count live.
  const first = timeline(page, 'general').getByRole('article').first();
  await first.hover();
  await first.getByRole('button', { name: 'Reply in thread' }).click();
  const thread = page.getByRole('complementary', { name: 'Thread' });
  await thread
    .getByRole('combobox', { name: 'Reply in thread' })
    .fill('Please add the variance table');
  await thread
    .getByRole('combobox', { name: 'Reply in thread' })
    .press('Enter');
  await expect(
    thread.getByRole('list', { name: 'Thread messages' }),
  ).toContainText('Please add the variance table');
  await expect(
    timeline(ep, 'general').getByRole('button', { name: '1 reply' }),
  ).toBeVisible({
    timeout: 20000,
  });

  // 4. Editor reacts; the owner sees the count.
  const editorFirst = timeline(ep, 'general').getByRole('article').first();
  await editorFirst.hover();
  await editorFirst.getByRole('button', { name: 'Add reaction' }).click();
  await ep.getByRole('menuitem', { name: /Thumbs up/ }).click();
  await expect(
    timeline(page, 'general').getByRole('button', { name: 'Thumbs up: 1' }),
  ).toBeVisible({
    timeout: 20000,
  });

  // 5. Editor mentions the owner by picking a real participant.
  await composer(ep, 'general').fill('');
  await composer(ep, 'general').pressSequentially('@Own');
  await ep.getByRole('option', { name: 'Owner Researcher' }).click();
  await composer(ep, 'general').pressSequentially('can you review?');
  await composer(ep, 'general').press('Enter');
  await expect(
    timeline(page, 'general')
      .locator('[data-mention]')
      .filter({ hasText: '@Owner Researcher' }),
  ).toBeVisible({ timeout: 20000 });
  await expect(
    page.getByRole('link', { name: /Inbox/ }).getByText(/unread notifications/),
  ).toBeAttached({
    timeout: 20000,
  });

  // 6. Owner shares a paper; the editor opens it from the card.
  await page.getByRole('button', { name: 'Share research' }).first().click();
  const share = page.getByRole('dialog', { name: 'Share research' });
  await share
    .getByRole('button', { name: 'Synthetic attention study' })
    .click();
  await expect(
    page.getByRole('list', { name: 'Research to share' }),
  ).toContainText('Synthetic attention study');
  await composer(page, 'general').fill('Background reading');
  await composer(page, 'general').press('Enter');
  const card = timeline(ep, 'general').getByRole('link', {
    name: /Synthetic attention study/,
  });
  await expect(card).toBeVisible({ timeout: 20000 });
  await expect(card).toHaveAttribute(
    'href',
    `/app/projects/${projectId}/library?paper=${paper.id}`,
  );

  // 7. Inbox: persistent notification navigates to the original message.
  await page.goto('/app/inbox');
  const mention = page.getByRole('link', {
    name: /Editor Researcher mentioned you in #general/,
  });
  await expect(mention).toBeVisible({ timeout: 30000 });
  await axe(page);
  await mention.click();
  await expect(page).toHaveURL(/channels\?channel=.*&message=/);
  await expect(timeline(page, 'general')).toContainText('can you review?', {
    timeout: 30000,
  });

  // 8. Reload both sessions: messages, thread, reaction and notification persist.
  await Promise.all([page.reload(), ep.reload()]);
  for (const p of [page, ep]) {
    await expect(timeline(p, 'general')).toContainText(
      'Draft ablation results are ready',
      {
        timeout: 30000,
      },
    );
    await expect(
      timeline(p, 'general').getByRole('button', { name: '1 reply' }),
    ).toBeVisible();
    await expect(
      timeline(p, 'general').getByRole('button', { name: /Thumbs up: 1/ }),
    ).toBeVisible();
  }
  await page.goto('/app/inbox');
  await expect(
    page.getByRole('link', { name: /mentioned you in #general/ }),
  ).toBeVisible({
    timeout: 30000,
  });

  // 9. Keyboard-only send and accessibility of the live conversation.
  await page.goto(`/app/projects/${projectId}/channels`);
  await composer(page, 'general').focus();
  await page.keyboard.type('Sent from the keyboard');
  await page.keyboard.press('Enter');
  await expect(timeline(page, 'general')).toContainText(
    'Sent from the keyboard',
    { timeout: 20000 },
  );
  await axe(page);

  // 10. Hostile text renders inert for the recipient.
  await composer(ep, 'general').fill(
    '<img src=x onerror=window.__pwned=1> javascript:alert(1)',
  );
  await composer(ep, 'general').press('Enter');
  await expect(timeline(page, 'general')).toContainText(
    '<img src=x onerror=window.__pwned=1>',
    {
      timeout: 20000,
    },
  );
  expect(
    await page.evaluate(() => (window as { __pwned?: number }).__pwned),
  ).toBeUndefined();
  await expect(timeline(page, 'general').locator('img')).toHaveCount(0);

  // 11. Contextual Atlas: explicit, consented, labelled as generated analysis.
  await page.getByRole('button', { name: 'Ask Atlas' }).first().click();
  const atlas = page.getByRole('region', {
    name: 'Atlas for this conversation',
  });
  await expect(atlas).toContainText(/messages? from this channel/, {
    timeout: 30000,
  });
  await atlas.getByRole('checkbox').check();
  await atlas.getByRole('button', { name: 'Ask Atlas' }).click();
  await expect(atlas).toContainText(
    'Generated analysis · not research evidence',
    { timeout: 60000 },
  );
  page.once('dialog', (d) => void d.accept());
  await atlas.getByRole('button', { name: 'Post to channel…' }).click();
  await expect(
    atlas.getByRole('button', { name: 'Posted to channel' }),
  ).toBeVisible({ timeout: 20000 });
  await expect(timeline(ep, 'general')).toContainText(
    'Generated analysis · posted by',
    {
      timeout: 20000,
    },
  );
  await atlas.getByRole('button', { name: 'Close Atlas' }).click();

  // 12. Restricted channel: live revocation removes the editor's view.
  const restricted = (
    await ok(page.request, {
      command: 'channel.create',
      projectId,
      name: 'private-results',
      visibility: 'RESTRICTED',
      idempotencyKey: randomUUID(),
    })
  ).id;
  await ok(page.request, {
    command: 'channel.member.add',
    id: restricted,
    profileId: editor.profileId,
  });
  await ep.goto(`/app/projects/${projectId}/channels?channel=${restricted}`);
  await expect(
    ep.getByRole('heading', { name: 'This is the start of #private-results' }),
  ).toBeVisible({
    timeout: 30000,
  });
  await expect(
    ep.getByRole('status').filter({ hasText: /^Live$/ }),
  ).toBeAttached({ timeout: 30000 });
  await ok(page.request, {
    command: 'channel.member.remove',
    id: restricted,
    profileId: editor.profileId,
  });
  await ok(page.request, {
    command: 'message.send',
    channelId: restricted,
    body: 'Unpublished p-value 0.003',
    idempotencyKey: randomUUID(),
  });
  await expect(
    ep.getByRole('heading', { name: 'You don’t have access to this channel' }),
  ).toBeVisible({
    timeout: 20000,
  });
  await expect(ep.getByText('Unpublished p-value 0.003')).toHaveCount(0);
  // The channel is gone from the editor's list after reload as well.
  await ep.reload();
  await expect(
    ep.getByRole('navigation', { name: 'Channels' }),
  ).not.toContainText('private-results', {
    timeout: 30000,
  });

  expect(errors).toEqual([]);
  await editor.context.close();
});
